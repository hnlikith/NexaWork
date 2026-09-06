/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeCycle } from "@/lib/internshipMath";
import { getActor } from "@/lib/onboarding/server";
import { logAudit } from "@/lib/audit";

interface RouteCtx { params: Promise<{ id: string }> }

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Best-effort write of amount_paid (the actually-credited amount). Wrapped so a
// missing column (before the ALTER is run) never breaks the main save.
async function setAmountPaid(
  supabase: any, cycleId: string, body: any, updatable: Record<string, unknown>, netAmount: number,
) {
  try {
    let ap: number | null = null;
    if ("amount_paid" in body && body.amount_paid != null) ap = Math.max(0, Number(body.amount_paid) || 0);
    else if (updatable.payment_status === "paid") ap = Number(netAmount);
    else if (updatable.payment_status === "pending" || updatable.payment_status === "failed") ap = 0;
    if (ap != null) await supabase.from("intern_stipend_cycles").update({ amount_paid: ap }).eq("id", cycleId);
  } catch { /* column may not exist yet — ignore */ }
}

// PATCH /api/interns/cycles/[id]
//
// Updates one persisted cycle. If id is "new", body must include
// { intern_id, month, year } and the row is inserted.
//
// Allowed body fields:
//   paid_days, holidays_taken, extra_leave_days,
//   gross_amount, deductions, net_amount,
//   payment_status, payment_date, payment_ref, notes, paid_by
//
// Server always recomputes net_amount = gross_amount − deductions on save to
// guard against drift.
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;

  try {
    const body = await req.json();
    const updatable: Record<string, unknown> = {};

    for (const k of [
      "paid_days","buffer_paid_days","holidays_taken","extra_leave_days",
      "gross_amount","deductions",
      "payment_status","payment_date","payment_ref","notes","paid_by",
    ]) {
      if (k in body) updatable[k] = body[k];
    }

    // Recompute gross + net whenever a day/holiday/deduction field changes.
    // Extra holidays (extra_leave_days) beyond the free allowance are LOP and
    // reduce the paid days, so gross must be recomputed from the intern's stipend
    // — not just net = gross − deductions.
    const dayFieldsChanged =
      "paid_days" in updatable || "buffer_paid_days" in updatable || "extra_leave_days" in updatable;

    if (id !== "new" && (dayFieldsChanged || "deductions" in updatable)) {
      const { data: cyc } = await supabase
        .from("intern_stipend_cycles")
        .select("intern_id, month, year, paid_days, buffer_paid_days, extra_leave_days, deductions, gross_amount, interns(stipend_amount, starting_date, billing_date)")
        .eq("id", id)
        .maybeSingle();

      const intern: any = cyc && (Array.isArray((cyc as any).interns) ? (cyc as any).interns[0] : (cyc as any).interns);

      if (cyc && intern) {
        const calc = computeCycle({
          intern: {
            stipend_amount: Number(intern.stipend_amount),
            starting_date: intern.starting_date,
            billing_date: intern.billing_date,
          },
          month: Number(cyc.month),
          year: Number(cyc.year),
          paid_days_override: Number(updatable.paid_days ?? cyc.paid_days),
          buffer_paid_days:   Number(updatable.buffer_paid_days ?? cyc.buffer_paid_days),
          extra_leave_days:   Number(updatable.extra_leave_days ?? cyc.extra_leave_days),
          deductions:         Number(updatable.deductions ?? cyc.deductions),
        });
        updatable.gross_amount = calc.gross_amount;
        updatable.net_amount   = calc.net_amount;
      } else {
        // Fallback: no intern join — just recompute net from gross − deductions.
        const gross  = Number(updatable.gross_amount  ?? cyc?.gross_amount ?? 0);
        const deduct = Number(updatable.deductions    ?? cyc?.deductions   ?? 0);
        updatable.net_amount = Math.max(0, gross - deduct);
      }
    }

    // Auto-stamp payment_date if marking paid and date wasn't provided
    if (updatable.payment_status === "paid" && !("payment_date" in updatable)) {
      updatable.payment_date = new Date().toISOString().slice(0, 10);
    }

    // Insert path: id === "new"
    if (id === "new") {
      const required = ["intern_id","month","year","paid_days","gross_amount"];
      for (const k of required) {
        if (!(k in body)) {
          return NextResponse.json({ error: `${k} required for new cycle` }, { status: 400 });
        }
      }
      const row = {
        intern_id: body.intern_id,
        month: Number(body.month),
        year:  Number(body.year),
        paid_days: Number(body.paid_days),
        buffer_paid_days: Number(body.buffer_paid_days ?? 0),
        holidays_taken: Number(body.holidays_taken ?? 6),
        extra_leave_days: Number(body.extra_leave_days ?? 0),
        gross_amount: Number(body.gross_amount),
        deductions:   Number(body.deductions ?? 0),
        net_amount:   Math.max(0, Number(body.gross_amount) - Number(body.deductions ?? 0)),
        payment_status: body.payment_status ?? "pending",
        payment_date:   body.payment_date ?? null,
        payment_ref:    body.payment_ref ?? null,
        paid_by:        body.paid_by ?? null,
        notes:          body.notes ?? null,
      };
      const { data, error } = await supabase
        .from("intern_stipend_cycles")
        .insert(row)
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "A cycle already exists for this intern/month/year." }, { status: 409 });
        }
        throw error;
      }

      await setAmountPaid(supabase, (data as any).id, body, { payment_status: row.payment_status }, (data as any).net_amount);

      // Audit the newly-created cycle (drafts saved from the manage grid land here).
      try {
        const actor = await getActor();
        const { data: who } = await supabase.from("interns").select("full_name").eq("id", body.intern_id).maybeSingle();
        const period = `${MONTHS[Number(body.month)]} ${body.year}`;
        const extra = Number(body.extra_leave_days ?? 0);
        const net = Number((data as any).net_amount);
        const summary = body.payment_status === "paid"
          ? `Marked ${period} stipend PAID for ${who?.full_name ?? "intern"} (₹${net.toLocaleString("en-IN")})`
          : extra > 0
            ? `Set ${extra} extra holiday(s) for ${who?.full_name ?? "intern"} — ${period} (net ₹${net.toLocaleString("en-IN")})`
            : `Created ${who?.full_name ?? "intern"}'s stipend cycle ${period} (net ₹${net.toLocaleString("en-IN")})`;
        await logAudit({
          actorId: actor?.userId ?? null,
          action: "internship.cycle.update",
          section: "Internship Payroll",
          summary,
          targetType: "intern_stipend_cycle",
          targetId: (data as any).id,
        });
      } catch {}

      return NextResponse.json({ cycle: data });
    }

    if (Object.keys(updatable).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("intern_stipend_cycles")
      .update(updatable)
      .eq("id", id)
      .select("*, interns(full_name)")
      .single();
    if (error) throw error;

    // Track the actual amount credited (best-effort — the amount_paid column may
    // not exist yet; it's what distinguishes paid / half-paid / over-paid).
    await setAmountPaid(supabase, id, body, updatable, (data as any).net_amount);

    // Audit: record who changed what (feeds the intern-activity view).
    try {
      const actor = await getActor();
      const who = (data as any)?.interns?.full_name ?? "intern";
      const period = `${MONTHS[Number((data as any).month)]} ${(data as any).year}`;
      let summary: string;
      if (updatable.payment_status === "paid") {
        summary = `Marked ${period} stipend PAID for ${who} (₹${Number((data as any).net_amount).toLocaleString("en-IN")})`;
      } else if ("extra_leave_days" in updatable) {
        summary = `Set ${Number(updatable.extra_leave_days)} extra holiday(s) for ${who} — ${period} (net ₹${Number((data as any).net_amount).toLocaleString("en-IN")})`;
      } else {
        summary = `Updated ${who}'s stipend cycle ${period} (net ₹${Number((data as any).net_amount).toLocaleString("en-IN")})`;
      }
      await logAudit({
        actorId: actor?.userId ?? null,
        action: "internship.cycle.update",
        section: "Internship Payroll",
        summary,
        targetType: "intern_stipend_cycle",
        targetId: id,
      });
    } catch {}

    return NextResponse.json({ cycle: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message ?? "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/interns/cycles/[id]
export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  const { error } = await supabase.from("intern_stipend_cycles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
