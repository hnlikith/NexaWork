/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildOAuthUrl } from "@/lib/zoho-mail";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { clientId, clientSecret, mailDomain, redirectUri } = await req.json();

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Client ID and Secret are required." }, { status: 400 });
  }

  const redirect = redirectUri || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/mail/auth/callback`;

  // Check if a row already exists — always update it, never create duplicates
  const { data: existing } = await supabase
    .from("zoho_config")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("zoho_config").update({
      client_id:    clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      mail_domain:  mailDomain || process.env.ZOHO_MAIL_DOMAIN || "your-company.com",
      is_connected: false,
      updated_at:   new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await supabase.from("zoho_config").insert({
      client_id:    clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      mail_domain:  mailDomain || process.env.ZOHO_MAIL_DOMAIN || "your-company.com",
      is_connected: false,
    });
  }

  const authUrl = buildOAuthUrl(clientId, redirect);
  return NextResponse.json({ authUrl });
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("zoho_config")
    .select("is_connected, mail_domain, admin_account_id, connected_at, token_expiry, org_id")
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ config: data });
}
