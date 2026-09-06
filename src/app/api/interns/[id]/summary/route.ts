/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeCycle, cycleApplies, DEFAULT_FREE_HOLIDAYS } from "@/lib/internshipMath";

interface RouteCtx { params: Promise<{ id: string }> }

export type MonthStatus = "paid" | "half_paid" | "over_paid" | "not_paid";

// GET /api/interns/[id]/summary?year=YYYY
//
// Per-month payment picture for one intern, with CARRY-FORWARD. Overpayment in a
// month automatically rolls into the next due month and reduces what's owed
// there. To compute carry correctly we walk EVERY due month chronologically from
// the intern's start up to December of the viewed year, keeping a running excess
// balance, and emit the 12 cells for the viewed year.
//
// Per month we return, separately:
//   owed           = net stipend for the month
//   direct_paid    = amount actually credited that month (amount_paid)
//   carry_in       = excess brought forward from earlier months
//   applied         = owed covered this month (from carry_in + direct_paid)
//   balance         = still to pay this month (owed − applied)
//   carry_out       = excess passed on to the next month
export async function GET(req: NextRequest, { params }: RouteCtx) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getUTCFullYear();

  const { data: intern, error } = await supabase
    .from("interns")
    .select("id, full_name, intern_id, upi_id, stipend_amount, joining_date, starting_date, billing_date, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error || !intern) return NextResponse.json({ error: "Intern not found" }, { status: 404 });

  // ALL cycles (every year) — carry can flow across year boundaries.
  const { data: cyclesRaw } = await supabase
    .from("intern_stipend_cycles")
    .select("*")
    .eq("intern_id", id);
  const byKey = new Map<string, any>((cyclesRaw ?? []).map((c) => [`${c.year}-${Number(c.month)}`, c]));

  const stipend = Number(intern.stipend_amount);
  const startingDate: string = intern.starting_date;
  const billingDate: string = intern.billing_date;
  const rate = stipend / 30;
  const round = (n: number) => Math.round(n);

  // Resolve owed + direct paid + day breakdown for a single (m, y).
  function monthData(m: number, y: number) {
    const row = byKey.get(`${y}-${m}`);
    if (row) {
      const net = Number(row.net_amount);
      return {
        persisted: true,
        cycle_id: row.id as string,
        net,
        direct_paid: row.amount_paid != null
          ? Number(row.amount_paid)
          : (row.payment_status === "paid" ? net : 0),
        paid_days: Number(row.paid_days),
        buffer_paid_days: Number(row.buffer_paid_days ?? 0),
        extra_leave_days: Number(row.extra_leave_days ?? 0),
        holidays_taken: Number(row.holidays_taken ?? DEFAULT_FREE_HOLIDAYS),
        payment_date: row.payment_date as string | null,
        payment_ref: row.payment_ref as string | null,
      };
    }
    const c = computeCycle({
      intern: { stipend_amount: stipend, starting_date: startingDate, billing_date: billingDate },
      month: m, year: y,
    });
    return {
      persisted: false, cycle_id: null as string | null,
      net: c.net_amount, direct_paid: 0,
      paid_days: c.paid_days, buffer_paid_days: c.buffer_paid_days,
      extra_leave_days: 0, holidays_taken: DEFAULT_FREE_HOLIDAYS,
      payment_date: null as string | null, payment_ref: null as string | null,
    };
  }

  // Walk from the intern's start month → Dec of the viewed year, carrying excess.
  const start = new Date(intern.starting_date + "T00:00:00Z");
  let wy = start.getUTCFullYear();
  let wm = start.getUTCMonth() + 1;

  let carry = 0;
  let lastDue: { month: number; year: number } | null = null;
  const viewed = new Map<number, any>();

  while (wy < year || (wy === year && wm <= 12)) {
    if (cycleApplies(intern.starting_date, intern.billing_date, wm, wy)) {
      const d = monthData(wm, wy);
      const owed = d.net;
      const carryIn = carry;
      // The carry always comes from the immediately previous DUE month.
      const carryFrom = carryIn > 0 ? lastDue : null;
      const available = carryIn + d.direct_paid;
      const applied = Math.min(owed, Math.max(0, available));
      const balance = Math.max(0, owed - available);
      const carryOut = Math.max(0, available - owed);
      carry = carryOut;

      let status: MonthStatus;
      if (owed <= 0) status = available > 0 ? "over_paid" : "paid";
      else if (available <= 0) status = "not_paid";
      else if (available > owed) status = "over_paid";
      else if (available >= owed) status = "paid";
      else status = "half_paid"; // 0 < available < owed

      if (wy === year) {
        const effectiveDays = Math.max(0, d.paid_days + d.buffer_paid_days - d.extra_leave_days);
        viewed.set(wm, {
          month: wm, due: true, persisted: d.persisted, cycle_id: d.cycle_id, status,
          stipend, per_day_rate: round(rate),
          net: owed, amount_paid: d.direct_paid,
          carry_in: carryIn, applied, balance, carry_out: carryOut,
          carry_from: carryFrom,
          available,
          paid_days: d.paid_days, buffer_paid_days: d.buffer_paid_days,
          extra_leave_days: d.extra_leave_days, holidays_taken: d.holidays_taken,
          effective_days: effectiveDays,
          credited_days: rate > 0 ? round(d.direct_paid / rate) : 0,
          applied_days: rate > 0 ? round(applied / rate) : 0,
          carry_in_days: rate > 0 ? round(carryIn / rate) : 0,
          carry_out_days: rate > 0 ? round(carryOut / rate) : 0,
          balance_days: rate > 0 ? round(balance / rate) : 0,
          payment_date: d.payment_date, payment_ref: d.payment_ref,
        });
      }
      lastDue = { month: wm, year: wy };
    }
    wm++; if (wm > 12) { wm = 1; wy++; }
  }

  // Emit all 12 months for the viewed year (fill not-due).
  const months = [];
  let owedYr = 0, paidYr = 0, balanceYr = 0;
  for (let m = 1; m <= 12; m++) {
    const cell = viewed.get(m);
    if (cell) {
      months.push(cell);
      owedYr += cell.net; paidYr += cell.amount_paid; balanceYr += cell.balance;
    } else {
      months.push({ month: m, due: false, status: null as MonthStatus | null });
    }
  }

  return NextResponse.json({
    intern: {
      id: intern.id, full_name: intern.full_name, intern_id: intern.intern_id,
      upi_id: intern.upi_id, stipend_amount: stipend,
      joining_date: intern.joining_date, starting_date: intern.starting_date, billing_date: intern.billing_date,
      is_active: intern.is_active,
    },
    year,
    months,
    // carry_forward = excess still unspent after December of the viewed year.
    totals: { owed: owedYr, paid: paidYr, balance: balanceYr, carry_forward: Math.max(0, carry) },
  });
}
