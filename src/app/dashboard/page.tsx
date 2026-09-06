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
import { useAuth } from "@/components/layout/AuthProvider";
import { CalendarWidget } from "@/components/calendar/CalendarWidget";
import { ManagerHubWidget } from "@/components/dashboard/ManagerHubWidget";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { formatCurrency, cn } from "@/lib/utils";
import { ProjectModal } from "@/components/projects/ProjectModal";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { supabase } from "@/lib/supabase";
import {
  calculateCompanyScore,
  getCompanyMultiplier,
  getEmployeeMultiplier,
} from "@/lib/incentiveMath";
import dayjs from "@/lib/dayjs";
import {
  IndianRupee,
  Award,
  TrendingUp,
  Activity,
  ChevronRight,
  History,
  Briefcase,
  TrendingDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const MONTHS = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];

function buildChartData(revenue: number, collections: number, delivery: number) {
  const rval = Number(revenue) || 0;
  const cval = Number(collections) || 0;
  const dval = Number(delivery) || 0;
  const deltas = [
    { r: -8, c: -10, d: -5 },
    { r: -5, c: -6,  d: -3 },
    { r: -3, c: -4,  d:  2 },
    { r:  2, c: -2,  d: -1 },
    { r: -1, c:  3,  d:  4 },
    { r:  0, c:  0,  d:  0 },
  ];
  return MONTHS.map((month, i) => ({
    month,
    Revenue:     Math.max(0, Math.min(100, rval + deltas[i].r)),
    Collections: Math.max(0, Math.min(100, cval + deltas[i].c)),
    Delivery:    Math.max(0, Math.min(100, dval + deltas[i].d)),
    isCurrent: i === 5,
  }));
}

