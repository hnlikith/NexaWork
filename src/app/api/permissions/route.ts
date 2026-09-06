/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor } from "@/lib/onboarding/server";
import { requireModule } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

type PermNode = {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
};

// GET /api/permissions?role=<role>&employee_id=<uuid?>
//
// Returns the EFFECTIVE permission map for a role, optionally merged with
// per-employee overrides. Override fields are honored field-by-field — NULL
// on an override field falls back to the role default.
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role");
  const employeeId = req.nextUrl.searchParams.get("employee_id");

  if (!role) {
    return NextResponse.json({ error: "role param required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 1. Role defaults
    const { data: roleRows, error: roleErr } = await supabase
      .from("role_permissions")
      .select("module_key, can_view, can_create, can_edit, can_delete, can_export")
      .eq("role", role);
    if (roleErr) throw roleErr;

    const permissions: Record<string, PermNode> = {};
    for (const row of roleRows ?? []) {
      permissions[row.module_key] = {
        can_view:   row.can_view,
        can_create: row.can_create,
        can_edit:   row.can_edit,
        can_delete: row.can_delete,
        can_export: row.can_export,
      };
    }

    // 2. Per-employee overrides (only if employee_id provided)
    if (employeeId) {
      const { data: overrideRows } = await supabase
        .from("employee_permissions")
        .select("module_key, can_view, can_create, can_edit, can_delete, can_export")
        .eq("employee_id", employeeId);

      for (const row of overrideRows ?? []) {
        const base = permissions[row.module_key] ?? {
          can_view: false, can_create: false, can_edit: false, can_delete: false, can_export: false,
        };
        permissions[row.module_key] = {
          can_view:   row.can_view   ?? base.can_view,
          can_create: row.can_create ?? base.can_create,
          can_edit:   row.can_edit   ?? base.can_edit,
          can_delete: row.can_delete ?? base.can_delete,
          can_export: row.can_export ?? base.can_export,
        };
      }
    }

    return NextResponse.json({ permissions });
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Unknown error";
    console.error("[GET /api/permissions]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/permissions — update ROLE defaults. Managing who-can-see-what is an
// admin-only action; without this gate ANY authenticated user could rewrite the
// permission map for every role.
export async function POST(req: NextRequest) {
  try {
    const gate = await requireModule("permissions_control", "can_edit");
    if (!gate.ok) return gate.response;

    const body = await req.json();
    const { role, permissions, updatedBy } = body as {
      role: string;
      permissions: Record<string, PermNode>;
      updatedBy?: string;
    };

    if (!role || !permissions) {
      return NextResponse.json({ error: "role and permissions are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const rows = Object.entries(permissions).map(([module_key, perms]) => ({
      role,
      module_key,
      can_view:   perms.can_view,
      can_create: perms.can_create,
      can_edit:   perms.can_edit,
      can_delete: perms.can_delete,
      can_export: perms.can_export,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    }));

    const { error } = await supabase
      .from("role_permissions")
      .upsert(rows, { onConflict: "role,module_key" });

    if (error) throw error;

    const actor = await getActor();
    await logAudit({
      actorId: actor?.userId ?? updatedBy ?? null,
      action: "permissions.role_update", section: "Permissions",
      summary: `Updated module permissions for the "${role}" role`,
      targetType: "role", targetId: role,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Unknown error";
    console.error("[POST /api/permissions]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
