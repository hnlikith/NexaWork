"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  IndianRupee, FileText, Receipt, CreditCard, PiggyBank, Tag,
  Wallet, Zap, Building2, ArrowRight, Loader2, AlertCircle, TrendingUp,
} from "lucide-react";
import dayjs from "@/lib/dayjs";

interface AccountsStats {
  outstandingInvoiceTotal: number;
  overdueInvoiceCount: number;
  pendingReimbursements: number;
  pendingClaims: number;
  upcomingRenewals: number;
  monthlyExpense: number;
  monthlyRevenue: number;
  payoutPool: number;
}

interface OverdueInvoice {
  id: string; invoice_no: string; client_name: string; due_date: string; total: number;
}
interface PendingApproval {
  id: string; kind: "reimbursement" | "claim"; employee_name: string; amount: number; description: string | null; created_at: string;
}
interface UpcomingRenewal {
  id: string; service_name: string; renewal_date: string; amount: number; currency: string;
}

const QUICK_LINKS = [
  { href: "/admin/invoicing",     label: "Invoicing",     icon: FileText,     desc: "Create & dispatch invoices" },
  { href: "/admin/vendors",       label: "Vendors",       icon: Building2,    desc: "Vendor directory & purchases" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: Tag,          desc: "SaaS / utility tracker" },
  { href: "/admin/budgets",       label: "Budgets",       icon: PiggyBank,    desc: "Department & project budgets" },
  { href: "/admin/payroll",       label: "Payroll",       icon: IndianRupee,  desc: "Monthly run & adjustments" },
  { href: "/admin/payslips",      label: "Payslips",      icon: FileText,     desc: "Generate & dispatch PDFs" },
  { href: "/admin/claims",        label: "Claims",        icon: CreditCard,   desc: "Approve / reject expenses" },
  { href: "/admin/reimbursements",label: "Reimbursements",icon: Receipt,      desc: "Process refund requests" },
  { href: "/admin/incentives",    label: "Incentives",    icon: Wallet,       desc: "Performance bonuses" },
  { href: "/admin/priority",      label: "Priority Payout",icon: Zap,         desc: "Ad-hoc bonus pool" },
];

