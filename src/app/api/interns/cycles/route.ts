/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeCycle, cycleApplies, defaultBufferPaidDays } from "@/lib/internshipMath";

// GET /api/interns/cycles?month=<1-12>&year=<YYYY>
//
// Returns ALL active interns for whom the selected month is "due" (billing_date
// is on or before the end of that month). Existing cycle rows are returned
// from DB. Missing ones are computed in-memory and returned with id=null so
// the UI can render them as drafts; the user clicks "Generate Cycles" or
// "Mark Paid" to actually persist.
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const month = Number(req.nextUrl.searchParams.get("month"));
  const year  = Number(req.nextUrl.searchParams.get("year"));

  if (!month || !year) {
    return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  }

  // 1. All active interns
  const { data: interns, error: iErr } = await supabase
    .from("interns")
    .select("id, full_name, intern_id, upi_id, stipend_amount, joining_date, starting_date, billing_date, is_active")
    .eq("is_active", true);
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  // 2. Existing cycles for that month
  const { data: existing, error: cErr } = await supabase
    .from("intern_stipend_cycles")
    .select("*")
    .eq("month", month)
    .eq("year", year);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const byInternId = new Map<string, typeof existing[number]>(
    (existing ?? []).map(r => [r.intern_id, r])
  );

  const cycles = (interns ?? [])
    .map(intern => {
      if (!cycleApplies(intern.starting_date, intern.billing_date, month, year)) return null;

      const stored = byInternId.get(intern.id);
      if (stored) {
        return {
          id: stored.id,
          intern_id: intern.id,
          full_name: intern.full_name,
          intern_code: intern.intern_id,
          upi_id: intern.upi_id,
          stipend_amount: Number(intern.stipend_amount),
          joining_date: intern.joining_date,
          starting_date: intern.starting_date,
          billing_date: intern.billing_date,
          month,
          year,
          paid_days: stored.paid_days,
          buffer_paid_days: stored.buffer_paid_days ?? 0,
          holidays_taken: stored.holidays_taken,
          extra_leave_days: stored.extra_leave_days,
          gross_amount: Number(stored.gross_amount),
          deductions: Number(stored.deductions),
          net_amount: Number(stored.net_amount),
          amount_paid: stored.amount_paid != null
            ? Number(stored.amount_paid)
            : (stored.payment_status === "paid" ? Number(stored.net_amount) : 0),
          payment_status: stored.payment_status,
          payment_date: stored.payment_date,
          payment_ref: stored.payment_ref,
          notes: stored.notes,
          is_persisted: true,
        };
      }

      // Compute draft in memory
      const c = computeCycle({
        intern: {
          stipend_amount: Number(intern.stipend_amount),
          starting_date: intern.starting_date,
          billing_date: intern.billing_date,
        },
        month, year,
      });
      const default_bpd = defaultBufferPaidDays(intern.starting_date, intern.billing_date, month, year);
      return {
        id: null,
        intern_id: intern.id,
        full_name: intern.full_name,
        intern_code: intern.intern_id,
        upi_id: intern.upi_id,
        stipend_amount: Number(intern.stipend_amount),
        joining_date: intern.joining_date,
        starting_date: intern.starting_date,
        billing_date: intern.billing_date,
        month,
        year,
        paid_days: c.paid_days,
        buffer_paid_days: default_bpd,
        holidays_taken: 6,
        extra_leave_days: 0,
        gross_amount: c.gross_amount,
        deductions: 0,
        net_amount: c.net_amount,
        amount_paid: 0,
        payment_status: "pending" as const,
        payment_date: null,
        payment_ref: null,
        notes: null,
        is_persisted: false,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return NextResponse.json({ cycles });
}
