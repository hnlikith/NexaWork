/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { useApi } from "@/hooks/useApi";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  calculateCompanyScore,
  calculateFinalIncentive,
  getCompanyMultiplier,
  getEmployeeMultiplier,
} from "@/lib/incentiveMath";
import {
  IndianRupee,
  Gift,
  TrendingDown,
  Activity,
  Download,
  Settings,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
  ChevronRight,
  CalendarRange,
  Briefcase,
  AlertTriangle,
  FileText,
  Ticket,
  UserPlus,
  Bell,
  Cake,
  Award,
  Building2,
  ShoppingBag,
  Receipt,
  History,
  Video,
  Star,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button as ShadcnButton } from "@/components/ui/button";
import type { DateRange as CalendarRangeType } from "react-day-picker";
import { useToast } from "@/components/ui/ToastLegacy";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Cell,
  Pie,
  PieChart,
  AreaChart,
  Area,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface UserShape  { id: string; name: string; }
interface ConfigShape {
  company_revenue: number;
  expense_percentage: number;
  revenue_achievement_percentage: number;
  collections_percentage: number;
  delivery_health_percentage: number;
  payout_pool_amount: number;
}

interface AnalyticsData {
  revenue: number[];
  expenses: number[];
  kpi: {
    revenue: number;
    expenses: number;
    profit: number;
    projects: number;
    budgetUsed: number;
  };
  kpiScorecard: any[];
}

// ─── Business Health Chart ────────────────────────────────
// Indian Financial Year (April → March). 12 months in order.
// The current calendar month uses live config values; other months use a small mock trend.
const FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

// Maps the current calendar month (0–11, Jan=0) to its index in FY_MONTHS.
// April (calendar 3) → FY index 0; March (calendar 2) → FY index 11.
function fyIndexFromCalendarMonth(monthIdx: number): number {
  return (monthIdx + 9) % 12;
}

function buildChartData(revenue: number, collections: number, delivery: number) {
  const rval = Number(revenue) || 0;
  const cval = Number(collections) || 0;
  const dval = Number(delivery) || 0;

  const currentFyIdx = fyIndexFromCalendarMonth(new Date().getMonth());

  return FY_MONTHS.map((month, i) => {
    // Distance from current month — past months get a small negative offset, future months are zero (not yet reported)
    const distance = currentFyIdx - i;
    const isCurrent = i === currentFyIdx;
    const isPast = distance > 0;

    const offset = isPast ? -(distance * 1.5) : 0;
    const value = (base: number) => {
      if (!isPast && !isCurrent) return 0; // future months: no data yet
      if (isCurrent) return Math.max(0, Math.min(100, base));
      return Math.max(0, Math.min(100, base + offset));
    };

    return {
      month,
      Revenue:     value(rval),
      Collections: value(cval),
      Delivery:    value(dval),
      isCurrent,
      isFuture: !isPast && !isCurrent,
    };
  });
}

const chartConfig = {
  Revenue:     { label: "Revenue",     color: "#0ea5e9" },
  Collections: { label: "Collections", color: "#10b981" },
  Delivery:    { label: "Delivery",    color: "#a855f7" },
} satisfies ChartConfig;

