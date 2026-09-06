/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// Shared, framework-agnostic helpers for the workspace observability pages
// (Master Log Sheet, Workspace Monitor, Sessions, Security & Audit).
// Pure functions only — safe to import from any client component.

export interface LogRow {
  id: string;
  created_at: string;
  user_id: string | null;
  actor_name: string | null;
  actor_emp_id: string | null;
  actor_role: string | null;
  action: string;
  section: string | null;
  summary: string | null;
  changes: Record<string, { from: any; to: any }> | null;
  target_type: string | null;
  target_id: string | null;
  ip_address?: string | null;
  path?: string | null;
}

export interface PresenceRow {
  user_id: string;
  last_seen: string;
  current_path: string | null;
  status?: string | null;
  emp?: { name?: string; employee_id?: string; role?: string; is_active?: boolean } | null;
}

// ── Time ──────────────────────────────────────────────────────
export function relTime(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  return new Date(iso).toLocaleDateString();
}
export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
export function durationBetween(startIso: string, endMs: number): string {
  const s = Math.max(0, Math.round((endMs - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// ── Roles ─────────────────────────────────────────────────────
export function roleClass(role?: string | null): string {
  switch ((role || "").toLowerCase()) {
    case "admin": return "bg-rose-500/10 text-rose-600 border-rose-500/20";
    case "dept_lead": return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
    case "team_lead": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "hr": return "bg-sky-500/10 text-sky-600 border-sky-500/20";
    case "accounts": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "intern": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "candidate": return "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}
export function prettyRole(role?: string | null): string {
  if (!role) return "—";
  return role.replace(/_/g, " ");
}

// ── Values ────────────────────────────────────────────────────
export function short(v: any, n = 60): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") { try { return JSON.stringify(v).slice(0, n); } catch { return "…"; } }
  return String(v).slice(0, n);
}

// ── Section classification ────────────────────────────────────
// Prefer the section stored at write-time; otherwise infer from the action
// name so legacy rows (login/sso/password events) still land in a bucket.
export function sectionForAction(action: string, storedSection?: string | null): string {
  if (storedSection) return storedSection;
  const a = (action || "").toLowerCase();
  if (/(logout|sign_out|signed_out)/.test(a)) return "Authentication";
  if (/(login|sign_in|signin|sso|activation|session)/.test(a)) return "Authentication";
  if (/(password|mfa|2fa|suspicious|failed|breach|lockout)/.test(a)) return "Security";
  if (a.startsWith("permissions.")) return "Permissions";
  if (a.startsWith("user.")) return "Users";
  if (a.startsWith("onboarding.")) return "Onboarding";
  if (a.startsWith("recruitment.")) return "Recruitment";
  if (a.startsWith("esign.")) return "E-Sign";
  if (a.startsWith("mail")) return "Mail";
  return "General";
}

// ── Path → section (for live presence "current screen") ───────
const SECTION_OF: { test: RegExp; name: string }[] = [
  { test: /\/admin\/onboarding/, name: "Onboarding" },
  { test: /\/admin\/interviews|\/admin\/meetings/, name: "Interviews" },
  { test: /\/admin\/ats/, name: "ATS Scanner" },
  { test: /\/admin\/recruitment|\/admin\/hub/, name: "Recruitment" },
  { test: /\/admin\/users/, name: "Employees" },
  { test: /\/admin\/permissions/, name: "Permissions" },
  { test: /\/admin\/master-log|\/admin\/workspace-monitor|\/admin\/sessions|\/admin\/security/, name: "System" },
  { test: /\/admin\/mail|\/mail/, name: "Mail" },
  { test: /attendance/, name: "Attendance" },
  { test: /workspace/, name: "Workspace" },
  { test: /\/sign\//, name: "E-Sign" },
  { test: /\/documents\//, name: "Documents" },
  { test: /payroll/, name: "Payroll" },
  { test: /project/, name: "Projects" },
  { test: /\/admin/, name: "Admin" },
  { test: /\/dashboard/, name: "Dashboard" },
];
export function pathSection(p?: string | null): string {
  if (!p) return "—";
  const m = SECTION_OF.find((s) => s.test.test(p));
  return m ? m.name : p;
}

// ── Path → exact screen name ──────────────────────────────────
// Full route table for every page in the workspace, so the live "current screen"
// shows precisely where a person is (e.g. "Mail · Inbox", "KPI / KRA"), not just a
// broad section. Longest-matching prefix wins; entries flagged `exact` match only
// the literal path (so "/admin" doesn't swallow every /admin/* route).
const SCREENS: { path: string; label: string; exact?: boolean }[] = [
  // Organization
  { path: "/admin", label: "Admin Overview", exact: true },
  { path: "/hr", label: "HR Hub", exact: true },
  { path: "/accounts", label: "Accounts Hub", exact: true },
  { path: "/department-lead/dashboard", label: "Manager Hub" },
  { path: "/dashboard", label: "My Dashboard", exact: true },
  { path: "/admin/projects", label: "Projects" },
  { path: "/admin/users", label: "Employees" },
  { path: "/admin/shifts", label: "Shift Management" },
  { path: "/admin/teams", label: "Teams" },
  { path: "/admin/org-chart", label: "Org Chart" },
  // Workspace
  { path: "/admin/workspace/documents", label: "Workspace · Documents" },
  { path: "/admin/workspace/spreadsheets", label: "Workspace · Spreadsheets" },
  { path: "/admin/workspace/presentations", label: "Workspace · Presentations" },
  { path: "/admin/workspace/notes", label: "Workspace · Notes" },
  { path: "/admin/workspace", label: "Workspace Hub" },
  // HR & Hiring
  { path: "/admin/hr/job-clusters", label: "Job Clusters" },
  { path: "/admin/recruitment", label: "Recruitment Hub" },
  { path: "/admin/ats", label: "ATS Scanner" },
  { path: "/admin/interviews", label: "Interviews" },
  { path: "/admin/onboarding", label: "Onboarding" },
  // Learning & Development
  { path: "/admin/lms/courses", label: "LMS · Courses" },
  { path: "/admin/lms/certifications", label: "LMS · Certifications" },
  { path: "/admin/lms", label: "Academy Manager" },
  { path: "/dashboard/academy", label: "Training Academy" },
  // Operations
  { path: "/admin/attendance", label: "Attendance" },
  { path: "/admin/priority", label: "Priority Payout" },
  { path: "/admin/claims", label: "Claims" },
  { path: "/admin/reimbursements", label: "Reimbursements" },
  { path: "/admin/incentives", label: "Incentives" },
  { path: "/admin/kpi", label: "KPI / KRA" },
  { path: "/admin/payroll", label: "Payroll" },
  { path: "/admin/payslips", label: "Payslips" },
  { path: "/admin/support", label: "Support Center" },
  // Finance
  { path: "/admin/invoicing", label: "Invoicing" },
  { path: "/admin/vendors", label: "Vendors" },
  { path: "/admin/subscriptions", label: "Subscriptions" },
  { path: "/admin/budgets", label: "Budgets" },
  // CRM
  { path: "/admin/crm/clients", label: "CRM · Clients" },
  { path: "/admin/crm", label: "Sales Pipeline" },
  // Communications
  { path: "/admin/mail/inbox", label: "Mail · Inbox" },
  { path: "/admin/mail/compose", label: "Mail · Compose" },
  { path: "/admin/mail/sent", label: "Mail · Sent" },
  { path: "/admin/mail/drafts", label: "Mail · Drafts" },
  { path: "/admin/mail/files", label: "Mail · File Share" },
  { path: "/admin/mail/templates", label: "Mail · Templates" },
  { path: "/admin/mail/accounts", label: "Mail · Accounts" },
  { path: "/admin/mail/config", label: "Mail · Config" },
  { path: "/admin/mail", label: "Mail Hub" },
  { path: "/admin/messaging", label: "Messages" },
  { path: "/admin/meetings", label: "Meetings" },
  // My Account
  { path: "/dashboard/profile", label: "My Profile" },
  { path: "/dashboard/attendance", label: "My Attendance" },
  { path: "/dashboard/calendar", label: "My Calendar" },
  { path: "/dashboard/meetings", label: "My Meetings" },
  { path: "/dashboard/messages", label: "My Messages" },
  { path: "/dashboard/projects", label: "My Projects" },
  { path: "/department-lead/teams", label: "My Teams" },
  { path: "/department-lead/org-chart", label: "My Org Chart" },
  { path: "/dashboard/performance", label: "My Performance" },
  { path: "/dashboard/payslips", label: "My Payslips" },
  { path: "/dashboard/incentives", label: "My Incentives" },
  { path: "/dashboard/reimbursements", label: "My Reimbursements" },
  { path: "/dashboard/priority", label: "My Priority Payout" },
  { path: "/dashboard/support", label: "Support & Help" },
  // System
  { path: "/admin/workspace-monitor", label: "Workspace Monitor" },
  { path: "/admin/master-log", label: "Master Log Sheet" },
  { path: "/admin/sessions", label: "Sessions" },
  { path: "/admin/security", label: "Security & Audit" },
  { path: "/admin/permissions", label: "Permissions" },
  { path: "/admin/analytics", label: "Analytics" },
  { path: "/admin/audit", label: "Audit Log" },
  { path: "/admin/report", label: "Feature Report" },
  { path: "/admin/config", label: "System Config" },
  // Candidate / auth (magic-link + public)
  { path: "/sign", label: "E-Sign (candidate)" },
  { path: "/documents", label: "Document upload (candidate)" },
  { path: "/onboarding", label: "Onboarding (self-serve)" },
  { path: "/login", label: "Login", exact: true },
  { path: "/reset-password", label: "Reset password" },
];
const SCREENS_SORTED = [...SCREENS].sort((a, b) => b.path.length - a.path.length);
export function screenLabel(p?: string | null): string {
  if (!p) return "—";
  const clean = p.split("?")[0].replace(/\/+$/, "") || "/";
  for (const s of SCREENS_SORTED) {
    if (s.exact) {
      if (clean === s.path) return s.label;
    } else if (clean === s.path || clean.startsWith(s.path + "/")) {
      return s.label;
    }
  }
  return pathSection(clean);
}

// ── Event kinds ───────────────────────────────────────────────
export function isLoginEvent(action: string): boolean {
  const a = (action || "").toLowerCase();
  return /(login|sign_in|signin|sso|activation)/.test(a) && !/(logout|sign_out)/.test(a);
}
export function isLogoutEvent(action: string): boolean {
  return /(logout|sign_out|signed_out)/i.test(action || "");
}
export function isSessionEvent(action: string): boolean {
  return isLoginEvent(action) || isLogoutEvent(action);
}

// Security-relevant events: auth failures, credential/permission/role changes,
// account lifecycle (create/delete/deactivate), and anything explicitly flagged.
export function isSecurityEvent(l: LogRow): boolean {
  const a = (l.action || "").toLowerCase();
  if (/(password|mfa|2fa|suspicious|failed|breach|lockout|unauthorized)/.test(a)) return true;
  if (a.startsWith("permissions.")) return true;
  if (["user.delete", "user.deactivate", "user.activate", "user.create",
       "user.reset_password", "user.resend_credentials"].includes(l.action)) return true;
  if (l.action === "user.update" && l.changes && Object.prototype.hasOwnProperty.call(l.changes, "role")) return true;
  return false;
}

export type Severity = "critical" | "warning" | "info";
export function severityOf(l: LogRow): Severity {
  const a = (l.action || "").toLowerCase();
  if (/(failed|suspicious|breach|unauthorized|lockout)/.test(a)) return "critical";
  if (l.action === "user.delete" || l.action === "user.deactivate") return "critical";
  if (a.startsWith("permissions.") || /(password|mfa|role)/.test(a)) return "warning";
  if (l.action === "user.update" && l.changes && Object.prototype.hasOwnProperty.call(l.changes, "role")) return "warning";
  return "info";
}
export function severityClass(sev: Severity): string {
  switch (sev) {
    case "critical": return "bg-rose-500/10 text-rose-600 border-rose-500/20";
    case "warning": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    default: return "bg-sky-500/10 text-sky-600 border-sky-500/20";
  }
}

// ── Live presence status ──────────────────────────────────────
// 7 states:  available · online · idle · break · interview · busy · offline
// Priority: explicit offline → path-based (interview/busy) → stored status → timing
export interface PresenceView { key: string; label: string; dot: string; badge: string; }
export function presenceStatus(p: PresenceRow, now: number): PresenceView {
  const delta = now - new Date(p.last_seen).getTime();
  const path = (p.current_path || "").toLowerCase();
  const stored = (p.status || "").toLowerCase();

  // Explicitly checked out OR vanished for > 15 min → Offline
  if (stored === "offline" || delta >= 900_000) {
    return { key: "offline", label: "Offline", dot: "bg-zinc-400", badge: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" };
  }
  // Path overrides: physically on an interview or meeting screen
  if (/interview/.test(path)) {
    return { key: "interview", label: "Interview", dot: "bg-violet-500 animate-pulse", badge: "bg-violet-500/10 text-violet-600 border-violet-500/20" };
  }
  if (/meeting/.test(path)) {
    return { key: "busy", label: "Busy", dot: "bg-rose-500 animate-pulse", badge: "bg-rose-500/10 text-rose-600 border-rose-500/20" };
  }
  // On break (attendance paused)
  if (stored === "break") {
    return { key: "break", label: "Break", dot: "bg-orange-400", badge: "bg-orange-500/10 text-orange-600 border-orange-500/20" };
  }
  // No heartbeat for 2 min → Idle
  if (delta >= 120_000) {
    return { key: "idle", label: "Idle", dot: "bg-amber-400", badge: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
  }
  // Checked in (Available — green)
  if (stored === "available") {
    return { key: "available", label: "Available", dot: "bg-emerald-500 animate-pulse", badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
  }
  // Logged in but not checked in (Online — blue)
  return { key: "online", label: "Online", dot: "bg-blue-500 animate-pulse", badge: "bg-blue-500/10 text-blue-500 border-blue-500/20" };
}

// WhatsApp-style "Last seen X ago" for offline/idle rows
export function lastSeenLabel(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Last seen just now";
  const m = Math.round(s / 60);
  if (m === 1) return "Last seen 1 minute ago";
  if (m < 60) return `Last seen ${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h === 1) return "Last seen 1 hour ago";
  if (h < 24) return `Last seen ${h} hours ago`;
  return `Last seen on ${new Date(iso).toLocaleDateString()}`;
}

// ── CSV export ────────────────────────────────────────────────
export function toCSV(rows: LogRow[]): string {
  const head = ["Timestamp", "User", "Employee ID", "Role", "Module", "Section", "Action", "Summary", "Path", "Target", "IP"];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((l) => [
    fullTime(l.created_at), l.actor_name ?? "", l.actor_emp_id ?? "", l.actor_role ?? "",
    l.path ? screenLabel(l.path) : "", sectionForAction(l.action, l.section), l.action, l.summary ?? "",
    l.path ?? "", `${l.target_type ?? ""} ${l.target_id ?? ""}`.trim(), l.ip_address ?? "",
  ].map(esc).join(","));
  return [head.map(esc).join(","), ...lines].join("\r\n");
}

export function getPresenceSessionId(): string {
  if (typeof window === "undefined") return "default";
  let id = sessionStorage.getItem("np_presence_session_id");
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem("np_presence_session_id", id);
  }
  return id;
}

// ── IST (India) date/time filtering for log classification ────────────────────
// Every timestamp is stored UTC; these read the wall-clock in IST (UTC+5:30) so the
// Master Log / Sessions / Security / Activity pages can filter by time-of-day and by
// year / month / day the Indian way.
const IST_OFFSET_MIN = 330; // +5:30

export interface ISTParts { year: number; month: number; day: number; hour: number; minute: number }
export function istParts(iso: string): ISTParts {
  const shifted = new Date(new Date(iso).getTime() + IST_OFFSET_MIN * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1, // 1–12
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export type TimeOfDay = "all" | "morning" | "afternoon" | "evening" | "night";
// Indian convention: Morning 5–12, Afternoon 12–5, Evening 5–9, Night 9–5.
export function timeOfDayIST(iso: string): Exclude<TimeOfDay, "all"> {
  const h = istParts(iso).hour;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}
export const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string }[] = [
  { value: "all",       label: "All day" },
  { value: "morning",   label: "🌅 Morning (5 AM–12 PM)" },
  { value: "afternoon", label: "☀️ Afternoon (12–5 PM)" },
  { value: "evening",   label: "🌇 Evening (5–9 PM)" },
  { value: "night",     label: "🌙 Night (9 PM–5 AM)" },
];
export const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export interface LogTimeFilter { tod: TimeOfDay; year: string; month: string; day: string } // "all" | numeric string
export const DEFAULT_LOG_TIME_FILTER: LogTimeFilter = { tod: "all", year: "all", month: "all", day: "all" };

/** True if the timestamp passes the IST time-of-day + year/month/day filter. */
export function passesTimeFilter(iso: string, f: LogTimeFilter): boolean {
  const p = istParts(iso);
  if (f.year !== "all" && p.year !== Number(f.year)) return false;
  if (f.month !== "all" && p.month !== Number(f.month)) return false;
  if (f.day !== "all" && p.day !== Number(f.day)) return false;
  if (f.tod !== "all" && timeOfDayIST(iso) !== f.tod) return false;
  return true;
}

/** Distinct IST years present in a set of rows (descending), for the year dropdown. */
export function istYearsOf(isos: string[]): number[] {
  const set = new Set<number>();
  for (const iso of isos) set.add(istParts(iso).year);
  return Array.from(set).sort((a, b) => b - a);
}
