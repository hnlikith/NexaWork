/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { exchangeCodeForTokens, zohoGet } from "@/lib/zoho-mail";
import { syncDomainFromZoho } from "@/lib/zoho-provisioning";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/admin/mail/config?error=${error || "no_code"}`);
  }

  const { data: config } = await supabase
    .from("zoho_config")
    .select("id, client_id, client_secret, redirect_uri")
    .limit(1)
    .maybeSingle();

  if (!config) {
    return NextResponse.redirect(`${appUrl}/admin/mail/config?error=no_config`);
  }

  const tokens = await exchangeCodeForTokens(
    config.client_id,
    config.client_secret,
    code,
    config.redirect_uri
  );

  if (!tokens?.access_token) {
    return NextResponse.redirect(`${appUrl}/admin/mail/config?error=token_failed`);
  }

  // Fetch admin account ID + org ID from Zoho
  let adminAccountId: string | null = null;
  let orgId: string | null = null;
  try {
    const accounts = await zohoGet(tokens.access_token, "/accounts");
    adminAccountId = accounts?.data?.[0]?.accountId ?? null;
  } catch {}
  try {
    const orgs = await zohoGet(tokens.access_token, "/organization");
    orgId = orgs?.data?.[0]?.orgId
         ?? orgs?.data?.[0]?.id
         ?? orgs?.data?.orgId
         ?? null;
  } catch {}

  if (!orgId) {
    orgId = process.env.ZOHO_ORG_ID || null;
  }

  await supabase.from("zoho_config").update({
    access_token:     tokens.access_token,
    refresh_token:    tokens.refresh_token,
    token_expiry:     new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    admin_account_id: adminAccountId,
    zoid:             orgId,
    org_id:           orgId,
    is_connected:     true,
    connected_at:     new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  }).eq("id", config.id);

  // Auto-detect and persist the verified domain from Zoho (non-blocking)
  syncDomainFromZoho().catch(() => {});

  return NextResponse.redirect(`${appUrl}/admin/mail/config?success=connected`);
}
