/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET — Fetch responses for a ticket
export async function GET(req: NextRequest) {
  const ticketId = req.nextUrl.searchParams.get("ticketId");

  if (!ticketId) {
    return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("ticket_responses")
      .select(`
        *,
        sender:employees!ticket_responses_sender_id_fkey(id, name, email, role, department)
      `)
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ responses: data ?? [] });
  } catch (err: any) {
    console.error("[GET /api/support/responses]", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — Add a response to a ticket
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticket_id, sender_id, message, is_internal } = body;

    if (!ticket_id || !sender_id || !message) {
      return NextResponse.json({ error: "ticket_id, sender_id, message are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("ticket_responses")
      .insert({
        ticket_id,
        sender_id,
        message,
        is_internal: is_internal ?? false,
      })
      .select(`
        *,
        sender:employees!ticket_responses_sender_id_fkey(id, name, email, role, department)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json({ response: data });
  } catch (err: any) {
    console.error("[POST /api/support/responses]", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