function formatRupee(n: number, compact = false) {
  if (compact && n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (compact && n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export default function AccountsLanding() {
  const [stats, setStats] = useState<AccountsStats>({
    outstandingInvoiceTotal: 0, overdueInvoiceCount: 0,
    pendingReimbursements: 0, pendingClaims: 0,
    upcomingRenewals: 0, monthlyExpense: 0, monthlyRevenue: 0, payoutPool: 0,
  });
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [upcomingRenewals, setUpcomingRenewals] = useState<UpcomingRenewal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const today = dayjs().format("YYYY-MM-DD");
    const monthStart = dayjs().startOf("month").toISOString();
    const monthEnd = dayjs().endOf("month").toISOString();
    const renewalWindow = dayjs().add(30, "day").format("YYYY-MM-DD");

    const results = await Promise.allSettled([
      // 0 outstanding invoices (status != paid, != cancelled)
      supabase.from("invoices").select("total").not("status", "in", "(paid,cancelled)"),
      // 1 overdue invoices count
      supabase.from("invoices").select("id", { count: "exact", head: true }).lt("due_date", today).not("status", "in", "(paid,cancelled)"),
      // 2 pending reimbursements
      supabase.from("reimbursement_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      // 3 pending claims
      supabase.from("claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
      // 4 upcoming subscription renewals (next 30 days)
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).lte("next_renewal_date", renewalWindow).gte("next_renewal_date", today),
      // 5 monthly revenue
      supabase.from("invoices").select("total").gte("issue_date", monthStart.slice(0, 10)).lte("issue_date", monthEnd.slice(0, 10)).eq("status", "paid"),
      // 6 monthly expense
      supabase.from("purchase_bills").select("total").gte("bill_date", monthStart.slice(0, 10)).lte("bill_date", monthEnd.slice(0, 10)),
      // 7 payout pool (system config)
      supabase.from("system_config").select("payout_pool_amount").maybeSingle(),
      // 8 overdue invoice detail
      supabase.from("invoices")
        .select("id, invoice_no, client_name, due_date, total")
        .lt("due_date", today)
        .not("status", "in", "(paid,cancelled)")
        .order("due_date", { ascending: true })
        .limit(5),
      // 9 pending reimbursement detail
      supabase.from("reimbursement_requests")
        .select("id, amount, description, created_at, employee:employees!reimbursement_requests_employee_id_fkey(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(4),
      // 10 pending claim detail
      supabase.from("claims")
        .select("id, amount, description, created_at, employee:employees!claims_employee_id_fkey(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(4),
      // 11 upcoming renewals detail
      supabase.from("subscriptions")
        .select("id, service_name, next_renewal_date, amount, currency")
        .lte("next_renewal_date", renewalWindow)
        .gte("next_renewal_date", today)
        .order("next_renewal_date", { ascending: true })
        .limit(5),
    ]);

    const sumTotals = (i: number) => {
      if (results[i].status !== "fulfilled") return 0;
      const rows = (results[i] as PromiseFulfilledResult<{ data: Array<{ total: number | null }> | null }>).value?.data ?? [];
      return rows.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
    };
    const safeCount = (i: number) => results[i].status === "fulfilled" ? ((results[i] as PromiseFulfilledResult<{ count: number | null }>).value?.count ?? 0) : 0;

    const newStats: AccountsStats = {
      outstandingInvoiceTotal: sumTotals(0),
      overdueInvoiceCount: safeCount(1),
      pendingReimbursements: safeCount(2),
      pendingClaims: safeCount(3),
      upcomingRenewals: safeCount(4),
      monthlyRevenue: sumTotals(5),
      monthlyExpense: sumTotals(6),
      payoutPool: results[7].status === "fulfilled"
        ? Number((results[7] as PromiseFulfilledResult<{ data: { payout_pool_amount: number } | null }>).value?.data?.payout_pool_amount ?? 0)
        : 0,
    };

    if (results[8].status === "fulfilled") {
      setOverdueInvoices(((results[8] as PromiseFulfilledResult<{ data: OverdueInvoice[] | null }>).value?.data ?? []));
    }

    const approvals: PendingApproval[] = [];
    if (results[9].status === "fulfilled") {
      const rows = ((results[9] as PromiseFulfilledResult<{ data: unknown[] | null }>).value?.data ?? []) as Array<{
        id: string; amount: number; description: string | null; created_at: string;
        employee: { name: string } | { name: string }[] | null;
      }>;
      for (const r of rows) {
        approvals.push({
          id: r.id, kind: "reimbursement", amount: r.amount,
          description: r.description, created_at: r.created_at,
          employee_name: Array.isArray(r.employee) ? r.employee[0]?.name ?? "—" : r.employee?.name ?? "—",
        });
      }
    }
    if (results[10].status === "fulfilled") {
      const rows = ((results[10] as PromiseFulfilledResult<{ data: unknown[] | null }>).value?.data ?? []) as Array<{
        id: string; amount: number; description: string | null; created_at: string;
        employee: { name: string } | { name: string }[] | null;
      }>;
      for (const r of rows) {
        approvals.push({
          id: r.id, kind: "claim", amount: r.amount,
          description: r.description, created_at: r.created_at,
          employee_name: Array.isArray(r.employee) ? r.employee[0]?.name ?? "—" : r.employee?.name ?? "—",
        });
      }
    }
    setPendingApprovals(approvals.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6));

    if (results[11].status === "fulfilled") {
      setUpcomingRenewals(((results[11] as PromiseFulfilledResult<{ data: UpcomingRenewal[] | null }>).value?.data ?? []));
    }

    setStats(newStats);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const netCashflow = stats.monthlyRevenue - stats.monthlyExpense;

  const kpis = [
    { label: "Outstanding A/R",     value: formatRupee(stats.outstandingInvoiceTotal, true), icon: FileText,    accent: "text-sky-600 dark:text-sky-400",         bg: "bg-sky-500/10" },
    { label: "Overdue Invoices",    value: stats.overdueInvoiceCount,                         icon: AlertCircle, accent: "text-red-600 dark:text-red-400",         bg: "bg-red-500/10" },
    { label: "Monthly Revenue",     value: formatRupee(stats.monthlyRevenue, true),           icon: TrendingUp,  accent: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Monthly Expense",     value: formatRupee(stats.monthlyExpense, true),           icon: Receipt,     accent: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-500/10" },
    { label: "Pending Claims",      value: stats.pendingClaims,                               icon: CreditCard,  accent: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-500/10" },
    { label: "Pending Reimb.",      value: stats.pendingReimbursements,                       icon: Wallet,      accent: "text-orange-600 dark:text-orange-400",   bg: "bg-orange-500/10" },
    { label: "Renewals (30d)",      value: stats.upcomingRenewals,                            icon: Tag,         accent: "text-purple-600 dark:text-purple-400",   bg: "bg-purple-500/10" },
    { label: "Payout Pool",         value: formatRupee(stats.payoutPool, true),               icon: PiggyBank,   accent: "text-indigo-600 dark:text-indigo-400",   bg: "bg-indigo-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="accounts_dashboard"
      title="Accounts Hub"
      subtitle="Cashflow, approvals, vendors, and payroll execution."
    >
      <div className="space-y-6">
        {/* Cashflow banner */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Net Cashflow this Month</p>
                <p className={cn(
                  "text-3xl font-semibold tabular-nums mt-1",
                  netCashflow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                )}>
                  {netCashflow >= 0 ? "+" : ""}{formatRupee(netCashflow, true)}
                </p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatRupee(stats.monthlyRevenue, true)}</p>
                </div>
                <Separator orientation="vertical" className="h-8" />
                <div>
                  <p className="text-xs text-muted-foreground">Expenses</p>
                  <p className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">{formatRupee(stats.monthlyExpense, true)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map(k => (
            <Card key={k.label}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className={cn("h-10 w-10 rounded-md flex items-center justify-center", k.bg, k.accent)}>
                  <k.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : k.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Lists row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick links */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-sm">Jump to</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2">
                {QUICK_LINKS.map(q => (
                  <Link
                    key={q.href}
                    href={q.href}
                    className="group flex items-center gap-3 rounded-md border p-2.5 hover:border-primary/40 hover:bg-muted/30 transition-colors"
                  >
                    <div className="h-8 w-8 rounded-md bg-muted text-muted-foreground group-hover:text-foreground flex items-center justify-center flex-shrink-0">
                      <q.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{q.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{q.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Overdue invoices */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Overdue Invoices</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/invoicing">
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {overdueInvoices.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No overdue invoices.</p>
              ) : (
                <div className="space-y-3">
                  {overdueInvoices.map(inv => {
                    const daysOverdue = dayjs().diff(dayjs(inv.due_date), "day");
                    return (
                      <div key={inv.id} className="flex items-center justify-between gap-3 pb-3 border-b last:border-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{inv.invoice_no}</p>
                            <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">
                              {daysOverdue}d overdue
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{inv.client_name}</p>
                        </div>
                        <p className="text-sm font-semibold tabular-nums">{formatRupee(Number(inv.total), true)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pending approvals + renewals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Pending Approvals</CardTitle>
              <Badge variant="secondary">{pendingApprovals.length}</Badge>
            </CardHeader>
            <CardContent>
              {pendingApprovals.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No pending approvals.</p>
              ) : (
                <div className="space-y-3">
                  {pendingApprovals.map(a => (
                    <div key={`${a.kind}-${a.id}`} className="flex items-start justify-between gap-3 pb-3 border-b last:border-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{a.employee_name}</p>
                          <Badge variant="outline" className="text-[10px] capitalize">{a.kind}</Badge>
                        </div>
                        {a.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{a.description}</p>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">{dayjs(a.created_at).format("DD MMM, HH:mm")}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">{formatRupee(Number(a.amount), true)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Upcoming Renewals (30d)</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/subscriptions">
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingRenewals.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No renewals in the next 30 days.</p>
              ) : (
                <div className="space-y-3">
                  {upcomingRenewals.map(r => {
                    const daysOut = dayjs(r.renewal_date).diff(dayjs(), "day");
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3 pb-3 border-b last:border-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{r.service_name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {dayjs(r.renewal_date).format("DD MMM YYYY")} · in {daysOut}d
                          </p>
                        </div>
                        <p className="text-sm font-semibold tabular-nums">
                          {r.currency === "INR" ? formatRupee(Number(r.amount), true) : `${r.currency} ${Number(r.amount).toLocaleString()}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
