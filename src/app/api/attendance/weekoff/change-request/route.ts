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

// GET  — list change requests (own, or all if admin/hr)
// POST — employee submits a post-lock date swap
// PATCH — admin/lead approves or rejects

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
    .from("weekoff_change_requests")
    .select("*, employee:employee_id(name, department, designation), decider:decided_by(name)")
    .order("created_at", { ascending: false });

  if (!isAdmin || !all) q = q.eq("employee_id", userId);

  const { data } = await q;
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { original_date, requested_date, reason } = await req.json();
  if (!reason?.trim())         return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  if (!original_date || !requested_date) return NextResponse.json({ error: "Both dates are required" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: settings } = await supabase
    .from("attendance_settings")
    .select("lock_day")
    .eq("id", 1)
    .maybeSingle();

  if (dayjs().date() <= (settings?.lock_day ?? 28)) {
    return NextResponse.json({ error: "Window is still open — edit your picks directly." }, { status: 400 });
  }

  // Verify caller owns this off-date
  const { data: existing } = await supabase
    .from("weekoff_days")
    .select("id")
    .eq("employee_id", userId)
    .eq("off_date", original_date)
    .eq("status", "allotted")
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "That date is not in your allotted weekoffs." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("weekoff_change_requests")
    .insert({ employee_id: userId, original_date, requested_date, reason, status: "pending" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify admins
  const { data: emp }    = await supabase.from("employees").select("name, department").eq("id", userId).maybeSingle();
  const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
  if (emp && admins?.length) {
    await supabase.from("system_notifications").insert(
      admins.map(a => ({
        user_id:  a.id,
        title:    `Weekoff Change — ${emp.name}`,
        message:  `${emp.name} requests to swap ${original_date} → ${requested_date}. Reason: ${reason}`,
        type:     "warning",
        link:     "/admin/attendance",
      }))
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { id, action } = await req.json() as { id: string; action: "approve" | "reject" };

  const { data: me } = await supabase.from("employees").select("role").eq("id", userId).maybeSingle();
  if (!["admin", "hr", "dept_lead", "team_lead"].includes(me?.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { data: cr } = await supabase.from("weekoff_change_requests").select("*").eq("id", id).maybeSingle();
  if (!cr) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  await supabase.from("weekoff_change_requests").update({
    status:     action === "approve" ? "approved" : "rejected",
    decided_by: userId,
    decided_at: new Date().toISOString(),
  }).eq("id", id);

  if (action === "approve") {
    // Retire the old off-date
    await supabase.from("weekoff_days")
      .update({ status: "changed" })
      .eq("employee_id", cr.employee_id)
      .eq("off_date", cr.original_date);

    // Insert the new off-date
    await supabase.from("weekoff_days").upsert({
      employee_id: cr.employee_id,
      cycle_key:   dayjs(cr.requested_date).format("YYYY-MM"),
      off_date:    cr.requested_date,
      week_index:  Math.ceil(dayjs(cr.requested_date).date() / 7),
      status:      "allotted",
      source:      "changed",
    }, { onConflict: "employee_id,off_date" });
  }

  // Notify employee
  const msg = action === "approve"
    ? `Your weekoff swap from ${cr.original_date} → ${cr.requested_date} was approved.`
    : `Your weekoff swap request (${cr.original_date} → ${cr.requested_date}) was rejected.`;
  await supabase.from("system_notifications").insert({
    user_id: cr.employee_id,
    title:   action === "approve" ? "Weekoff Change Approved" : "Weekoff Change Rejected",
    message: msg,
    type:    action === "approve" ? "success" : "warning",
    link:    "/dashboard/attendance",
  });

  return NextResponse.json({ success: true });
}