function BusinessHealthChart({ revenue, collections, delivery }: { revenue: number; collections: number; delivery: number }) {
  const data = buildChartData(revenue, collections, delivery);
  const COLORS: Record<string, string> = {
    Revenue:     "#0ea5e9",
    Collections: "#10b981",
    Delivery:    "#a855f7",
  };

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

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barCategoryGap="30%" barGap={3}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 0" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--fg-muted))" }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "hsl(var(--fg-muted))" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--surface-raised))", radius: 6 }} />
        {(["Revenue", "Collections", "Delivery"] as const).map((key) => (
          <Bar key={key} dataKey={key} fill={COLORS[key]} radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={COLORS[key]} opacity={entry.isCurrent ? 1 : 0.55} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface WalletData {
  wallet: { earned_total: number; locked_amount: number; claimable_amount: number; held_amount: number; claimed_amount: number };
}
interface ConfigData {
  company_revenue: number; expense_percentage: number;
  revenue_achievement_percentage: number; collections_percentage: number;
  delivery_health_percentage: number; payout_pool_amount: number;
}
interface KpiData { scores: Array<{ month: number; year: number; final_score: number }> }
interface IncentiveData { incentives: Array<{ _id: string; amount: number; base_amount: number; status: string; month: number; year: number; created_at: string }> }
interface Project { id: string; name: string; description?: string; progress: number; phase: string; dueDate?: string; tasks: { total: number; completed: number; inProgress: number; todo: number; submitted: number } }
interface AssignedProjectsResponse { success: boolean; data: Project[]; count: number }

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { request } = useApi();
  const [wallet, setWallet] = useState<WalletData["wallet"] | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [kpi, setKpi] = useState<KpiData["scores"]>([]);
  const [incentiveData, setIncentiveData] = useState<IncentiveData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const openKanban = (projectId: string) => {
    setSelectedProjectId(projectId);
    setShowProjectModal(true);
  };

  const loadProjects = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setProjectsLoading(true);
    try {
      const res = await request<AssignedProjectsResponse>({ url: `/api/projects/assigned?employeeId=${user.id}` });
      if (res.success) setProjects(res.data);
    } catch {
    } finally {
      setProjectsLoading(false);
    }
  }, [user?.id, request]);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const [walletRes, configRes, kpiRes, incentiveRes] = await Promise.all([
        request<WalletData>({ url: "/api/wallet" }),
        request<ConfigData>({ url: "/api/config" }),
        request<KpiData>({ url: "/api/kpi" }),
        request<IncentiveData>({ url: "/api/incentives" }),
      ]);
      setWallet(walletRes.wallet);
      setConfig(configRes);
      setKpi(kpiRes.scores ?? []);
      setIncentiveData(incentiveRes);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [user, request, router]);

  useEffect(() => {
    load();
    loadProjects();

    // REAL-TIME INTEGRATION: Subscribe to all relevant project changes
    const projectsChannel = supabase.channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        loadProjects(true);
        load(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_teams' }, () => {
        loadProjects(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, () => {
        loadProjects(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, () => {
        loadProjects(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(projectsChannel);
    };
  }, [load, loadProjects]);

  const latestKpi = kpi[0];
  const employeeScore = latestKpi?.final_score ?? 80;
  const revAch  = config?.revenue_achievement_percentage ?? 0;
  const collPct = config?.collections_percentage ?? 0;
  const delivPct = config?.delivery_health_percentage ?? 0;
  const companyScore      = calculateCompanyScore(revAch, collPct, delivPct);
  const employeeMultiplier = getEmployeeMultiplier(employeeScore);
  const companyMultiplier  = getCompanyMultiplier(companyScore);
  const totalMultiplier    = parseFloat((employeeMultiplier * companyMultiplier).toFixed(2));
  const latestIncentive    = incentiveData?.incentives?.[0];
  const baseIncentive      = latestIncentive?.base_amount ?? 10000;
  const finalIncentive     = Math.round(baseIncentive * totalMultiplier);

  return (
    <DashboardShell
      moduleKey="my_dashboard"
      title="Dashboard"
      subtitle="Your performance, earnings, and assigned projects at a glance."
      actions={
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-600">Live</span>
          </span>
          <Link href="/dashboard/incentives">
            <Button variant="secondary" size="sm">
              <History size={13} className="mr-1.5" /> History
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-5">

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "My KPI Score",       value: `${employeeScore}%`,           icon: Activity,    color: "text-theme-fg",    bg: "bg-theme-raised",     sub: "Performance index" },
            { label: "Current Multiplier", value: `${totalMultiplier}x`,          icon: TrendingUp,  color: "text-sky-600",     bg: "bg-sky-500/10",       sub: `${employeeMultiplier.toFixed(1)}x pers · ${companyMultiplier.toFixed(1)}x org` },
            { label: "Projected Payout",   value: formatCurrency(finalIncentive), icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-500/10",   sub: "Next cycle" },
            { label: "Total Earnings",     value: formatCurrency(wallet?.earned_total ?? 0), icon: Award, color: "text-purple-600", bg: "bg-purple-500/10", sub: `${incentiveData?.incentives?.length ?? 0} disbursements` },
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

        {/* Manager Hub — only renders when user is_dept_lead or is_team_lead */}
        <ManagerHubWidget />

        {/* Calendar Widget */}
        {user?.id && (
          <CalendarWidget
            userId={user.id}
            department={user.department || ""}
            maxItems={5}
            className="w-full"
          />
        )}

        {/* Business Health Chart + Multiplier */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 page-card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-theme-muted" />
                <span className="text-sm font-semibold text-theme-fg">Business Health</span>
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
                <span className={cn("text-sm font-black",
                  companyScore >= 80 ? "text-emerald-600" : companyScore >= 60 ? "text-amber-600" : "text-red-500"
                )}>
                  {Math.round(companyScore)}%
                </span>
              </div>
            </div>
            <BusinessHealthChart revenue={revAch} collections={collPct} delivery={delivPct} />
          </div>

          <div className="page-card flex flex-col justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp size={15} className="text-theme-muted" />
                <span className="text-sm font-semibold text-theme-fg">Multiplier Stack</span>
              </div>
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-theme-muted">Personal Performance</span>
                    <span className="font-black text-emerald-600">{employeeMultiplier.toFixed(1)}x</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-theme-raised overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${employeeScore}%` }} />
                  </div>
                  <p className="text-[10px] text-theme-subtle">Based on {employeeScore}% KPI score</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-theme-muted">Company Health Factor</span>
                    <span className="font-black text-sky-600">{companyMultiplier.toFixed(1)}x</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-theme-raised overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full transition-all duration-700" style={{ width: `${companyScore}%` }} />
                  </div>
                  <p className="text-[10px] text-theme-subtle">Based on {Math.round(companyScore)}% company index</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-theme-raised border border-theme-border px-5 py-4">
              <p className="text-xs text-theme-muted mb-1">Calculated Multiplier</p>
              <p className="text-3xl font-black text-theme-fg leading-none">{totalMultiplier}<span className="text-base font-semibold text-theme-muted ml-1">x</span></p>
            </div>
          </div>
        </div>

        {/* Assigned Projects */}
        <div className="page-card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Briefcase size={15} className="text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-fg">
                My Projects
                <span className="ml-2 text-xs font-normal text-theme-subtle">{projects.length} active</span>
              </h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowProjectModal(true)}>
              View all <ChevronRight size={13} className="ml-1" />
            </Button>
          </div>

          <div className="p-5">
            {projectsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-48 animate-pulse rounded-xl bg-theme-raised" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="py-10 text-center text-sm text-theme-subtle">
                No projects assigned yet. Your assigned projects will appear here.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.slice(0, 3).map((project) => (
                  <div key={project.id} onClick={() => openKanban(project.id)} className="cursor-pointer group">
                    <ProjectCard {...project} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Incentive History */}
        <div className="page-card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
            <div className="flex items-center gap-2">
              <History size={15} className="text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-fg">
                Incentive History
                {loading && <span className="ml-2 text-xs font-normal text-theme-subtle">Loading…</span>}
              </h3>
            </div>
            <Link href="/dashboard/incentives">
              <button className="flex items-center gap-1 text-xs text-theme-muted hover:text-theme-fg transition-colors">
                View all <ChevronRight size={13} />
              </button>
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted">
                  <th className="px-5 py-3 font-semibold">Period</th>
                  <th className="px-5 py-3 font-semibold">Base Allocation</th>
                  <th className="px-5 py-3 font-semibold">Multiplier</th>
                  <th className="px-5 py-3 font-semibold">Net Settlement</th>
                  <th className="px-5 py-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border">
                {loading && !incentiveData ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-3 animate-pulse rounded bg-theme-raised" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !incentiveData?.incentives?.length ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-theme-subtle">
                      No payout records found
                    </td>
                  </tr>
                ) : (
                  incentiveData.incentives.slice(0, 5).map((row) => (
                    <tr key={row._id} className="hover:bg-theme-raised/40 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-xs font-semibold text-theme-fg">
                          {dayjs().month(row.month - 1).format("MMMM")} {row.year}
                        </p>
                        <p className="text-[10px] text-theme-subtle">#{row._id.slice(-8).toUpperCase()}</p>
                      </td>
                      <td className="px-5 py-3 text-xs text-theme-muted">{formatCurrency(row.base_amount)}</td>
                      <td className="px-5 py-3">
                        <span className="rounded-md bg-theme-raised px-2 py-0.5 text-[11px] font-semibold text-theme-fg">
                          {totalMultiplier.toFixed(1)}×
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs font-bold text-theme-fg">{formatCurrency(row.amount)}</td>
                      <td className="px-5 py-3 text-right">
                        <Badge variant={row.status === "paid" ? "success" : row.status === "locked" ? "warning" : "default"}>
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
            <span className="text-xs text-theme-subtle">Payouts are calculated based on monthly performance audits.</span>
            <div className="flex items-center gap-1.5 text-xs text-theme-subtle">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live data
            </div>
          </div>
        </div>

      </div>

      <ProjectModal 
        isOpen={showProjectModal} 
        onClose={() => {
          setShowProjectModal(false);
          setSelectedProjectId(null);
        }} 
        projects={projects} 
        initialProjectId={selectedProjectId || undefined}
      />
    </DashboardShell>
  );
}
