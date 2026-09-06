/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/interns?active=true|false (omit for all)
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const active = req.nextUrl.searchParams.get("active");

  let query = supabase.from("interns").select("*").order("created_at", { ascending: false });
  if (active === "true")  query = query.eq("is_active", true);
  if (active === "false") query = query.eq("is_active", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interns: data ?? [] });
}

// POST /api/interns
// Body: { full_name, intern_id, upi_id, stipend_amount, joining_date, starting_date, billing_date, notes?, created_by? }
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  try {
    const body = await req.json();
    const {
      full_name, intern_id, upi_id, stipend_amount,
      joining_date, starting_date, billing_date,
      notes, created_by,
    } = body;

    if (!full_name || !intern_id || !stipend_amount || !joining_date || !starting_date || !billing_date) {
      return NextResponse.json({
        error: "full_name, intern_id, stipend_amount, joining_date, starting_date, billing_date are required",
      }, { status: 400 });
    }

    const { data, error } = await supabase.from("interns").insert({
      full_name,
      intern_id,
      upi_id:          upi_id ?? null,
      stipend_amount:  Number(stipend_amount),
      joining_date,
      starting_date,
      billing_date,
      notes:           notes ?? null,
      created_by:      created_by ?? null,
    }).select("*").single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: `Intern ID "${intern_id}" already exists.` }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ intern: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message ?? "Unknown error" }, { status: 500 });
  }
}
