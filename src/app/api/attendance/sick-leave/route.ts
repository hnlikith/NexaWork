/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import dayjs from "@/lib/dayjs";

// GET  — list sick leaves (own, or all pending certs if admin)
// POST — employee submits a new sick leave
// PATCH — submit certificate URL  |  admin approve / reject cert

export async function GET(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const all = req.nextUrl.searchParams.get("all") === "1";

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const isAdmin = me?.role === "admin" || me?.role === "hr";

  let q = supabase
    .from("sick_leaves")
    .select("*, employee:employee_id(name, department, designation), decider:decided_by(name)")
    .order("created_at", { ascending: false });

  if (!isAdmin || !all) q = q.eq("employee_id", userId);

  const { data: leaves } = await q;
  if (!leaves) return NextResponse.json([]);

  // Compute-on-access: flag overdue certificates as blocking
  const today = dayjs();
  const toBlock = leaves.filter(
    l => !l.blocks_checkin && l.cert_status === "pending" && !l.certificate_url && today.isAfter(dayjs(l.certificate_deadline))
  );
  if (toBlock.length) {
    await supabase.from("sick_leaves")
      .update({ blocks_checkin: true })
      .in("id", toBlock.map(l => l.id));
    toBlock.forEach(l => { l.blocks_checkin = true; });
  }

  return NextResponse.json(leaves);
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { from_date, to_date, reason, certificate_url } = await req.json();

  if (!reason?.trim())         return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  if (!from_date || !to_date)  return NextResponse.json({ error: "Dates are required" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: settings } = await supabase
    .from("attendance_settings")
    .select("sick_leave_forward_days, sick_leave_backward_days, certificate_deadline_days")
    .eq("id", 1)
    .maybeSingle();

  if (!settings) return NextResponse.json({ error: "Settings not found" }, { status: 500 });

  const today   = dayjs();
  const minDate = today.subtract(settings.sick_leave_backward_days, "day").format("YYYY-MM-DD");
  const maxDate = today.add(settings.sick_leave_forward_days,    "day").format("YYYY-MM-DD");

  if (from_date < minDate || from_date > maxDate) {
    return NextResponse.json({
      error: `Date must be within ${settings.sick_leave_backward_days} day(s) back and ${settings.sick_leave_forward_days} day(s) forward from today`,
    }, { status: 400 });
  }

  const days     = dayjs(to_date).diff(dayjs(from_date), "day") + 1;
  const deadline = today.add(settings.certificate_deadline_days, "day").format("YYYY-MM-DD");

  const { data, error } = await supabase
    .from("sick_leaves")
    .insert({
      employee_id:          userId,
      from_date,
      to_date,
      days,
      reason,
      certificate_url:      certificate_url || null,
      certificate_deadline: deadline,
      cert_status:          certificate_url ? "submitted" : "pending",
      approval_required:    false,
      blocks_checkin:       false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify admins
  const { data: emp }    = await supabase.from("employees").select("name").eq("id", userId).maybeSingle();
  const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
  if (emp && admins?.length) {
    await supabase.from("system_notifications").insert(
      admins.map(a => ({
        user_id: a.id,
        title:   `Sick Leave — ${emp.name}`,
        message: `${emp.name} sick leave: ${from_date} → ${to_date}. Certificate due ${deadline}.`,
        type:    "warning",
        link:    "/admin/attendance",
      }))
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const body = await req.json() as {
    id: string;
    action: "submit_cert" | "approve" | "reject";
    certificate_url?: string;
  };
  const { id, action, certificate_url } = body;

  const { data: leave } = await supabase.from("sick_leaves").select("*").eq("id", id).maybeSingle();
  if (!leave) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── employee submits certificate ─────────────────────────────────────────
  if (action === "submit_cert") {
    if (leave.employee_id !== userId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!certificate_url?.trim()) return NextResponse.json({ error: "Certificate URL is required" }, { status: 400 });

    const { data: settings } = await supabase
      .from("attendance_settings")
      .select("require_cert_approval")
      .eq("id", 1)
      .maybeSingle();

    const isLate       = dayjs().isAfter(dayjs(leave.certificate_deadline));
    const needsApproval = isLate && settings?.require_cert_approval;

    await supabase.from("sick_leaves").update({
      certificate_url,
      certificate_submitted_at: new Date().toISOString(),
      cert_status:      needsApproval ? "submitted" : "approved",
      approval_required: needsApproval,
      // Keep blocking until admin approves the late cert
      blocks_checkin:    needsApproval ? leave.blocks_checkin : false,
    }).eq("id", id);

    if (needsApproval) {
      const { data: emp }    = await supabase.from("employees").select("name").eq("id", userId).maybeSingle();
      const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
      if (emp && admins?.length) {
        await supabase.from("system_notifications").insert(
          admins.map(a => ({
            user_id: a.id,
            title:   `Late Cert — ${emp.name}`,
            message: `${emp.name} submitted a late sick-leave certificate (deadline was ${leave.certificate_deadline}).`,
            type:    "warning",
            link:    "/admin/attendance",
          }))
        );
      }
    }

    return NextResponse.json({ success: true, needsApproval });
  }

  // ── admin approve / reject ───────────────────────────────────────────────
  if (action === "approve" || action === "reject") {
    const { data: me } = await supabase.from("employees").select("role").eq("id", userId).maybeSingle();
    if (!["admin", "hr"].includes(me?.role ?? "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await supabase.from("sick_leaves").update({
      cert_status:    action === "approve" ? "approved" : "rejected",
      decided_by:     userId,
      decided_at:     new Date().toISOString(),
      blocks_checkin: action === "approve" ? false : leave.blocks_checkin,
    }).eq("id", id);

    await supabase.from("system_notifications").insert({
      user_id: leave.employee_id,
      title:   action === "approve" ? "Certificate Approved" : "Certificate Rejected",
      message: action === "approve"
        ? `Your sick-leave certificate for ${leave.from_date} was approved.`
        : `Your sick-leave certificate for ${leave.from_date} was rejected — please resubmit.`,
      type: action === "approve" ? "success" : "warning",
      link: "/dashboard/attendance",
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
