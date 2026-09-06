/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  try {
    const { data, error } = await supabase
      .from("subscription_assignments")
      .select(`
        *,
        teams ( name ),
        employees ( name, email, employee_id, department, designation )
      `)
      .eq("subscription_id", id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ assignments: data || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  try {
    const body = await req.json();
    const {
      assignment_type, department_name, team_id, employee_id,
      seats_allocated, access_email, access_login, access_note,
    } = body;

    if (!assignment_type) {
      return NextResponse.json({ error: "assignment_type is required" }, { status: 400 });
    }

    // ── Seat capacity guard ──────────────────────────────────────────────────
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("total_seats, name")
      .eq("id", id)
      .single();

    if (sub) {
      const { data: existing } = await supabase
        .from("subscription_assignments")
        .select("seats_allocated")
        .eq("subscription_id", id);

      const usedSeats = (existing || []).reduce((sum: number, a: { seats_allocated: number }) => sum + (a.seats_allocated || 0), 0);
      const requested = Number(seats_allocated) || 1;
      const available = sub.total_seats - usedSeats;

      if (requested > available) {
        return NextResponse.json(
          { error: `Only ${available} seat${available !== 1 ? "s" : ""} available for ${sub.name} (${usedSeats}/${sub.total_seats} already allocated)` },
          { status: 400 }
        );
      }
    }

    // Resolve access_email if not provided
    let resolvedEmail = access_email || null;
    if (!resolvedEmail && employee_id) {
      const { data: emp } = await supabase
        .from("employees")
        .select("email")
        .eq("id", employee_id)
        .single();
      resolvedEmail = emp?.email || null;
    }

    const { data, error } = await supabase
      .from("subscription_assignments")
      .insert({
        subscription_id: id,
        assignment_type,
        department_name: department_name || null,
        team_id:         team_id         || null,
        employee_id:     employee_id     || null,
        seats_allocated: seats_allocated ?? 1,
        access_email:    resolvedEmail,
        access_login:    access_login    || null,
        access_note:     access_note     || null,
      })
      .select(`
        *,
        teams ( name ),
        employees ( name, email, employee_id, department, designation )
      `)
      .single();

    if (error) throw error;
    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
