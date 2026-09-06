/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/payslips?employeeId=...&month=...&year=...&status=...
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = req.nextUrl;
  const employeeId = searchParams.get("employeeId");
  const month      = searchParams.get("month");
  const year       = searchParams.get("year");
  const status     = searchParams.get("status");

  let query = supabase
    .from("payslips")
    .select("*, employee:employees!payslips_employee_id_fkey(name, employee_id, department, designation)");

  if (employeeId) query = query.eq("employee_id", employeeId);
  if (month)      query = query.eq("month", Number(month));
  if (year)       query = query.eq("year", Number(year));
  if (status)     query = query.eq("status", status);

  const { data, error } = await query
    .order("year",  { ascending: false })
    .order("month", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payslips: data ?? [] });
}

// POST /api/payslips — update status / notes on existing payslip
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { employee_id, month, year, status, notes, approved_by } = body;

  if (!employee_id || !month || !year) {
    return NextResponse.json({ error: "employee_id, month, year are required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    employee_id,
    month:      Number(month),
    year:       Number(year),
    notes:      notes ?? null,
    updated_at: new Date().toISOString(),
  };

  if (status) {
    updates.status = status;
    if (status === "approved") {
      updates.approved_at = new Date().toISOString();
      if (approved_by) updates.approved_by = approved_by;
    }
    if (status === "released") {
      updates.released_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase
    .from("payslips")
    .upsert(updates, { onConflict: "employee_id,month,year" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payslip: data });
}
