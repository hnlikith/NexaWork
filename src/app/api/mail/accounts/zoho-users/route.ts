/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveToken } from "@/lib/zoho-mail";

const ZOHO_MAIL_API = process.env.ZOHO_MAIL_API_URL || "https://mail.zoho.in/api";

// Fetch all users from Zoho Admin Console (live)
export async function GET() {
  const supabase = getSupabaseAdmin();
  const token    = await getActiveToken();

  const { data: config } = await supabase
    .from("zoho_config")
    .select("id, org_id, zoid, org_domain")
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

  if (!token || !orgId) {
    return NextResponse.json({ users: [], domain: config?.org_domain || null, is_connected: false });
  }

  try {
    const res  = await fetch(`${ZOHO_MAIL_API}/organization/${orgId}/accounts`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const json = await res.json();

    const users = (json?.data || []).map((u: any) => {
      const lastLoginMs = u.lastLogin;
      const neverSignedIn = !lastLoginMs || lastLoginMs === -1;
      const lastLoginDate = !neverSignedIn ? new Date(lastLoginMs).toISOString() : null;

      return {
        accountId:    u.accountId   || u.mailboxId || null,
        name:         u.displayName || u.name      || "—",
        email:        u.primaryEmailAddress || u.emailAddress || "—",
        role:         u.role        || "member",
        // Zoho API returns `enabled` (boolean) and `status` (boolean)
        isActive:     u.enabled === true && u.status !== false,
        domain:       (u.primaryEmailAddress || u.emailAddress || "").split("@")[1] || "",
        lastLogin:    lastLoginDate,
        neverSignedIn,
        lastClient:   u.lastClient  || null,
        mailboxStatus: u.mailboxStatus || null,
        iamStatus:    u.iamStatus   || null,
        lastPasswordReset: u.lastPasswordReset ? new Date(u.lastPasswordReset).toISOString() : null,
        accountCreationTime: u.accountCreationTime ? new Date(u.accountCreationTime).toISOString() : null,
      };
    });

    return NextResponse.json({
      users,
      domain:       config?.org_domain || null,
      is_connected: true,
    });
  } catch (e: any) {
    console.error("[Zoho users]", e.message);
    return NextResponse.json({ users: [], domain: config?.org_domain || null, is_connected: true, error: e.message });
  }
}
