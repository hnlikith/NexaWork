/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { STATUTORY_EVENTS, ADVANCE_TAX_DATES, TDS_RETURN_DATES } from "@/lib/zoho-calendar";

// POST /api/calendar/seed-statutory
// Admin only — idempotent seeding of all statutory recurring events
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body     = await req.json().catch(() => ({}));
    const adminId  = body.admin_id || null;

    // Verify caller is admin
    if (adminId) {
      const { data: emp } = await supabase
        .from("employees")
        .select("role")
        .eq("id", adminId)
        .maybeSingle();
      if (emp?.role !== "admin") {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
      }
    }

    const now  = new Date();
    const year = now.getFullYear();
    const rows: any[] = [];

    // ── Monthly recurring statutory events ───────────────────────────────────
    for (const evt of STATUTORY_EVENTS) {
      // Check if already seeded
      const { count } = await supabase
        .from("calendar_events")
        .select("id", { count: "exact", head: true })
        .eq("title", evt.title)
        .eq("calendar_type", "statutory");

      if ((count || 0) > 0) continue;

      // Create one event per month for the next 12 months
      for (let m = 0; m < 12; m++) {
        const d      = new Date(year, now.getMonth() + m, evt.dayOfMonth);
        const start  = new Date(d.getFullYear(), d.getMonth(), evt.dayOfMonth, 9, 0, 0);
        const end    = new Date(d.getFullYear(), d.getMonth(), evt.dayOfMonth, 10, 0, 0);

        rows.push({
          title:         evt.title,
          description:   evt.description,
          start_time:    start.toISOString(),
          end_time:      end.toISOString(),
          all_day:       false,
          calendar_type: "statutory",
          department:    evt.department,
          color:         evt.color,
          reminder_mins: 1440, // 24 hours
          recurrence_rule: evt.recurrence,
          is_recurring:  true,
          attendees:     [],
        });
      }
    }

    // ── Advance Tax (quarterly) ───────────────────────────────────────────────
    const { count: atCount } = await supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("title", "Advance Tax Payment")
      .eq("calendar_type", "statutory");

    if ((atCount || 0) === 0) {
      for (const d of ADVANCE_TAX_DATES) {
        const start = new Date(d.year, d.month - 1, d.day, 9, 0, 0);
        const end   = new Date(d.year, d.month - 1, d.day, 10, 0, 0);
        rows.push({
          title:         "Advance Tax Payment",
          description:   "Quarterly advance tax deposit deadline",
          start_time:    start.toISOString(),
          end_time:      end.toISOString(),
          all_day:       false,
          calendar_type: "statutory",
          department:    "Accounts",
          color:         "#dc2626",
          reminder_mins: 1440,
          is_recurring:  false,
          attendees:     [],
        });
      }
    }

    // ── TDS Return (quarterly) ────────────────────────────────────────────────
    const { count: tdsCount } = await supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("title", "TDS Return Filing")
      .eq("calendar_type", "statutory");

    if ((tdsCount || 0) === 0) {
      for (const d of TDS_RETURN_DATES) {
        const start = new Date(d.year, d.month - 1, d.day, 9, 0, 0);
        const end   = new Date(d.year, d.month - 1, d.day, 10, 0, 0);
        rows.push({
          title:         "TDS Return Filing",
          description:   "Quarterly TDS return submission deadline",
          start_time:    start.toISOString(),
          end_time:      end.toISOString(),
          all_day:       false,
          calendar_type: "statutory",
          department:    "Accounts",
          color:         "#dc2626",
          reminder_mins: 1440,
          is_recurring:  false,
          attendees:     [],
        });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ message: "Statutory events already seeded.", seeded: 0 });
    }

    const { data, error } = await supabase.from("calendar_events").insert(rows).select("id");
    if (error) throw error;

    await supabase.from("audit_logs").insert({
      user_id:     adminId,
      action:      "statutory_events_seeded",
      target_type: "calendar",
      metadata:    { count: rows.length },
    });

    return NextResponse.json({ message: `Seeded ${rows.length} statutory events.`, seeded: rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
