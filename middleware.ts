import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// ── Auto-audit ────────────────────────────────────────────────────────────────
// Every state-changing API call (POST/PATCH/PUT/DELETE) is recorded to the Master
// Log Sheet with the actor, the page it came from, and the endpoint — so ALL roles'
// create/edit/delete activity across the whole workspace is captured centrally, not
// just the handful of routes that call logAudit() manually. GET (page views) are NOT
// logged here — live "who's on what module" is covered by presence instead.
const AUDIT_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const AUDIT_SKIP = [
  // Pure infrastructure / high-frequency noise
  "/api/presence", "/api/auth", "/api/health", "/api/admin/master-log", "/api/messages",
  // Already richly logged via logAudit() (with before/after) — skip to avoid duplicates
  "/api/onboarding", "/api/sign", "/api/permissions", "/api/users", "/api/admin/recruitment",
];

function pagePathFromReferer(referer: string | null, fallback: string): string {
  if (!referer) return fallback;
  try { return new URL(referer).pathname || fallback; } catch { return fallback; }
}

async function writeAuditLog(req: NextRequest, userId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;
  const apiPath = req.nextUrl.pathname;
  const method = req.method.toUpperCase();
  const pagePath = pagePathFromReferer(req.headers.get("referer"), apiPath);
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "").trim() || null;
  try {
    await fetch(`${url}/rest/v1/audit_logs`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        action: `api.${method.toLowerCase()}`,
        table_name: "api_request",
        record_id: userId, // valid uuid — satisfies the legacy not-null column
        target_type: "api",
        target_id: apiPath,
        path: pagePath,
        summary: `${method} ${apiPath}`,
        ip_address: ip,
        metadata: { auto: true, method },
      }),
    });
  } catch { /* never break the request over an audit write */ }
}

// Edge auth gate.
//   - Unauthenticated users hitting any protected route are redirected to /login
//   - Authenticated users hitting /login are redirected to their role's home
//   - Public routes pass through untouched
//
// Page-level permission gating (moduleKey → can_view) still happens inside
// DashboardShell; this middleware only blocks unauthenticated access at the
// edge so users can't briefly see protected UI before the client redirects.

const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/forgot-credentials",
  // /onboarding is NOT public — requires a valid session.
  // Unauthenticated users hitting /onboarding are redirected to /login by middleware.
  "/career",
  "/careers",
];

const PUBLIC_PREFIXES = [
  "/_next",
  "/api/auth",          // login / logout / resolve-email
  "/api/health",
  "/favicon",
  "/robots.txt",
  "/sitemap.xml",
  "/meet",              // public LiveKit meet rooms (token-gated server-side)
  "/sign",              // candidate e-signature pages (token-gated server-side)
  "/api/sign",          // candidate e-signature API (token-gated server-side)
  "/documents",         // candidate KYC document upload (token-gated server-side)
  "/api/documents",     // candidate KYC document API (token-gated server-side)
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return false; // root → server-side role router
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  // /onboarding is permanently retired — redirect to root which routes by role
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Always allow Next.js internals + explicit public routes
  if (isPublic(pathname)) return NextResponse.next();

  // Bail out gracefully if Supabase env vars aren't set (e.g. preview build
  // for a branch that hasn't been linked). Without this, middleware would
  // throw on every request and crash the entire app.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  let session = null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error && (error.message?.includes("Refresh Token") || error.message?.includes("refresh_token"))) {
      throw error;
    }
    session = data?.session || null;
  } catch (err) {
    console.error("Middleware session check failed:", err);
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("error", "session_expired");
    if (pathname !== "/") redirectUrl.searchParams.set("next", pathname);
    
    const responseWithRedirect = NextResponse.redirect(redirectUrl);
    responseWithRedirect.cookies.delete("sb-access-token");
    responseWithRedirect.cookies.delete("sb-refresh-token");
    return responseWithRedirect;
  }

  // Unauthenticated → /login (preserve intended destination)
  if (!session) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    if (pathname !== "/") redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Auto-audit every state-changing API call (fire-and-forget, never blocks the
  // request). Captures who + what + which page/module, workspace-wide.
  if (
    AUDIT_METHODS.has(req.method.toUpperCase()) &&
    pathname.startsWith("/api/") &&
    !AUDIT_SKIP.some((p) => pathname.startsWith(p)) &&
    session.user?.id
  ) {
    event.waitUntil(writeAuditLog(req, session.user.id));
  }

  return response;
}

export const config = {
  // Match everything except next internals, static assets, and image optimizer.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)",
  ],
};
