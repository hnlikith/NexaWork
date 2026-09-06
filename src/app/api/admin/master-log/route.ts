/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, isAdmin } from "@/lib/onboarding/server";

// GET /api/admin/master-log — the universal audit feed + live presence (admin only).
// Shared by Master Log Sheet, Workspace Monitor, Sessions and Security & Audit.
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(actor)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 500), 2000);
  const supabase = getSupabaseAdmin();

  // Check if user_presence has device_id column to prevent queries from crashing before migrations run
  const { error: colErr } = await supabase
    .from("user_presence")
    .select("device_id")
    .limit(1);
  const hasDeviceColumn = !colErr;

  const presenceSelect = hasDeviceColumn
    ? "user_id, device_id, device_name, user_agent, last_seen, current_path, status, emp:user_id(name, employee_id, role, is_active)"
    : "user_id, last_seen, current_path, status, emp:user_id(name, employee_id, role, is_active)";

  const [logsRes, presenceRes] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("id, created_at, user_id, actor_name, actor_emp_id, actor_role, action, section, summary, changes, target_type, target_id, ip_address, path")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("user_presence")
      .select(presenceSelect)
      .order("last_seen", { ascending: false }),
  ]);

  const logs = logsRes.data ?? [];

  // Backfill actor identity for legacy rows written before app-level attribution
  // (e.g. Zoho SSO / login / password events): resolve name/emp_id/role from the
  // employees table by user_id so nothing shows as an anonymous "System" actor.
  const missing = Array.from(
    new Set(logs.filter((l: any) => !l.actor_name && l.user_id).map((l: any) => l.user_id)),
  );
  if (missing.length) {
    const { data: emps } = await supabase
      .from("employees")
      .select("id, name, employee_id, role")
      .in("id", missing);
    const byId = new Map((emps ?? []).map((e: any) => [e.id, e]));
    for (const l of logs as any[]) {
      if (!l.actor_name && l.user_id && byId.has(l.user_id)) {
        const e = byId.get(l.user_id);
        l.actor_name = e.name;
        l.actor_emp_id = l.actor_emp_id ?? e.employee_id;
        l.actor_role = l.actor_role ?? e.role;
      }
    }
  }

  return NextResponse.json({
    logs,
    presence: presenceRes.data ?? [],
    serverTime: new Date().toISOString(),
  });
}
