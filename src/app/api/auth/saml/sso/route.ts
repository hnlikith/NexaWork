/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateSAMLResponse } from "@/lib/saml";

export async function GET(req: NextRequest) {
  return handleSAMLRequest(req);
}

export async function POST(req: NextRequest) {
  return handleSAMLRequest(req);
}

async function handleSAMLRequest(req: NextRequest) {
  const session = await getSession();
  const nextUrl = req.nextUrl;
  const currentOrigin = nextUrl.origin;

  // Silent mode: the assertion is POSTed to Zoho from a hidden iframe so the user
  // never leaves the workspace. We render a bare, invisible auto-submit form
  // (no visible "Connecting to Zoho" UI) — the parent page has already routed the
  // user straight to their dashboard.
  const silentMode = nextUrl.searchParams.get("mode") === "silent";

  // 1. If not authenticated: in silent (iframe) mode just return an empty 200 — a
  //    login redirect inside a hidden iframe is pointless and noisy. In full-page
  //    mode, redirect to login with a return pointer.
  if (!session?.userId) {
    if (silentMode) return new NextResponse("", { status: 200, headers: { "Content-Type": "text/html" } });
    const ssoPath = `${nextUrl.pathname}${nextUrl.search}`;
    const loginUrl = new URL(`/login`, currentOrigin);
    loginUrl.searchParams.set("next", ssoPath);
    return NextResponse.redirect(loginUrl.toString());
  }

  const supabase = getSupabaseAdmin();

  // 2. Fetch the user's active employee profile
  const { data: user, error: userErr } = await supabase
    .from("employees")
    .select("id, name, zoho_email, personal_email, is_active, status, role, zoho_activated_at")
    .eq("id", session.userId)
    .maybeSingle();

  if (userErr || !user) {
    // Never strand the user on a blank error page. The np_session may be stale or
    // point at an account with no employee row — bounce gracefully instead of 404.
    if (silentMode) return new NextResponse("", { status: 200, headers: { "Content-Type": "text/html" } });
    return NextResponse.redirect(new URL("/dashboard", currentOrigin));
  }

  if (user.status === "disabled" || user.is_active === false) {
    if (silentMode) return new NextResponse("", { status: 200, headers: { "Content-Type": "text/html" } });
    return new NextResponse("Account deactivated.", { status: 403 });
  }

  // 3. Extract RelayState (destination after login — our dashboard route)
  let relayState = "";
  if (req.method === "GET") {
    relayState = nextUrl.searchParams.get("RelayState") || nextUrl.searchParams.get("relayState") || "/dashboard";
  } else {
    try {
      const formData = await req.formData();
      relayState = (formData.get("RelayState") as string) || (formData.get("relayState") as string) || "/dashboard";
    } catch {
      relayState = "/dashboard";
    }
  }

  // Ensure RelayState points to our origin (trusted paths only)
  if (relayState.startsWith("http://") || relayState.startsWith("https://")) {
    try {
      const parsedRelay = new URL(relayState);
      if (parsedRelay.origin !== currentOrigin && !parsedRelay.hostname.endsWith(".zoho.in") && !parsedRelay.hostname.endsWith(".zoho.com")) {
        relayState = "/dashboard";
      }
    } catch {
      relayState = "/dashboard";
    }
  }

  // Build the absolute fallback URL (where we redirect if SAML is not configured)
  const fallbackUrl = new URL(relayState.startsWith("/") ? relayState : `/${relayState}`, currentOrigin).toString();

  // Zoho requires an ABSOLUTE RelayState. A relative path (e.g. "/dashboard")
  // gets corrupted on Zoho's side (serviceurl=…/<garbage>) and strands the user
  // on a Zoho error page instead of returning to our app. Always send the full URL.
  const relayStateAbsolute = relayState.startsWith("http") ? relayState : fallbackUrl;

  // Skip-if-already-activated: once a user has activated Zoho, our IdP-initiated
  // hand-off must NEVER fire again. If the user presses Back and lands on this
  // route URL, just bounce them to their role dashboard instead of POSTing a new
  // assertion to Zoho (which would loop them back through the Zoho pages). This
  // only applies to our own hand-off (GET, no SAMLRequest) — a genuine SP-initiated
  // request from Zoho (has SAMLRequest, or POST) must still be answered.
  const spInitiated = !!nextUrl.searchParams.get("SAMLRequest") || req.method === "POST";
  if ((user as any).zoho_activated_at && !spInitiated && !silentMode) {
    const roleDash =
      user.role === "admin" ? "/admin" :
      user.role === "hr" ? "/hr" :
      user.role === "accounts" ? "/accounts" : "/dashboard";
    return NextResponse.redirect(new URL(roleDash, currentOrigin));
  }

  // Log audit event for this professional login (non-blocking)
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || null;
  supabase.from("audit_logs").insert({
    actor_id:    user.id,
    user_id:     user.id,
    action:      "login_professional_zoho",
    table_name:  "employees",
    record_id:   user.id,
    target_type: "login",
    new_values:  {
      email:    user.zoho_email,
      method:   "professional_email_saml_sso",
      note:     "User signed in using company Zoho mail ID — SAML SSO flow triggered",
    },
    ip_address:  ip,
  }).then(undefined, () => {});

  // 4. If user has no Zoho email, skip SAML and redirect directly
  if (!user.zoho_email) {
    return NextResponse.redirect(fallbackUrl);
  }

  // 5. Fetch SAML configuration
  const { data: config } = await supabase
    .from("zoho_config")
    .select("saml_enabled, saml_issuer, saml_acs_url, saml_private_key, saml_certificate, zoid, org_id")
    .maybeSingle();

  if (!config || !config.saml_enabled || !config.saml_private_key || !config.saml_certificate) {
    // SAML SSO not configured in our system — redirect directly (no error)
    console.log("[SAML SSO] SAML not configured, redirecting directly to:", relayState);
    return NextResponse.redirect(fallbackUrl);
  }

  // 6. Resolve the ACS URL (Zoho's SAML Assertion Consumer Service endpoint)
  let acsUrl = config.saml_acs_url;
  const zoid = config.zoid || config.org_id;

  if (!acsUrl) {
    const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";
    acsUrl = zoid ? `${accountsUrl}/samlresponse/${zoid}` : `${accountsUrl}/samlresponse`;
  } else if (zoid && acsUrl.endsWith("/samlresponse") && !acsUrl.includes(zoid)) {
    acsUrl = `${acsUrl}/${zoid}`;
  }

  // 7. Generate signed SAML assertion
  let samlResponse = "";
  try {
    samlResponse = generateSAMLResponse(
      user.zoho_email,
      acsUrl,
      config.saml_issuer || "your-organization-sso",
      config.saml_private_key,
      config.saml_certificate
    );
  } catch (err: any) {
    console.error("[SAML SSO] Signature generation failed:", err);
    // On signing error, fall back to direct redirect rather than showing an error
    return NextResponse.redirect(fallbackUrl);
  }

  console.log(`[SAML SSO] Submitting SAML assertion for ${user.zoho_email} → ${acsUrl}${silentMode ? " (silent/iframe)" : ""}`);

  // NOTE: We intentionally do NOT stamp zoho_activated_at or send the confirmation
  // email here. Generating an assertion only means we ASKED Zoho to sign the user
  // in — it is not proof Zoho accepted it. The genuine "activated" signal is the
  // browser RETURNING to our activation landing page (RelayState = /auth/zoho-
  // activated) after Zoho completes the sign-in. That page calls
  // /api/auth/zoho-activate, which stamps the flag and sends the email exactly once.

  // 8. Silent mode → bare invisible auto-submit form (stay inside the workspace).
  if (silentMode) {
    const silentHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>.</title></head>
<body style="margin:0;background:transparent">
  <form id="samlForm" method="POST" action="${acsUrl}">
    <input type="hidden" name="SAMLResponse" value="${samlResponse}" />
    <input type="hidden" name="RelayState" value="${relayStateAbsolute}" />
  </form>
  <script>document.getElementById('samlForm').submit();</script>
</body></html>`;
    return new NextResponse(silentHtml, {
      headers: { "Content-Type": "text/html" },
    });
  }

  // 8b. Full-page fallback — render an auto-submit page that POSTs the SAML assertion to Zoho
  //    After Zoho processes it, Zoho redirects to RelayState (our dashboard).
  //
  //    If Zoho rejects the assertion (certificate not configured in Zoho Admin Console),
  //    the fallback JS timer redirects the user directly to the dashboard after 8 seconds
  //    so they are never stuck on this page.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connecting to Zoho | NexaWork</title>
  <style>
    :root {
      --bg: #eef1f5;
      --card: #ffffff;
      --primary: #4f46e5;
      --primary-glow: rgba(79, 70, 229, 0.10);
      --text: #0f172a;
      --muted: #64748b;
      --border: #e3e8ef;
      --success: #10b981;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      background-image: radial-gradient(ellipse 80% 50% at 50% 0%, rgba(59,130,246,0.08), transparent);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
    }
    .card {
      text-align: center;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 28px;
      padding: 48px 40px;
      width: 360px;
      box-shadow: 0 12px 40px -16px rgba(15,23,42,0.25);
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--primary), transparent);
      opacity: 0.8;
    }
    .logo {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background: #0b0f17;
      color: #ffffff;
      font-weight: 800;
      font-size: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      box-shadow: 0 8px 20px rgba(15,23,42,0.18);
    }
    .spinner {
      position: relative;
      width: 64px;
      height: 64px;
      margin: 0 auto 28px;
    }
    .ring {
      position: absolute;
      inset: 0;
      border: 3px solid transparent;
      border-radius: 50%;
      border-top-color: var(--primary);
      animation: spin 1s cubic-bezier(0.6,0,0.4,1) infinite;
    }
    .ring:nth-child(2) {
      inset: 8px;
      border-top-color: transparent;
      border-right-color: rgba(59,130,246,0.4);
      animation-duration: 1.4s;
      animation-direction: reverse;
    }
    .ring-dot {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 10px; height: 10px;
      background: var(--primary);
      border-radius: 50%;
      box-shadow: 0 0 16px var(--primary);
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      50% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.7); }
    }
    h2 {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 13px;
      color: var(--muted);
      font-weight: 500;
      line-height: 1.5;
    }
    .steps {
      margin-top: 28px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      color: var(--muted);
      padding: 8px 12px;
      background: #f8fafc;
      border-radius: 10px;
      border: 1px solid var(--border);
      transition: all 0.3s;
    }
    .step.active { color: var(--text); border-color: rgba(79,70,229,0.3); background: rgba(79,70,229,0.06); }
    .step.done { color: var(--success); }
    .step-icon {
      width: 20px; height: 20px;
      border-radius: 50%;
      background: #eef2f7;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      font-size: 9px;
    }
    .step.active .step-icon { background: rgba(59,130,246,0.2); color: var(--primary); }
    .step.done .step-icon { background: rgba(16,185,129,0.2); color: var(--success); }
    .fallback {
      margin-top: 24px;
      font-size: 11px;
      color: var(--muted);
    }
    .fallback a { color: var(--primary); text-decoration: none; }
    .fallback a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">N</div>
    <div class="spinner">
      <div class="ring"></div>
      <div class="ring"></div>
      <div class="ring-dot"></div>
    </div>
    <h2>Connecting to Zoho Mail</h2>
    <p class="subtitle">Setting up your secure session automatically...</p>

    <div class="steps">
      <div class="step done" id="step1">
        <div class="step-icon">✓</div>
        <span>Login verified</span>
      </div>
      <div class="step active" id="step2">
        <div class="step-icon">⟳</div>
        <span>Activating Zoho session</span>
      </div>
      <div class="step" id="step3">
        <div class="step-icon">→</div>
        <span>Redirecting to dashboard</span>
      </div>
    </div>

    <p class="fallback">
      Taking too long? <a href="${fallbackUrl}" id="directLink">Go directly →</a>
    </p>
  </div>

  <form id="samlForm" method="POST" action="${acsUrl}">
    <input type="hidden" name="SAMLResponse" value="${samlResponse}" />
    <input type="hidden" name="RelayState" value="${relayStateAbsolute}" />
  </form>

  <script>
    // Step animation
    setTimeout(function() {
      document.getElementById('step2').classList.remove('active');
      document.getElementById('step2').classList.add('done');
      document.getElementById('step2').querySelector('.step-icon').textContent = '✓';
      document.getElementById('step3').classList.add('active');
    }, 1500);

    // Submit SAML form to Zoho
    setTimeout(function() {
      document.getElementById('samlForm').submit();
    }, 200);

    // Fallback: if Zoho doesn't redirect back within 8s, go directly
    // (happens if SAML cert is not configured in Zoho Admin Console)
    setTimeout(function() {
      window.location.href = '${fallbackUrl}';
    }, 8000);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
