/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getZohoToken } from "@/lib/zoho-auth";
import { createZohoEvent } from "@/lib/zoho-calendar";

// Best-effort push to the creator's Zoho calendar via the unified org token.
// Non-blocking: never throws, never blocks the local event. Returns the Zoho
// event id when it succeeds so we can store it for later sync.
async function pushToZoho(event: {
  createdBy: string;
  title: string;
  description?: string | null;
  start: string;
  end: string;
  allDay?: boolean;
  attendees?: string[];
  recurrence?: string | null;
}): Promise<string | null> {
  try {
    const token = await getZohoToken();
    if (!token) return null;

    const supabase = getSupabaseAdmin();
    const { data: emp } = await supabase
      .from("employees")
      .select("zoho_account_id")
      .eq("id", event.createdBy)
      .maybeSingle();

    const calendarUid = emp?.zoho_account_id;
    if (!calendarUid) return null;

    const res = await createZohoEvent(token, calendarUid, {
      title: event.title,
      description: event.description || "",
      startTime: event.start,
      endTime: event.end,
      allDay: event.allDay,
      attendees: event.attendees,
      recurrence: event.recurrence || undefined,
    });
    return res?.events?.[0]?.uid || res?.uid || null;
  } catch {
    return null;
  }
}

// GET /api/calendar/events?userId=&department=&from=&to=&limit=
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const userId     = searchParams.get("userId");
    const department = searchParams.get("department");
    const from       = searchParams.get("from") || new Date().toISOString();
    const to         = searchParams.get("to")   || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const limit      = Number(searchParams.get("limit") || "50");

    if (!userId) return NextResponse.json({ events: [] });

    // Fetch employee role and department if not provided
    let empDept = department;
    let empRole = "";
    if (!empDept || !empRole) {
      const { data: emp } = await supabase
        .from("employees")
        .select("department, role")
        .eq("id", userId)
        .maybeSingle();
      empDept = empDept || emp?.department || null;
      empRole = emp?.role || "";
    }

    // Build query: personal events + dept events + statutory
    let query = supabase
      .from("calendar_events")
      .select("*")
      .gte("start_time", from)
      .lte("start_time", to)
      .order("start_time", { ascending: true })
      .limit(limit);

    // Show statutory + cross-dept events to admin + HR. Phase 5 will check
    // is_dept_lead/is_team_lead via DB lookup (currently only role is in scope).
    const isManager = ["admin", "hr"].includes(empRole);
    if (!isManager) {
      const filters = [`calendar_type.eq.statutory`, `created_by.eq.${userId}`];
      if (empDept) filters.push(`and(calendar_type.eq.department,department.eq.${empDept})`);
      query = query.or(filters.join(","));
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ events: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/calendar/events
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body     = await req.json();
    const {
      title, description, start_time, end_time, all_day,
      location, calendar_type, department, created_by,
      color, attendees, reminder_mins, recurrence_rule,
    } = body;

    if (!title || !start_time || !end_time || !created_by) {
      return NextResponse.json({ error: "title, start_time, end_time, created_by are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("calendar_events")
      .insert({
        title,
        description:   description || null,
        start_time,
        end_time,
        all_day:       all_day || false,
        location:      location || null,
        calendar_type: calendar_type || "personal",
        department:    department || null,
        created_by,
        color:         color || "#6366f1",
        attendees:     attendees || [],
        reminder_mins: reminder_mins ?? 15,
        recurrence_rule: recurrence_rule || null,
        is_recurring:  !!recurrence_rule,
      })
      .select()
      .single();

    if (error) throw error;

    // Mirror to Zoho calendar (best-effort, non-blocking).
    const zohoId = await pushToZoho({
      createdBy: created_by,
      title,
      description,
      start: start_time,
      end: end_time,
      allDay: all_day,
      attendees,
      recurrence: recurrence_rule,
    });
    if (zohoId) {
      await supabase
        .from("calendar_events")
        .update({ zoho_event_id: zohoId, synced_at: new Date().toISOString() })
        .eq("id", data.id)
        .then(undefined, () => {});
    }

    return NextResponse.json({ event: { ...data, zoho_event_id: zohoId ?? data.zoho_event_id } }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/calendar/events  { id, ...fields }
export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body     = await req.json();
    const { id, ...fields } = body;

    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    const allowed = [
      "title", "description", "start_time", "end_time", "all_day",
      "location", "calendar_type", "department", "color",
      "attendees", "reminder_mins", "recurrence_rule",
    ];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (fields[key] !== undefined) updates[key] = fields[key];
    }
    if ("recurrence_rule" in updates) updates.is_recurring = !!updates.recurrence_rule;

    const { data, error } = await supabase
      .from("calendar_events")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ event: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/calendar/events?id=
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
