/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// Scoped "payroll intern" access.
//
// These accounts are temporary helpers who may ONLY use the internship stipend
// pages. They are locked down by email (not by role) because the restriction is
// per-account and temporary — add/remove an address here to grant/revoke access.
// Enforced in: login redirect (AuthProvider), root router, DashboardShell guard,
// and the Sidebar (which shows only the internship links for these accounts).

// Configured via PAYROLL_INTERN_EMAILS (comma-separated). No hardcoded
// address — an unconfigured deployment grants this scoped access to nobody,
// rather than guessing an email that doesn't exist for this company.
export const PAYROLL_INTERN_EMAILS = (process.env.PAYROLL_INTERN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Landing page + the only navigable area for these accounts.
export const PAYROLL_INTERN_HOME = "/admin/payroll/internship";

export function isPayrollInternOnly(email?: string | null): boolean {
  return !!email && PAYROLL_INTERN_EMAILS.includes(email.trim().toLowerCase());
}

/** True when the path is inside the internship module these accounts may use. */
export function isPayrollInternPathAllowed(pathname?: string | null): boolean {
  if (!pathname) return false;
  return pathname === PAYROLL_INTERN_HOME || pathname.startsWith(PAYROLL_INTERN_HOME + "/");
}
