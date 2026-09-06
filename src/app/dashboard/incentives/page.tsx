/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge, statusBadgeVariant } from "@/components/ui/BadgeLegacy";
import { Button } from "@/components/ui/ButtonLegacy";
import { useApi } from "@/hooks/useApi";
import { useToast } from "@/components/ui/ToastLegacy";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import axios from "axios";
import {
  IndianRupee,
  Award,
  Lock,
  TrendingUp,
  CheckCircle,
  Info,
  X,
  Wallet,
} from "lucide-react";

interface Incentive {
  _id: string;
  amount: number;
  base_amount: number;
  fixed_amount?: number;
  variable_amount?: number;
  status: string;
  month: number;
  year: number;
  vesting_end: string;
  hold_months: number;
  bonus_applied: number;
  claimed_at?: string;
}

interface Summary {
  total_earned: number;
  locked: number;
  claimable: number;
  held: number;
  claimed: number;
}

export default function IncentivesPage() {
  const { request } = useApi();
  const { showToast } = useToast();
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projection, setProjection] = useState<{ immediate: number; hold_1m: number; hold_2m: number } | null>(null);
  const [selectedIncentive, setSelectedIncentive] = useState<Incentive | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    try {
      const data = await request<{ incentives: Incentive[]; summary: Summary }>({ url: "/api/incentives" });
      setIncentives(data.incentives ?? []);
      setSummary(data.summary ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function fetchProjection(amount: number) {
    const res = await request<{ projection: typeof projection }>({ url: `/api/incentives/hold?amount=${amount}` });
    setProjection(res.projection);
  }

  async function handleClaim(incentiveId: string) {
    setActionLoading(true);
    try {
      await axios.post("/api/claims", { incentiveId });
      await load();
      showToast("Claim submitted successfully!", "success");
    } catch (e: unknown) {
      showToast((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error submitting claim", "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleHold(incentiveId: string, months: 1 | 2) {
    setActionLoading(true);
    try {
      await axios.post("/api/incentives/hold", { incentiveId, holdMonths: months });
      await load();
      setSelectedIncentive(null);
      setProjection(null);
      showToast("Hold applied successfully!", "success");
    } catch (e: unknown) {
      showToast((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error", "error");
    } finally {
      setActionLoading(false);
    }
  }

  const monthName = (m: number, y: number) =>
    new Date(y, m - 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <DashboardShell
      moduleKey="my_incentives"
      title="My Incentives"
      subtitle="Track your performance-linked incentive payouts and earnings."
    >
      <div className="space-y-5">

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              { label: "Total Earned", value: summary.total_earned, icon: Award,       color: "text-theme-fg",    bg: "bg-theme-raised" },
              { label: "Locked",       value: summary.locked,       icon: Lock,        color: "text-amber-600",   bg: "bg-amber-500/10" },
              { label: "Claimable",    value: summary.claimable,    icon: Wallet,      color: "text-emerald-600", bg: "bg-emerald-500/10" },
              { label: "Held",         value: summary.held,         icon: TrendingUp,  color: "text-purple-600",  bg: "bg-purple-500/10" },
              { label: "Claimed",      value: summary.claimed,      icon: CheckCircle, color: "text-sky-600",     bg: "bg-sky-500/10" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="page-card flex items-center gap-3">
                <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
                  <Icon size={15} className={color} />
                </div>
                <div>
                  <p className="text-[11px] text-theme-muted">{label}</p>
                  <p className={cn("text-lg font-black leading-tight", color)}>{formatCurrency(value)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Incentive Table */}
        <div className="page-card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
            <div className="flex items-center gap-2">
              <IndianRupee size={15} className="text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-fg">
                Incentive History
                {loading && <span className="ml-2 text-xs font-normal text-theme-subtle">Loading…</span>}
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted">
                  <th className="px-5 py-3 font-semibold">Period</th>
                  <th className="px-5 py-3 font-semibold">Base Amount</th>
                  <th className="px-5 py-3 font-semibold">Final Amount</th>
                  <th className="px-5 py-3 font-semibold">Bonus</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Vests On</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-3 animate-pulse rounded bg-theme-raised" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : incentives.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-theme-subtle">
                      No incentives yet
                    </td>
                  </tr>
                ) : (
                  incentives.map((inc) => (
                    <tr key={inc._id} className="hover:bg-theme-raised/40 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-xs font-semibold text-theme-fg">{monthName(inc.month, inc.year)}</p>
                        <p className="text-[10px] text-theme-subtle">#{inc._id.slice(-8).toUpperCase()}</p>
                      </td>
                      <td className="px-5 py-3 text-xs text-theme-muted">{formatCurrency(inc.base_amount)}</td>
                      <td className="px-5 py-3">
                        <p className="text-xs font-bold text-theme-fg">{formatCurrency(inc.amount)}</p>
                        <p className="text-[10px] text-theme-subtle">
                          F: {formatCurrency(inc.fixed_amount ?? inc.base_amount)} · V: {formatCurrency(inc.variable_amount ?? 0)}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        {inc.bonus_applied > 0 ? (
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                            +{inc.bonus_applied}%
                          </span>
                        ) : (
                          <span className="text-xs text-theme-subtle">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusBadgeVariant(inc.status)}>
                          {inc.status.charAt(0).toUpperCase() + inc.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-theme-muted">
                        {inc.status === "locked" ? formatDate(inc.vesting_end) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {inc.status === "claimable" && (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" variant="success" loading={actionLoading} onClick={() => handleClaim(inc._id)}>
                              Claim Now
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => { setSelectedIncentive(inc); fetchProjection(inc.amount); }}>
                              Hold for Bonus
                            </Button>
                          </div>
                        )}
                        {inc.status === "held" && (
                          <span className="text-xs text-purple-600 font-semibold">
                            Earning bonus ({inc.hold_months}m hold)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-theme-border bg-theme-page px-5 py-2.5">
            <span className="text-xs text-theme-subtle">
              Payouts are calculated based on monthly performance audits and company multipliers.
            </span>
          </div>
        </div>

      </div>

      {/* Hold Bonus Modal */}
      {selectedIncentive && projection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-theme-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-theme-fg">Hold Bonus Calculator</h3>
                <p className="text-xs text-theme-muted">Optimize your payout timing</p>
              </div>
              <button
                onClick={() => { setSelectedIncentive(null); setProjection(null); }}
                className="rounded-full p-2 text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl bg-sky-500/5 border border-theme-border px-4 py-3">
                <Info size={14} className="text-sky-600 mt-0.5 shrink-0" />
                <p className="text-xs text-theme-muted">
                  Holding your incentive longer earns you more. All calculations are transparent and deterministic.
                </p>
              </div>

              <div className="space-y-2">
                {[
                  { label: "Claim Now (0% bonus)",       value: projection.immediate, highlight: false },
                  { label: "Hold 1 Month (+bonus)",      value: projection.hold_1m,   highlight: false },
                  { label: "Hold 2 Months (+max bonus)", value: projection.hold_2m,   highlight: true  },
                ].map(({ label, value, highlight }) => (
                  <div
                    key={label}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-4 py-3",
                      highlight ? "bg-emerald-500/10" : "bg-theme-raised"
                    )}
                  >
                    <span className="text-xs text-theme-fg">{label}</span>
                    <span className={cn("text-sm font-bold", highlight ? "text-emerald-600" : "text-theme-fg")}>
                      {formatCurrency(value)}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-theme-subtle">
                Maximum payout at 2-month hold:{" "}
                <span className="font-bold text-emerald-600">{formatCurrency(projection.hold_2m)}</span>
              </p>
            </div>

            <div className="flex gap-3 border-t border-theme-border px-6 py-4">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => { setSelectedIncentive(null); setProjection(null); }}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" loading={actionLoading} onClick={() => handleHold(selectedIncentive._id, 1)}>
                Hold 1 Month
              </Button>
              <Button size="sm" variant="success" className="flex-1" loading={actionLoading} onClick={() => handleHold(selectedIncentive._id, 2)}>
                Hold 2 Months
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
