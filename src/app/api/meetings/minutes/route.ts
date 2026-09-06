/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ── GET /api/meetings/minutes?meeting_id=xxx ─────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const meetingId = req.nextUrl.searchParams.get("meeting_id");
  if (!meetingId) return NextResponse.json({ error: "meeting_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("meeting_minutes")
    .select(`*, creator:employees!meeting_minutes_created_by_fkey(id,name)`)
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ── POST /api/meetings/minutes ───────────────────────────────────────────────
// Body: { meeting_id, created_by, transcript?, summary?, key_topics?, decisions?, action_items?, status? }
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { meeting_id, created_by, ...rest } = body;

  if (!meeting_id || !created_by)
    return NextResponse.json({ error: "meeting_id and created_by required" }, { status: 400 });

  const { data, error } = await supabase
    .from("meeting_minutes")
    .upsert({ meeting_id, created_by, ...rest }, { onConflict: "meeting_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ── PATCH /api/meetings/minutes ──────────────────────────────────────────────
// Body: { meeting_id, ...fields }
export async function PATCH(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { meeting_id, ...fields } = await req.json();
  if (!meeting_id) return NextResponse.json({ error: "meeting_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("meeting_minutes")
    .update(fields)
    .eq("meeting_id", meeting_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
