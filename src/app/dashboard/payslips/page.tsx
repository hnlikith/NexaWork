"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { formatCurrency, cn } from "@/lib/utils";
import axios from "axios";
import {
  Download,
  FileText,
  Search,
  IndianRupee,
  Lock,
  TrendingUp,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface Payslip {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  base_salary: number;
  hra: number;
  special_allowance: number;
  incentive_amount: number;
  sales_commission: number;
  other_earnings: number;
  gross_pay: number;
  pf_deduction: number;
  professional_tax: number;
  tds_deduction: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  status: "draft" | "approved" | "released";
  released_at?: string;
  created_at: string;
}

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_CONFIG = {
  draft:    { label: "Pending",  color: "text-amber-600",   bg: "bg-amber-500/10",   dot: "bg-amber-400"  },
  approved: { label: "Approved", color: "text-sky-600",     bg: "bg-sky-500/10",     dot: "bg-sky-400"    },
  released: { label: "Released", color: "text-emerald-600", bg: "bg-emerald-500/10", dot: "bg-emerald-400"},
};

export default function EmployeePayslipsPage() {
  const { user } = useAuth();

  const [payslips,  setPayslips]  = useState<Payslip[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const r = await axios.get(`/api/payslips?employeeId=${user.id}`);
      setPayslips(r.data.payslips ?? []);
    } catch { setPayslips([]); }
    finally  { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = payslips.filter(
    (p) =>
      MONTH_NAMES[p.month].toLowerCase().includes(search.toLowerCase()) ||
      p.year.toString().includes(search)
  );

  const releasedSlips = payslips.filter((p) => p.status === "released");
  const ytdGross      = releasedSlips.reduce((s, p) => s + p.gross_pay, 0);
  const ytdDeductions = releasedSlips.reduce((s, p) => s + p.total_deductions, 0);
  const ytdNet        = releasedSlips.reduce((s, p) => s + p.net_pay, 0);
  const lastSlip      = releasedSlips[0] ?? null;

  return (
    <DashboardShell
      moduleKey="my_payslips"
      title="Payslips"
      subtitle="Your monthly salary breakdown and net-pay history."
      actions={
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-raised px-3 py-1.5 text-xs font-semibold text-theme-muted hover:text-theme-fg transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      }
    >
      <div className="space-y-5">

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: "Last Net Pay",
              value: lastSlip ? formatCurrency(lastSlip.net_pay) : "—",
              icon: IndianRupee,
              color: "text-emerald-600",
              bg: "bg-emerald-500/10",
              sub: lastSlip ? `${MONTH_NAMES[lastSlip.month]} ${lastSlip.year}` : "No payslip yet",
            },
            {
              label: "YTD Gross",
              value: formatCurrency(ytdGross),
              icon: TrendingUp,
              color: "text-theme-fg",
              bg: "bg-theme-raised",
              sub: `${releasedSlips.length} payslips`,
            },
            {
              label: "Total Deductions",
              value: formatCurrency(ytdDeductions),
              icon: Lock,
              color: "text-red-500",
              bg: "bg-red-500/10",
              sub: "YTD",
            },
            {
              label: "YTD Net Pay",
              value: formatCurrency(ytdNet),
              icon: IndianRupee,
              color: "text-sky-600",
              bg: "bg-sky-500/10",
              sub: "Take-home total",
            },
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

        {/* Payslip Table */}
        <div className="page-card overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-theme-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-fg">Payslip History</h3>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-subtle" size={13} />
              <input
                type="text"
                placeholder="Search by month or year…"
                className="w-full rounded-lg border border-theme-border bg-theme-page pl-8 pr-3 py-1.5 text-xs text-theme-fg outline-none focus:border-theme-primary transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted">
                  <th className="px-5 py-3 font-semibold">Period</th>
                  <th className="px-5 py-3 font-semibold">Gross Pay</th>
                  <th className="px-5 py-3 font-semibold text-red-500">Deductions</th>
                  <th className="px-5 py-3 font-semibold text-emerald-600">Net Pay</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Details</th>
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
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-theme-subtle">
                      {payslips.length === 0
                        ? "No payslips generated yet. Contact HR to generate your payslip."
                        : "No results match your search."}
                    </td>
                  </tr>
                ) : filtered.map((p) => {
                  const sc       = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.draft;
                  const isOpen   = expanded === p.id;
                  const slipNum  = `PSL-${p.year}-${String(p.month).padStart(2, "0")}`;
                  return [
                    <tr key={p.id} className="hover:bg-theme-raised/40 transition-colors cursor-pointer" onClick={() => setExpanded(isOpen ? null : p.id)}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 text-[10px] font-black">
                            {MONTH_NAMES[p.month].slice(0, 3).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-theme-fg">{MONTH_NAMES[p.month]} {p.year}</p>
                            <p className="text-[10px] text-theme-subtle">{slipNum}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold text-theme-fg">{formatCurrency(p.gross_pay)}</td>
                      <td className="px-5 py-3 text-xs font-semibold text-red-500">−{formatCurrency(p.total_deductions)}</td>
                      <td className="px-5 py-3 text-sm font-black text-emerald-600">{formatCurrency(p.net_pay)}</td>
                      <td className="px-5 py-3">
                        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold", sc.bg, sc.color)}>
                          <span className={cn("h-1 w-1 rounded-full", sc.dot)} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isOpen
                            ? <ChevronUp size={14} className="text-theme-muted" />
                            : <ChevronDown size={14} className="text-theme-muted" />}
                          {p.status === "released" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); }}
                              className="flex items-center gap-1 rounded-lg border border-theme-border bg-theme-raised px-2.5 py-1 text-[11px] font-semibold text-theme-muted hover:text-theme-fg transition-colors"
                            >
                              <Download size={11} /> Download
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>,
                    /* Expandable breakdown */
                    isOpen && (
                      <tr key={`${p.id}-detail`} className="bg-theme-raised/30">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                            {/* Earnings */}
                            <div>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600">Earnings</p>
                              <div className="space-y-1.5">
                                {[
                                  { label: "Basic Salary",      value: p.base_salary       },
                                  { label: "HRA",               value: p.hra               },
                                  { label: "Special Allowance", value: p.special_allowance },
                                  ...(p.incentive_amount  > 0 ? [{ label: "Incentive",       value: p.incentive_amount  }] : []),
                                  ...(p.sales_commission  > 0 ? [{ label: "Sales Commission",value: p.sales_commission  }] : []),
                                  ...(p.other_earnings    > 0 ? [{ label: "Other Earnings",  value: p.other_earnings    }] : []),
                                ].map(({ label, value }) => (
                                  <div key={label} className="flex items-center justify-between text-xs">
                                    <span className="text-theme-muted">{label}</span>
                                    <span className="font-semibold text-theme-fg">{formatCurrency(value)}</span>
                                  </div>
                                ))}
                                <div className="border-t border-theme-border pt-1.5 flex justify-between text-xs font-bold">
                                  <span className="text-emerald-600">Gross Pay</span>
                                  <span className="text-emerald-600">{formatCurrency(p.gross_pay)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Deductions */}
                            <div>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-red-500">Deductions</p>
                              <div className="space-y-1.5">
                                {[
                                  { label: "Provident Fund",   value: p.pf_deduction    },
                                  { label: "Professional Tax", value: p.professional_tax },
                                  { label: "TDS",              value: p.tds_deduction   },
                                  ...(p.other_deductions > 0 ? [{ label: "Other", value: p.other_deductions }] : []),
                                ].map(({ label, value }) => (
                                  <div key={label} className="flex items-center justify-between text-xs">
                                    <span className="text-theme-muted">{label}</span>
                                    <span className="font-semibold text-red-500">−{formatCurrency(value)}</span>
                                  </div>
                                ))}
                                <div className="border-t border-theme-border pt-1.5 flex justify-between text-xs font-bold">
                                  <span className="text-red-500">Total Deductions</span>
                                  <span className="text-red-500">−{formatCurrency(p.total_deductions)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Net summary */}
                            <div className="flex flex-col justify-end">
                              <div className="rounded-xl border border-emerald-200 bg-emerald-500/5 p-4 text-center">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Net Pay</p>
                                <p className="text-3xl font-black text-emerald-600">{formatCurrency(p.net_pay)}</p>
                                <p className="text-[10px] text-theme-subtle mt-1">
                                  {MONTH_NAMES[p.month]} {p.year}
                                </p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-theme-border bg-theme-page px-5 py-2.5">
            <span className="text-xs text-theme-subtle">{filtered.length} payslip{filtered.length !== 1 ? "s" : ""}</span>
            <span className="text-xs text-theme-subtle">
              YTD net: <span className="font-bold text-theme-fg">{formatCurrency(ytdNet)}</span>
            </span>
          </div>
        </div>

      </div>
    </DashboardShell>
  );
}
