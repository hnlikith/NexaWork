/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveToken } from "@/lib/zoho-mail";
import { syncDomainFromZoho } from "@/lib/zoho-provisioning";

const ZOHO_MAIL_API = process.env.ZOHO_MAIL_API_URL || "https://mail.zoho.in/api";

// ── GET: current domain + list of verified domains from Zoho ─────────────────
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: config } = await supabase
    .from("zoho_config")
    .select("id, org_id, zoid, org_domain, domain_synced_at")
    .maybeSingle();

  let orgId = config?.org_id || config?.zoid;
  if (!orgId && process.env.ZOHO_ORG_ID) {
    orgId = process.env.ZOHO_ORG_ID;
    if (config?.id) {
      await supabase
        .from("zoho_config")
        .update({ org_id: orgId, zoid: orgId })
        .eq("id", config.id);
    }
  }
  const token = await getActiveToken();

  // Try to fetch live domain list from Zoho
  let zohoDomains: { name: string; isPrimary: boolean; isVerified: boolean }[] = [];
  if (token && orgId) {
    try {
      const res  = await fetch(`${ZOHO_MAIL_API}/organization/${orgId}/domains`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      const json = await res.json();
      zohoDomains = (json?.data || []).map((d: any) => ({
        name:       d.domainName?.toLowerCase() || "",
        isPrimary:  d.isPrimary  || false,
        isVerified: d.isVerified || d.status === "verified" || false,
      }));
    } catch {
      // non-fatal — return what we have in DB
    }
  }

  return NextResponse.json({
    current_domain:  config?.org_domain || null,
    domain_synced_at: config?.domain_synced_at || null,
    zoho_domains:    zohoDomains,
    is_connected:    !!(token && orgId),
  });
}

// ── POST: manually set domain (overrides DB value) ────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { domain } = await req.json();

  if (!domain || !domain.includes(".")) {
    return NextResponse.json({ error: "Valid domain required (e.g. mail.your-company.com)" }, { status: 400 });
  }

  const clean = domain.trim().toLowerCase();

  const { data: config } = await supabase
    .from("zoho_config")
    .select("id, org_id, zoid")
    .maybeSingle();

  if (!config) {
    return NextResponse.json({ error: "Zoho not configured yet." }, { status: 400 });
  }

  let orgId = config.org_id || config.zoid;
  if (!orgId && process.env.ZOHO_ORG_ID) {
    orgId = process.env.ZOHO_ORG_ID;
    await supabase
      .from("zoho_config")
      .update({ org_id: orgId, zoid: orgId })
      .eq("id", config.id);
  }

  await supabase
    .from("zoho_config")
    .update({ org_domain: clean, domain_synced_at: new Date().toISOString() })
    .eq("id", config.id);

  return NextResponse.json({ success: true, domain: clean });
}

// ── PUT: sync domain FROM Zoho API (auto-detect) ─────────────────────────────
export async function PUT() {
  const domain = await syncDomainFromZoho();

  if (!domain) {
    return NextResponse.json(
      { error: "Could not sync domain from Zoho. Ensure Zoho is connected and org has a verified domain." },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, domain });
}
