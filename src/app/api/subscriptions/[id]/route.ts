/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  try {
    const body = await req.json();
    const {
      name, provider, category, cost_per_seat, total_seats,
      billing_cycle, currency, renewal_date, status, notes, website_url,
    } = body;

    const payload: Record<string, unknown> = {};
    if (name         !== undefined) payload.name          = name;
    if (provider     !== undefined) payload.provider      = provider || null;
    if (category     !== undefined) payload.category      = category;
    if (cost_per_seat !== undefined) payload.cost_per_seat = Number(cost_per_seat);
    if (total_seats  !== undefined) payload.total_seats   = Number(total_seats);
    if (billing_cycle !== undefined) payload.billing_cycle = billing_cycle;
    if (currency     !== undefined) payload.currency      = currency;
    if (renewal_date !== undefined) payload.renewal_date  = renewal_date || null;
    if (status       !== undefined) payload.status        = status;
    if (notes        !== undefined) payload.notes         = notes || null;
    if (website_url  !== undefined) payload.website_url   = website_url || null;

    const { data, error } = await supabase
      .from("subscriptions")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ subscription: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  try {
    const { error } = await supabase.from("subscriptions").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
