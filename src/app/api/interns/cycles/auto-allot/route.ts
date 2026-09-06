/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeCycle, cycleApplies } from "@/lib/internshipMath";
import { getActor } from "@/lib/onboarding/server";
import { logAudit } from "@/lib/audit";

// POST /api/interns/cycles/auto-allot
//
// Records ONE bulk payment of a lump sum to an intern and AUTO-ALLOCATES it
// across their unpaid cycles, oldest first. Each cycle is only marked paid when
// the remaining amount fully covers its net — no partial payments. Any leftover
// is returned so the admin knows how much is unallocated.
//
// Body: { intern_id, amount, payment_date, payment_ref, paid_by?, notes? }
// Returns: { allocated: [{month,year,net_amount}], covered, leftover, unpaid_remaining }
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  try {
    const body = await req.json();
    const { intern_id, amount, payment_date, payment_ref, paid_by, notes } = body as {
      intern_id: string;
      amount: number;
      payment_date: string;
      payment_ref: string;
      paid_by?: string;
      notes?: string;
    };

    if (!intern_id || amount == null) {
      return NextResponse.json({ error: "intern_id and amount are required" }, { status: 400 });
    }
    if (!payment_date || !payment_ref) {
      return NextResponse.json({ error: "payment_date and payment_ref are required" }, { status: 400 });
    }
    let remaining = Number(amount);
    if (!(remaining > 0)) {
      return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
    }

    const { data: intern, error: iErr } = await supabase
      .from("interns")
      .select("id, stipend_amount, starting_date, billing_date")
      .eq("id", intern_id)
      .single();
    if (iErr || !intern) return NextResponse.json({ error: "Intern not found" }, { status: 404 });

    const { data: existing } = await supabase
      .from("intern_stipend_cycles")
      .select("*")
      .eq("intern_id", intern_id);
    const byKey = new Map<string, any>((existing ?? []).map((r) => [`${r.year}-${r.month}`, r]));

    // Walk months oldest → current, collecting unpaid cycles (persisted + drafts).
    const start = new Date(intern.starting_date + "T00:00:00Z");
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth() + 1;
    const now = new Date();
    const end_y = now.getUTCFullYear();
    const end_m = now.getUTCMonth() + 1;

    const unpaid: Array<{ id: string | null; month: number; year: number; paid_days: number; buffer_paid_days: number; deductions: number; net_amount: number }> = [];
    while (y < end_y || (y === end_y && m <= end_m)) {
      const row = byKey.get(`${y}-${m}`);
      if (row) {
        if (row.payment_status !== "paid") {
          unpaid.push({
            id: row.id, month: m, year: y,
            paid_days: row.paid_days, buffer_paid_days: row.buffer_paid_days ?? 0,
            deductions: Number(row.deductions), net_amount: Number(row.net_amount),
          });
        }
      } else if (cycleApplies(intern.starting_date, intern.billing_date, m, y)) {
        const c = computeCycle({
          intern: {
            stipend_amount: Number(intern.stipend_amount),
            starting_date: intern.starting_date,
            billing_date: intern.billing_date,
          },
          month: m, year: y,
        });
        unpaid.push({ id: null, month: m, year: y, paid_days: c.paid_days, buffer_paid_days: c.buffer_paid_days, deductions: 0, net_amount: c.net_amount });
      }
      m++; if (m > 12) { m = 1; y++; }
    }

    // Allocate oldest-first; only fully-covered cycles are marked paid.
    const allocated: Array<{ id: string | null; month: number; year: number; net_amount: number }> = [];
    for (const c of unpaid) {
      if (c.net_amount > remaining) break; // can't fully cover this one — stop
      const paidRow = {
        payment_status: "paid" as const,
        payment_date,
        payment_ref,
        paid_by: paid_by ?? null,
        notes: notes ?? null,
      };
      if (c.id) {
        const { error } = await supabase.from("intern_stipend_cycles").update(paidRow).eq("id", c.id);
        if (error) return NextResponse.json({ error: `Failed to pay ${c.month}/${c.year}: ${error.message}` }, { status: 500 });
      } else {
        const { error } = await supabase.from("intern_stipend_cycles").insert({
          intern_id, month: c.month, year: c.year,
          paid_days: c.paid_days, buffer_paid_days: c.buffer_paid_days,
          holidays_taken: 6, extra_leave_days: 0,
          gross_amount: c.net_amount + c.deductions, deductions: c.deductions, net_amount: c.net_amount,
          ...paidRow,
        });
        if (error && error.code !== "23505") {
          return NextResponse.json({ error: `Failed to create ${c.month}/${c.year}: ${error.message}` }, { status: 500 });
        }
      }
      remaining -= c.net_amount;
      allocated.push({ id: c.id, month: c.month, year: c.year, net_amount: c.net_amount });
    }

    // Record amount_paid = net for each cleared month (best-effort; column may not exist).
    try {
      for (const a of allocated) {
        await supabase.from("intern_stipend_cycles")
          .update({ amount_paid: a.net_amount })
          .eq("intern_id", intern_id).eq("month", a.month).eq("year", a.year);
      }
    } catch { /* amount_paid column may not exist yet */ }

    // Audit the bulk payment (feeds the intern-activity view).
    try {
      const actor = await getActor();
      const { data: who } = await supabase.from("interns").select("full_name").eq("id", intern_id).maybeSingle();
      await logAudit({
        actorId: actor?.userId ?? null,
        action: "internship.bulk_payment",
        section: "Internship Payroll",
        summary: `Recorded ₹${Number(amount).toLocaleString("en-IN")} to ${who?.full_name ?? "intern"} — cleared ${allocated.length} month(s)${Math.round(remaining) > 0 ? `, ₹${Math.round(remaining).toLocaleString("en-IN")} unallocated` : ""} · ref ${payment_ref}`,
        targetType: "intern",
        targetId: intern_id,
      });
    } catch {}

    return NextResponse.json({
      allocated,
      covered: allocated.length,
      leftover: Math.round(remaining),
      unpaid_remaining: unpaid.length - allocated.length,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message ?? "Unknown error" }, { status: 500 });
  }
}
