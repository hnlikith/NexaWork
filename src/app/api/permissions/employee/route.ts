/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor } from "@/lib/onboarding/server";
import { logAudit } from "@/lib/audit";

// GET /api/permissions/employee?employee_id=<uuid>
// Returns the raw override rows (NULL = inherit) for an employee, keyed by module_key.
export async function GET(req: NextRequest) {
  const employeeId = req.nextUrl.searchParams.get("employee_id");
  if (!employeeId) {
    return NextResponse.json({ error: "employee_id param required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("employee_permissions")
      .select("module_key, can_view, can_create, can_edit, can_delete, can_export, reason, updated_at")
      .eq("employee_id", employeeId);
    if (error) throw error;

    const overrides: Record<string, {
      can_view: boolean | null;
      can_create: boolean | null;
      can_edit: boolean | null;
      can_delete: boolean | null;
      can_export: boolean | null;
      reason: string | null;
      updated_at: string;
    }> = {};
    for (const row of data ?? []) {
      overrides[row.module_key] = {
        can_view:   row.can_view,
        can_create: row.can_create,
        can_edit:   row.can_edit,
        can_delete: row.can_delete,
        can_export: row.can_export,
        reason:     row.reason,
        updated_at: row.updated_at,
      };
    }

    return NextResponse.json({ overrides });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST /api/permissions/employee
// Body: { employee_id, overrides: { [module_key]: { can_view?, can_create?, ... reason? } }, updatedBy }
// Upserts override rows. To REMOVE an override, pass an entry with all fields = null.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employee_id, overrides, updatedBy } = body as {
      employee_id: string;
      overrides: Record<string, {
        can_view: boolean | null;
        can_create: boolean | null;
        can_edit: boolean | null;
        can_delete: boolean | null;
        can_export: boolean | null;
        reason?: string | null;
      }>;
      updatedBy?: string;
    };

    if (!employee_id || !overrides) {
      return NextResponse.json({ error: "employee_id and overrides are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const toUpsert: Array<{
      employee_id: string;
      module_key: string;
      can_view: boolean | null;
      can_create: boolean | null;
      can_edit: boolean | null;
      can_delete: boolean | null;
      can_export: boolean | null;
      reason: string | null;
      updated_by: string | null;
      updated_at: string;
    }> = [];
    const toDelete: string[] = [];

    for (const [module_key, o] of Object.entries(overrides)) {
      const allNull =
        o.can_view === null &&
        o.can_create === null &&
        o.can_edit === null &&
        o.can_delete === null &&
        o.can_export === null;
      if (allNull) {
        toDelete.push(module_key);
      } else {
        toUpsert.push({
          employee_id,
          module_key,
          can_view:   o.can_view,
          can_create: o.can_create,
          can_edit:   o.can_edit,
          can_delete: o.can_delete,
          can_export: o.can_export,
          reason:     o.reason ?? null,
          updated_by: updatedBy ?? null,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from("employee_permissions")
        .upsert(toUpsert, { onConflict: "employee_id,module_key" });
      if (error) throw error;
    }

    if (toDelete.length > 0) {
      const { error } = await supabase
        .from("employee_permissions")
        .delete()
        .eq("employee_id", employee_id)
        .in("module_key", toDelete);
      if (error) throw error;
    }

    const actor = await getActor();
    await logAudit({
      actorId: actor?.userId ?? updatedBy ?? null,
      action: "permissions.employee_override", section: "Permissions",
      summary: `Updated per-employee permission overrides (${toUpsert.length} set, ${toDelete.length} cleared)`,
      targetType: "employee", targetId: employee_id,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message ?? "Unknown error" }, { status: 500 });
  }
}
