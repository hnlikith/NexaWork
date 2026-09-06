/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role");
  if (!role) {
    return NextResponse.json({ error: "role param required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("role_assignable_roles")
      .select("assignable_role")
      .eq("assigner_role", role);

    if (error) throw error;

    return NextResponse.json({
      assignableRoles: (data ?? []).map((r) => r.assignable_role),
    });
  } catch (err: any) {
    console.error("[GET /api/permissions/assignable-roles]", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { role, assignableRoles } = body as {
      role: string;
      assignableRoles: string[];
    };

    if (!role || !Array.isArray(assignableRoles)) {
      return NextResponse.json(
        { error: "role and assignableRoles array are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Replace all entries for this assigner role
    const { error: delError } = await supabase
      .from("role_assignable_roles")
      .delete()
      .eq("assigner_role", role);

    if (delError) throw delError;

    if (assignableRoles.length > 0) {
      const { error: insError } = await supabase
        .from("role_assignable_roles")
        .insert(
          assignableRoles.map((assignable_role) => ({
            assigner_role: role,
            assignable_role,
          }))
        );
      if (insError) throw insError;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/permissions/assignable-roles]", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
