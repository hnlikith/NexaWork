/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getZohoToken, zohoRequest } from "@/lib/zoho-auth";

// Calendar reuses the single unified Zoho connection (see zoho-auth.ts).
// No separate token store / OAuth URL — getZohoToken() is the one helper.

/** @deprecated use getZohoToken() from "@/lib/zoho-auth" — kept for back-compat. */
export const getCalendarToken = getZohoToken;

// ── Get events for a user ─────────────────────────────────────────────────────

export async function getZohoEvents(token: string, calendarUid: string, params: {
  startTime: string;
  endTime:   string;
  limit?:    number;
}): Promise<any[]> {
  try {
    const res = await zohoRequest("calendar", `/calendars/${calendarUid}/events`, {
      token,
      params: {
        sdate: params.startTime,
        edate: params.endTime,
        range: String(params.limit || 50),
      },
    });
    return res?.events || [];
  } catch {
    return [];
  }
}

// ── Create an event ───────────────────────────────────────────────────────────

export async function createZohoEvent(token: string, calendarUid: string, event: {
  title:       string;
  description?: string;
  startTime:   string;
  endTime:     string;
  allDay?:     boolean;
  attendees?:  string[];
  recurrence?: string;
}) {
  const body: any = {
    title:       event.title,
    description: event.description || "",
    dateandtime: {
      start:    event.startTime,
      end:      event.endTime,
      timezone: "Asia/Kolkata",
    },
    isallday: event.allDay || false,
  };
  if (event.attendees?.length) {
    body.attendees = event.attendees.map(e => ({ email: e }));
  }
  if (event.recurrence) {
    body.recurrence = event.recurrence;
  }
  return zohoRequest("calendar", `/calendars/${calendarUid}/events`, { token, method: "POST", body });
}

// ── Statutory recurring events seed data ────────────────────────────────────

export const STATUTORY_EVENTS = [
  {
    title:       "Generate Payslips",
    description: "Monthly payslip generation deadline",
    dayOfMonth:  28,
    color:       "#ef4444",
    calendar_type: "statutory" as const,
    department:  "Accounts",
    recurrence:  "FREQ=MONTHLY;BYMONTHDAY=28",
  },
  {
    title:       "TDS Payment Deadline",
    description: "Monthly TDS deposit to government",
    dayOfMonth:  7,
    color:       "#f97316",
    calendar_type: "statutory" as const,
    department:  "Accounts",
    recurrence:  "FREQ=MONTHLY;BYMONTHDAY=7",
  },
  {
    title:       "GSTR-1 Filing",
    description: "Monthly GST return filing",
    dayOfMonth:  11,
    color:       "#eab308",
    calendar_type: "statutory" as const,
    department:  "Accounts",
    recurrence:  "FREQ=MONTHLY;BYMONTHDAY=11",
  },
  {
    title:       "GSTR-3B Filing",
    description: "Monthly GST summary return",
    dayOfMonth:  20,
    color:       "#eab308",
    calendar_type: "statutory" as const,
    department:  "Accounts",
    recurrence:  "FREQ=MONTHLY;BYMONTHDAY=20",
  },
  {
    title:       "PF / ESI Payment",
    description: "Monthly Provident Fund and ESI deposit",
    dayOfMonth:  15,
    color:       "#8b5cf6",
    calendar_type: "statutory" as const,
    department:  "Accounts",
    recurrence:  "FREQ=MONTHLY;BYMONTHDAY=15",
  },
];

// Quarterly dates: Advance Tax
export const ADVANCE_TAX_DATES = [
  { month: 6,  day: 15, year: 2026 },
  { month: 9,  day: 15, year: 2026 },
  { month: 12, day: 15, year: 2026 },
  { month: 3,  day: 15, year: 2027 },
];

// Quarterly: TDS Return
export const TDS_RETURN_DATES = [
  { month: 7,  day: 31, year: 2026 },
  { month: 10, day: 31, year: 2026 },
  { month: 1,  day: 31, year: 2027 },
  { month: 5,  day: 31, year: 2027 },
];
