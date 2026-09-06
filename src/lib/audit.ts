/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { headers } from "next/headers";

export interface AuditChange { from: any; to: any; }

export interface LogAuditOpts {
  actorId?: string | null;        // employee id of the person doing the action
  actorName?: string | null;      // optional override (e.g. a candidate, not an employee)
  actorRole?: string | null;
  action: string;                 // machine action, e.g. "onboarding.approve"
  section: string;                // human section, e.g. "Onboarding"
  summary: string;                // human-readable one-liner for the log sheet
  targetType?: string | null;     // e.g. "onboarding_packet", "employee"
  targetId?: string | null;
  changes?: Record<string, AuditChange> | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  ip?: string | null;
}

/** Field-level diff between two plain objects → { field: {from, to} } (only changed keys). */
export function diffObjects(before?: Record<string, any> | null, after?: Record<string, any> | null): Record<string, AuditChange> | null {
  const b = before || {};
  const a = after || {};
  const out: Record<string, AuditChange> = {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const k of keys) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) out[k] = { from: b[k] ?? null, to: a[k] ?? null };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Record one entry in the universal Master Log Sheet (audit_logs).
 * Best-effort: never throws into the calling flow.
 */
export async function logAudit(opts: LogAuditOpts): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    let ip = opts.ip ?? null;
    if (!ip) {
      try {
        const headerList = await headers();
        const forwarded = headerList.get("x-forwarded-for");
        ip = forwarded ? forwarded.split(",")[0].trim() : headerList.get("x-real-ip") || null;
      } catch {}
    }

    let name = opts.actorName ?? null;
    let role = opts.actorRole ?? null;
    let empId: string | null = null;

    // Skip the lookup when the caller already supplied both name and role —
    // the only thing it would otherwise add is actor_emp_id.
    if (opts.actorId && !(opts.actorName && opts.actorRole)) {
      const { data } = await supabase
        .from("employees")
        .select("name, employee_id, role")
        .eq("id", opts.actorId)
        .maybeSingle();
      if (data) {
        name = name ?? (data as any).name ?? null;
        empId = (data as any).employee_id ?? null;
        role = role ?? (data as any).role ?? null;
      }
    }

    const changes = opts.changes ?? diffObjects(opts.before, opts.after);

    // audit_logs carries two legacy NOT-NULL columns from the original table:
    //   table_name (text) and record_id (uuid). logAudit historically omitted both,
    //   so EVERY call failed silently on the not-null constraint. Always populate
    //   them: record_id must be a valid uuid (target if it's one, else the actor,
    //   else the nil uuid) so the insert never violates the type/not-null.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const targetIdStr = opts.targetId != null ? String(opts.targetId) : null;
    const recordId =
      (targetIdStr && UUID_RE.test(targetIdStr) && targetIdStr) ||
      (opts.actorId && UUID_RE.test(opts.actorId) && opts.actorId) ||
      "00000000-0000-0000-0000-000000000000";

    await supabase.from("audit_logs").insert({
      user_id: opts.actorId ?? null,
      action: opts.action,
      table_name: opts.targetType ?? opts.section ?? "system",
      record_id: recordId,
      target_type: opts.targetType ?? null,
      target_id: targetIdStr,
      actor_name: name,
      actor_emp_id: empId,
      actor_role: role,
      section: opts.section,
      summary: opts.summary,
      changes,
      ip_address: ip,
      metadata: {},
    });
  } catch (e: any) {
    console.error("[audit] failed to record:", e?.message);
  }
}
