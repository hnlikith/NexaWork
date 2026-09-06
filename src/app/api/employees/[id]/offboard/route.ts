/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { disableZohoMailbox } from "@/lib/zoho-provisioning";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/employees/[id]/offboard
// Body: { reason?: string, initiated_by: string }
// Starts the 7-day offboarding window. A cron job (or the PATCH endpoint below)
// calls /api/employees/[id]/offboard with { finalize: true } after 7 days.

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id }         = await params;
    const body           = await req.json();
    const { reason, initiated_by, finalize } = body;
    const supabase       = getSupabaseAdmin();

    const { data: emp, error: fetchErr } = await supabase
      .from("employees")
      .select("id, name, email, zoho_user_id, zoho_email, status, department, team_id")
      .eq("id", id)
      .single();

    if (fetchErr || !emp) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // ── Finalize offboarding (disable Zoho + lock panel login) ───────────────
    if (finalize) {
      if (emp.status !== "offboarding") {
        return NextResponse.json({ error: "Employee is not in offboarding state." }, { status: 400 });
      }

      // Disable Zoho mailbox
      if (emp.zoho_user_id) {
        await disableZohoMailbox(emp.zoho_user_id).catch(e =>
          console.error("[Offboard] Zoho disable failed:", e.message)
        );
      }

      // Disable Supabase Auth user
      await supabase.auth.admin.updateUserById(id, { ban_duration: "876600h" }).catch(() => {});

      await supabase.from("employees").update({
        status:    "disabled",
        is_active: false,
        updated_at: new Date().toISOString(),
      }).eq("id", id);

      await supabase.from("audit_logs").insert({
        user_id:     initiated_by || null,
        action:      "offboarding_finalized",
        target_type: "employee",
        target_id:   id,
        metadata:    { name: emp.name, email: emp.email, zoho_email: emp.zoho_email },
      });

      return NextResponse.json({ success: true, message: `${emp.name} has been fully offboarded and disabled.` });
    }

    // ── Begin 7-day offboarding window ────────────────────────────────────────
    if (emp.status === "disabled") {
      return NextResponse.json({ error: "Employee is already disabled." }, { status: 400 });
    }

    const offboardedAt = new Date();

    await supabase.from("employees").update({
      status:          "offboarding",
      offboarded_at:   offboardedAt.toISOString(),
      offboard_reason: reason || null,
      updated_at:      new Date().toISOString(),
    }).eq("id", id);

    await supabase.from("audit_logs").insert({
      user_id:     initiated_by || null,
      action:      "offboarding_started",
      target_type: "employee",
      target_id:   id,
      metadata:    {
        name:       emp.name,
        email:      emp.email,
        reason,
        finalize_at: new Date(offboardedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `${emp.name} is now in the 7-day offboarding window. Access will be revoked on ${new Date(offboardedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN")}.`,
      finalize_at: new Date(offboardedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
