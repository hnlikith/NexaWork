/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");

    let query = supabase
      .from("projects")
      .select(`
        *,
        clients (id, name, lead_name),
        project_teams (team_id, teams (id, name)),
        budgets (
          id, budget_number, name, total_amount,
          actual_spent, purchase_spent, sub_spent, status
        )
      `, { count: "exact" });

    if (search) query = query.ilike("name", `%${search}%`);
    query = query.order("created_at", { ascending: false });

    const { data, count, error } = await query;
    if (error) throw error;

    const projects = (data || []).map((p: any) => ({
      ...p,
      clientId:  p.client_id,
      dueDate:   p.due_date,
      client:    p.clients,
      teams:     p.project_teams?.map((pt: any) => pt.teams) || [],
      teamIds:   p.project_teams?.map((pt: any) => pt.team_id) || [],
      budget_data: p.budgets || null,
      department_id: p.department_id,
      manager_id: p.manager_id,
      workflow_status: p.workflow_status,
      progress: p.progress || 0,
      progress_locked: p.progress_locked || false,
      started_at: p.started_at || null,
      accepted_by: p.accepted_by || null,
    }));

    return NextResponse.json({ projects, total: count || 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { name, description, budget, client_id, phase, issued_date, due_date, team_ids, budget_id, department_id, assigned_by, manager_id, workflow_status } = body;

    if (!name || !client_id) {
      return NextResponse.json({ error: "Name and Client are required" }, { status: 400 });
    }

    const { data: project, error: pError } = await supabase
      .from("projects")
      .insert({
        name, description,
        budget:    Number(budget) || 0,
        client_id, phase: phase || "SCOPING",
        issued_date, due_date,
        budget_id: budget_id || null,
        department_id: department_id || null,
        assigned_by: assigned_by || null,
        manager_id: manager_id || null,
        workflow_status: workflow_status || 'initialized',
        is_active: true,
      })
      .select()
      .single();

    if (pError) throw pError;

    if (team_ids?.length > 0) {
      const { error: tError } = await supabase.from("project_teams").insert(
        team_ids.map((tid: string) => ({ project_id: project.id, team_id: tid }))
      );
      if (tError) throw tError;
    }

    return NextResponse.json({ success: true, project });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
