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

// POST /api/interns/cycles/bulk-pay
//
// Records ONE payment that clears multiple cycles for a SINGLE intern.
// Drafts (un-persisted cycle rows for past months) are inserted on the fly.
//
// Body:
//   {
//     intern_id: string,
//     cycles: Array<{
//       id: string | null,        // cycle id if persisted; null if draft
//       month: number,
//       year: number,
//       paid_days: number,
//       buffer_paid_days?: number,
//       deductions?: number,
//     }>,
//     payment_date: string (YYYY-MM-DD),
//     payment_ref: string,
//     paid_by?: string,
//     notes?: string,
//   }
//
// Returns: { updated_ids: string[], created_ids: string[] }
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  try {
    const body = await req.json();
    const {
      intern_id, cycles,
      payment_date, payment_ref,
      paid_by, notes,
    } = body as {
      intern_id: string;
      cycles: Array<{
        id: string | null;
        month: number;
        year: number;
        paid_days: number;
        buffer_paid_days?: number;
        deductions?: number;
      }>;
      payment_date: string;
      payment_ref: string;
      paid_by?: string;
      notes?: string;
    };

    if (!intern_id || !Array.isArray(cycles) || cycles.length === 0) {
      return NextResponse.json({ error: "intern_id and non-empty cycles[] are required" }, { status: 400 });
    }
    if (!payment_date || !payment_ref) {
      return NextResponse.json({ error: "payment_date and payment_ref are required" }, { status: 400 });
    }

    // Look up intern stipend amount + dates
    const { data: intern, error: iErr } = await supabase
      .from("interns")
      .select("id, stipend_amount, starting_date, billing_date")
      .eq("id", intern_id)
      .single();
    if (iErr || !intern) {
      return NextResponse.json({ error: "Intern not found" }, { status: 404 });
    }

    const updated_ids: string[] = [];
    const created_ids: string[] = [];

    for (const c of cycles) {
      const buffer = Number(c.buffer_paid_days ?? 0);
      const deduct = Number(c.deductions ?? 0);
      const calc = computeCycle({
        intern: {
          stipend_amount: Number(intern.stipend_amount),
          starting_date: intern.starting_date,
          billing_date: intern.billing_date,
        },
        month: c.month,
        year: c.year,
        paid_days_override: c.paid_days,
        buffer_paid_days: buffer,
        deductions: deduct,
      });

      const baseRow = {
        intern_id,
        month: c.month,
        year: c.year,
        paid_days: c.paid_days,
        buffer_paid_days: buffer,
        gross_amount: calc.gross_amount,
        deductions: deduct,
        net_amount: calc.net_amount,
        payment_status: "paid" as const,
        payment_date,
        payment_ref,
        paid_by: paid_by ?? null,
        notes: notes ?? null,
      };

      if (c.id) {
        const { error } = await supabase
          .from("intern_stipend_cycles")
          .update(baseRow)
          .eq("id", c.id);
        if (error) {
          return NextResponse.json({ error: `Failed to update cycle ${c.id}: ${error.message}` }, { status: 500 });
        }
        updated_ids.push(c.id);
        try { await supabase.from("intern_stipend_cycles").update({ amount_paid: calc.net_amount }).eq("id", c.id); } catch {}
      } else {
        const { data, error } = await supabase
          .from("intern_stipend_cycles")
          .insert({ ...baseRow, holidays_taken: 6, extra_leave_days: 0 })
          .select("id")
          .single();
        if (error) {
          if (error.code === "23505") {
            return NextResponse.json({ error: `Cycle for ${c.month}/${c.year} already exists` }, { status: 409 });
          }
          return NextResponse.json({ error: `Failed to insert cycle ${c.month}/${c.year}: ${error.message}` }, { status: 500 });
        }
        if (data?.id) {
          created_ids.push(data.id);
          try { await supabase.from("intern_stipend_cycles").update({ amount_paid: calc.net_amount }).eq("id", data.id); } catch {}
        }
      }
    }

    try {
      const actor = await getActor();
      const { data: who } = await supabase.from("interns").select("full_name").eq("id", intern_id).maybeSingle();
      await logAudit({
        actorId: actor?.userId ?? null,
        action: "internship.backlog_payment",
        section: "Internship Payroll",
        summary: `Cleared ${updated_ids.length + created_ids.length} stipend month(s) for ${who?.full_name ?? "intern"} · ref ${payment_ref}`,
        targetType: "intern",
        targetId: intern_id,
      });
    } catch {}

    return NextResponse.json({
      updated_ids,
      created_ids,
      total: updated_ids.length + created_ids.length,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message ?? "Unknown error" }, { status: 500 });
  }
}
