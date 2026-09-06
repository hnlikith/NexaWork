/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, type Actor } from "@/lib/onboarding/server";

export type PermAction = "can_view" | "can_create" | "can_edit" | "can_delete" | "can_export";

// Server-side permission gate for API routes. The client route-guard (DashboardShell)
// only controls the UI; this is the authoritative layer that stops a user calling a
// sensitive admin/management endpoint directly (curl, devtools, a tampered client).
//
// Resolves the caller's real role from the DB, then checks role_permissions (with a
// per-employee override) for the given module + action. Admin always passes. Returns
// the actor on success, or a ready-to-return 401/403 NextResponse on failure:
//
//   const gate = await requireModule("teams", "can_create");
//   if (!gate.ok) return gate.response;
//   // ...gate.actor is the authenticated employee
export async function requireModule(
  moduleKey: string,
  action: PermAction = "can_view",
): Promise<{ ok: true; actor: Actor } | { ok: false; response: NextResponse }> {
  const actor = await getActor();
  if (!actor) {
    return { ok: false, response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  // Admin is the apex role — always allowed (also avoids lockout if a row is unseeded).
  if (actor.role === "admin") return { ok: true, actor };

  const supabase = getSupabaseAdmin();

  // Per-employee override wins when explicitly set (non-null).
  const { data: emp } = await supabase
    .from("employee_permissions")
    .select(action)
    .eq("employee_id", actor.userId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  const empVal = emp ? (emp as Record<string, unknown>)[action] : undefined;
  if (empVal !== null && empVal !== undefined) {
    return empVal
      ? { ok: true, actor }
      : { ok: false, response: NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 }) };
  }

  // Fall back to the role default.
  const { data: rp } = await supabase
    .from("role_permissions")
    .select(action)
    .eq("role", actor.role)
    .eq("module_key", moduleKey)
    .maybeSingle();
  if (rp && (rp as Record<string, unknown>)[action]) return { ok: true, actor };

  return { ok: false, response: NextResponse.json({ error: "You don't have permission for this action." }, { status: 403 }) };
}
