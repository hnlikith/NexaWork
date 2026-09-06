/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const { data, error } = await supabase
      .from("project_tasks")
      .select(`*, assigned_to_employee:employees!assigned_to (id, name, employee_id)`)
      .eq("project_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Enrich assignee_ids with employee details
    const allIds = [...new Set((data || []).flatMap((t: any) => t.assignee_ids || []))];
    let employeeMap: Record<string, { id: string; name: string; employee_id: string }> = {};
    if (allIds.length > 0) {
      const { data: emps } = await supabase
        .from("employees")
        .select("id, name, employee_id")
        .in("id", allIds);
      (emps || []).forEach((e: any) => { employeeMap[e.id] = e; });
    }

    const tasks = (data || []).map((t: any) => ({
      ...t,
      assignees: (t.assignee_ids || []).map((uid: string) => employeeMap[uid]).filter(Boolean),
    }));

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = await req.json();

    const { title, description, status, priority, assignee_ids, due_date } = body;
    const primaryAssignee = assignee_ids?.[0] || null;

    const { data, error } = await supabase
      .from("project_tasks")
      .insert([{
        project_id: id,
        title,
        description,
        status: status || 'TODO',
        priority: priority || 'Medium',
        assigned_to: primaryAssignee,
        assignee_ids: assignee_ids || [],
        due_date: due_date || null
      }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ task: data }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
