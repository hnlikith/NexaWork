/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getSupabaseAdmin } from "@/lib/supabase";

// ── Unified Zoho OAuth backbone ──────────────────────────────────────────────
// Single connection (zoho_config row), single token helper, single consent.
// Every Zoho product (Mail, Calendar, Cliq, Meeting) reuses this layer.

export const ZOHO_ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";

// Each Zoho product is served from its own host.
export const ZOHO_API = {
  mail:      process.env.ZOHO_MAIL_API_URL        || "https://mail.zoho.in/api",
  calendar:  process.env.ZOHO_CALENDAR_URL        || "https://calendar.zoho.in/api/v1",
  cliq:      process.env.ZOHO_CLIQ_API_URL        || "https://cliq.zoho.in/api/v2",
  meeting:   process.env.ZOHO_MEETING_API_URL     || "https://meeting.zoho.in/api/v2",
  // Office Suite — Workspace Hub
  writer:    process.env.ZOHO_WRITER_API_URL      || "https://writer.zoho.in/writer/v1",
  sheet:     process.env.ZOHO_SHEET_API_URL       || "https://sheet.zoho.in/api/v2",
  show:      process.env.ZOHO_SHOW_API_URL        || "https://show.zoho.in/api/v1",
  workdrive: process.env.ZOHO_WORKDRIVE_API_URL   || "https://workdrive.zoho.in/api/v1",
} as const;

export type ZohoService = keyof typeof ZOHO_API;

// Single source of truth for the unified consent. When a product's module is
// built, add its (verified) scopes here — the admin re-consents once to grant
// them, since all services share one connection.
export const ZOHO_SCOPES = [
  // Mail
  "ZohoMail.messages.ALL",
  "ZohoMail.accounts.ALL",
  "ZohoMail.organization.ALL",
  "ZohoMail.folders.ALL",
  "ZohoMail.organization.accounts.ALL",
  "ZohoMail.organization.accounts.DELETE",
  // Calendar
  "ZohoCalendar.calendar.ALL",
  "ZohoCalendar.event.ALL",
  // Office Suite (Workspace Hub) — scopes added when each panel is built & verified
  // "ZohoWriter.files.ALL",
  // "ZohoSheet.dataAPI.ALL",
  // "ZohoShow.presentation.ALL",
  // "WorkDrive.files.ALL",
  // "WorkDrive.workspace.ALL",
  // Cliq — enable when the messaging module is wired:
  // "ZohoCliq.Channels.ALL", "ZohoCliq.Messages.ALL", "ZohoCliq.Webhooks.ALL",
  // Meeting — enable when the meeting module is wired:
  // "ZohoMeeting.meeting.ALL",
];

// ── OAuth URL + token exchange ───────────────────────────────────────────────

export function buildZohoOAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[] = ZOHO_SCOPES
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: scopes.join(","),
    redirect_uri: redirectUri,
    access_type: "offline",
    prompt: "consent",
  });
  return `${ZOHO_ACCOUNTS_URL}/oauth/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<any> {
  const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  return res.json();
}

// ── The shared token helper ──────────────────────────────────────────────────
// Reads the single zoho_config connection and refreshes if it's near expiry.
// All products call this — there is exactly one token in play.

export async function getZohoToken(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data: config } = await supabase
    .from("zoho_config")
    .select("id, access_token, refresh_token, token_expiry, client_id, client_secret, is_connected")
    .eq("is_connected", true)
    .maybeSingle();

  if (!config?.access_token) return null;

  const expiresAt = config.token_expiry ? new Date(config.token_expiry) : null;
  const soonExpires = expiresAt && expiresAt <= new Date(Date.now() + 5 * 60 * 1000);

  if (soonExpires && config.refresh_token) {
    const refreshed = await refreshAccessToken(
      config.client_id,
      config.client_secret,
      config.refresh_token
    );
    if (refreshed?.access_token) {
      await supabase.from("zoho_config").update({
        access_token: refreshed.access_token,
        token_expiry: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", config.id);
      return refreshed.access_token;
    }
    // Refresh failed — expired/revoked refresh token, or bad client credentials.
    // Log it and flip is_connected=false so the UI shows "Zoho not connected"
    // instead of silently provisioning mailboxes with a null account id. The
    // OAuth callback re-sets is_connected=true on the next reconnect.
    console.error("[Zoho] token refresh failed:", JSON.stringify(refreshed));
    await supabase.from("zoho_config").update({ is_connected: false }).eq("id", config.id);
    return null;
  }

  return config.access_token;
}

// ── Generic authenticated request against any Zoho product ───────────────────

export async function zohoRequest(
  service: ZohoService,
  path: string,
  init: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    params?: Record<string, string>;
    body?: unknown;
    token?: string;
  } = {}
): Promise<any> {
  const token = init.token ?? (await getZohoToken());
  if (!token) throw new Error("Zoho is not connected — no active token.");

  const url = new URL(`${ZOHO_API[service]}${path}`);
  if (init.params) {
    Object.entries(init.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho ${service} ${init.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}
