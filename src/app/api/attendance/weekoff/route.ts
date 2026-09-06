/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import dayjs from "@/lib/dayjs";

// ── helpers ──────────────────────────────────────────────────────────────────

function weekIndex(date: dayjs.Dayjs): number {
  return Math.ceil(date.date() / 7);
}

function sundaysInMonth(year: number, month: number): dayjs.Dayjs[] {
  const start = dayjs(new Date(year, month, 1));
  const result: dayjs.Dayjs[] = [];
  for (let d = 1; d <= start.daysInMonth(); d++) {
    const day = start.date(d);
    if (day.day() === 0) result.push(day);
  }
  return result;
}

// ── GET — fetch (or initialise) a cycle for the caller ──────────────────────
// Optional ?month=YYYY-MM to pre-allot next month (gated by recycle_day).

export async function GET(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();

  const { data: settings } = await supabase
    .from("attendance_settings")
    .select("weekoff_mode, weekoffs_per_month, max_weekoffs_per_week, weekoff_carry_forward, recycle_day, lock_day, auto_assign_sundays, fixed_weekend_days")
    .eq("id", 1)
    .maybeSingle();

  if (!settings) return NextResponse.json({ error: "Settings not configured" }, { status: 500 });

  const today = dayjs();
  const monthParam = req.nextUrl.searchParams.get("month"); // optional YYYY-MM

  let targetMonth = today;
  if (monthParam) {
    const parsed = dayjs(monthParam + "-01");
    if (!parsed.isValid()) return NextResponse.json({ error: "Invalid month param" }, { status: 400 });
    const currentKey = today.format("YYYY-MM");
    const nextKey = today.add(1, "month").format("YYYY-MM");
    if (monthParam !== currentKey && monthParam !== nextKey) {
      return NextResponse.json({ error: "Can only access current or next month" }, { status: 400 });
    }
    if (monthParam === nextKey && today.date() < (settings.recycle_day ?? 25)) {
      return NextResponse.json({
        error: `Next-month pre-allotment opens on day ${settings.recycle_day ?? 25}`,
        opensOn: settings.recycle_day ?? 25,
      }, { status: 403 });
    }
    targetMonth = parsed;
  }

  const cycleKey = targetMonth.format("YYYY-MM");
  const isCurrentMonth = cycleKey === today.format("YYYY-MM");

  // ── get or create cycle ──────────────────────────────────────────────────
  let { data: cycle } = await supabase
    .from("weekoff_cycles")
    .select("*")
    .eq("employee_id", userId)
    .eq("cycle_key", cycleKey)
    .maybeSingle();

  if (!cycle) {
    const { data: fresh } = await supabase
      .from("weekoff_cycles")
      .insert({
        employee_id: userId,
        cycle_key: cycleKey,
        allotted: settings.weekoffs_per_month,
        locked: false,
        auto_assigned: false,
      })
      .select()
      .single();
    cycle = fresh;
  }

  // ── compute-on-access: lock + auto-Sunday after lock day (current month only) ─
  if (isCurrentMonth && cycle && !cycle.locked && today.date() > settings.lock_day) {
    await supabase
      .from("weekoff_cycles")
      .update({ locked: true, updated_at: new Date().toISOString() })
      .eq("id", cycle.id);
    cycle.locked = true;

    if (settings.auto_assign_sundays && !cycle.preallotted_at) {
      const sundays = sundaysInMonth(targetMonth.year(), targetMonth.month());
      const picks = sundays.slice(0, settings.weekoffs_per_month).map(s => ({
        employee_id: userId,
        cycle_key: cycleKey,
        off_date: s.format("YYYY-MM-DD"),
        week_index: weekIndex(s),
        status: "allotted",
        source: "auto_sunday",
      }));
      if (picks.length) {
        await supabase.from("weekoff_days").upsert(picks, { onConflict: "employee_id,off_date" });
      }
      await supabase
        .from("weekoff_cycles")
        .update({ auto_assigned: true, updated_at: new Date().toISOString() })
        .eq("id", cycle.id);
      cycle.auto_assigned = true;
    }
  }

  // ── carry-forward (current month only, before lock day) ─────────────────
  if (isCurrentMonth && cycle && !cycle.locked && settings.weekoff_carry_forward) {
    const { data: existingDays } = await supabase
      .from("weekoff_days")
      .select("*")
      .eq("employee_id", userId)
      .eq("cycle_key", cycleKey);

    const byWeek: Record<number, any[]> = {};
    for (const d of existingDays || []) {
      (byWeek[d.week_index] = byWeek[d.week_index] || []).push(d);
    }

    for (const [fromWk, toWk] of [[1, 2], [3, 4]]) {
      const fromDays = byWeek[fromWk] || [];
      const toDays = byWeek[toWk] || [];
      const toCap = settings.max_weekoffs_per_week;
      const carrySlots = toCap - toDays.length;
      if (carrySlots > 0 && fromDays.length === 0) {
        // week fromWk was empty — already carries into toWk naturally via allotment total
        // (no-op here; user can allocate up to toCap in toWk)
      }
      // Mark carry source on days that came from previous week
    }
  }

  // ── fetch off days + change requests ─────────────────────────────────────
  const { data: offDays } = await supabase
    .from("weekoff_days")
    .select("*")
    .eq("employee_id", userId)
    .eq("cycle_key", cycleKey)
    .order("off_date");

  const monthStart = dayjs(`${cycleKey}-01`).format("YYYY-MM-DD");
  const monthEnd   = dayjs(`${cycleKey}-01`).endOf("month").format("YYYY-MM-DD");

  const { data: changeRequests } = await supabase
    .from("weekoff_change_requests")
    .select("*")
    .eq("employee_id", userId)
    .gte("original_date", monthStart)
    .lte("original_date", monthEnd)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    cycle,
    offDays: offDays || [],
    changeRequests: changeRequests || [],
    settings,
    // Next month is never locked yet — always open for pre-allotment
    canAllot: isCurrentMonth ? !!(cycle && !cycle.locked) : true,
    isLocked: isCurrentMonth ? !!(cycle && cycle.locked) : false,
    cycleKey,
    lockDay:    settings.lock_day,
    recycleDay: settings.recycle_day,
  });
}

