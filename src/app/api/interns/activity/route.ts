/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, isAdmin } from "@/lib/onboarding/server";
import { PAYROLL_INTERN_EMAILS } from "@/lib/payroll-access";
import { logAudit } from "@/lib/audit";

// GET /api/interns/activity
//
// Admin-only. Returns the full audit trail of the scoped payroll-intern
// account(s) — every stipend/holiday/payment action they performed — so an
// admin can see exactly what the intern helper has done. Powers the realtime
// "Intern Activity" page.
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(actor)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const supabase = getSupabaseAdmin();

  // Resolve the scoped account(s) → employee ids.
  const emails = PAYROLL_INTERN_EMAILS.map((e) => e.toLowerCase());
  const { data: accounts } = await supabase
    .from("employees")
    .select("id, name, email, employee_id")
    .in("email", emails);

  const ids = (accounts ?? []).map((a) => a.id);
  if (ids.length === 0) {
    return NextResponse.json({ account: null, events: [], stats: { total: 0, payments: 0, holidays: 0 } });
  }

  const { data: events, error } = await supabase
    .from("audit_logs")
    .select("id, action, section, summary, target_type, target_id, actor_name, actor_emp_id, actor_role, created_at")
    .in("user_id", ids)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch presence
  const { data: presences } = await supabase
    .from("user_presence")
    .select("user_id, last_seen, current_path, status")
    .in("user_id", ids);

  const list = events ?? [];
  const stats = {
    total: list.length,
    payments: list.filter((e) => e.action?.includes("payment")).length,
    holidays: list.filter((e) => e.action === "internship.cycle.update" && /holiday/i.test(e.summary || "")).length,
  };

  return NextResponse.json({
    account: accounts?.[0] ?? null,
    presence: presences?.find((p) => p.user_id === accounts?.[0]?.id) ?? null,
    events: list,
    stats,
  });
}

// POST /api/interns/activity
//
// Scoped payroll intern logging endpoint.
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // getActor() already resolves name/role from the employees table — reuse it
  // instead of re-fetching the same row here.
  const body = await req.json().catch(() => ({}));
  const { action, summary, section, targetType, targetId } = body;

  if (!action || !summary) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  await logAudit({
    actorId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    section: section || "Internship",
    summary,
    targetType: targetType || null,
    targetId: targetId || null,
  });

  return NextResponse.json({ success: true });
}
