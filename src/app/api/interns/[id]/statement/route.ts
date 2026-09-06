/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeCycle, cycleApplies, bufferDays, preBillingBufferDays } from "@/lib/internshipMath";

interface RouteCtx { params: Promise<{ id: string }> }

// GET /api/interns/[id]/statement
//
// Returns a chronological statement: profile header + every applicable month
// from starting_date forward, with persisted cycle data if available or a
// computed draft if not. Plus YTD totals.
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const supabase = getSupabaseAdmin();
  const { id: intern_id } = await params;

  const { data: intern, error: iErr } = await supabase
    .from("interns")
    .select("id, full_name, intern_id, upi_id, stipend_amount, joining_date, starting_date, billing_date, is_active, notes, created_at")
    .eq("id", intern_id)
    .single();
  if (iErr || !intern) {
    return NextResponse.json({ error: "Intern not found" }, { status: 404 });
  }

  const { data: persisted, error: cErr } = await supabase
    .from("intern_stipend_cycles")
    .select("*")
    .eq("intern_id", intern_id);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const byKey = new Map<string, typeof persisted[number]>(
    (persisted ?? []).map(r => [`${r.year}-${r.month}`, r])
  );

  // Walk months from starting_date.month/year to current month.
  const start = new Date(intern.starting_date + "T00:00:00Z");
  const start_m = start.getUTCMonth() + 1;
  const start_y = start.getUTCFullYear();
  const now = new Date();
  const end_m = now.getUTCMonth() + 1;
  const end_y = now.getUTCFullYear();

  const months: Array<{
    id: string | null;
    month: number;
    year: number;
    paid_days: number;
    buffer_paid_days: number;
    holidays_taken: number;
    extra_leave_days: number;
    gross_amount: number;
    deductions: number;
    net_amount: number;
    payment_status: "pending" | "paid" | "failed";
    payment_date: string | null;
    payment_ref: string | null;
    notes: string | null;
    is_persisted: boolean;
    is_buffer_month: boolean;
  }> = [];

  let y = start_y;
  let m = start_m;
  while (y < end_y || (y === end_y && m <= end_m)) {
    const key = `${y}-${m}`;
    const row = byKey.get(key);

    if (row) {
      months.push({
        id: row.id,
        month: m,
        year: y,
        paid_days: row.paid_days,
        buffer_paid_days: row.buffer_paid_days ?? 0,
        holidays_taken: row.holidays_taken,
        extra_leave_days: row.extra_leave_days,
        gross_amount: Number(row.gross_amount),
        deductions: Number(row.deductions),
        net_amount: Number(row.net_amount),
        payment_status: row.payment_status,
        payment_date: row.payment_date,
        payment_ref: row.payment_ref,
        notes: row.notes,
        is_persisted: true,
        is_buffer_month: (row.buffer_paid_days ?? 0) > 0,
      });
    } else if (cycleApplies(intern.starting_date, intern.billing_date, m, y)) {
      const c = computeCycle({
        intern: {
          stipend_amount: Number(intern.stipend_amount),
          starting_date: intern.starting_date,
          billing_date: intern.billing_date,
        },
        month: m,
        year: y,
      });
      months.push({
        id: null,
        month: m,
        year: y,
        paid_days: c.paid_days,
        buffer_paid_days: c.buffer_paid_days,
        holidays_taken: 6,
        extra_leave_days: 0,
        gross_amount: c.gross_amount,
        deductions: 0,
        net_amount: c.net_amount,
        payment_status: "pending",
        payment_date: null,
        payment_ref: null,
        notes: null,
        is_persisted: false,
        is_buffer_month: c.buffer_paid_days > 0,
      });
    }

    m++;
    if (m > 12) { m = 1; y++; }
  }

  // YTD totals
  const totals = {
    total_months: months.length,
    total_gross:   months.reduce((s, x) => s + x.gross_amount, 0),
    total_deductions: months.reduce((s, x) => s + x.deductions, 0),
    total_net:     months.reduce((s, x) => s + x.net_amount, 0),
    total_paid:    months.filter(x => x.payment_status === "paid").reduce((s, x) => s + x.net_amount, 0),
    total_pending: months.filter(x => x.payment_status !== "paid").reduce((s, x) => s + x.net_amount, 0),
  };

  return NextResponse.json({
    intern: {
      ...intern,
      stipend_amount: Number(intern.stipend_amount),
      buffer_total_days: bufferDays(intern.joining_date, intern.starting_date),
      buffer_paid_days_total: preBillingBufferDays(intern.starting_date, intern.billing_date),
    },
    months,
    totals,
  });
}
