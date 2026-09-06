/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const supabase = getSupabaseAdmin();
    const { taskId } = await params;
    const body = await req.json();

    const { title, description, status, priority, assignee_ids, assigned_to, due_date } = body;
    const primaryAssignee = assignee_ids !== undefined
      ? (assignee_ids[0] || null)
      : assigned_to;

    const { data, error } = await supabase
      .from("project_tasks")
      .update({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(assignee_ids !== undefined && { assignee_ids, assigned_to: primaryAssignee }),
        ...(assigned_to !== undefined && assignee_ids === undefined && { assigned_to }),
        ...(due_date !== undefined && { due_date }),
        updated_at: new Date().toISOString()
      })
      .eq("id", taskId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ task: data }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const supabase = getSupabaseAdmin();
    const { taskId } = await params;

    const { error } = await supabase.from("project_tasks").delete().eq("id", taskId);
    if (error) throw error;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
