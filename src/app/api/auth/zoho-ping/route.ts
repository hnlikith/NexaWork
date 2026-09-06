/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/auth/zoho-ping
 *
 * Called by the client after a successful login with a professional/company Zoho email.
 * This endpoint:
 * 1. Verifies the session is valid
 * 2. Checks the Zoho mailbox status (verifies it's active in Zoho)
 * 3. Records the professional login event in audit_logs
 *
 * Note: Zoho Admin Console's "Last Sign In" / "Never Signed In" status can only be updated
 * when the user directly signs into Zoho Mail via browser. It cannot be updated via API.
 * For SAML SSO to work, the SAML certificate must be configured in Zoho Admin Console
 * under Settings → Security → SAML Authentication (requires paid Zoho plan).
 */
export async function POST(req: NextRequest) {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || null;
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Fetch fresh employee data
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, name, email, zoho_email, zoho_user_id, zoho_account_id, status, is_active")
      .eq("id", session.userId)
      .maybeSingle();

    if (empErr || !emp) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Log the professional login to audit_logs
    await supabase.from("audit_logs").insert({
      actor_id:    emp.id,
      user_id:     emp.id,
      action:      "login_professional_zoho",
      table_name:  "employees",
      record_id:   emp.id,
      target_type: "login",
      new_values:  { 
        email: emp.zoho_email || emp.email, 
        method: "professional_email_login",
        zoho_user_id: emp.zoho_user_id,
        note: "User signed in using company Zoho mail ID"
      },
      ip_address:  ip,
    }).then(undefined, () => {});

    // Check/verify the Zoho mailbox status (non-blocking verification)
    let zohoMailboxActive = false;
    let lastLogin: string | null = null;
    if (emp.zoho_user_id) {
      try {
        const { activateZohoMailbox } = await import("@/lib/zoho-provisioning");
        zohoMailboxActive = await activateZohoMailbox(emp.zoho_user_id);
        console.log(`[Zoho Ping] Mailbox status for ${emp.zoho_email}: ${zohoMailboxActive ? "active" : "inactive/not found"}`);
      } catch (activateErr: any) {
        console.error("[Zoho Ping] Mailbox check error:", activateErr.message);
      }
    }

    return NextResponse.json({ 
      success: true, 
      zohoMailboxActive,
      hasZohoEmail: !!emp.zoho_email,
      zohoEmail: emp.zoho_email,
      note: emp.zoho_user_id 
        ? "Login recorded. Zoho lastSignIn requires direct browser login to mail.zoho.in"
        : "No Zoho mailbox provisioned for this user",
    });
  } catch (err: any) {
    console.error("[Zoho Ping] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