// ── POST — save employee's pre-allotted off dates ────────────────────────────

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { offDates, cycleKey } = await req.json() as { offDates: string[]; cycleKey: string };

  const supabase = getSupabaseAdmin();

  const { data: settings } = await supabase
    .from("attendance_settings")
    .select("weekoffs_per_month, max_weekoffs_per_week, lock_day, recycle_day")
    .eq("id", 1)
    .maybeSingle();

  if (!settings) return NextResponse.json({ error: "Settings not configured" }, { status: 500 });

  const today = dayjs();
  const isCurrentMonth = cycleKey === today.format("YYYY-MM");
  const isNextMonth    = cycleKey === today.add(1, "month").format("YYYY-MM");

  if (!isCurrentMonth && !isNextMonth) {
    return NextResponse.json({ error: "Can only save weekoffs for current or next month" }, { status: 400 });
  }
  if (isNextMonth && today.date() < (settings as any).recycle_day) {
    return NextResponse.json({ error: `Next-month pre-allotment opens on day ${(settings as any).recycle_day}` }, { status: 403 });
  }
  if (isCurrentMonth && today.date() > settings.lock_day) {
    return NextResponse.json({ error: "Pre-allotment window has closed. Submit a change request." }, { status: 400 });
  }
  if (offDates.length > settings.weekoffs_per_month) {
    return NextResponse.json({ error: `Max ${settings.weekoffs_per_month} weekoffs per month allowed` }, { status: 400 });
  }

  const perWeek: Record<number, number> = {};
  for (const d of offDates) {
    const w = weekIndex(dayjs(d));
    perWeek[w] = (perWeek[w] || 0) + 1;
    if (perWeek[w] > settings.max_weekoffs_per_week) {
      return NextResponse.json({ error: `Max ${settings.max_weekoffs_per_week} weekoff(s) per week allowed` }, { status: 400 });
    }
  }

  // Replace existing preallot picks
  await supabase.from("weekoff_days")
    .delete()
    .eq("employee_id", userId)
    .eq("cycle_key", cycleKey)
    .eq("source", "preallot");

  if (offDates.length > 0) {
    const inserts = offDates.map((d: string) => ({
      employee_id: userId,
      cycle_key: cycleKey,
      off_date: d,
      week_index: weekIndex(dayjs(d)),
      status: "allotted",
      source: "preallot",
    }));
    const { error } = await supabase.from("weekoff_days").upsert(inserts, { onConflict: "employee_id,off_date" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("weekoff_cycles")
    .update({ preallotted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("employee_id", userId)
    .eq("cycle_key", cycleKey);

  return NextResponse.json({ success: true, saved: offDates.length });
}
