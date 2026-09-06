/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const search    = searchParams.get("search")     || "";
  const scopeType = searchParams.get("scope_type") || "";
  const year      = searchParams.get("year")       || "";
  const status    = searchParams.get("status")     || "";

  try {
    let query = supabase
      .from("budgets")
      .select(`
        *,
        teams ( name ),
        budget_allocations (
          id, category, label, allocated, sort_order, linked_sub_id,
          subscriptions ( name, sub_number, category )
        )
      `)
      .order("created_at", { ascending: false });

    if (search)    query = query.ilike("name", `%${search}%`);
    if (scopeType) query = query.eq("scope_type", scopeType);
    if (status)    query = query.eq("status", status);
    if (year)      query = query.eq("fiscal_year", parseInt(year));

    const { data: budgets, error } = await query;
    if (error) throw error;

    // actual_spent, purchase_spent, sub_spent are now STORED columns — no computation needed
    return NextResponse.json({ budgets: budgets || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  try {
    const body = await req.json();
    const {
      name, scope_type, department_name, team_id, fiscal_year, fiscal_month,
      total_amount, category, notes, status, created_by_name, created_by_emp_id,
      allocations,
    } = body;

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const { data: budget, error } = await supabase
      .from("budgets")
      .insert({
        budget_number:     "",
        name,
        scope_type:        scope_type       || "department",
        department_name:   department_name  || null,
        team_id:           team_id          || null,
        fiscal_year:       fiscal_year      || new Date().getFullYear(),
        fiscal_month:      fiscal_month     || null,
        total_amount:      total_amount     ?? 0,
        category:          category         || "General",
        notes:             notes            || null,
        status:            status           || "active",
        created_by_name:   created_by_name  || null,
        created_by_emp_id: created_by_emp_id || null,
      })
      .select()
      .single();

    if (error) throw error;

    if (allocations?.length && budget) {
      const rows = allocations.map((
        a: { category: string; label?: string; allocated: number; linked_sub_id?: string },
        i: number,
      ) => ({
        budget_id:     budget.id,
        category:      a.category,
        label:         a.label         || null,
        allocated:     a.allocated     ?? 0,
        linked_sub_id: a.linked_sub_id || null,
        sort_order:    i,
      }));
      const { error: allocErr } = await supabase.from("budget_allocations").insert(rows);
      if (allocErr) throw allocErr;
    }

    // Return the budget with DB-computed spent fields
    const { data: fresh } = await supabase.from("budgets").select("*").eq("id", budget.id).single();
    return NextResponse.json({ budget: fresh ?? budget }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
