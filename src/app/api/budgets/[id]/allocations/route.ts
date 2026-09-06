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
      .from("budget_allocations")
      .select(`*, subscriptions ( name, sub_number, category, cost_per_seat, billing_cycle )`)
      .eq("budget_id", id)
      .order("sort_order");
    if (error) throw error;
    return NextResponse.json({ allocations: data || [] });
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
    const { category, label, allocated, linked_sub_id, sort_order } = body;

    const { data, error } = await supabase
      .from("budget_allocations")
      .insert({
        budget_id:     id,
        category:      category      || "General",
        label:         label         || null,
        allocated:     allocated     ?? 0,
        linked_sub_id: linked_sub_id || null,
        sort_order:    sort_order    ?? 0,
      })
      .select(`*, subscriptions ( name, sub_number, category )`)
      .single();

    if (error) throw error;
    return NextResponse.json({ allocation: data }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  await params;
  try {
    const { searchParams } = new URL(req.url);
    const allocId = searchParams.get("allocId");
    if (!allocId) return NextResponse.json({ error: "allocId required" }, { status: 400 });

    const { error } = await supabase.from("budget_allocations").delete().eq("id", allocId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
