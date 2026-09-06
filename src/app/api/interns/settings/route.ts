/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/interns/settings
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("intern_module_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Fallback defaults if row missing (shouldn't happen — migration seeds it)
  return NextResponse.json({
    settings: data ?? {
      id: 1,
      default_holidays_per_month: 6,
      per_day_divisor: 30,
      auto_buffer_cycle: true,
      notes: null,
      updated_by: null,
      updated_at: null,
    },
  });
}

// POST /api/interns/settings
// Body: { default_holidays_per_month?, per_day_divisor?, auto_buffer_cycle?, notes?, updated_by? }
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  try {
    const body = await req.json();
    const updatable: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
    for (const k of ["default_holidays_per_month", "per_day_divisor", "auto_buffer_cycle", "notes", "updated_by"]) {
      if (k in body) updatable[k] = body[k];
    }
    const { data, error } = await supabase
      .from("intern_module_settings")
      .upsert(updatable, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message ?? "Unknown error" }, { status: 500 });
  }
}
