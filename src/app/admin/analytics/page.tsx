"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import axios from "axios";
import {
  TrendingUp, TrendingDown, Building2, Users, Download,
  Activity, Briefcase, IndianRupee, Target,
  ChevronUp, ChevronDown, CheckCircle, Award, Star,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const formatRupee = (n: number, compact = false) => {
  if (compact && n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (compact && n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface CompanyData {
  revenue:       number[];
  expenses:      number[];
  profit:        number[];
  kpi:           { revenue: number; expenses: number; profit: number; projects: number; budgetUsed: number };
  quarterProfit: { q: string; v: number }[];
  budgetDept:    { label: string; v: number; color: string }[];
  projects:      { name: string; health: number; budget: number; spent: number; status: string }[];
  kpiScorecard:  { label: string; v: number; color: string }[];
  plTable:       { month: string; revenue: number; expenses: number }[];
}

interface EmpStats {
  kpi:              { avgKpi: number; totalRevenue: number; avgAttendance: number; totalIncentive: number };
  performanceTrend: Record<string, number[]>;
  teamDist:         { label: string; v: number; color: string }[];
  attendanceMonths: { name: string; v: number }[];
  revenueByEmp:     { name: string; v: number }[];
  incentiveByEmp:   { name: string; v: number }[];
}

interface EmployeeItem {
  id:          string;
  name:        string;
  employee_id: string;
  role:        string;
  team:        string;
  kpi:         number;
  leads:       number;
  converted:   number;
  revenue:     number;
  attendance:  number;
  incentive:   number;
  rating:      number;
  trend:       number;
}

const EMPTY_COMPANY: CompanyData = {
  revenue: Array(12).fill(0), expenses: Array(12).fill(0), profit: Array(12).fill(0),
  kpi: { revenue: 0, expenses: 0, profit: 0, projects: 0, budgetUsed: 0 },
  quarterProfit: [], budgetDept: [], projects: [], kpiScorecard: [], plTable: [],
};

const EMPTY_EMP: EmpStats = {
  kpi: { avgKpi: 0, totalRevenue: 0, avgAttendance: 0, totalIncentive: 0 },
  performanceTrend: {}, teamDist: [], attendanceMonths: [], revenueByEmp: [], incentiveByEmp: [],
};

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KPICard({
  label, value, delta, positive, icon: Icon, accent,
}: {
  label: string; value: string; delta: string; positive: boolean;
  icon: React.ElementType; accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-8 w-8 rounded-md flex items-center justify-center" style={{ background: `${accent}1A` }}>
            <Icon className="h-4 w-4" style={{ color: accent }} />
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] gap-0.5",
              positive
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
            )}
          >
            {positive ? <ChevronUp className="h-3 w-3" strokeWidth={3} /> : <ChevronDown className="h-3 w-3" strokeWidth={3} />}
            {delta}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title, subtitle, children, className,
}: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function BarChart({
  data, color = "#38BDF8", height = 120, showLabels = true,
}: { data: { label: string; v: number }[]; color?: string; height?: number; showLabels?: boolean }) {
  const max = Math.max(...data.map(d => d.v), 1);
  return (
    <div className="flex items-end gap-1.5 w-full" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-grow group">
          <span className="text-[8px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {typeof d.v === "number" && d.v > 100000 ? formatRupee(d.v, true) : `${d.v}${d.v <= 100 ? "%" : ""}`}
          </span>
          <div
            className="w-full rounded-t-md transition-opacity hover:opacity-80 cursor-pointer"
            style={{ height: `${(d.v / max) * (height - 24)}px`, background: color }}
          />
          {showLabels && <span className="text-[8px] text-muted-foreground uppercase">{d.label}</span>}
        </div>
      ))}
    </div>
  );
}

