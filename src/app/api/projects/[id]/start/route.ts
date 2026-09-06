/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// POST /api/projects/[id]/start
// Manager accepts & starts a project — sets started_at, accepted_by, phase = IMPLEMENTATION
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = await req.json();
    const { accepted_by } = body;

    // Check if already started
    const { data: existing, error: fetchErr } = await supabase
      .from("projects")
      .select("id, started_at")
      .eq("id", id)
      .single();

    if (fetchErr) throw fetchErr;
    if (existing?.started_at) {
      return NextResponse.json({ error: "Project already started" }, { status: 400 });
    }

    const { error } = await supabase
      .from("projects")
      .update({
        started_at: new Date().toISOString(),
        accepted_by: accepted_by || null,
        phase: "IMPLEMENTATION",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
