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
  const { searchParams } = req.nextUrl;
  const employeeId = searchParams.get("employeeId");
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  let query = supabase.from("sales_records").select("*");
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (month)      query = query.eq("month", Number(month));
  if (year)       query = query.eq("year", Number(year));

  const { data, error } = await query
    .order("year",  { ascending: false })
    .order("month", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ records: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { employee_id, month, year, amount_achieved, notes, entered_by } = body;

  if (!employee_id || !month || !year) {
    return NextResponse.json({ error: "employee_id, month, year are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sales_records")
    .upsert(
      {
        employee_id,
        month:            Number(month),
        year:             Number(year),
        amount_achieved:  Number(amount_achieved) || 0,
        notes:            notes ?? null,
        entered_by:       entered_by ?? null,
        updated_at:       new Date().toISOString(),
      },
      { onConflict: "employee_id,month,year" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: data });
}
