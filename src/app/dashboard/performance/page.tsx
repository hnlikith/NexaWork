/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useApi } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { Activity, Award, Target, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface KpiScore {
  _id: string;
  month: number;
  year: number;
  kpi_score: number;
  kra_score: number;
  behavioral_score?: number;
  final_score: number;
  remarks?: string;
  rating_label?: string;
  incentive_hint?: string;
  enteredBy?: { name: string };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface p-3 shadow-lg text-xs">
      <p className="mb-2 font-bold text-theme-fg">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-theme-muted">{p.name}</span>
          </div>
          <span className="font-semibold text-theme-fg">{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

export default function PerformancePage() {
  const { request } = useApi();
  const [scores, setScores] = useState<KpiScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    request<{ scores: KpiScore[] }>({ url: "/api/kpi" })
      .then((res) => setScores(res.scores ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [request]);

  const chartData = [...scores]
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
    .map((s) => ({
      label: new Date(s.year, s.month - 1).toLocaleString("en-IN", { month: "short", year: "2-digit" }),
      KPI:        s.kpi_score,
      KRA:        s.kra_score,
      Behavioral: s.behavioral_score ?? 0,
      Final:      s.final_score,
    }));

  const latest = scores[0];

  return (
    <DashboardShell
      moduleKey="my_performance"
      title="Performance"
      subtitle="Monthly KPI / KRA scores and trend analysis."
    >
      <div className="space-y-5">

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-theme-primary border-t-transparent" />
              <p className="text-xs font-semibold text-theme-muted">Loading scores…</p>
            </div>
          </div>
        ) : scores.length === 0 ? (
          <div className="page-card py-16 text-center text-theme-subtle">
            <p className="text-sm font-medium">No performance data yet</p>
            <p className="text-xs mt-1">Your admin or lead will enter KPI/KRA scores each month.</p>
          </div>
        ) : (
          <>
            {/* Latest Score Cards */}
            {latest && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "KPI Score",   value: `${latest.kpi_score}%`,            icon: Activity,   color: "text-sky-600",    bg: "bg-sky-500/10",    sub: "Task performance" },
                  { label: "KRA Score",   value: `${latest.kra_score}%`,            icon: Target,     color: "text-emerald-600", bg: "bg-emerald-500/10", sub: "Key results" },
                  { label: "Behavioral",  value: `${latest.behavioral_score ?? 0}%`, icon: Award,      color: "text-amber-600",  bg: "bg-amber-500/10",  sub: "Soft skills" },
                  { label: "Final Score", value: `${latest.final_score}%`,           icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-500/10", sub: latest.rating_label ?? "Overall grade" },
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
            )}

            {/* Score Trend Chart */}
            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={15} className="text-theme-muted" />
                  <span className="text-sm font-semibold text-theme-fg">Score Trend</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-theme-muted">
                  {[
                    { dot: "bg-sky-500",    label: "KPI" },
                    { dot: "bg-emerald-500", label: "KRA" },
                    { dot: "bg-amber-500",  label: "Behavioral" },
                    { dot: "bg-purple-500", label: "Final" },
                  ].map(({ dot, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={cn("h-2 w-2 rounded-full flex-shrink-0", dot)} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--fg-muted))" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "hsl(var(--fg-muted))" }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                  <Line type="monotone" dataKey="KPI"        stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3, fill: "#0ea5e9", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="KRA"        stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Behavioral" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Final"      stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 0 }} strokeDasharray="4 2" activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly Scores Table */}
            <div className="page-card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
                <div className="flex items-center gap-2">
                  <Award size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Monthly Scores</h3>
                </div>
                <span className="text-xs text-theme-subtle">{scores.length} months recorded</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted">
                      <th className="px-5 py-3 font-semibold">Period</th>
                      <th className="px-5 py-3 font-semibold">KPI Score</th>
                      <th className="px-5 py-3 font-semibold">KRA Score</th>
                      <th className="px-5 py-3 font-semibold">Behavioral</th>
                      <th className="px-5 py-3 font-semibold">
                        Final Score <span className="font-normal opacity-60">(40/40/20)</span>
                      </th>
                      <th className="px-5 py-3 font-semibold">Remarks</th>
                      <th className="px-5 py-3 font-semibold">Entered By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border">
                    {scores.map((s) => (
                      <tr key={s._id} className="hover:bg-theme-raised/40 transition-colors">
                        <td className="px-5 py-3 text-xs font-semibold text-theme-fg">
                          {new Date(s.year, s.month - 1).toLocaleString("en-IN", { month: "long", year: "numeric" })}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-theme-raised">
                              <div className="h-full rounded-full bg-sky-400" style={{ width: `${s.kpi_score}%` }} />
                            </div>
                            <span className="text-xs text-theme-muted">{s.kpi_score}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-theme-raised">
                              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${s.kra_score}%` }} />
                            </div>
                            <span className="text-xs text-theme-muted">{s.kra_score}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-theme-raised">
                              <div className="h-full rounded-full bg-amber-400" style={{ width: `${s.behavioral_score ?? 0}%` }} />
                            </div>
                            <span className="text-xs text-theme-muted">{s.behavioral_score ?? 0}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm font-black text-purple-600">{s.final_score}%</td>
                        <td className="px-5 py-3 text-xs text-theme-muted">
                          {s.remarks ?? s.incentive_hint ?? s.rating_label ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-xs text-theme-muted">{s.enteredBy?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </DashboardShell>
  );
}
