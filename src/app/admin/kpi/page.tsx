/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { useAuth } from "@/components/layout/AuthProvider";
import { usePermission } from "@/hooks/usePermission";
import { getYearRange } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calculateBehavioralScore,
  calculateFinalKpiScore,
  calculateKraScore,
  calculateWeightedKpi,
  getKpiRating,
  type BehavioralMetricsInput,
  type KpiEntryInput,
  type KraMetricsInput,
} from "@/lib/kpiMath";
import {
  Award,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  TrendingUp,
  Users,
  Star,
  BarChart3,
  ClipboardList,
  CheckCircle2,
  Info,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastLegacy";

// ─── Types ───────────────────────────────────────────────
interface User {
  _id: string;
  id?: string;
  name: string;
  employeeId: string;
  department: string;
  commission_enabled?: boolean;
  monthly_sales_target?: number;
  salary_slab_id?: string;
}

interface SalesRecord {
  id: string; employee_id: string; month: number; year: number;
  amount_achieved: number; notes?: string;
}

interface SalarySlab {
  id: string; name: string; min_target: number; max_target: number | null;
  commission_percent: number; sort_order: number;
}

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
  kpi_entries?: KpiEntryInput[];
  kra_metrics?: KraMetricsInput;
  behavioral_metrics?: BehavioralMetricsInput;
  enteredBy?: { name: string };
}

interface FormState {
  month: number;
  year: number;
  kpiEntries: KpiEntryInput[];
  kraMetrics: KraMetricsInput;
  behavioralMetrics: BehavioralMetricsInput;
  remarks: string;
}

interface AutoCalculatedKpi {
  kpi_entries: Array<{ label: string; weight: number; score: number; breakdown: any }>;
  kra_metrics: { ownership: number; quality: number; initiative: number };
  behavioral_metrics: { attendance: number; discipline: number; communication: number };
  kpi_score: number;
  kra_score: number;
  behavioral_score: number;
  final_score: number;
  rating_label: string;
  insights: {
    attendance_status: string;
    task_completion: string;
    project_status: string;
    recommendation: string;
  };
}

type PageTab = "entry" | "overview";

// ─── Mock Data ───────────────────────────────────────────
const MOCK_USERS: User[] = [];

const MOCK_OVERVIEW: Array<{
  emp: User;
  month: number; year: number;
  kpi: number; kra: number; beh: number; final: number;
}> = [];

// ─── Helpers ─────────────────────────────────────────────
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthLabel(m: number, y: number) {
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

function createDefaultForm(month: number, year: number): FormState {
  return {
    month, year,
    kpiEntries: [
      { label: "KPI 1", weight: 40, score: 0 },
      { label: "KPI 2", weight: 35, score: 0 },
      { label: "KPI 3", weight: 25, score: 0 },
    ],
    kraMetrics: { ownership: 0, quality: 0, initiative: 0 },
    behavioralMetrics: { attendance: 0, discipline: 0, communication: 0 },
    remarks: "",
  };
}

function createFormFromScore(score: KpiScore): FormState {
  return {
    month: score.month,
    year: score.year,
    kpiEntries: score.kpi_entries?.length
      ? score.kpi_entries
      : [
          { label: "KPI 1", weight: 40, score: score.kpi_score ?? 0 },
          { label: "KPI 2", weight: 35, score: score.kpi_score ?? 0 },
          { label: "KPI 3", weight: 25, score: score.kpi_score ?? 0 },
        ],
    kraMetrics: score.kra_metrics ?? {
      ownership: Math.round((score.kra_score ?? 0) / 20),
      quality:   Math.round((score.kra_score ?? 0) / 20),
      initiative: Math.round((score.kra_score ?? 0) / 20),
    },
    behavioralMetrics: score.behavioral_metrics ?? {
      attendance:    score.behavioral_score ?? 0,
      discipline:    0,
      communication: 0,
    },
    remarks: score.remarks ?? "",
  };
}

// Rating helpers
const RATING_COLOR: Record<string, string> = {
  Outstanding:       "text-emerald-600",
  Exceeds:           "text-sky-600",
  Meets:             "text-amber-600",
  "Needs Improvement": "text-orange-500",
  Poor:              "text-red-500",
};

const RATING_BADGE: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
  Outstanding:       "success",
  Exceeds:           "info",
  Meets:             "warning",
  "Needs Improvement": "danger",
  Poor:              "danger",
};

function gaugeColor(score: number) {
  if (score >= 90) return "#10b981"; // emerald-500
  if (score >= 75) return "#0ea5e9"; // sky-500
  if (score >= 60) return "#f59e0b"; // amber-500
  return "#ef4444"; // red-500
}

// Star rating component
function StarRating({
  value,
  onChange,
  disabled,
  color = "text-amber-500",
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          disabled={disabled}
          className={cn(
            "transition-all",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:scale-110"
          )}
          title={`${r}/5`}
        >
          <Star
            size={20}
            className={cn(
              "transition-colors",
              r <= value ? color : "text-theme-border"
            )}
            fill={r <= value ? "currentColor" : "none"}
          />
        </button>
      ))}
      <span className={cn("ml-1 text-xs font-bold", value > 0 ? color : "text-theme-muted")}>
        {value > 0 ? `${value}/5` : "—"}
      </span>
    </div>
  );
}

