/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const status = req.nextUrl.searchParams.get("status");
  const channelId = req.nextUrl.searchParams.get("channel_id");

  let query = supabase
    .from("meetings")
    .select(`*, host:employees!meetings_host_id_fkey(id,name,designation), meeting_participants(employee_id, role, joined_at, left_at, employees(id,name))`)
    .order("scheduled_at", { ascending: true });

  if (status) query = query.eq("status", status);
  if (channelId) query = query.eq("channel_id", channelId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { title, description, scheduled_at, type, channel_id, host_id, participant_ids } = body;

  // Generate unique room name
  const room_name = `nexawork-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({ title, description, scheduled_at, type: type || "video", channel_id, host_id, room_name, status: "scheduled" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add host as participant
  const participants = [
    { meeting_id: meeting.id, employee_id: host_id, role: "host" },
    ...(participant_ids || []).filter((id: string) => id !== host_id).map((id: string) => ({
      meeting_id: meeting.id, employee_id: id, role: "participant"
    }))
  ];
  await supabase.from("meeting_participants").insert(participants).select();

  // Post notification in channel if linked
  if (channel_id) {
    const { data: host } = await supabase.from("employees").select("name").eq("id", host_id).single();
    const when = scheduled_at ? new Date(scheduled_at).toLocaleString() : "Now";
    await supabase.from("messages").insert({
      channel_id,
      sender_id: host_id,
      sender_name: host?.name || "System",
      content: `📹 Meeting scheduled: **${title}** — ${when}. Join: /meetings/${meeting.id}`,
    });
  }

  return NextResponse.json(meeting);
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { id, status, ended_at } = body;

  const { data, error } = await supabase
    .from("meetings")
    .update({ status, ended_at })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
