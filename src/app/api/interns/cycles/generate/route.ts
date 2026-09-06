/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeCycle, cycleApplies } from "@/lib/internshipMath";

// POST /api/interns/cycles/generate
// Body: { month, year }
//
// Generates draft cycle rows for ALL active interns who are due for the given
// month (billing_date is on or before the end of that month). Existing rows
// for that month are NOT overwritten.
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  try {
    const body = await req.json();
    const month = Number(body.month);
    const year  = Number(body.year);
    if (!month || !year) {
      return NextResponse.json({ error: "month and year are required" }, { status: 400 });
    }

    // 1. Active interns
    const { data: interns, error: iErr } = await supabase
      .from("interns")
      .select("id, stipend_amount, starting_date, billing_date")
      .eq("is_active", true);
    if (iErr) throw iErr;

    // 2. Existing cycle rows
    const { data: existing, error: eErr } = await supabase
      .from("intern_stipend_cycles")
      .select("intern_id")
      .eq("month", month)
      .eq("year", year);
    if (eErr) throw eErr;
    const existingSet = new Set((existing ?? []).map(r => r.intern_id));

    // 3. Insert missing
    const toInsert: Array<{
      intern_id: string; month: number; year: number;
      paid_days: number; buffer_paid_days: number;
      holidays_taken: number; extra_leave_days: number;
      gross_amount: number; deductions: number; net_amount: number;
      payment_status: "pending";
    }> = [];

    for (const intern of interns ?? []) {
      if (existingSet.has(intern.id)) continue;
      if (!cycleApplies(intern.starting_date, intern.billing_date, month, year)) continue;
      const c = computeCycle({
        intern: {
          stipend_amount: Number(intern.stipend_amount),
          starting_date: intern.starting_date,
          billing_date: intern.billing_date,
        },
        month, year,
      });
      toInsert.push({
        intern_id: intern.id,
        month, year,
        paid_days: c.paid_days,
        buffer_paid_days: c.buffer_paid_days,
        holidays_taken: 6,
        extra_leave_days: 0,
        gross_amount: c.gross_amount,
        deductions: 0,
        net_amount: c.net_amount,
        payment_status: "pending",
      });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ created: 0, message: "All due cycles already exist for this month." });
    }

    const { error: insErr } = await supabase.from("intern_stipend_cycles").insert(toInsert);
    if (insErr) throw insErr;

    return NextResponse.json({ created: toInsert.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message ?? "Unknown error" }, { status: 500 });
  }
}