// ─── Admin: quick sales amount input ─────────────────────
function SalesAmountEntry({
  employeeId, month, year, current, onSaved,
}: {
  employeeId: string; month: number; year: number;
  current: number; onSaved: (rec: SalesRecord) => void;
}) {
  const [val, setVal] = useState(current > 0 ? String(current) : "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { setVal(current > 0 ? String(current) : ""); setDone(false); }, [current, month, year]);

  async function save() {
    if (!val || isNaN(Number(val))) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sales-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, month, year, amount_achieved: Number(val) }),
      });
      const d = await res.json();
      if (d.record) { onSaved(d.record); setDone(true); }
    } finally { setSaving(false); }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-orange-100 bg-orange-50/50 px-4 py-3">
      <Target size={13} className="text-orange-500 flex-shrink-0" />
      <span className="text-[11px] font-bold text-orange-700 shrink-0">Set sales:</span>
      <div className="relative flex-1">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-orange-400 font-bold">₹</span>
        <input
          type="number" min="0" step="100"
          value={val}
          onChange={e => { setVal(e.target.value); setDone(false); }}
          placeholder="0"
          className="h-8 w-full rounded-lg border border-orange-200 bg-white pl-6 pr-3 text-sm text-theme-fg outline-none focus:border-orange-400 transition-all"
        />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className={cn(
          "h-8 px-3 rounded-lg text-[11px] font-black transition-all flex-shrink-0",
          done ? "bg-emerald-500 text-white" : "bg-orange-500 hover:bg-orange-600 text-white"
        )}
      >
        {saving ? "…" : done ? "✓ Saved" : "Save"}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function AdminKpiPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const today = new Date();
  const [tab, setTab] = useState<PageTab>("entry");
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [scores, setScores] = useState<KpiScore[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [loadingScores, setLoadingScores] = useState(false);
  const [loadingAutoCalc, setLoadingAutoCalc] = useState(false);
  const [autoCalc, setAutoCalc] = useState<AutoCalculatedKpi | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(
    createDefaultForm(today.getMonth() + 1, today.getFullYear())
  );

  const { canEdit, canExport } = usePermission("kpi_kra");
  const [salesRecord, setSalesRecord] = useState<SalesRecord | null>(null);
  const [salarySlabs, setSalarySlabs] = useState<SalarySlab[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Load real users with safe field mapping
  useEffect(() => {
    axios.get("/api/users?role=employee&limit=100")
      .then((res) => {
        if (res.data.users?.length) {
          const mappedUsers = res.data.users.map((u: any) => ({
            _id: u.id || u._id,
            id: u.id || u._id,
            name: u.name,
            employeeId: u.employeeId || u.employee_id,
            department: u.department,
            commission_enabled: u.commission_enabled || false,
            monthly_sales_target: u.monthly_sales_target || null,
            salary_slab_id: u.salary_slab_id || null,
          }));
          setUsers(mappedUsers);
        }
      })
      .catch(() => {/* use mock */});
    // Load salary slabs once for checkpoint display
    fetch("/api/salary-slabs")
      .then(r => r.json())
      .then(d => { if (d.slabs) setSalarySlabs(d.slabs); })
      .catch(() => {});
  }, []);

  // Fetch KPI scores in real-time
  useEffect(() => {
    if (!selectedUser) { setScores([]); return; }
    setLoadingScores(true);
    axios.get(`/api/kpi?employeeId=${selectedUser}`)
      .then((res) => {
        const data = res.data.data || res.data.scores || [];
        setScores(Array.isArray(data) ? data : [data]);
      })
      .catch((err) => {
        console.error("KPI fetch error:", err);
        setScores([]);
      })
      .finally(() => setLoadingScores(false));
  }, [selectedUser]);

  // Fetch auto-calculated KPI scores
  useEffect(() => {
    if (!selectedUser) { setAutoCalc(null); return; }
    setLoadingAutoCalc(true);
    axios.get(`/api/kpi/calculate`, {
      params: {
        employeeId: selectedUser,
        month: form.month,
        year: form.year
      }
    })
      .then((res) => {
        if (res.data.success && res.data.auto_calculated) {
          setAutoCalc(res.data.auto_calculated);
        }
      })
      .catch((err) => {
        console.error("Auto-calc fetch error:", err);
        setAutoCalc(null);
      })
      .finally(() => setLoadingAutoCalc(false));
  }, [selectedUser, form.month, form.year]);

  // Subscribe to real-time KPI updates via polling
  useEffect(() => {
    if (!selectedUser) return;
    const interval = setInterval(() => {
      axios.get(`/api/kpi?employeeId=${selectedUser}`)
        .then((res) => {
          const data = res.data.data || res.data.scores || [];
          setScores(Array.isArray(data) ? data : [data]);
        })
        .catch(() => {/* silent fail */});
    }, 3000); // Real-time update every 3 seconds
    return () => clearInterval(interval);
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUser) return;
    const existing = scores.find((s) => s.month === form.month && s.year === form.year);
    if (!existing) return;
    const next = createFormFromScore(existing);
    if (JSON.stringify(form) !== JSON.stringify(next)) setForm(next);
  }, [selectedUser, scores]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch sales record when a commission-enabled employee is selected
  useEffect(() => {
    const emp = users.find(u => (u._id || u.id) === selectedUser);
    if (!selectedUser || !emp?.commission_enabled) { setSalesRecord(null); return; }
    setLoadingSales(true);
    fetch(`/api/sales-records?employeeId=${selectedUser}&month=${form.month}&year=${form.year}`)
      .then(r => r.json())
      .then(d => setSalesRecord(d.records?.[0] ?? null))
      .catch(() => setSalesRecord(null))
      .finally(() => setLoadingSales(false));
  }, [selectedUser, form.month, form.year, users]);

  // Live score calculations
  const kpiScore       = useMemo(() => calculateWeightedKpi(form.kpiEntries),        [form.kpiEntries]);
  const kraScore       = useMemo(() => calculateKraScore(form.kraMetrics),            [form.kraMetrics]);
  const behavioralScore = useMemo(() => calculateBehavioralScore(form.behavioralMetrics), [form.behavioralMetrics]);
  const finalScore     = useMemo(() => calculateFinalKpiScore(kpiScore, kraScore, behavioralScore), [kpiScore, kraScore, behavioralScore]);
  const rating         = useMemo(() => getKpiRating(finalScore),                      [finalScore]);
  const totalWeight    = form.kpiEntries.reduce((s, e) => s + e.weight, 0);

  const selectedEmployee = users.find((e) => (e._id || e.id) === selectedUser);
  const isEditing = scores.some((s) => s.month === form.month && s.year === form.year);

  function applyAutoCalculatedScores() {
    if (!autoCalc) { showToast("No auto-calculated data available", "warning"); return; }

    // Apply KPI entries
    if (autoCalc.kpi_entries && autoCalc.kpi_entries.length > 0) {
      setForm((f) => ({
        ...f,
        kpiEntries: autoCalc.kpi_entries.map((entry) => ({
          label: entry.label,
          weight: entry.weight,
          score: entry.score || 0,
        })),
      }));
    }

    // Apply KRA metrics (convert from 0-100 to 1-5 star rating)
    if (autoCalc.kra_metrics) {
      setForm((f) => ({
        ...f,
        kraMetrics: {
          ownership: autoCalc.kra_metrics.ownership ? Math.round((autoCalc.kra_metrics.ownership / 100) * 5) : 0,
          quality: autoCalc.kra_metrics.quality ? Math.round((autoCalc.kra_metrics.quality / 100) * 5) : 0,
          initiative: autoCalc.kra_metrics.initiative ? Math.round((autoCalc.kra_metrics.initiative / 100) * 5) : 0,
        },
      }));
    }

    // Apply Behavioral metrics
    if (autoCalc.behavioral_metrics) {
      setForm((f) => ({
        ...f,
        behavioralMetrics: {
          attendance: autoCalc.behavioral_metrics.attendance || 0,
          discipline: autoCalc.behavioral_metrics.discipline ? Math.round((autoCalc.behavioral_metrics.discipline / 100) * 5) : 0,
          communication: autoCalc.behavioral_metrics.communication ? Math.round((autoCalc.behavioral_metrics.communication / 100) * 5) : 0,
        },
      }));
    }

    showToast("Auto-calculated scores applied to manual fields", "success");
  }

  function revertToDefaults() {
    setForm(createDefaultForm(form.month, form.year));
    showToast("Manual inputs reverted to defaults", "info");
  }

  function resetForPeriod(month: number, year: number) {
    const existing = scores.find((s) => s.month === month && s.year === year);
    setForm(existing ? createFormFromScore(existing) : createDefaultForm(month, year));
  }

  function navigatePeriod(dir: -1 | 1) {
    let m = form.month + dir;
    let y = form.year;
    if (m < 1)  { m = 12; y--; }
    if (m > 12) { m = 1;  y++; }
    resetForPeriod(m, y);
  }

  async function handleSubmit() {
    if (!selectedUser) { showToast("Select an employee to score.", "warning"); return; }
    if (!canEdit)       { showToast("Access Denied: Admin, HR, or Lead role required.", "error"); return; }
    setSubmitting(true);
    try {
      await axios.post("/api/kpi", {
        employee_id: selectedUser,
        month: form.month,
        year: form.year,
        kpi_score: kpiScore,
        kpi_entries: form.kpiEntries,
        kra_score: kraScore,
        kra_metrics: form.kraMetrics,
        behavioral_score: behavioralScore,
        behavioral_metrics: form.behavioralMetrics,
        final_score: finalScore,
        rating_label: rating.label,
        remarks: form.remarks,
      });
      const res = await axios.get(`/api/kpi?employeeId=${selectedUser}`);
      setScores(Array.isArray(res.data.data) ? res.data.data : []);
      showToast(`Performance scores for ${selectedEmployee?.name} recorded successfully.`, "success");
    } catch (err: unknown) {
      showToast((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Protocol Sync Error", "error");
    } finally {
      setSubmitting(false);
    }
  }

  // Gauge circumference
  const R = 72;
  const CIRC = 2 * Math.PI * R;
  const dashOffset = CIRC - (CIRC * Math.min(100, Math.max(0, finalScore))) / 100;

  return (
    <DashboardShell
      moduleKey="kpi_kra"
      title="KPI & KRA"
      subtitle="Track, score, and review employee performance each month."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={submitting}
            onClick={handleSubmit}
            disabled={!canEdit || !selectedUser}
          >
            <CheckCircle2 size={14} className="mr-1.5" />
            {isEditing ? "Update Score" : "Save Score"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">

        {/* Read-only warning */}
        {!canEdit && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
            <CircleAlert size={16} className="text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              You are in view-only mode. Only Super Admin, HR, and Team Leads can edit scores.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex rounded-xl border border-theme-border bg-theme-raised p-1 w-fit gap-0.5">
          {([
            { key: "entry",    label: "Score Entry",    icon: ClipboardList },
            { key: "overview", label: "Team Overview",  icon: Users },
          ] as { key: PageTab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all",
                tab === key
                  ? "bg-theme-surface text-theme-fg shadow-sm"
                  : "text-theme-muted hover:text-theme-fg"
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* ── SCORE ENTRY TAB ── */}
        {tab === "entry" && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">

            {/* Left — Input Panels */}
            <div className="space-y-5 xl:col-span-3">

              {/* Employee + Period selector */}
              <div className="page-card">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {/* Employee */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-theme-muted uppercase tracking-wide">Employee</label>
                    <Select
                      value={selectedUser || undefined}
                      onValueChange={(v) => {
                        setSelectedUser(v);
                        setForm(createDefaultForm(form.month, form.year));
                      }}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select employee…" /></SelectTrigger>
                      <SelectContent>
                        {users.map((emp) => (
                          <SelectItem key={emp._id || emp.id || emp.employeeId} value={emp._id || emp.id || emp.employeeId}>
                            {emp.name} — {emp.employeeId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Month nav */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-theme-muted uppercase tracking-wide">Period</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigatePeriod(-1)}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-theme-border bg-theme-page text-theme-muted hover:text-theme-fg transition-colors"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <div className="flex flex-1 gap-2">
                        <Select value={String(form.month)} onValueChange={(v) => resetForPeriod(parseInt(v), form.year)}>
                          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MONTH_NAMES.map((m, i) => (
                              <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={String(form.year)} onValueChange={(v) => resetForPeriod(form.month, parseInt(v))}>
                          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {getYearRange().map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <button
                        onClick={() => navigatePeriod(1)}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-theme-border bg-theme-page text-theme-muted hover:text-theme-fg transition-colors"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Status indicator */}
                  <div className="flex flex-col justify-end">
                    {selectedEmployee ? (
                      <div className="flex items-center gap-3 rounded-lg border border-theme-border bg-theme-raised px-3 py-2">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-theme-primary text-theme-surface text-[10px] font-black">
                          {getInitials(selectedEmployee.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-theme-fg truncate">{selectedEmployee.name}</p>
                          <p className="text-[10px] text-theme-muted">{selectedEmployee.department} · {selectedEmployee.employeeId}</p>
                        </div>
                        {isEditing && (
                          <span className="ml-auto flex-shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-600">
                            Editing
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-theme-border px-3 py-2 text-center text-xs text-theme-subtle">
                        No employee selected
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sales Performance Widget — shown when selected employee is on commission */}
              {selectedEmployee?.commission_enabled && selectedEmployee.monthly_sales_target && (
                <div className="page-card p-0 overflow-hidden" style={{ borderColor: "rgba(249,115,22,0.25)" }}>
                  <style>{`
                    @keyframes admShimmer { 0% { left:-80%; } 100% { left:130%; } }
                    @keyframes admLiveDot { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.7); } }
                    @keyframes admFillGlow { 0%,100% { filter:brightness(1); } 50% { filter:brightness(1.15); } }
                  `}</style>

                  {/* Header */}
                  <div style={{ background: "linear-gradient(135deg,#431407,#7c2d12,#9a3412)", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(249,115,22,0.25)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                      <div style={{ width: "30px", height: "30px", borderRadius: "7px", background: "rgba(249,115,22,0.25)", border: "1px solid rgba(249,115,22,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Target size={15} style={{ color: "#fb923c" }} />
                      </div>
                      <div>
                        <p style={{ color: "#fed7aa", fontSize: "11px", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>Sales Performance</p>
                        <p style={{ color: "#fdba74", fontSize: "10px", opacity: 0.7, marginTop: "2px" }}>{MONTH_NAMES[form.month - 1]} {form.year} · Commission Track</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.35)", borderRadius: "20px", padding: "3px 9px" }}>
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fb923c", animation: "admLiveDot 1.6s ease-in-out infinite" }} />
                      <span style={{ color: "#fb923c", fontSize: "8px", fontWeight: 900, letterSpacing: "0.1em" }}>LIVE</span>
                    </div>
                  </div>

                  {loadingSales ? (
                    <div style={{ padding: "16px 18px" }}>
                      <div style={{ height: "36px", borderRadius: "6px", background: "rgba(249,115,22,0.08)", animation: "pulse 1.5s ease-in-out infinite" }} />
                    </div>
                  ) : (() => {
                    const achieved = salesRecord?.amount_achieved ?? 0;
                    const target   = selectedEmployee.monthly_sales_target!;
                    const pct      = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;
                    const activeSlab = salarySlabs.filter(s => s.min_target <= achieved).at(-1) ?? null;
                    const estimatedCommission = activeSlab ? (achieved * activeSlab.commission_percent) / 100 : 0;
                    const checkpoints = salarySlabs
                      .map(s => ({ ...s, posPct: target > 0 ? Math.min(100, (s.min_target / target) * 100) : 0, cleared: achieved >= s.min_target }))
                      .filter(s => s.posPct <= 100);
                    const pctColor = pct >= 100 ? "#10b981" : pct >= 75 ? "#0ea5e9" : pct >= 50 ? "#f59e0b" : "#f97316";

                    return (
                      <>
                        {/* 3-stat strip */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: "1px solid rgba(249,115,22,0.1)" }}>
                          {[
                            { label: "ACHIEVED", value: `₹${achieved.toLocaleString("en-IN")}`, color: "#f97316" },
                            { label: "PROGRESS", value: `${pct.toFixed(1)}%`, color: pctColor },
                            { label: "COMMISSION", value: `₹${Math.round(estimatedCommission).toLocaleString("en-IN")}`, color: "#10b981" },
                          ].map((s, i) => (
                            <div key={i} style={{ padding: "11px 14px", borderRight: i < 2 ? "1px solid rgba(249,115,22,0.1)" : "none" }}>
                              <p style={{ fontSize: "8px", fontWeight: 800, letterSpacing: "0.1em", color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>{s.label}</p>
                              <p style={{ fontSize: "16px", fontWeight: 900, color: s.color, lineHeight: 1, letterSpacing: "-0.02em" }}>{s.value}</p>
                              {i === 0 && <p style={{ fontSize: "9px", color: "#94a3b8", marginTop: "2px" }}>of ₹{target.toLocaleString("en-IN")} target</p>}
                              {i === 2 && <p style={{ fontSize: "9px", color: "#94a3b8", marginTop: "2px" }}>{activeSlab ? `${activeSlab.commission_percent}% rate` : "No slab"}</p>}
                            </div>
                          ))}
                        </div>

                        {/* 3D Bar */}
                        <div style={{ padding: "14px 18px 4px" }}>
                          <div style={{ position: "relative", height: "36px", borderRadius: "6px", overflow: "hidden", background: "linear-gradient(180deg,#0d1117,#161b22,#0d1117)", boxShadow: "inset 0 3px 8px rgba(0,0,0,0.6), inset 0 -2px 4px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)" }}>
                            <div style={{ position: "absolute", left: "3px", top: "3px", bottom: "3px", width: `calc(${Math.max(pct, 0.5)}% - 6px)`, borderRadius: "4px", background: pct >= 100 ? "linear-gradient(90deg,#047857,#059669,#10b981)" : "linear-gradient(90deg,#9a3412,#c2410c,#ea580c,#f97316,#fb923c)", boxShadow: pct >= 100 ? "0 0 16px rgba(16,185,129,0.7)" : "0 0 16px rgba(249,115,22,0.7)", transition: "width 1.4s cubic-bezier(0.34,1.56,0.64,1)", animation: pct > 0 ? "admFillGlow 2.5s ease-in-out infinite" : "none", overflow: "hidden" }}>
                              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(180deg,rgba(255,255,255,0.28) 0%,transparent 100%)", borderRadius: "4px 4px 0 0" }} />
                              {pct > 4 && <div style={{ position: "absolute", top: 0, bottom: 0, width: "35%", background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)", animation: "admShimmer 2.6s ease-in-out infinite" }} />}
                            </div>
                            {checkpoints.slice(1).map(cp => cp.posPct < 99 && (
                              <div key={cp.id} style={{ position: "absolute", left: `${cp.posPct}%`, top: 0, height: "100%", width: "1px", background: cp.cleared ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.06)", zIndex: 2 }} />
                            ))}
                            {pct > 10 && <div style={{ position: "absolute", right: `${100 - Math.min(pct, 97)}%`, top: "50%", transform: "translateY(-50%)", fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.9)", paddingRight: "6px", zIndex: 3, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>{pct.toFixed(0)}%</div>}
                          </div>
                        </div>

                        {/* Milestone pills */}
                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(checkpoints.length, 1)},1fr)`, gap: "8px", padding: "10px 18px 14px" }}>
                          {checkpoints.map((cp) => {
                            const isActive = cp.id === activeSlab?.id;
                            return (
                              <div key={cp.id} style={{ borderRadius: "7px", border: isActive ? "1px solid rgba(249,115,22,0.45)" : cp.cleared ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(148,163,184,0.12)", background: isActive ? "rgba(249,115,22,0.08)" : cp.cleared ? "rgba(16,185,129,0.05)" : "rgba(148,163,184,0.04)", padding: "8px 10px", position: "relative", boxShadow: isActive ? "0 0 10px rgba(249,115,22,0.12)" : "none" }}>
                                {isActive && <div style={{ position: "absolute", top: "4px", right: "4px", fontSize: "7px", fontWeight: 900, background: "linear-gradient(90deg,#ea580c,#f97316)", color: "white", padding: "1px 4px", borderRadius: "3px" }}>ACTIVE</div>}
                                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
                                  {cp.cleared ? <Trophy size={11} style={{ color: isActive ? "#f97316" : "#10b981" }} /> : <div style={{ width: "11px", height: "11px", borderRadius: "2px", border: "1.5px solid #475569" }} />}
                                  <span style={{ fontSize: "8px", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: isActive ? "#ea580c" : cp.cleared ? "#10b981" : "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cp.name.split("(")[0].trim()}</span>
                                </div>
                                <p style={{ fontSize: "18px", fontWeight: 900, lineHeight: 1, color: isActive ? "#f97316" : cp.cleared ? "#10b981" : "#475569", letterSpacing: "-0.03em" }}>{cp.commission_percent}%</p>
                                <p style={{ fontSize: "8px", color: "#64748b", marginTop: "2px" }}>{cp.min_target > 0 ? `≥ ₹${cp.min_target.toLocaleString("en-IN")}` : "Base"}</p>
                                <span style={{ display: "inline-block", marginTop: "5px", fontSize: "7px", fontWeight: 800, letterSpacing: "0.05em", padding: "1px 5px", borderRadius: "3px", background: isActive ? "rgba(249,115,22,0.15)" : cp.cleared ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.1)", color: isActive ? "#f97316" : cp.cleared ? "#10b981" : "#94a3b8" }}>
                                  {isActive ? "⚡ EARNING" : cp.cleared ? "✓ CLEARED" : "○ LOCKED"}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Bottom strip: admin sales entry */}
                        {canEdit && (
                          <div style={{ borderTop: "1px solid rgba(249,115,22,0.12)", background: "linear-gradient(90deg,rgba(249,115,22,0.05),transparent)", padding: "10px 18px" }}>
                            <SalesAmountEntry
                              employeeId={selectedUser}
                              month={form.month}
                              year={form.year}
                              current={achieved}
                              onSaved={(rec) => setSalesRecord(rec)}
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Auto-Calculated Scores Section */}
              {selectedUser && (
                <div className="page-card border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
                        <TrendingUp size={16} className="text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-theme-fg">Auto-Calculated Scores</h3>
                        <p className="text-[11px] text-theme-muted">AI-powered analysis from employee data (attendance, projects, tasks)</p>
                      </div>
                    </div>
                  </div>

                  {loadingAutoCalc ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 animate-pulse rounded-lg bg-theme-raised/50" />
                      ))}
                    </div>
                  ) : autoCalc ? (
                    <div className="space-y-4">
                      {/* Main Score Display */}
                      <div className="rounded-xl bg-theme-page/50 p-4 border border-emerald-500/20">
                        <div className="flex items-end justify-between gap-4">
                          <div>
                            <p className="text-[11px] text-theme-muted font-bold uppercase mb-1">AI Calculated Final Score</p>
                            <div className="flex items-baseline gap-2">
                              <span className="text-4xl font-black text-emerald-600">{autoCalc.final_score ? autoCalc.final_score.toFixed(1) : "—"}</span>
                              <span className="text-sm font-bold text-emerald-600 mb-1">{autoCalc.rating_label || "—"}</span>
                            </div>
                          </div>
                          <div className="h-16 w-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
                            <div className="text-center">
                              <p className="text-xs font-bold text-emerald-700">Score</p>
                              <p className="text-lg font-black text-emerald-600">{autoCalc.final_score ? Math.round(autoCalc.final_score) : "—"}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Score Components Grid */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 p-3">
                          <p className="text-[9px] font-bold text-sky-700 uppercase mb-1.5">KPI Score</p>
                          <p className="text-2xl font-black text-sky-600">{autoCalc.kpi_score ? autoCalc.kpi_score.toFixed(1) : "—"}</p>
                          <div className="mt-2 h-1 w-full bg-sky-500/20 rounded-full overflow-hidden">
                            <div className="h-full bg-sky-500" style={{ width: `${autoCalc.kpi_score ? Math.min(autoCalc.kpi_score, 100) : 0}%` }} />
                          </div>
                        </div>
                        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                          <p className="text-[9px] font-bold text-emerald-700 uppercase mb-1.5">KRA Score</p>
                          <p className="text-2xl font-black text-emerald-600">{autoCalc.kra_score ? autoCalc.kra_score.toFixed(1) : "—"}</p>
                          <div className="mt-2 h-1 w-full bg-emerald-500/20 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${autoCalc.kra_score ? Math.min(autoCalc.kra_score, 100) : 0}%` }} />
                          </div>
                        </div>
                        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3">
                          <p className="text-[9px] font-bold text-purple-700 uppercase mb-1.5">Behavioral</p>
                          <p className="text-2xl font-black text-purple-600">{autoCalc.behavioral_score ? autoCalc.behavioral_score.toFixed(1) : "—"}</p>
                          <div className="mt-2 h-1 w-full bg-purple-500/20 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500" style={{ width: `${autoCalc.behavioral_score ? Math.min(autoCalc.behavioral_score, 100) : 0}%` }} />
                          </div>
                        </div>
                      </div>

                      {/* Breakdown Details */}
                      <div className="rounded-lg bg-theme-page/30 p-4 space-y-3">
                        <div>
                          <p className="text-[10px] font-bold text-theme-muted uppercase mb-2">KPI Breakdown</p>
                          <div className="space-y-2 text-xs">
                            {autoCalc.kpi_entries && autoCalc.kpi_entries.length > 0 ? (
                              autoCalc.kpi_entries.map((entry, i) => (
                                <div key={i} className="flex items-center justify-between text-theme-fg">
                                  <span>{entry.label} ({entry.weight}%)</span>
                                  <span className="font-bold text-sky-600">{entry.score ? entry.score.toFixed(0) : "—"}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-theme-muted">No data available</p>
                            )}
                          </div>
                        </div>
                        <div className="border-t border-theme-border pt-3">
                          <p className="text-[10px] font-bold text-theme-muted uppercase mb-2">Insights & Recommendation</p>
                          <div className="space-y-1.5 text-xs text-theme-fg">
                            <p><span className="text-theme-muted">Attendance:</span> {autoCalc.insights?.attendance_status || "—"}</p>
                            <p><span className="text-theme-muted">Tasks:</span> {autoCalc.insights?.task_completion || "—"}</p>
                            <p><span className="text-theme-muted">Projects:</span> {autoCalc.insights?.project_status || "—"}</p>
                            <p className="font-semibold text-emerald-600 mt-2">HR Recommendation: {autoCalc.insights?.recommendation || "—"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-theme-page/50 border border-dashed border-theme-border px-3 py-2.5">
                        <p className="text-[10px] text-theme-muted">
                          💡 The scores above are auto-calculated from actual employee data. You can override them below with manual adjustments if needed.
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={applyAutoCalculatedScores}
                          disabled={!canEdit || !autoCalc}
                          className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-theme-raised disabled:text-theme-muted px-4 py-2.5 text-sm font-bold text-white transition-all"
                        >
                          ✓ Update KPI/KRA
                        </button>
                        <button
                          onClick={revertToDefaults}
                          disabled={!canEdit}
                          className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-theme-raised disabled:text-theme-muted px-4 py-2.5 text-sm font-bold text-white transition-all"
                        >
                          ↶ Revert
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-theme-border py-6 text-center">
                      <p className="text-xs text-theme-subtle">No auto-calculated data available for this period</p>
                    </div>
                  )}
                </div>
              )}

              {/* KPI Section */}
              <div className="page-card">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10">
                      <BarChart3 size={16} className="text-sky-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-theme-fg">Manual KPI Override</h3>
                      <p className="text-[11px] text-theme-muted">Weight: 40% of final score · Adjust auto-calculated scores or enter custom values</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {totalWeight !== 100 && (
                      <span className="flex items-center gap-1 text-[11px] text-amber-600">
                        <Info size={12} /> Weights: {totalWeight}%
                      </span>
                    )}
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/10 border-2 border-sky-500/20">
                      <span className="text-sm font-black text-sky-600">{Math.round(kpiScore)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {form.kpiEntries.map((entry, idx) => (
                    <div key={idx} className="rounded-xl border border-theme-border bg-theme-raised/50 p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <input
                          type="text"
                          value={entry.label}
                          onChange={(e) => {
                            const updated = [...form.kpiEntries];
                            updated[idx] = { ...updated[idx], label: e.target.value };
                            setForm((f) => ({ ...f, kpiEntries: updated }));
                          }}
                          disabled={!canEdit}
                          placeholder={`KPI ${idx + 1}`}
                          className="flex-1 min-w-[120px] rounded-lg border border-theme-border bg-theme-page px-3 py-1.5 text-xs font-semibold text-theme-fg outline-none focus:border-theme-strong transition-all disabled:opacity-60"
                        />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-theme-muted">Weight</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={entry.weight}
                            onChange={(e) => {
                              const updated = [...form.kpiEntries];
                              updated[idx] = { ...updated[idx], weight: parseInt(e.target.value) || 0 };
                              setForm((f) => ({ ...f, kpiEntries: updated }));
                            }}
                            disabled={!canEdit}
                            className="w-14 rounded-lg border border-theme-border bg-theme-page px-2 py-1.5 text-center text-xs font-bold text-theme-fg outline-none focus:border-theme-strong transition-all disabled:opacity-60"
                          />
                          <span className="text-[11px] text-theme-muted">%</span>
                        </div>
                        <div className={cn(
                          "flex h-7 w-10 items-center justify-center rounded-lg font-black text-sm",
                          entry.score >= 80 ? "bg-emerald-500/10 text-emerald-600" :
                          entry.score >= 60 ? "bg-sky-500/10 text-sky-600" :
                          entry.score >= 40 ? "bg-amber-500/10 text-amber-600" :
                          "bg-theme-raised text-theme-muted"
                        )}>
                          {entry.score}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={entry.score}
                          onChange={(e) => {
                            const updated = [...form.kpiEntries];
                            updated[idx] = { ...updated[idx], score: parseInt(e.target.value) };
                            setForm((f) => ({ ...f, kpiEntries: updated }));
                          }}
                          disabled={!canEdit}
                          className="flex-1 h-2 cursor-pointer accent-sky-600 disabled:cursor-not-allowed"
                        />
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-theme-border">
                          <div
                            className={cn("h-full rounded-full transition-all",
                              entry.score >= 80 ? "bg-emerald-500" :
                              entry.score >= 60 ? "bg-sky-500" :
                              entry.score >= 40 ? "bg-amber-500" : "bg-red-400"
                            )}
                            style={{ width: `${entry.score}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* KRA Section */}
              <div className="page-card">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
                      <TrendingUp size={16} className="text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-theme-fg">Manual KRA Override</h3>
                      <p className="text-[11px] text-theme-muted">Weight: 40% of final score · Rate 1–5 stars or adjust from auto-calculated</p>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 border-2 border-emerald-500/20">
                    <span className="text-sm font-black text-emerald-600">{Math.round(kraScore)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {([
                    { key: "ownership"  as const, label: "Ownership",         desc: "Takes responsibility, follows through" },
                    { key: "quality"    as const, label: "Quality of Work",    desc: "Accuracy, thoroughness, attention to detail" },
                    { key: "initiative" as const, label: "Initiative",         desc: "Proactive, goes beyond assigned tasks" },
                  ]).map(({ key, label, desc }) => (
                    <div key={key} className="rounded-xl border border-theme-border bg-theme-raised/50 p-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-theme-fg">{label}</p>
                        <p className="text-[10px] text-theme-subtle mt-0.5">{desc}</p>
                      </div>
                      <StarRating
                        value={form.kraMetrics[key]}
                        onChange={(v) => setForm((f) => ({ ...f, kraMetrics: { ...f.kraMetrics, [key]: v } }))}
                        disabled={!canEdit}
                        color="text-emerald-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Behavioral Section */}
              <div className="page-card">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10">
                      <Award size={16} className="text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-theme-fg">Manual Behavioral Override</h3>
                      <p className="text-[11px] text-theme-muted">Weight: 20% of final score · Adjust from auto-calculated values</p>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10 border-2 border-purple-500/20">
                    <span className="text-sm font-black text-purple-600">{Math.round(behavioralScore)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {/* Attendance */}
                  <div className="rounded-xl border border-theme-border bg-theme-raised/50 p-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-theme-fg">Attendance</p>
                      <p className="text-[10px] text-theme-subtle mt-0.5">Monthly attendance percentage</p>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[100, 95, 90, 85, 80, 75, 70, 60].map((a) => (
                        <button
                          key={a}
                          onClick={() => setForm((f) => ({ ...f, behavioralMetrics: { ...f.behavioralMetrics, attendance: a } }))}
                          disabled={!canEdit}
                          className={cn(
                            "rounded-lg py-1.5 text-[11px] font-bold transition-all border",
                            form.behavioralMetrics.attendance === a
                              ? "bg-purple-600 border-purple-700 text-white shadow-sm"
                              : "border-theme-border bg-theme-page text-theme-muted hover:border-purple-300 hover:text-theme-fg"
                          )}
                        >
                          {a}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Discipline + Communication */}
                  {([
                    { key: "discipline"    as const, label: "Discipline",     desc: "Punctuality, adherence to policy" },
                    { key: "communication" as const, label: "Communication",  desc: "Team collaboration, clarity" },
                  ]).map(({ key, label, desc }) => (
                    <div key={key} className="rounded-xl border border-theme-border bg-theme-raised/50 p-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-theme-fg">{label}</p>
                        <p className="text-[10px] text-theme-subtle mt-0.5">{desc}</p>
                      </div>
                      <StarRating
                        value={form.behavioralMetrics[key]}
                        onChange={(v) => setForm((f) => ({ ...f, behavioralMetrics: { ...f.behavioralMetrics, [key]: v } }))}
                        disabled={!canEdit}
                        color="text-purple-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks */}
              <div className="page-card">
                <label className="mb-2 block text-xs font-semibold text-theme-muted uppercase tracking-wide">
                  Manager Remarks
                </label>
                <textarea
                  value={form.remarks}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                  disabled={!canEdit}
                  rows={3}
                  placeholder="Summarise the employee's performance, notable achievements, and areas for improvement…"
                  className="w-full rounded-xl border border-theme-border bg-theme-page px-4 py-3 text-sm text-theme-fg outline-none focus:border-theme-strong transition-all placeholder:text-theme-subtle resize-none disabled:opacity-60"
                />
              </div>
            </div>

            {/* Right — Score Sidebar */}
            <div className="space-y-4">
              {/* Gauge */}
              <div className="page-card sticky top-5">
                <h3 className="mb-4 text-xs font-semibold text-theme-muted uppercase tracking-wide">Live Score</h3>

                {/* SVG Gauge */}
                <div className="relative mx-auto mb-4 flex h-40 w-40 items-center justify-center">
                  <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
                    <circle cx="80" cy="80" r={R} fill="none" strokeWidth="10" className="text-theme-raised" stroke="currentColor" />
                    <circle
                      cx="80" cy="80" r={R}
                      fill="none" strokeWidth="10"
                      stroke={gaugeColor(finalScore)}
                      strokeDasharray={CIRC}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-4xl font-black text-theme-fg">{Math.round(finalScore)}</span>
                    <span className={cn("text-[11px] font-bold", RATING_COLOR[rating.label] ?? "text-theme-muted")}>
                      {rating.label}
                    </span>
                  </div>
                </div>

                {/* Incentive hint */}
                <div className="mb-4 rounded-lg bg-theme-raised px-3 py-2 text-center">
                  <p className="text-[10px] text-theme-muted">Incentive multiplier</p>
                  <p className="text-sm font-bold text-theme-fg">{rating.incentiveHint}</p>
                </div>

                {/* Breakdown bars */}
                <div className="space-y-3">
                  {[
                    { label: "KPI (40%)",        value: Math.round(kpiScore),       color: "bg-sky-500" },
                    { label: "KRA (40%)",         value: Math.round(kraScore),       color: "bg-emerald-500" },
                    { label: "Behavioral (20%)",  value: Math.round(behavioralScore), color: "bg-purple-500" },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="text-theme-muted">{label}</span>
                        <span className="font-bold text-theme-fg">{value}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-theme-raised">
                        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-theme-border pt-4">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    loading={submitting}
                    onClick={handleSubmit}
                    disabled={!canEdit || !selectedUser}
                  >
                    <CheckCircle2 size={13} className="mr-1.5" />
                    {isEditing ? "Update Score" : "Save Score"}
                  </Button>
                </div>
              </div>

              {/* History */}
              <div className="page-card">
                <h3 className="mb-3 text-xs font-semibold text-theme-muted uppercase tracking-wide">Score History</h3>
                {!selectedUser ? (
                  <div className="rounded-xl border border-dashed border-theme-border py-8 text-center">
                    <p className="text-xs text-theme-subtle">Select an employee to view history</p>
                  </div>
                ) : loadingScores ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-xl bg-theme-raised" />
                    ))}
                  </div>
                ) : scores.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-theme-border py-8 text-center">
                    <p className="text-xs text-theme-subtle">No records yet for this employee</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {scores.slice(0, 6).map((score) => (
                      <button
                        key={score._id}
                        onClick={() => setForm(createFormFromScore(score))}
                        className="group w-full rounded-xl border border-theme-border bg-theme-raised/50 px-3 py-2.5 text-left transition-all hover:border-sky-400 hover:bg-theme-raised"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-theme-fg">
                            {monthLabel(score.month, score.year)}
                          </span>
                          <span className={cn("text-sm font-black", RATING_COLOR[score.rating_label ?? ""] ?? "text-theme-fg")}>
                            {score.final_score}
                          </span>
                        </div>
                        <div className="mt-1 flex gap-3 text-[10px] text-theme-muted">
                          <span>KPI {score.kpi_score}</span>
                          <span>KRA {score.kra_score}</span>
                          <span>BEH {score.behavioral_score ?? 0}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TEAM OVERVIEW TAB ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            {/* Period stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Outstanding (≥90)",     count: MOCK_OVERVIEW.filter((r) => r.final >= 90).length,  color: "text-emerald-600", bg: "bg-emerald-500/10" },
                { label: "Exceeds (75–89)",        count: MOCK_OVERVIEW.filter((r) => r.final >= 75 && r.final < 90).length, color: "text-sky-600",     bg: "bg-sky-500/10" },
                { label: "Meets (60–74)",          count: MOCK_OVERVIEW.filter((r) => r.final >= 60 && r.final < 75).length, color: "text-amber-600",   bg: "bg-amber-500/10" },
                { label: "Needs Improvement",      count: MOCK_OVERVIEW.filter((r) => r.final < 60).length,  color: "text-red-500",     bg: "bg-red-500/10" },
              ].map(({ label, count, color, bg }) => (
                <div key={label} className="page-card flex items-center gap-3">
                  <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
                    <Star size={15} className={color} />
                  </div>
                  <div>
                    <p className="text-[10px] text-theme-muted leading-tight">{label}</p>
                    <p className={cn("text-xl font-black", color)}>{count}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Overview table */}
            <div className="page-card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
                <h3 className="text-sm font-semibold text-theme-fg">
                  March 2026 — All Employees
                </h3>
                <span className="text-xs text-theme-muted">Avg: {MOCK_OVERVIEW.length ? Math.round(MOCK_OVERVIEW.reduce((s, r) => s + r.final, 0) / MOCK_OVERVIEW.length) : 0} / 100</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted">
                      <th className="px-5 py-3 font-semibold">Employee</th>
                      <th className="px-5 py-3 font-semibold">Department</th>
                      <th className="px-5 py-3 font-semibold text-center">KPI</th>
                      <th className="px-5 py-3 font-semibold text-center">KRA</th>
                      <th className="px-5 py-3 font-semibold text-center">Behavioral</th>
                      <th className="px-5 py-3 font-semibold">Final Score</th>
                      <th className="px-5 py-3 font-semibold text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border">
                    {[...MOCK_OVERVIEW]
                      .sort((a, b) => b.final - a.final)
                      .map(({ emp, kpi, kra, beh, final }) => {
                        const r = getKpiRating(final);
                        return (
                          <tr
                            key={emp._id}
                            className="cursor-pointer transition-colors hover:bg-theme-raised/40"
                            onClick={() => {
                              setSelectedUser(emp._id);
                              setTab("entry");
                            }}
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-theme-primary text-theme-surface text-[10px] font-black">
                                  {getInitials(emp.name)}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-theme-fg">{emp.name}</p>
                                  <p className="text-[10px] text-theme-subtle">{emp.employeeId}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <span className="text-xs text-theme-muted">{emp.department}</span>
                            </td>
                            <td className="px-5 py-3 text-center font-semibold text-sky-600">{kpi}</td>
                            <td className="px-5 py-3 text-center font-semibold text-emerald-600">{kra}</td>
                            <td className="px-5 py-3 text-center font-semibold text-purple-600">{beh}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-theme-raised">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${final}%`, backgroundColor: gaugeColor(final) }}
                                  />
                                </div>
                                <span className={cn("text-xs font-bold", RATING_COLOR[r.label])}>{final}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <Badge variant={RATING_BADGE[r.label] ?? "default"}>
                                {r.label}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-theme-border bg-theme-page px-5 py-2.5 text-xs text-theme-subtle">
                Click any row to open that employee's score entry form
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
