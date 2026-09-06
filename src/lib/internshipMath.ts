/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
/**
 * Internship stipend calculation rules:
 *   - Month is treated as a flat 30 days (NOT calendar days).
 *   - 6 free paid holidays/month (4 weekly + 2 paid). Those are baked into the
 *     30 paid days — they don't reduce the gross.
 *   - EXTRA holidays beyond the free allowance are Loss-of-Pay (LOP): each one
 *     removes a paid day. extra_leave_days holds that count.
 *   - Mid-month start: paid_days = 30 − (billing_date.day − 1)
 *   - Buffer (starting_date − joining_date) is informational only.
 *   - effective_days = paid_days + buffer_paid_days − extra_leave_days
 *   - gross = (stipend / 30) × effective_days
 *   - net   = gross − deductions
 */

/** Default free (paid) holidays per 30-day month: 4 weekly + 2 paid. */
export const DEFAULT_FREE_HOLIDAYS = 6;

export interface InternForCalc {
  stipend_amount: number;
  starting_date: string; // YYYY-MM-DD
  billing_date: string;  // YYYY-MM-DD
}

export interface CalcInput {
  intern: InternForCalc;
  month: number; // 1-12
  year: number;
  // Overrides (used when admin manually adjusts a cycle)
  paid_days_override?: number;
  buffer_paid_days?: number;  // Default 0 — buffer days credited as paid
  extra_leave_days?: number;  // LOP days (holidays beyond the free allowance)
  deductions?: number;
}

export interface CalcResult {
  paid_days: number;
  buffer_paid_days: number;
  extra_leave_days: number;
  effective_days: number;
  gross_amount: number;
  net_amount: number;
  applies: boolean; // false if intern's billing date is after the selected month
}

/**
 * Given the total holidays taken in a month and the free allowance, return the
 * number of LOP (unpaid) days. Only holidays beyond the free 6 cost pay.
 */
export function lopFromHolidays(holidaysTaken: number, freeHolidays = DEFAULT_FREE_HOLIDAYS): number {
  return Math.max(0, Math.round(Number(holidaysTaken || 0) - Number(freeHolidays)));
}

/**
 * Compute default paid_days for a given month, accounting for mid-month start.
 * Returns 0 if the intern's billing_date is in a future month from the selected
 * month (intern hadn't started billing yet).
 */
export function defaultPaidDays(billing_date: string, month: number, year: number): number {
  const bd = new Date(billing_date + "T00:00:00Z");
  const bMonth = bd.getUTCMonth() + 1;
  const bYear  = bd.getUTCFullYear();

  // Billing date is AFTER the selected month → no stipend due yet
  if (bYear > year || (bYear === year && bMonth > month)) return 0;

  // Billing date is BEFORE the selected month → full 30 days
  if (bYear < year || (bYear === year && bMonth < month)) return 30;

  // Same month → prorate from billing day
  // paid_days = 30 − days_before = 30 − (billing_date.day − 1)
  const daysBefore = bd.getUTCDate() - 1;
  return Math.max(0, 30 - daysBefore);
}

export function computeCycle(input: CalcInput): CalcResult {
  const { intern, month, year, paid_days_override, buffer_paid_days, extra_leave_days, deductions = 0 } = input;
  const default_pd  = defaultPaidDays(intern.billing_date, month, year);
  const default_bpd = defaultBufferPaidDays(intern.starting_date, intern.billing_date, month, year);
  const paid_days   = paid_days_override !== undefined ? paid_days_override : default_pd;
  const buffer_pd   = buffer_paid_days !== undefined ? buffer_paid_days : default_bpd;
  const extra_lop   = Math.max(0, Number(extra_leave_days ?? 0));
  // Extra holidays beyond the free allowance eat into paid days (LOP).
  const effective_days = Math.max(0, paid_days + buffer_pd - extra_lop);
  const gross_amount = Math.round((Number(intern.stipend_amount) / 30) * effective_days);
  const net_amount   = Math.max(0, gross_amount - Number(deductions));
  return {
    paid_days,
    buffer_paid_days: buffer_pd,
    extra_leave_days: extra_lop,
    effective_days,
    gross_amount,
    net_amount,
    applies: default_pd > 0 || default_bpd > 0,
  };
}

/**
 * Returns true if the (month, year) cycle should exist for this intern —
 * either because they have regular paid days due, OR pre-billing buffer days.
 */
export function cycleApplies(
  starting_date: string,
  billing_date: string,
  month: number,
  year: number,
): boolean {
  return defaultPaidDays(billing_date, month, year) > 0
    || defaultBufferPaidDays(starting_date, billing_date, month, year) > 0;
}

/** buffer_days for display = starting_date − joining_date (in days) */
export function bufferDays(joining_date: string, starting_date: string): number {
  const j = new Date(joining_date + "T00:00:00Z").getTime();
  const s = new Date(starting_date + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((s - j) / (1000 * 60 * 60 * 24)));
}

/**
 * Pre-billing buffer = days worked BEFORE the billing date.
 *   = billing_date − starting_date (in days)
 *
 * These days are paid at the same rate as regular days, and all land in the
 * "buffer month" = the month containing starting_date.
 */
export function preBillingBufferDays(starting_date: string, billing_date: string): number {
  const s = new Date(starting_date + "T00:00:00Z").getTime();
  const b = new Date(billing_date + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - s) / (1000 * 60 * 60 * 24)));
}

/** YYYY-MM from a date string */
function ymOf(dateStr: string): { y: number; m: number } {
  const d = new Date(dateStr + "T00:00:00Z");
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

/**
 * Returns true if (month, year) is the "buffer month" for this intern —
 * the month containing starting_date, BEFORE the billing_date month.
 */
export function isBufferMonth(
  starting_date: string,
  billing_date: string,
  month: number,
  year: number,
): boolean {
  const sd = ymOf(starting_date);
  const bd = ymOf(billing_date);
  // Buffer month requires the start to be strictly before billing
  if (sd.y > bd.y || (sd.y === bd.y && sd.m >= bd.m)) return false;
  return year === sd.y && month === sd.m;
}

/**
 * Default buffer_paid_days for a cycle in the given month:
 *   - if it's the buffer month → return total pre-billing buffer days
 *   - else → 0
 */
export function defaultBufferPaidDays(
  starting_date: string,
  billing_date: string,
  month: number,
  year: number,
): number {
  if (!isBufferMonth(starting_date, billing_date, month, year)) return 0;
  return preBillingBufferDays(starting_date, billing_date);
}