function BusinessHealthChart({
  revenue,
  collections,
  delivery,
}: {
  revenue: number;
  collections: number;
  delivery: number;
}) {
  const data = buildChartData(revenue, collections, delivery);

  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <BarChart data={data} barCategoryGap="30%" barGap={3}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 0" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="4 4" />
        <ChartTooltip
          cursor={{ fill: "var(--accent)", radius: 6 }}
          content={<ChartTooltipContent indicator="dot" formatter={(value, name) => (
            <div className="flex w-full items-center justify-between gap-4">
              <span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig]?.label ?? name}</span>
              <span className="font-semibold text-foreground tabular-nums">{value}%</span>
            </div>
          )} />}
        />
        {(["Revenue", "Collections", "Delivery"] as const).map((key) => (
          <Bar key={key} dataKey={key} fill={chartConfig[key].color} radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell
                key={idx}
                fill={chartConfig[key].color}
                opacity={entry.isCurrent ? 1 : 0.55}
              />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}

// ─── Mock fallback data (shown when API is not wired) ─────
const MOCK_CONFIG: ConfigShape = {
  company_revenue: 0,
  expense_percentage: 0,
  revenue_achievement_percentage: 0,
  collections_percentage: 0,
  delivery_health_percentage: 0,
  payout_pool_amount: 0,
};

// ─── Date range filter options ───────────────────────────
type DateRange = "today" | "yesterday" | "7d" | "30d" | "3m" | "fy" | "custom";

const DATE_RANGE_OPTIONS: { value: Exclude<DateRange, "custom">; label: string }[] = [
  { value: "today",     label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d",        label: "7 Days" },
  { value: "30d",       label: "30 Days" },
  { value: "3m",        label: "3 Months" },
  { value: "fy",        label: "Financial Year" },
];

/** Returns {from, to} date strings (ISO) for a given range. FY runs Apr 1 → Mar 31 (India). */
function rangeBounds(r: DateRange, custom?: CalendarRangeType | null): { from: Date; to: Date; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  if (r === "today")     return { from: today, to: tomorrow, label: "today" };
  if (r === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { from: y, to: today, label: "yesterday" };
  }
  if (r === "7d")  { const f = new Date(today); f.setDate(f.getDate() - 7);  return { from: f, to: tomorrow, label: "last 7 days" }; }
  if (r === "30d") { const f = new Date(today); f.setDate(f.getDate() - 30); return { from: f, to: tomorrow, label: "last 30 days" }; }
  if (r === "3m")  { const f = new Date(today); f.setMonth(f.getMonth() - 3); return { from: f, to: tomorrow, label: "last 3 months" }; }
  if (r === "custom" && custom?.from) {
    const from = new Date(custom.from);
    from.setHours(0, 0, 0, 0);
    const to = custom.to ? new Date(custom.to) : new Date(from);
    to.setHours(0, 0, 0, 0);
    to.setDate(to.getDate() + 1); // make `to` exclusive
    const label = custom.to
      ? `${dayjs(custom.from).format("MMM D")} – ${dayjs(custom.to).format("MMM D")}`
      : dayjs(custom.from).format("MMM D, YYYY");
    return { from, to, label };
  }
  // fy: April this year (or last April if we're before April)
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const from = new Date(fyStartYear, 3, 1);  // April 1
  const to   = new Date(fyStartYear + 1, 2, 31); to.setDate(to.getDate() + 1);
  return { from, to, label: `FY ${String(fyStartYear).slice(-2)}–${String(fyStartYear + 1).slice(-2)}` };
}

// ─── Operations snapshot — admin pulse counters ──────────
interface SnapshotData {
  totalEmployees: number;
  presentToday: number;
  pendingLeaves: number;
  activeProjects: number;
  openTickets: number;
  pendingPriority: number;
  recentHires: number;
  // Claims / reimbursements
  pendingClaims: number;
  pendingReimbursements: number;
  pendingClaimAmount: number;
  pendingReimbAmount: number;
  // Sales / invoicing
  invoicesIssued: number;
  invoicesTotal: number;
  invoicesPaid: number;
  invoicesOutstanding: number;
}

const EMPTY_SNAPSHOT: SnapshotData = {
  totalEmployees: 0,
  presentToday: 0,
  pendingLeaves: 0,
  activeProjects: 0,
  openTickets: 0,
  pendingPriority: 0,
  recentHires: 0,
  pendingClaims: 0,
  pendingReimbursements: 0,
  pendingClaimAmount: 0,
  pendingReimbAmount: 0,
  invoicesIssued: 0,
  invoicesTotal: 0,
  invoicesPaid: 0,
  invoicesOutstanding: 0,
};

// ─── Detail data types ───────────────────────────────────
interface AuditEntry { id: string; action: string; target_type: string | null; user_id: string | null; created_at: string; metadata: any; }
interface MeetingEntry { id: string; title: string; scheduled_at: string; status: string | null; }
interface BirthdayEntry { id: string; name: string; type: "birthday" | "anniversary"; years_completed?: number; }
interface PerformerEntry { employee_id: string; name: string; score: number; department: string | null; }
interface DepartmentSlice { name: string; value: number; }
interface SalesPoint { period: string; amount: number; }

// Chart palette for department pie — uses shadcn chart vars
const DEPT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#0ea5e9", "#a855f7", "#f59e0b"];

export default function AdminOverview() {
  const { request } = useApi();
  const { showToast } = useToast();
  const [config, setConfig] = useState<ConfigShape>(MOCK_CONFIG);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [employeeRows, setEmployeeRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [customRange, setCustomRange] = useState<CalendarRangeType | undefined>(undefined);
  const [customOpen, setCustomOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotData>(EMPTY_SNAPSHOT);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [auditFeed, setAuditFeed] = useState<AuditEntry[]>([]);
  const [meetings, setMeetings] = useState<MeetingEntry[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [performers, setPerformers] = useState<PerformerEntry[]>([]);
  const [deptSlices, setDeptSlices] = useState<DepartmentSlice[]>([]);
  const [salesTrend, setSalesTrend] = useState<SalesPoint[]>([]);

  // Pull operations pulse + detail data from Supabase (per current date range)
  const loadSnapshot = useCallback(async (range: DateRange, custom?: CalendarRangeType) => {
    setSnapshotLoading(true);
    const { from, to } = rangeBounds(range, custom ?? null);
    const fromIso = from.toISOString();
    const toIso   = to.toISOString();
    const fromDate = from.toISOString().slice(0, 10);
    const toDate   = new Date(to.getTime() - 1).toISOString().slice(0, 10);
    const today    = new Date().toISOString().slice(0, 10);
    const sevenDaysOut = dayjs().add(7, "day").toISOString();
    const todayMMDD = dayjs().format("MM-DD"); // for birthdays/anniversaries
    const nowYear   = new Date().getFullYear();

    const results = await Promise.allSettled([
      // 0  total active employees
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
      // 1  present today
      supabase.from("attendance_logs").select("id", { count: "exact", head: true }).eq("date", today).not("clock_in", "is", null),
      // 2  pending leave requests
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      // 3  active projects
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("is_active", true),
      // 4  open support tickets
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
      // 5  pending priority payouts
      supabase.from("priority_payouts").select("id", { count: "exact", head: true }).eq("status", "pending"),
      // 6  new hires in range
      supabase.from("employees").select("id", { count: "exact", head: true }).gte("joining_date", fromDate).lte("joining_date", toDate),
      // 7  pending claims (rows for amount sum)
      supabase.from("claims").select("id, amount").eq("status", "pending"),
      // 8  pending reimbursements (rows for amount sum)
      supabase.from("reimbursements").select("id, amount").eq("status", "pending"),
      // 9  invoices issued in range
      supabase.from("invoices").select("id, total, status, issued_date").gte("issued_date", fromDate).lte("issued_date", toDate),
      // 10 audit feed (latest 8 entries)
      supabase.from("audit_logs").select("id, action, target_type, user_id, created_at, metadata").order("created_at", { ascending: false }).limit(8),
      // 11 upcoming meetings (next 7 days)
      supabase.from("meetings").select("id, title, scheduled_at, status").gte("scheduled_at", new Date().toISOString()).lte("scheduled_at", sevenDaysOut).order("scheduled_at", { ascending: true }).limit(6),
      // 12 employees for birthdays/anniversaries (we filter client-side because Supabase can't easily match MM-DD)
      supabase.from("employees").select("id, name, joining_date").eq("status", "active"),
      // 13 KPI top performers — try kpi_scores, fall back below
      supabase.from("kpi_scores").select("employee_id, final_score, month, year, employees(name, department)").order("final_score", { ascending: false }).limit(5),
      // 14 dept breakdown — full active employee list grouped by department
      supabase.from("employees").select("department").eq("status", "active"),
      // 15 sales trend — paid invoices over the last 12 weeks (FY-aware via date range from)
      supabase.from("invoices").select("issued_date, total, status").gte("issued_date", dayjs().subtract(12, "week").format("YYYY-MM-DD")),
    ]);

    const safe = (i: number) => {
      const r = results[i];
      if (r.status === "fulfilled" && !r.value.error) return r.value.count ?? 0;
      return 0;
    };
    const rows = <T = any>(i: number): T[] => {
      const r = results[i];
      if (r.status === "fulfilled" && !r.value.error) return (r.value.data ?? []) as T[];
      return [];
    };

    // Aggregate claims/reimbursements
    const claimsRows = rows<{ amount: number }>(7);
    const reimbRows  = rows<{ amount: number }>(8);
    const claimAmt   = claimsRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const reimbAmt   = reimbRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    // Aggregate invoices
    const invRows = rows<{ id: string; total: number; status: string; issued_date: string }>(9);
    const invTotal       = invRows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const invPaid        = invRows.filter(r => r.status === "paid").reduce((s, r) => s + (Number(r.total) || 0), 0);
    const invOutstanding = invTotal - invPaid;

    setSnapshot({
      totalEmployees:  safe(0),
      presentToday:    safe(1),
      pendingLeaves:   safe(2),
      activeProjects:  safe(3),
      openTickets:     safe(4),
      pendingPriority: safe(5),
      recentHires:     safe(6),
      pendingClaims:        claimsRows.length,
      pendingReimbursements: reimbRows.length,
      pendingClaimAmount:   claimAmt,
      pendingReimbAmount:   reimbAmt,
      invoicesIssued:       invRows.length,
      invoicesTotal:        invTotal,
      invoicesPaid:         invPaid,
      invoicesOutstanding:  invOutstanding,
    });

    // Audit feed
    setAuditFeed(rows<AuditEntry>(10));

    // Upcoming meetings
    setMeetings(rows<MeetingEntry>(11));

    // Birthdays + anniversaries (today)
    const empRows = rows<{ id: string; name: string; dob: string | null; joining_date: string | null }>(12);
    const bdays: BirthdayEntry[] = [];
    for (const e of empRows) {
      if (e.dob && dayjs(e.dob).format("MM-DD") === todayMMDD) {
        bdays.push({ id: `bd-${e.id}`, name: e.name, type: "birthday" });
      }
      if (e.joining_date && dayjs(e.joining_date).format("MM-DD") === todayMMDD) {
        const years = nowYear - dayjs(e.joining_date).year();
        if (years > 0) bdays.push({ id: `wa-${e.id}`, name: e.name, type: "anniversary", years_completed: years });
      }
    }
    setBirthdays(bdays);

    // Top performers
    const kpiRows = rows<any>(13);
    setPerformers(kpiRows.slice(0, 5).map((r) => ({
      employee_id: r.employee_id,
      name: r.employees?.name ?? "—",
      score: Number(r.final_score) || 0,
      department: r.employees?.department ?? null,
    })));

    // Department breakdown
    const deptList = rows<{ department: string | null }>(14);
    const deptMap = new Map<string, number>();
    for (const r of deptList) {
      const dept = r.department || "Unassigned";
      deptMap.set(dept, (deptMap.get(dept) ?? 0) + 1);
    }
    const slices = Array.from(deptMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    setDeptSlices(slices);

    // Sales trend — group paid invoices by ISO week
    const salesRows = rows<{ issued_date: string; total: number; status: string }>(15);
    const weekMap = new Map<string, number>();
    for (const r of salesRows) {
      if (r.status !== "paid") continue;
      const week = dayjs(r.issued_date).startOf("week").format("MMM DD");
      weekMap.set(week, (weekMap.get(week) ?? 0) + (Number(r.total) || 0));
    }
    const trend = Array.from(weekMap.entries()).map(([period, amount]) => ({ period, amount })).slice(-12);
    setSalesTrend(trend);

    setSnapshotLoading(false);
  }, []);

  useEffect(() => {
    // Don't fire a custom-range query until the user has picked both dates
    if (dateRange === "custom" && !customRange?.from) return;
    loadSnapshot(dateRange, customRange);
  }, [dateRange, customRange, loadSnapshot]);

  const rangeLabel = rangeBounds(dateRange, customRange ?? null).label;

  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    let hadError = false;

    const [configRes, analyticsRes, usersRes] = await Promise.allSettled([
      request<{ config: ConfigShape }>({ url: "/api/config" }),
      request<AnalyticsData>({ url: "/api/analytics/company" }),
      request<{ users: UserShape[] }>({ url: "/api/users?role=employee&limit=6" }),
    ]);

    if (configRes.status === "fulfilled" && configRes.value?.config) {
      setConfig(configRes.value.config);
    } else if (configRes.status === "rejected") {
      hadError = true;
    }

    if (analyticsRes.status === "fulfilled" && analyticsRes.value) {
      setAnalytics(analyticsRes.value);
    } else if (analyticsRes.status === "rejected") {
      hadError = true;
    }

    const cfg = configRes.status === "fulfilled" ? (configRes.value?.config ?? MOCK_CONFIG) : MOCK_CONFIG;
    const companyScore = calculateCompanyScore(
      cfg.revenue_achievement_percentage,
      cfg.collections_percentage,
      cfg.delivery_health_percentage
    );
    const companyMultiplier = getCompanyMultiplier(companyScore);

    const users = usersRes.status === "fulfilled" ? (usersRes.value?.users ?? []) : [];
    if (usersRes.status === "rejected") hadError = true;

    try {
      const rows = await Promise.all(
        users.map(async (emp) => {
          const [kpiRes, incRes] = await Promise.allSettled([
            request<{ scores: any[] }>({ url: `/api/kpi?employeeId=${emp.id}` }),
            request<{ incentives: any[] }>({ url: `/api/incentives?employeeId=${emp.id}` }),
          ]);
          const score = kpiRes.status === "fulfilled" ? (kpiRes.value?.scores?.[0]?.final_score ?? 80) : 80;
          const employeeMultiplier = getEmployeeMultiplier(score);
          const latestIncentive = incRes.status === "fulfilled" ? incRes.value?.incentives?.[0] : undefined;
          const baseIncentive = latestIncentive?.base_amount ?? 10000;
          return {
            id: emp.id,
            name: emp.name,
            score,
            baseIncentive,
            employeeMultiplier,
            finalIncentive: calculateFinalIncentive(0, baseIncentive, employeeMultiplier, companyMultiplier),
            status: latestIncentive?.status ?? "locked",
          };
        })
      );
      setEmployeeRows(rows);
    } catch {
      hadError = true;
    }

    if (hadError && !isRefresh) {
      showToast("Some data could not be loaded. Showing available metrics.", "warning");
    }

    setLoading(false);
  }, [request, showToast]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // ─── Realtime Integration ───────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase.channel("dashboard-realtime-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => loadDashboardData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "company_revenues" }, () => loadDashboardData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "company_expenses" }, () => loadDashboardData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => loadDashboardData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "incentives" }, () => loadDashboardData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "system_config" }, () => loadDashboardData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => loadDashboardData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, () => loadDashboardData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, () => loadDashboardData(true))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("connected");
        else if (status === "CLOSED" || status === "CHANNEL_ERROR") setRealtimeStatus("disconnected");
      });

    return () => { supabase.removeChannel(channel); };
  }, [loadDashboardData]);

  const currentMonth = new Date().getMonth();
  const liveRevenue = analytics?.revenue?.[currentMonth] ?? 0;
  const liveExpenses = analytics?.expenses?.[currentMonth] ?? 0;
  const liveNetRevenue = liveRevenue - liveExpenses;
  const expensePercentage = liveRevenue > 0 ? Math.round((liveExpenses / liveRevenue) * 100) : 0;

  // Real Achievement Logic
  const targetRevenue = Number(config.company_revenue) || 100000;
  const revAchievement = Math.min(100, Math.round((liveRevenue / targetRevenue) * 100));
  
  // Use config as primary source for Collections/Delivery, fallback to sensible industry averages
  const liveCollections = Number(config.collections_percentage) || 85; 
  const liveDelivery    = Number(config.delivery_health_percentage) || 92;

  const companyScore = calculateCompanyScore(
    revAchievement,
    liveCollections,
    liveDelivery
  );

  // Use live analytics but fallback to config if analytics is still loading
  const displayRevenue = analytics ? liveRevenue : (config.company_revenue || 0);
  const displayExpensesValue = analytics ? liveExpenses : (config.company_revenue * config.expense_percentage / 100);
  const displayNetRevenue = displayRevenue - displayExpensesValue;
  const displayExpensePct = analytics ? expensePercentage : config.expense_percentage;

  return (
    <DashboardShell
      moduleKey="admin_dashboard"
      title="Dashboard"
      subtitle="Company performance, payouts, and key metrics at a glance."
      actions={
        <span className="flex items-center gap-1.5 text-[10px] font-semibold">
          <span className={cn("h-1.5 w-1.5 rounded-full",
            realtimeStatus==="connected" ? "bg-emerald-500 animate-pulse" :
            realtimeStatus==="connecting"? "bg-amber-500 animate-pulse" : "bg-red-500")} />
          <span className={cn(realtimeStatus==="connected"?"text-emerald-600":realtimeStatus==="connecting"?"text-amber-600":"text-red-500")}>
            {realtimeStatus==="connected"?"System Live":realtimeStatus==="connecting"?"Syncing...":"Realtime Offline"}
          </span>
        </span>
      }
    >
      <div className="space-y-5">

        {/* Toolbar: date range filter */}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarRange size={14} />
            <span>Showing data for <span className="font-medium text-foreground">{rangeLabel}</span></span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={dateRange === "custom" ? "" : dateRange}
              onValueChange={(v) => {
                if (!v) return;
                setCustomRange(undefined);
                setDateRange(v as DateRange);
              }}
              variant="outline"
              size="sm"
              className="bg-background"
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <ToggleGroupItem key={opt.value} value={opt.value} className="px-2.5 text-xs">
                  {opt.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <ShadcnButton
                  variant={dateRange === "custom" ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                >
                  <CalendarRange className="size-3.5" />
                  {dateRange === "custom" && customRange?.from
                    ? (customRange.to
                        ? `${dayjs(customRange.from).format("MMM D")} – ${dayjs(customRange.to).format("MMM D")}`
                        : dayjs(customRange.from).format("MMM D"))
                    : "Custom"}
                </ShadcnButton>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={customRange}
                  onSelect={(r) => {
                    setCustomRange(r);
                    setDateRange("custom");
                    // Auto-close once both dates are picked
                    if (r?.from && r?.to) setCustomOpen(false);
                  }}
                  defaultMonth={customRange?.from ?? new Date()}
                  autoFocus
                />
                <div className="flex items-center justify-between gap-2 border-t border-border p-2">
                  <span className="text-[11px] text-muted-foreground">
                    {customRange?.from && customRange?.to
                      ? `${dayjs(customRange.to).diff(customRange.from, "day") + 1} day${dayjs(customRange.to).diff(customRange.from, "day") === 0 ? "" : "s"}`
                      : "Pick a start and end date"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <ShadcnButton
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCustomRange(undefined);
                        setDateRange("today");
                        setCustomOpen(false);
                      }}
                      className="text-xs"
                    >
                      Clear
                    </ShadcnButton>
                    <ShadcnButton
                      size="sm"
                      onClick={() => setCustomOpen(false)}
                      disabled={!customRange?.from}
                      className="text-xs"
                    >
                      Apply
                    </ShadcnButton>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Operations Snapshot — admin pulse */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Active Employees", value: snapshot.totalEmployees,  icon: Users,    color: "text-foreground",          bg: "bg-muted",            href: "/admin/users" },
            { label: "Present Today",    value: snapshot.presentToday,    icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", href: "/admin/attendance" },
            { label: "Active Projects",  value: snapshot.activeProjects,  icon: Briefcase, color: "text-sky-600 dark:text-sky-400",         bg: "bg-sky-500/10",        href: "/admin/projects" },
            { label: "New Hires",        value: snapshot.recentHires,     icon: UserPlus, color: "text-purple-600 dark:text-purple-400",     bg: "bg-purple-500/10",     href: "/admin/users" },
          ].map(({ label, value, icon: Icon, color, bg, href }) => (
            <Link key={label} href={href} className="page-card flex items-center gap-3 transition-colors hover:bg-muted/40">
              <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg", bg)}>
                <Icon size={16} className={color} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className={cn("text-xl font-semibold leading-tight tabular-nums", color)}>
                  {snapshotLoading ? <span className="inline-block h-5 w-12 animate-pulse rounded bg-muted" /> : value.toLocaleString("en-IN")}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Action Items — things needing admin attention */}
        <div className="page-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-amber-500" />
              <span className="text-sm font-semibold text-foreground">Needs Your Attention</span>
            </div>
            {!snapshotLoading && snapshot.pendingLeaves + snapshot.openTickets + snapshot.pendingPriority === 0 && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={12} /> All caught up
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { label: "Pending Leave Requests", value: snapshot.pendingLeaves,   icon: CalendarRange, href: "/admin/attendance", tone: "amber" },
              { label: "Open Support Tickets",   value: snapshot.openTickets,     icon: Ticket,        href: "/admin/support",    tone: "rose"  },
              { label: "Priority Payouts",       value: snapshot.pendingPriority, icon: AlertTriangle, href: "/admin/priority",   tone: "sky"   },
            ].map(({ label, value, icon: Icon, href, tone }) => {
              const isEmpty = !snapshotLoading && value === 0;
              const toneClasses = isEmpty
                ? "border-border bg-muted/30 text-muted-foreground"
                : ({
                    amber: "border-amber-500/30 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400",
                    rose:  "border-rose-500/30  bg-rose-500/[0.06]  text-rose-600  dark:text-rose-400",
                    sky:   "border-sky-500/30   bg-sky-500/[0.06]   text-sky-600   dark:text-sky-400",
                  }[tone] as string);
              return (
                <Link
                  key={label}
                  href={href}
                  className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all hover:scale-[1.01]", toneClasses)}
                >
                  <Icon size={16} className="flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wider opacity-80">{label}</p>
                    <p className={cn("text-base font-semibold tabular-nums", isEmpty && "text-foreground/60")}>
                      {snapshotLoading ? <span className="inline-block h-4 w-8 animate-pulse rounded bg-muted" /> : value.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <ChevronRight size={14} className="flex-shrink-0 opacity-50" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Financial Stat cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total Revenue",  value: formatCurrency(displayRevenue),       icon: IndianRupee, color: "text-theme-fg",    bg: "bg-theme-raised",     sub: "Current Month" },
            { label: "Total Expenses", value: formatCurrency(displayExpensesValue), icon: TrendingDown, color: "text-red-500",   bg: "bg-red-500/10",       sub: `${displayExpensePct}% of revenue` },
            { label: "Net Revenue",    value: formatCurrency(displayNetRevenue),    icon: TrendingUp,   color: "text-emerald-600", bg: "bg-emerald-500/10", sub: "After expenses" },
            { label: "Payout Pool",    value: formatCurrency(config.payout_pool_amount), icon: Gift,       color: "text-sky-600",    bg: "bg-sky-500/10",       sub: "Available" },
          ].map(({ label, value, icon: Icon, color, bg, sub }) => (
            <div key={label} className="page-card flex items-center gap-3">
              <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
                <Icon size={17} className={color} />
              </div>
              <div>
                <p className="text-xs text-theme-muted">{label}</p>
                <p className={cn("text-xl font-black leading-tight", color)}>{value}</p>
                <p className="text-[10px] text-theme-subtle">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Business Health Chart */}
        <div className="page-card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-theme-muted" />
              <span className="text-sm font-semibold text-theme-fg">Business Health</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">· FY (Apr–Mar)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 text-[11px] text-theme-muted">
                {[
                  { dot: "bg-sky-500",    label: "Revenue" },
                  { dot: "bg-emerald-500", label: "Collections" },
                  { dot: "bg-purple-500", label: "Delivery" },
                ].map(({ dot, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={cn("h-2 w-2 rounded-full flex-shrink-0", dot)} />
                    {label}
                  </div>
                ))}
              </div>
              <span className={cn(
                "text-sm font-black",
                companyScore >= 80 ? "text-emerald-600" : companyScore >= 60 ? "text-amber-600" : "text-red-500"
              )}>
                {Math.round(companyScore)}%
              </span>
            </div>
          </div>

          <BusinessHealthChart
            revenue={revAchievement}
            collections={liveCollections}
            delivery={liveDelivery}
          />
        </div>

        {/* Sales / Invoicing snapshot + Department breakdown side-by-side */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Sales/Invoicing card (2/3 width) */}
          <div className="page-card lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag size={15} className="text-theme-muted" />
                <span className="text-sm font-semibold text-foreground">Sales / Invoicing</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">· {rangeLabel}</span>
              </div>
              <Link href="/admin/invoicing" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all <ChevronRight size={12} />
              </Link>
            </div>

            {/* Mini KPI row */}
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Invoices",     value: snapshot.invoicesIssued.toLocaleString("en-IN") },
                { label: "Total Billed", value: formatCurrency(snapshot.invoicesTotal) },
                { label: "Paid",         value: formatCurrency(snapshot.invoicesPaid),       cls: "text-emerald-600 dark:text-emerald-400" },
                { label: "Outstanding",  value: formatCurrency(snapshot.invoicesOutstanding), cls: "text-amber-600 dark:text-amber-400" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className={cn("text-sm font-semibold tabular-nums leading-tight", cls ?? "text-foreground")}>{value}</p>
                </div>
              ))}
            </div>

            {/* Trend area chart */}
            {salesTrend.length > 0 ? (
              <ChartContainer config={{ amount: { label: "Revenue", color: "#10b981" } }} className="h-[140px] w-full">
                <AreaChart data={salesTrend}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
                  <ChartTooltip cursor={{ stroke: "var(--accent)" }} content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                  <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} fill="url(#salesFill)" />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[140px] items-center justify-center text-xs text-muted-foreground">
                {snapshotLoading ? "Loading sales trend…" : "No paid invoices in the last 12 weeks"}
              </div>
            )}
          </div>

          {/* Department breakdown (1/3 width) */}
          <div className="page-card">
            <div className="mb-3 flex items-center gap-2">
              <Building2 size={15} className="text-theme-muted" />
              <span className="text-sm font-semibold text-foreground">Headcount by Department</span>
            </div>
            {deptSlices.length > 0 ? (
              <>
                <ChartContainer config={{}} className="mx-auto h-[160px] w-full">
                  <PieChart>
                    <Pie data={deptSlices} dataKey="value" nameKey="name" innerRadius={36} outerRadius={66} paddingAngle={2} stroke="var(--background)" strokeWidth={2}>
                      {deptSlices.map((_, i) => (
                        <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
                <div className="mt-1 space-y-1">
                  {deptSlices.slice(0, 5).map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                        <span className="truncate text-muted-foreground">{s.name}</span>
                      </div>
                      <span className="font-semibold tabular-nums text-foreground">{s.value}</span>
                    </div>
                  ))}
                  {deptSlices.length > 5 && (
                    <p className="pt-1 text-[10px] text-muted-foreground">+{deptSlices.length - 5} more</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">
                {snapshotLoading ? "Loading…" : "No department data"}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity + Upcoming Meetings + Birthdays — 3 columns */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          {/* Recent activity */}
          <div className="page-card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History size={15} className="text-theme-muted" />
                <span className="text-sm font-semibold text-foreground">Recent Activity</span>
              </div>
              <Link href="/admin/audit" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all <ChevronRight size={12} />
              </Link>
            </div>
            {auditFeed.length > 0 ? (
              <ul className="space-y-2">
                {auditFeed.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 text-xs">
                    <div className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-theme-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate capitalize">{a.action.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-muted-foreground">{dayjs(a.created_at).fromNow?.() || dayjs(a.created_at).format("MMM D, h:mm A")} {a.target_type ? `· ${a.target_type}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">{snapshotLoading ? "Loading…" : "No recent activity"}</p>
            )}
          </div>

          {/* Upcoming meetings */}
          <div className="page-card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video size={15} className="text-theme-muted" />
                <span className="text-sm font-semibold text-foreground">Upcoming Meetings</span>
                <span className="text-[10px] text-muted-foreground">· next 7d</span>
              </div>
              <Link href="/admin/meetings" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all <ChevronRight size={12} />
              </Link>
            </div>
            {meetings.length > 0 ? (
              <ul className="space-y-2">
                {meetings.map((m) => (
                  <li key={m.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
                    <div className="flex h-7 w-7 flex-shrink-0 flex-col items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      <span className="text-[9px] font-bold uppercase leading-none">{dayjs(m.scheduled_at).format("MMM")}</span>
                      <span className="text-xs font-bold leading-tight">{dayjs(m.scheduled_at).format("D")}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{m.title}</p>
                      <p className="text-[10px] text-muted-foreground">{dayjs(m.scheduled_at).format("ddd, h:mm A")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">{snapshotLoading ? "Loading…" : "No upcoming meetings"}</p>
            )}
          </div>

          {/* Birthdays / Anniversaries today */}
          <div className="page-card">
            <div className="mb-3 flex items-center gap-2">
              <Cake size={15} className="text-pink-500" />
              <span className="text-sm font-semibold text-foreground">Today's Celebrations</span>
            </div>
            {birthdays.length > 0 ? (
              <ul className="space-y-2">
                {birthdays.map((b) => (
                  <li key={b.id} className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-2 py-1.5">
                    {b.type === "birthday" ? (
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-400">
                        <Cake size={13} />
                      </div>
                    ) : (
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Award size={13} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{b.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {b.type === "birthday" ? "Birthday today 🎉" : `${b.years_completed} year${b.years_completed === 1 ? "" : "s"} with the team`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">{snapshotLoading ? "Loading…" : "No celebrations today"}</p>
            )}
          </div>
        </div>

        {/* Top Performers + Pending Claims & Reimbursements — 2 columns */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* Top performers */}
          <div className="page-card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star size={15} className="text-amber-500" />
                <span className="text-sm font-semibold text-foreground">Top Performers</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">· KPI score</span>
              </div>
              <Link href="/admin/kpi" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all <ChevronRight size={12} />
              </Link>
            </div>
            {performers.length > 0 ? (
              <ul className="space-y-2">
                {performers.map((p, i) => (
                  <li key={p.employee_id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
                    <span className={cn("flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold",
                      i === 0 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                      i === 1 ? "bg-zinc-400/15 text-zinc-600 dark:text-zinc-300" :
                      i === 2 ? "bg-orange-500/15 text-orange-600 dark:text-orange-400" :
                                "bg-muted text-muted-foreground")}>#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{p.department ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full",
                          p.score >= 80 ? "bg-emerald-500" :
                          p.score >= 60 ? "bg-amber-500" : "bg-red-400")}
                          style={{ width: `${Math.min(100, p.score)}%` }} />
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-foreground">{Math.round(p.score)}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">{snapshotLoading ? "Loading…" : "No KPI scores yet"}</p>
            )}
          </div>

          {/* Pending Claims & Reimbursements */}
          <div className="page-card">
            <div className="mb-3 flex items-center gap-2">
              <Receipt size={15} className="text-theme-muted" />
              <span className="text-sm font-semibold text-foreground">Pending Reimbursements & Claims</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/admin/claims" className="rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Claims</p>
                  <FileText size={12} className="text-muted-foreground" />
                </div>
                <p className="text-xl font-semibold leading-tight text-foreground tabular-nums">{snapshot.pendingClaims}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{formatCurrency(snapshot.pendingClaimAmount)}</p>
              </Link>
              <Link href="/admin/reimbursements" className="rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reimbursements</p>
                  <Receipt size={12} className="text-muted-foreground" />
                </div>
                <p className="text-xl font-semibold leading-tight text-foreground tabular-nums">{snapshot.pendingReimbursements}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{formatCurrency(snapshot.pendingReimbAmount)}</p>
              </Link>
            </div>
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-[11px] text-muted-foreground">
              Total pending payout: <span className="font-semibold text-foreground">{formatCurrency(snapshot.pendingClaimAmount + snapshot.pendingReimbAmount)}</span>
            </div>
          </div>
        </div>

        {/* Incentive overview table */}
        <div className="page-card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-fg">
                Incentive Overview
                {loading && <span className="ml-2 text-xs font-normal text-theme-subtle">Loading…</span>}
              </h3>
            </div>
            <Link href="/admin/incentives">
              <button className="flex items-center gap-1 text-xs text-theme-muted hover:text-theme-fg transition-colors">
                View all <ChevronRight size={13} />
              </button>
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted">
                  <th className="px-5 py-3 font-semibold">Employee</th>
                  <th className="px-5 py-3 font-semibold">KPI Score</th>
                  <th className="px-5 py-3 font-semibold">Base Amount</th>
                  <th className="px-5 py-3 font-semibold">Multiplier</th>
                  <th className="px-5 py-3 font-semibold">Final Payout</th>
                  <th className="px-5 py-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-3 animate-pulse rounded bg-theme-raised" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : employeeRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-theme-subtle">
                      No data available
                    </td>
                  </tr>
                ) : (
                  employeeRows.map((row) => (
                    <tr key={row.id} className="hover:bg-theme-raised/40 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-theme-primary text-theme-surface text-[10px] font-black">
                            {row.name.split(" ").map((n: string) => n[0]).join("")}
                          </div>
                          <span className="text-xs font-semibold text-theme-fg">{row.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-theme-raised">
                            <div className={cn("h-full rounded-full",
                              row.score >= 80 ? "bg-emerald-500" : row.score >= 60 ? "bg-amber-500" : "bg-red-400"
                            )} style={{ width: `${row.score}%` }} />
                          </div>
                          <span className="text-xs text-theme-muted">{row.score}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-theme-muted">{formatCurrency(row.baseIncentive)}</td>
                      <td className="px-5 py-3">
                        <span className="rounded-md bg-theme-raised px-2 py-0.5 text-[11px] font-semibold text-theme-fg">
                          {row.employeeMultiplier.toFixed(1)}× · {getCompanyMultiplier(companyScore).toFixed(1)}×
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs font-bold text-theme-fg">{formatCurrency(row.finalIncentive)}</td>
                      <td className="px-5 py-3 text-right">
                        <Badge variant={row.status === "paid" || row.status === "Paid" ? "success" : row.status === "claimable" ? "info" : "default"}>
                          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-theme-border bg-theme-page px-5 py-2.5">
            <span className="text-xs text-theme-subtle">Showing {employeeRows.length} employees</span>
            <div className="flex items-center gap-1.5 text-xs text-theme-subtle">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live data
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
