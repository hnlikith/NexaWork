/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  try {
    const body = await req.json();
    const {
      name, scope_type, department_name, team_id, fiscal_year, fiscal_month,
      total_amount, category, notes, status,
    } = body;

    const payload: Record<string, unknown> = {};
    if (name             !== undefined) payload.name             = name;
    if (scope_type       !== undefined) payload.scope_type       = scope_type;
    if (department_name  !== undefined) payload.department_name  = department_name  || null;
    if (team_id          !== undefined) payload.team_id          = team_id          || null;
    if (fiscal_year      !== undefined) payload.fiscal_year      = Number(fiscal_year);
    if (fiscal_month     !== undefined) payload.fiscal_month     = fiscal_month     || null;
    if (total_amount     !== undefined) payload.total_amount     = Number(total_amount);
    if (category         !== undefined) payload.category         = category;
    if (notes            !== undefined) payload.notes            = notes            || null;
    if (status           !== undefined) payload.status           = status;

    const { data, error } = await supabase
      .from("budgets")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ budget: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  try {
    const { error } = await supabase.from("budgets").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