function DualAreaChart({ revenue, expenses, labels }: { revenue: number[]; expenses: number[]; labels: string[] }) {
  const max = Math.max(...revenue, ...expenses, 1);
  const W = 100, H = 140, pad = 8;
  const pts = (data: number[]) =>
    data.map((v, i) => `${pad + (i / (data.length - 1 || 1)) * (W - 2 * pad)},${H - pad - ((v / max) * (H - 2 * pad))}`).join(" ");
  const area = (data: number[]) =>
    `M${pad},${H - pad} ` +
    data.map((v, i) => `L${pad + (i / (data.length - 1 || 1)) * (W - 2 * pad)},${H - pad - ((v / max) * (H - 2 * pad))}`).join(" ") +
    ` L${W - pad},${H - pad} Z`;
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F87171" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#F87171" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area(revenue)} fill="url(#revGrad)" />
        <path d={area(expenses)} fill="url(#expGrad)" />
        <polyline points={pts(revenue)} fill="none" stroke="#38BDF8" strokeWidth="1" />
        <polyline points={pts(expenses)} fill="none" stroke="#F87171" strokeWidth="1" />
        {revenue.map((v, i) => {
          const x = pad + (i / (revenue.length - 1 || 1)) * (W - 2 * pad);
          const y = H - pad - ((v / max) * (H - 2 * pad));
          return <circle key={i} cx={x} cy={y} r="1.5" fill="#38BDF8" stroke="var(--background)" strokeWidth="0.5" />;
        })}
      </svg>
      <div className="flex justify-between mt-1">
        {labels.map((l, i) => <span key={i} className="text-[8px] text-muted-foreground">{l}</span>)}
      </div>
    </div>
  );
}

function DonutChart({ data }: { data: { label: string; v: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.v, 0) || 1;
  let angle = -90;
  const R = 36, CX = 50, CY = 50, ir = 22;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (p: number) => {
    const start = angle;
    const end = angle + (p / 100) * 360;
    angle = end;
    const ls = end - start > 180 ? 1 : 0;
    const sx  = CX + R  * Math.cos(toRad(start));
    const sy  = CY + R  * Math.sin(toRad(start));
    const ex  = CX + R  * Math.cos(toRad(end - 0.2));
    const ey  = CY + R  * Math.sin(toRad(end - 0.2));
    const six = CX + ir * Math.cos(toRad(start));
    const siy = CY + ir * Math.sin(toRad(start));
    const eix = CX + ir * Math.cos(toRad(end - 0.2));
    const eiy = CY + ir * Math.sin(toRad(end - 0.2));
    return `M${sx},${sy} A${R},${R} 0 ${ls},1 ${ex},${ey} L${eix},${eiy} A${ir},${ir} 0 ${ls},0 ${six},${siy} Z`;
  };
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-32 h-32 flex-shrink-0">
        {data.map(d => <path key={d.label} d={arc((d.v / total) * 100)} fill={d.color} />)}
      </svg>
      <div className="space-y-2 flex-1">
        {data.map(d => (
          <div key={d.label} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-muted-foreground">{d.label}</span>
            <span className="text-xs font-semibold ml-auto tabular-nums">{d.v}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>{v}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${v}%`, background: color }} />
      </div>
    </div>
  );
}

function SparkLine({ data, color = "#38BDF8", height = 60 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1 || 1)) * 100},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      {data.map((v, i) => (
        <circle key={i} cx={(i / (data.length - 1 || 1)) * 100} cy={height - ((v - min) / range) * height} r="1.5" fill={color} />
      ))}
    </svg>
  );
}

function LoadingOverlay() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─── COMPANY VIEW ─────────────────────────────────────────────────────────────
function CompanyView({ period, data }: { period: string; data: CompanyData }) {
  const sliceData = (arr: number[]) => {
    const map: Record<string, number> = { "7D": 1, "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "ALL": 12 };
    return arr.slice(-(map[period] || 12));
  };

  const revSlice = sliceData(data.revenue);
  const expSlice = sliceData(data.expenses);

  const prevRev = data.revenue.slice(-2)[0] || 0;
  const currRev = data.revenue.slice(-1)[0] || 0;
  const revDelta = prevRev > 0 ? ((currRev - prevRev) / prevRev * 100).toFixed(1) : "—";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <KPICard label="Total Revenue"      value={formatRupee(data.kpi.revenue, true)}  delta={`${revDelta}%`} positive={Number(revDelta) >= 0} icon={TrendingUp}   accent="#0ea5e9" />
        <KPICard label="Total Expenses"     value={formatRupee(data.kpi.expenses, true)} delta="MoM"            positive={false}                  icon={TrendingDown} accent="#ef4444" />
        <KPICard label="Net Profit"         value={formatRupee(data.kpi.profit, true)}   delta={data.kpi.profit > 0 ? "Profit" : "Loss"}           positive={data.kpi.profit > 0} icon={IndianRupee} accent="#10b981" />
        <KPICard label="Active Projects"    value={String(data.kpi.projects)}             delta="Live"           positive                           icon={Briefcase}    accent="#6366f1" />
        <KPICard label="Budget Utilization" value={`${data.kpi.budgetUsed}%`}             delta={data.kpi.budgetUsed <= 85 ? "On Track" : "Over"} positive={data.kpi.budgetUsed <= 85} icon={Target} accent="#f59e0b" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ChartCard title="Revenue vs Expense Trend" subtitle="Monthly cash flow" className="lg:col-span-2">
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-sky-500" /><span className="text-xs text-muted-foreground">Revenue</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500" /><span className="text-xs text-muted-foreground">Expenses</span></div>
            <div className="ml-auto text-xs text-muted-foreground">YTD Peak: {formatRupee(Math.max(...data.revenue), true)}</div>
          </div>
          <DualAreaChart revenue={revSlice} expenses={expSlice} labels={MONTHS.slice(-revSlice.length)} />
        </ChartCard>
        <ChartCard title="Profit Margin by Quarter" subtitle="Gross profit %, quarterly">
          {data.quarterProfit.length > 0
            ? <BarChart data={data.quarterProfit.map(q => ({ label: q.q, v: q.v }))} color="#818CF8" height={160} />
            : <p className="text-xs text-muted-foreground text-center py-8">No quarterly data yet</p>}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ChartCard title="Budget by Department" subtitle="Allocation breakdown">
          {data.budgetDept.length > 0
            ? <DonutChart data={data.budgetDept} />
            : <p className="text-xs text-muted-foreground text-center py-8">No project budget data</p>}
        </ChartCard>
        <ChartCard title="Project Health Matrix" subtitle="Delivery score by project">
          {data.projects.length > 0 ? (
            <div className="space-y-2.5">
              {data.projects.map(p => {
                const color = p.health >= 80 ? "#10b981" : p.health >= 65 ? "#f59e0b" : "#ef4444";
                return (
                  <div key={p.name} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-foreground truncate max-w-[140px]">{p.name}</span>
                      <span className="text-xs font-semibold tabular-nums" style={{ color }}>{p.health}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p.health}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-8">No active projects</p>}
        </ChartCard>
        <ChartCard title="KPI Scorecard" subtitle="Operational metrics">
          <div className="space-y-3">
            {data.kpiScorecard.map(k => <ProgressBar key={k.label} label={k.label} v={k.v} color={k.color} />)}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Monthly Revenue" subtitle="12-month gross revenue trend">
          <BarChart data={MONTHS.map((m, i) => ({ label: m, v: data.revenue[i] || 0 }))} color="#38BDF8" height={150} />
        </ChartCard>
        <ChartCard title="Monthly Expenses" subtitle="12-month operational expenditure">
          <BarChart data={MONTHS.map((m, i) => ({ label: m, v: data.expenses[i] || 0 }))} color="#F87171" height={150} />
        </ChartCard>
      </div>

      <ChartCard title="Monthly Profit & Loss Ledger" subtitle="Last 6 months">
        {data.plTable.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-right">Expense Ratio</TableHead>
                <TableHead>Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.plTable.map((row, i) => {
                const profitValue = row.revenue - row.expenses;
                const ratioValue  = row.revenue > 0 ? ((row.expenses / row.revenue) * 100).toFixed(1) : "0.0";
                const isHighRatio = parseFloat(ratioValue) > 35;
                return (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right tabular-nums text-sky-600 dark:text-sky-400">{formatRupee(row.revenue, true)}</TableCell>
                    <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{formatRupee(row.expenses, true)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{formatRupee(profitValue, true)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={cn(
                        "tabular-nums",
                        isHighRatio
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                      )}>
                        {ratioValue}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {profitValue > 0
                        ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        : <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : <p className="text-xs text-muted-foreground text-center py-8">No P&L data for selected period</p>}
      </ChartCard>
    </div>
  );
}

// ─── EMPLOYEE VIEW ────────────────────────────────────────────────────────────
function EmployeeView({ empData, employees }: { empData: EmpStats; employees: EmployeeItem[] }) {
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  useEffect(() => {
    if (employees.length > 0 && !selectedEmpId) setSelectedEmpId(employees[0].id);
  }, [employees, selectedEmpId]);

  if (employees.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">No employee records found</p>
      </div>
    );
  }

  const emp = employees.find(e => e.id === selectedEmpId) || employees[0];
  const trend = empData.performanceTrend[emp.id] || Array(6).fill(0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Avg KPI Score"     value={`${empData.kpi.avgKpi.toFixed(1)}%`}         delta="YTD Avg"  positive icon={Activity}    accent="#6366f1" />
        <KPICard label="Total Revenue Gen" value={formatRupee(empData.kpi.totalRevenue, true)}  delta="Won Leads" positive icon={TrendingUp}  accent="#0ea5e9" />
        <KPICard label="Avg Attendance"    value={`${empData.kpi.avgAttendance}%`}              delta="This Year" positive={empData.kpi.avgAttendance >= 85} icon={CheckCircle} accent="#10b981" />
        <KPICard label="Incentives Paid"   value={formatRupee(empData.kpi.totalIncentive, true)} delta="Claimed"  positive icon={Award}       accent="#f59e0b" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ChartCard title="Employee Roster" subtitle="Click to explore individual analytics">
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {employees.map(e => (
              <button
                key={e.id}
                onClick={() => setSelectedEmpId(e.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-2.5 rounded-md transition-colors text-left",
                  selectedEmpId === e.id ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <div className="h-8 w-8 rounded-md bg-background border flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0 uppercase">
                  {e.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{e.name}</p>
                  <p className="text-[10px] text-muted-foreground">{e.role}</p>
                </div>
                <Badge variant="outline" className={cn(
                  "tabular-nums",
                  e.kpi >= 90
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : e.kpi >= 80
                      ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
                )}>
                  {e.kpi}%
                </Badge>
              </button>
            ))}
          </div>
        </ChartCard>

        <ChartCard title={`${emp.name} — Performance Trend`} subtitle="KPI score over last 6 months" className="lg:col-span-2">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card className="bg-muted/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Leads</p>
                <p className="text-lg font-semibold tabular-nums">{emp.leads}</p>
              </CardContent>
            </Card>
            <Card className="bg-emerald-500/5 border-emerald-500/20">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Converted</p>
                <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{emp.converted}</p>
              </CardContent>
            </Card>
            <Card className="bg-sky-500/5 border-sky-500/20">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Revenue</p>
                <p className="text-lg font-semibold tabular-nums text-sky-600 dark:text-sky-400">{formatRupee(emp.revenue, true)}</p>
              </CardContent>
            </Card>
          </div>
          <SparkLine data={trend} color="#6366f1" height={80} />
          <div className="flex justify-between mt-1">
            {["M1","M2","M3","M4","M5","M6"].map(m => <span key={m} className="text-[10px] text-muted-foreground">{m}</span>)}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ChartCard title="Revenue by Employee" subtitle="Individual contribution (won leads)">
          {empData.revenueByEmp.length > 0
            ? <BarChart data={empData.revenueByEmp.map(e => ({ label: e.name, v: e.v }))} color="#0ea5e9" height={150} />
            : <p className="text-xs text-muted-foreground text-center py-8">No revenue data yet</p>}
        </ChartCard>
        <ChartCard title="Attendance Score" subtitle="Monthly attendance %">
          <BarChart data={empData.attendanceMonths.map(e => ({ label: e.name, v: e.v }))} color="#10b981" height={150} />
        </ChartCard>
        <ChartCard title="Team Distribution" subtitle="Headcount by team">
          {empData.teamDist.length > 0 ? (
            <>
              <DonutChart data={empData.teamDist} />
              <div className="mt-4 space-y-2">
                {empData.teamDist.map(t => (
                  <div key={t.label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t.label}</span>
                    <span className="tabular-nums" style={{ color: t.color }}>{t.v} members</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-xs text-muted-foreground text-center py-8">No team data</p>}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Incentive Distribution" subtitle="Total incentives earned per employee">
          {empData.incentiveByEmp.length > 0
            ? <BarChart data={empData.incentiveByEmp.map(e => ({ label: e.name, v: e.v }))} color="#f59e0b" height={150} />
            : <p className="text-xs text-muted-foreground text-center py-8">No incentive data yet</p>}
        </ChartCard>
        <ChartCard title="Lead Conversion Funnel" subtitle="Leads → Conversion pipeline">
          {employees.filter(e => e.leads > 0).length > 0 ? (
            <div className="space-y-3">
              {employees.filter(e => e.leads > 0).map(e => (
                <div key={e.id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{e.name.split(" ")[0]}</span>
                    <span className="font-semibold tabular-nums">
                      {e.converted}/{e.leads} — {Math.round((e.converted / e.leads) * 100)}% CR
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-sky-200 dark:bg-sky-900 w-full" />
                    <div className="absolute inset-y-0 left-0 rounded-full bg-sky-500 transition-all duration-700" style={{ width: `${(e.converted / e.leads) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-8">No lead data yet</p>}
        </ChartCard>
      </div>

      <ChartCard title="Employee Performance Ledger" subtitle="Full individual metrics across all KPI dimensions">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>KPI Score</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Converted</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="text-right">Incentive</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow
                  key={e.id}
                  className={cn("cursor-pointer", selectedEmpId === e.id && "bg-muted/50")}
                  onClick={() => setSelectedEmpId(e.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-background border flex items-center justify-center text-[9px] font-semibold uppercase">{e.name[0]}</div>
                      <span className="text-xs font-medium">{e.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.employee_id}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{e.team}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500 transition-all duration-700" style={{ width: `${e.kpi}%` }} />
                      </div>
                      <span className={cn(
                        "text-xs font-semibold tabular-nums",
                        e.kpi >= 90 ? "text-emerald-600 dark:text-emerald-400" : e.kpi >= 80 ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400",
                      )}>{e.kpi}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sky-600 dark:text-sky-400">{formatRupee(e.revenue, true)}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.leads}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{e.converted}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={cn(e.attendance >= 95 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                      {e.attendance}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">{formatRupee(e.incentive, true)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map(s => (
                        <Star
                          key={s}
                          className={cn("h-3 w-3", s <= Math.floor(e.rating) ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30")}
                        />
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-1 tabular-nums">{e.rating}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={cn(
                      "flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                      e.trend > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                    )}>
                      {e.trend > 0 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {Math.abs(e.trend)}%
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ChartCard>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [tab, setTab]     = useState<"company" | "employee">("company");
  const [period, setPeriod] = useState("1Y");

  const [companyData,  setCompanyData]  = useState<CompanyData>(EMPTY_COMPANY);
  const [empStats,     setEmpStats]     = useState<EmpStats>(EMPTY_EMP);
  const [employees,    setEmployees]    = useState<EmployeeItem[]>([]);
  const [loadingC,     setLoadingC]     = useState(true);
  const [loadingE,     setLoadingE]     = useState(true);

  const year = new Date().getFullYear();

  const fetchCompany = useCallback(async () => {
    try {
      const { data } = await axios.get<CompanyData>(`/api/analytics/company?year=${year}`);
      setCompanyData(data);
    } catch {
      // keep previous data
    } finally {
      setLoadingC(false);
    }
  }, [year]);

  const fetchEmployees = useCallback(async () => {
    try {
      const { data } = await axios.get<{ employees: EmployeeItem[] } & EmpStats>(`/api/analytics/employees?year=${year}`);
      const { employees: emps, ...stats } = data;
      setEmployees(emps);
      setEmpStats(stats as EmpStats);
    } catch {
      // keep previous data
    } finally {
      setLoadingE(false);
    }
  }, [year]);

  useEffect(() => {
    fetchCompany();
    fetchEmployees();

    const channel = supabase
      .channel("analytics-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "company_revenues" },   fetchCompany)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_expenses" },   fetchCompany)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" },           fetchCompany)
      .on("postgres_changes", { event: "*", schema: "public", table: "kpi_scores" },         fetchEmployees)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" },    fetchEmployees)
      .on("postgres_changes", { event: "*", schema: "public", table: "incentives" },         fetchEmployees)
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_ratings" },   fetchEmployees)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        fetchCompany(); fetchEmployees();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchCompany, fetchEmployees]);

  return (
    <DashboardShell
      moduleKey="analytics"
      title="Analytics Command Center"
      subtitle="Company and employee performance intelligence."
      actions={
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="company"><Building2 className="mr-2 h-3.5 w-3.5" /> Company</TabsTrigger>
              <TabsTrigger value="employee"><Users className="mr-2 h-3.5 w-3.5" /> Employee</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={period} onValueChange={setPeriod}>
            <TabsList>
              {["7D","1M","3M","6M","1Y","ALL"].map(p => (
                <TabsTrigger key={p} value={p}>{p}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Live</span>
          </div>
        </div>

        {tab === "company" ? (
          loadingC ? <LoadingOverlay /> : <CompanyView period={period} data={companyData} />
        ) : (
          loadingE ? <LoadingOverlay /> : <EmployeeView empData={empStats} employees={employees} />
        )}
      </div>
    </DashboardShell>
  );
}
