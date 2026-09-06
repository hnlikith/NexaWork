"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, IndianRupee, Loader2, Plus, Pencil, Trash2, CheckCircle2,
  Clock, AlertCircle, Sparkles, Download, FileText, History, ListChecks,
  Settings, Eye, CalendarDays, Activity, UserSearch,
} from "lucide-react";
import { bufferDays, DEFAULT_FREE_HOLIDAYS } from "@/lib/internshipMath";
import { InternsSummary } from "@/components/interns/InternsSummary";
import dayjs from "@/lib/dayjs";

// ─── Types ────────────────────────────────────────────────────────────────
interface Intern {
  id: string;
  full_name: string;
  intern_id: string;
  upi_id: string | null;
  stipend_amount: number;
  joining_date: string;
  starting_date: string;
  billing_date: string;
  is_active: boolean;
  notes: string | null;
}

interface Cycle {
  id: string | null;
  intern_id: string;
  full_name: string;
  intern_code: string;
  upi_id: string | null;
  stipend_amount: number;
  joining_date: string;
  starting_date: string;
  billing_date: string;
  month: number;
  year: number;
  paid_days: number;
  buffer_paid_days: number;
  holidays_taken: number;
  extra_leave_days: number;
  gross_amount: number;
  deductions: number;
  net_amount: number;
  amount_paid: number;
  payment_status: "pending" | "paid" | "failed";
  payment_date: string | null;
  payment_ref: string | null;
  notes: string | null;
  is_persisted: boolean;
}

interface UnpaidCycle {
  id: string | null;
  month: number;
  year: number;
  paid_days: number;
  buffer_paid_days: number;
  gross_amount: number;
  deductions: number;
  net_amount: number;
  payment_status: "pending" | "paid" | "failed";
  is_persisted: boolean;
}

interface HistoryRow extends Cycle { intern_is_active: boolean; created_at: string }

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function initials(name?: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function statusBadge(status: Cycle["payment_status"]) {
  if (status === "paid")    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 gap-1"><CheckCircle2 className="h-3 w-3" /> Paid</Badge>;
  if (status === "failed")  return <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20 gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
}

const emptyIntern = {
  full_name: "", intern_id: "", upi_id: "", stipend_amount: "",
  joining_date: "", starting_date: "", billing_date: "", notes: "",
};

export default function InternshipStipendPage() {
  const { user } = useAuth();

  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear]   = useState(today.getFullYear());
  const [tab, setTab]     = useState<"cycles" | "roster" | "history" | "summary">("cycles");

  // Data
  const [interns, setInterns]   = useState<Intern[]>([]);
  const [cycles, setCycles]     = useState<Cycle[]>([]);
  const [history, setHistory]   = useState<HistoryRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [acting, setActing]     = useState(false);

  // Add/edit intern dialog
  const [internOpen, setInternOpen] = useState(false);
  const [internEditing, setInternEditing] = useState<Intern | null>(null);
  const [internForm, setInternForm] = useState({ ...emptyIntern });
  const [internSaving, setInternSaving] = useState(false);

  // Cycle dialog (mark paid / override)
  const [cycleOpen, setCycleOpen] = useState(false);
  const [cycleEditing, setCycleEditing] = useState<Cycle | null>(null);
  const [cycleForm, setCycleForm] = useState({
    paid_days: "30",
    buffer_paid_days: "0",
    extra_leave_days: "0",
    deductions: "0",
    amount_paid: "0",
    payment_status: "pending" as Cycle["payment_status"],
    payment_date: "",
    payment_ref: "",
    notes: "",
  });
  const [cycleSaving, setCycleSaving] = useState(false);
  // Carry-forward context for the month being paid (excess from the previous month).
  const [cycleCarry, setCycleCarry] = useState<{ carry_in: number; net: number; from: { month: number; year: number } | null } | null>(null);

  // Clear Backlog dialog
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [backlogIntern, setBacklogIntern] = useState<Intern | null>(null);
  const [backlogUnpaid, setBacklogUnpaid] = useState<UnpaidCycle[]>([]);
  const [backlogSelected, setBacklogSelected] = useState<Set<string>>(new Set());
  const [backlogLoading, setBacklogLoading] = useState(false);
  const [backlogSaving, setBacklogSaving] = useState(false);
  const [backlogForm, setBacklogForm] = useState({ payment_date: "", payment_ref: "", notes: "" });

  // Delete confirms
  const [deleteIntern, setDeleteIntern] = useState<Intern | null>(null);

  // Year options: current ± 2
  const yearOptions = useMemo(() => {
    const y = today.getFullYear();
    return [y - 2, y - 1, y, y + 1, y + 2];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Loaders ────────────────────────────────────────────────────────────
  const loadInterns = useCallback(async () => {
    try {
      const res = await fetch("/api/interns");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setInterns(j.interns ?? []);
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Failed to load interns");
    }
  }, []);

  const loadCycles = useCallback(async (m: number, y: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/interns/cycles?month=${m}&year=${y}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setCycles(j.cycles ?? []);
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Failed to load cycles");
    } finally { setLoading(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/interns/cycles/history?limit=200");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setHistory(j.history ?? []);
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Failed to load history");
    }
  }, []);

  useEffect(() => { loadInterns(); }, [loadInterns]);
  useEffect(() => { if (tab === "cycles") loadCycles(month, year); }, [tab, month, year, loadCycles]);
  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);

  // ─── Intern dialog actions ──────────────────────────────────────────────
  function openAddIntern() {
    setInternEditing(null);
    setInternForm({ ...emptyIntern });
    setInternOpen(true);
  }
  function openEditIntern(i: Intern) {
    setInternEditing(i);
    setInternForm({
      full_name: i.full_name,
      intern_id: i.intern_id,
      upi_id: i.upi_id ?? "",
      stipend_amount: String(i.stipend_amount),
      joining_date: i.joining_date,
      starting_date: i.starting_date,
      billing_date: i.billing_date,
      notes: i.notes ?? "",
    });
    setInternOpen(true);
  }

  async function saveIntern(e: React.FormEvent) {
    e.preventDefault();
    setInternSaving(true);
    try {
      const payload = {
        full_name: internForm.full_name.trim(),
        intern_id: internForm.intern_id.trim(),
        upi_id:    internForm.upi_id.trim() || null,
        stipend_amount: Number(internForm.stipend_amount),
        joining_date:  internForm.joining_date,
        starting_date: internForm.starting_date,
        billing_date:  internForm.billing_date,
        notes: internForm.notes.trim() || null,
        created_by: user?.id,
      };
      const url = internEditing ? `/api/interns/${internEditing.id}` : "/api/interns";
      const method = internEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(internEditing ? "Intern updated." : "Intern added.");
      setInternOpen(false);
      loadInterns();
      if (tab === "cycles") loadCycles(month, year);
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Save failed");
    } finally { setInternSaving(false); }
  }

  // ─── Clear Backlog flow ───────────────────────────────────────────────
  async function openBacklog(intern: Intern) {
    setBacklogIntern(intern);
    setBacklogUnpaid([]);
    setBacklogSelected(new Set());
    setBacklogForm({ payment_date: dayjs().format("YYYY-MM-DD"), payment_ref: "", notes: "" });
    setBacklogOpen(true);
    setBacklogLoading(true);
    try {
      const res = await fetch(`/api/interns/${intern.id}/unpaid`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      const list: UnpaidCycle[] = j.unpaid ?? [];
      setBacklogUnpaid(list);
      // Pre-select all
      setBacklogSelected(new Set(list.map(c => `${c.year}-${c.month}`)));
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Failed to load backlog");
    } finally {
      setBacklogLoading(false);
    }
  }

  function toggleBacklog(key: string) {
    setBacklogSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function setBacklogPaidDays(key: string, value: number) {
    setBacklogUnpaid(prev => prev.map(c => {
      if (`${c.year}-${c.month}` !== key) return c;
      if (!backlogIntern) return c;
      const buffer = c.buffer_paid_days || 0;
      const gross  = Math.round((backlogIntern.stipend_amount / 30) * (value + buffer));
      const net    = Math.max(0, gross - c.deductions);
      return { ...c, paid_days: value, gross_amount: gross, net_amount: net };
    }));
  }

  function setBacklogBuffer(key: string, value: number) {
    setBacklogUnpaid(prev => prev.map(c => {
      if (`${c.year}-${c.month}` !== key) return c;
      if (!backlogIntern) return c;
      const gross = Math.round((backlogIntern.stipend_amount / 30) * (c.paid_days + value));
      const net   = Math.max(0, gross - c.deductions);
      return { ...c, buffer_paid_days: value, gross_amount: gross, net_amount: net };
    }));
  }

  async function submitBacklog(e: React.FormEvent) {
    e.preventDefault();
    if (!backlogIntern) return;
    const chosen = backlogUnpaid.filter(c => backlogSelected.has(`${c.year}-${c.month}`));
    if (chosen.length === 0) { toast.info("Select at least one month."); return; }
    if (!backlogForm.payment_date || !backlogForm.payment_ref.trim()) {
      toast.error("Payment date and UPI ref are required.");
      return;
    }
    setBacklogSaving(true);
    try {
      const res = await fetch("/api/interns/cycles/bulk-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intern_id: backlogIntern.id,
          payment_date: backlogForm.payment_date,
          payment_ref: backlogForm.payment_ref.trim(),
          notes: backlogForm.notes.trim() || null,
          paid_by: user?.id ?? null,
          cycles: chosen.map(c => ({
            id: c.id,
            month: c.month,
            year: c.year,
            paid_days: c.paid_days,
            buffer_paid_days: c.buffer_paid_days,
            deductions: c.deductions,
          })),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(`Cleared ${j.total} cycle${j.total === 1 ? "" : "s"} for ${backlogIntern.full_name}.`);
      setBacklogOpen(false);
      if (tab === "cycles") loadCycles(month, year);
      if (tab === "history") loadHistory();
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Save failed");
    } finally { setBacklogSaving(false); }
  }

  const backlogTotal = useMemo(() => backlogUnpaid
    .filter(c => backlogSelected.has(`${c.year}-${c.month}`))
    .reduce((s, c) => s + c.net_amount, 0), [backlogUnpaid, backlogSelected]);

  async function confirmDeleteIntern() {
    if (!deleteIntern) return;
    try {
      const res = await fetch(`/api/interns/${deleteIntern.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success("Intern deactivated.");
      setDeleteIntern(null);
      loadInterns();
      if (tab === "cycles") loadCycles(month, year);
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Delete failed");
    }
  }

  // ─── Generate cycles ────────────────────────────────────────────────────
  async function handleGenerate() {
    setActing(true);
    try {
      const res = await fetch("/api/interns/cycles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(j.created > 0 ? `${j.created} cycle${j.created === 1 ? "" : "s"} drafted.` : j.message);
      loadCycles(month, year);
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Generation failed");
    } finally { setActing(false); }
  }

  // ─── Cycle dialog actions ───────────────────────────────────────────────
  async function openCycle(c: Cycle) {
    setCycleEditing(c);
    setCycleForm({
      paid_days:        String(c.paid_days),
      buffer_paid_days: String(c.buffer_paid_days ?? 0),
      extra_leave_days: String(c.extra_leave_days ?? 0),
      deductions:       String(c.deductions),
      amount_paid:      String(c.amount_paid || c.net_amount),
      payment_status:   c.payment_status,
      payment_date:     c.payment_date ?? dayjs().format("YYYY-MM-DD"),
      payment_ref:      c.payment_ref ?? "",
      notes:            c.notes ?? "",
    });
    setCycleCarry(null);
    setCycleOpen(true);

    // Look up carry-forward for THIS month (from earlier over-payments) so the
    // dialog can show how much is really owed and auto-fill the amount to pay.
    try {
      const res = await fetch(`/api/interns/${c.intern_id}/summary?year=${c.year}`);
      const j = await res.json();
      if (res.ok) {
        const tm = (j.months || []).find((x: any) => x.month === c.month);
        const carry_in = Number(tm?.carry_in ?? 0);
        const net = Number(tm?.net ?? c.net_amount);
        const from = tm?.carry_from ?? null;
        setCycleCarry({ carry_in, net, from });
        // Auto-allot the carry: only the remainder needs to be paid this month.
        if (c.payment_status !== "paid" && carry_in > 0) {
          setCycleForm((f) => ({ ...f, amount_paid: String(Math.max(0, net - carry_in)) }));
        }
      }
    } catch { /* carry lookup is best-effort */ }
  }

  async function saveCycle(e: React.FormEvent) {
    e.preventDefault();
    if (!cycleEditing) return;
    setCycleSaving(true);
    try {
      const paid_days        = Number(cycleForm.paid_days);
      const buffer_paid_days = Number(cycleForm.buffer_paid_days);
      const extra_leave_days = Math.max(0, Number(cycleForm.extra_leave_days) || 0);
      const deductions       = Number(cycleForm.deductions);
      // Extra holidays beyond the free allowance are LOP — they reduce paid days.
      const effective_days = Math.max(0, paid_days + buffer_paid_days - extra_leave_days);
      const gross = Math.round((cycleEditing.stipend_amount / 30) * effective_days);
      const body = {
        intern_id:        cycleEditing.intern_id,
        month:            cycleEditing.month,
        year:             cycleEditing.year,
        paid_days,
        buffer_paid_days,
        extra_leave_days,
        // Keep total holidays coherent with the extra (LOP) count so the summary
        // never shows "6 (incl. N extra)" where N > the total.
        holidays_taken:   DEFAULT_FREE_HOLIDAYS + extra_leave_days,
        deductions,
        gross_amount:     gross,
        // Actual amount credited — full = Paid, less = Half-paid, more = Over-paid.
        amount_paid:      cycleForm.payment_status === "paid" ? Math.max(0, Number(cycleForm.amount_paid) || 0) : 0,
        payment_status:   cycleForm.payment_status,
        payment_date:     cycleForm.payment_status === "paid" ? cycleForm.payment_date || null : null,
        payment_ref:      cycleForm.payment_ref.trim() || null,
        notes:            cycleForm.notes.trim() || null,
        paid_by:          user?.id ?? null,
      };
      const id = cycleEditing.is_persisted && cycleEditing.id ? cycleEditing.id : "new";
      const res = await fetch(`/api/interns/cycles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success("Cycle saved.");
      setCycleOpen(false);
      loadCycles(month, year);
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Save failed");
    } finally { setCycleSaving(false); }
  }

  // ─── KPIs ───────────────────────────────────────────────────────────────
  const totalNet     = cycles.reduce((s, c) => s + Number(c.net_amount), 0);
  const totalPaid    = cycles.filter(c => c.payment_status === "paid").reduce((s, c) => s + Number(c.net_amount), 0);
  const totalPending = cycles.filter(c => c.payment_status !== "paid").reduce((s, c) => s + Number(c.net_amount), 0);
  const activeInternCount = interns.filter(i => i.is_active).length;

  // Live gross preview in cycle dialog
  const cycleGross = useMemo(() => {
    if (!cycleEditing) return 0;
    const pd = Number(cycleForm.paid_days) || 0;
    const bpd = Number(cycleForm.buffer_paid_days) || 0;
    const extra = Math.max(0, Number(cycleForm.extra_leave_days) || 0);
    const eff = Math.max(0, pd + bpd - extra);
    return Math.round((cycleEditing.stipend_amount / 30) * eff);
  }, [cycleEditing, cycleForm.paid_days, cycleForm.buffer_paid_days, cycleForm.extra_leave_days]);
  const cycleNet = useMemo(() => Math.max(0, cycleGross - Number(cycleForm.deductions || 0)), [cycleGross, cycleForm.deductions]);

  // CSV export of current month cycles
  function exportCSV() {
    const headers = ["Intern ID","Full Name","UPI","Stipend","Paid Days","Gross","Deductions","Net","Status","Payment Date","Payment Ref"];
    const rows = cycles.map(c => [
      c.intern_code, c.full_name, c.upi_id ?? "",
      c.stipend_amount, c.paid_days, c.gross_amount, c.deductions, c.net_amount,
      c.payment_status, c.payment_date ?? "", c.payment_ref ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `internship-stipend-${year}-${String(month).padStart(2,"0")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <DashboardShell
      moduleKey="payroll_internship"
      title="Internship Stipend"
      subtitle="Monthly stipend calculation and payment tracking for interns."
      actions={
        <div className="flex items-center gap-2">
          {tab === "cycles" && (
            <>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-9 w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={cycles.length === 0}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
              </Button>
              <Button size="sm" onClick={handleGenerate} disabled={acting}>
                {acting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Generate Cycles
              </Button>
            </>
          )}
          {tab === "roster" && (
            <Button size="sm" onClick={openAddIntern}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Intern
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/payroll/internship/manage">
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Holidays &amp; Payments
            </Link>
          </Button>
          {user?.role === "admin" && (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/payroll/internship/activity">
                <Activity className="mr-1.5 h-3.5 w-3.5" /> Intern Activity
              </Link>
            </Button>
          )}
          {user?.role === "admin" && (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/payroll/internship/settings">
                <Settings className="mr-1.5 h-3.5 w-3.5" /> Settings
              </Link>
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Active Interns",  value: activeInternCount,           icon: Users,       tone: "text-foreground", bg: "bg-muted" },
            { label: "Total Stipend",   value: formatCurrency(totalNet),    icon: IndianRupee, tone: "text-foreground", bg: "bg-muted" },
            { label: "Paid This Month", value: formatCurrency(totalPaid),   icon: CheckCircle2,tone: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "Pending Payout",  value: formatCurrency(totalPending),icon: Clock,       tone: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-500/10" },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("h-10 w-10 rounded-md flex items-center justify-center", k.bg, k.tone)}>
                  <k.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className={cn("text-xl font-semibold tabular-nums leading-tight", k.tone)}>{k.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="cycles"><ListChecks className="mr-1.5 h-3.5 w-3.5" /> {MONTHS[month - 1]} {year}</TabsTrigger>
            <TabsTrigger value="roster"><Users className="mr-1.5 h-3.5 w-3.5" /> Roster ({interns.length})</TabsTrigger>
            <TabsTrigger value="history"><History className="mr-1.5 h-3.5 w-3.5" /> Payment History</TabsTrigger>
            <TabsTrigger value="summary"><UserSearch className="mr-1.5 h-3.5 w-3.5" /> Interns Summary</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ── Interns Summary Tab ──────────────────────────────────────── */}
        {tab === "summary" && (
          <InternsSummary interns={interns.map((i) => ({ id: i.id, full_name: i.full_name, intern_id: i.intern_id }))} />
        )}

        {/* ── Cycles Tab ───────────────────────────────────────────────── */}
        {tab === "cycles" && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Intern</TableHead>
                    <TableHead>UPI ID</TableHead>
                    <TableHead className="text-right">Stipend</TableHead>
                    <TableHead className="text-right">Paid Days</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : cycles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                        No cycles for {MONTHS[month - 1]} {year}. Click <strong>Generate Cycles</strong> to draft them.
                      </TableCell>
                    </TableRow>
                  ) : cycles.map(c => (
                    <TableRow key={c.intern_id} className={c.is_persisted ? "" : "bg-amber-500/[0.04]"}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-[10px] font-semibold">{initials(c.full_name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium leading-tight">{c.full_name}</p>
                            <p className="text-[11px] text-muted-foreground">{c.intern_code}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{c.upi_id ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(c.stipend_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.paid_days} / 30
                        {c.buffer_paid_days > 0 && <span className="text-amber-600 dark:text-amber-400"> +{c.buffer_paid_days}b</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(c.gross_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {c.deductions > 0 ? `−${formatCurrency(c.deductions)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(c.net_amount)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {statusBadge(c.payment_status)}
                          {!c.is_persisted && <Badge variant="outline" className="text-[10px]">draft</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={c.payment_status === "paid" ? "outline" : "default"} onClick={() => openCycle(c)}>
                          {c.payment_status === "paid" ? "View / Edit" : "Mark Paid"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Roster Tab ──────────────────────────────────────────────── */}
        {tab === "roster" && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Intern</TableHead>
                    <TableHead>UPI ID</TableHead>
                    <TableHead className="text-right">Stipend</TableHead>
                    <TableHead>Joining</TableHead>
                    <TableHead>Starting</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead className="text-right">Buffer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                        No interns yet. Click <strong>Add Intern</strong> to start.
                      </TableCell>
                    </TableRow>
                  ) : interns.map(i => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-[10px] font-semibold">{initials(i.full_name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{i.full_name}</p>
                            <p className="text-[11px] text-muted-foreground">{i.intern_id}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{i.upi_id ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(i.stipend_amount)}</TableCell>
                      <TableCell className="text-xs tabular-nums">{dayjs(i.joining_date).format("DD MMM YYYY")}</TableCell>
                      <TableCell className="text-xs tabular-nums">{dayjs(i.starting_date).format("DD MMM YYYY")}</TableCell>
                      <TableCell className="text-xs tabular-nums">{dayjs(i.billing_date).format("DD MMM YYYY")}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{bufferDays(i.joining_date, i.starting_date)}d</TableCell>
                      <TableCell>
                        {i.is_active
                          ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Active</Badge>
                          : <Badge variant="secondary">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild size="sm" variant="outline" className="h-7">
                            <Link href={`/admin/payroll/internship/${i.id}`}>
                              <Eye className="mr-1 h-3 w-3" /> Statement
                            </Link>
                          </Button>
                          {i.is_active && (
                            <Button size="sm" variant="outline" className="h-7" onClick={() => openBacklog(i)}>
                              Clear Backlog
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditIntern(i)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {i.is_active && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => setDeleteIntern(i)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── History Tab ─────────────────────────────────────────────── */}
        {tab === "history" && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Intern</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid On</TableHead>
                    <TableHead>UPI Ref</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                        No payment history yet.
                      </TableCell>
                    </TableRow>
                  ) : history.map(h => (
                    <TableRow key={h.id ?? `${h.intern_id}-${h.month}-${h.year}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[10px] font-semibold">{initials(h.full_name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{h.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{MONTHS[h.month - 1]} {h.year}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(Number(h.net_amount))}</TableCell>
                      <TableCell>{statusBadge(h.payment_status)}</TableCell>
                      <TableCell className="text-xs tabular-nums">{h.payment_date ? dayjs(h.payment_date).format("DD MMM YYYY") : "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{h.payment_ref ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ─── Add/Edit Intern Dialog ───────────────────────────────────── */}
      <Dialog open={internOpen} onOpenChange={setInternOpen}>
        <DialogContent className="sm:max-w-lg !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[88vh]">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>{internEditing ? "Edit Intern" : "Add Intern"}</DialogTitle>
            <DialogDescription>{internEditing ? "Update intern details." : "Onboard a new intern with stipend details."}</DialogDescription>
          </DialogHeader>

          <form id="intern-form" onSubmit={saveIntern} className="min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            {/* Identity */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Identity</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Full Name *</Label>
                  <Input required value={internForm.full_name} onChange={(e) => setInternForm({ ...internForm, full_name: e.target.value })} placeholder="e.g. Priya Sharma" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Intern ID *</Label>
                    <Input required value={internForm.intern_id} onChange={(e) => setInternForm({ ...internForm, intern_id: e.target.value })} placeholder="INT-001" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>UPI ID</Label>
                    <Input value={internForm.upi_id} onChange={(e) => setInternForm({ ...internForm, upi_id: e.target.value })} placeholder="name@upi" className="font-mono" />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Dates */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Dates</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Joining Date *</Label>
                  <Input required type="date" value={internForm.joining_date} onChange={(e) => setInternForm({ ...internForm, joining_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Starting Date *</Label>
                  <Input required type="date" value={internForm.starting_date} onChange={(e) => setInternForm({ ...internForm, starting_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Billing Date *</Label>
                  <Input required type="date" value={internForm.billing_date} onChange={(e) => setInternForm({ ...internForm, billing_date: e.target.value })} />
                </div>
              </div>
              {internForm.joining_date && internForm.starting_date && (
                <p className="text-xs text-muted-foreground mt-2">
                  Buffer: <strong>{bufferDays(internForm.joining_date, internForm.starting_date)} day(s)</strong> between joining and starting. <span className="text-muted-foreground">(informational only — full pay)</span>
                </p>
              )}
            </div>

            <Separator />

            {/* Stipend */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Stipend</p>
              <div className="space-y-1.5">
                <Label>Monthly Stipend Amount (₹) *</Label>
                <Input required type="number" min={0} value={internForm.stipend_amount} onChange={(e) => setInternForm({ ...internForm, stipend_amount: e.target.value })} placeholder="e.g. 10000" className="tabular-nums" />
                <p className="text-[11px] text-muted-foreground">Full month payout. Mid-month start prorates as (stipend / 30) × paid days.</p>
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={internForm.notes} onChange={(e) => setInternForm({ ...internForm, notes: e.target.value })} placeholder="Optional — department, mentor, anything noteworthy." />
            </div>
          </form>

          <DialogFooter className="px-6 py-3 border-t bg-muted/20">
            <Button type="button" variant="outline" size="sm" onClick={() => setInternOpen(false)}>Cancel</Button>
            <Button type="submit" form="intern-form" size="sm" disabled={internSaving}>
              {internSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {internEditing ? "Save Changes" : "Add Intern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cycle Dialog ─────────────────────────────────────────────── */}
      <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
        <DialogContent className="sm:max-w-md !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[88vh]">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>{cycleEditing?.payment_status === "paid" ? "Edit Payment" : "Mark Stipend Paid"}</DialogTitle>
            <DialogDescription>
              {cycleEditing && <>
                {cycleEditing.full_name} · {MONTHS[cycleEditing.month - 1]} {cycleEditing.year}
              </>}
            </DialogDescription>
          </DialogHeader>

          {cycleEditing && (
            <form id="cycle-form" onSubmit={saveCycle} className="min-h-0 overflow-y-auto px-6 py-5 space-y-5">
              {/* Calculation */}
              <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Stipend</span>
                  <span className="font-medium tabular-nums">{formatCurrency(cycleEditing.stipend_amount)}/mo</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Per-day rate (÷ 30)</span>
                  <span className="font-medium tabular-nums">{formatCurrency(Math.round(cycleEditing.stipend_amount / 30))}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span>
                    Gross ({cycleForm.paid_days} days{Number(cycleForm.buffer_paid_days) > 0 ? ` + ${cycleForm.buffer_paid_days} buffer` : ""}{Number(cycleForm.extra_leave_days) > 0 ? ` − ${cycleForm.extra_leave_days} extra holiday(s)` : ""})
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(cycleGross)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-rose-600 dark:text-rose-400">Deductions</span>
                  <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">−{formatCurrency(Number(cycleForm.deductions) || 0)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base">
                  <span className="font-semibold">Net Payable</span>
                  <span className="font-bold tabular-nums">{formatCurrency(cycleNet)}</span>
                </div>
              </div>

              {/* Carry-forward from earlier over-payment(s) */}
              {cycleCarry && cycleCarry.carry_in > 0 && (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/[0.06] p-3 text-xs space-y-1">
                  <div className="font-semibold text-sky-700 dark:text-sky-400">
                    ↩ {formatCurrency(cycleCarry.carry_in)} carried over{cycleCarry.from ? ` from ${MONTHS[cycleCarry.from.month - 1]} ${cycleCarry.from.year}` : " from earlier"} (over-payment)
                  </div>
                  <p className="text-foreground">
                    Net owed <b className="tabular-nums">{formatCurrency(cycleCarry.net)}</b> − carried{" "}
                    <b className="tabular-nums">{formatCurrency(Math.min(cycleCarry.carry_in, cycleCarry.net))}</b> ={" "}
                    {cycleCarry.net - cycleCarry.carry_in <= 0 ? (
                      <b className="text-emerald-600">fully covered — nothing to pay this month.</b>
                    ) : (
                      <>
                        <b className="text-emerald-600 tabular-nums">{formatCurrency(cycleCarry.net - cycleCarry.carry_in)} to pay</b>
                        {" "}<span className="text-muted-foreground">(auto-filled in Amount Paid below).</span>
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Buffer info for context */}
              <div className="rounded-md border bg-amber-500/[0.05] border-amber-500/20 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Joining → Starting buffer</span>
                  <span className="font-semibold tabular-nums">{bufferDays(cycleEditing.joining_date, cycleEditing.starting_date)} day(s)</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Buffer is informational only by default. Set <strong>Buffer paid days</strong> below if you want to credit some of it as paid (typically on the first cycle only).
                </p>
              </div>

              {/* Override fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Paid Days</Label>
                  <Input type="number" min={0} max={31} value={cycleForm.paid_days} onChange={(e) => setCycleForm({ ...cycleForm, paid_days: e.target.value })} className="tabular-nums" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-amber-700 dark:text-amber-400">Buffer Paid</Label>
                  <Input type="number" min={0} max={31} value={cycleForm.buffer_paid_days} onChange={(e) => setCycleForm({ ...cycleForm, buffer_paid_days: e.target.value })} className="tabular-nums" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-rose-700 dark:text-rose-400">Extra Holidays (LOP)</Label>
                  <Input type="number" min={0} max={60} value={cycleForm.extra_leave_days} onChange={(e) => setCycleForm({ ...cycleForm, extra_leave_days: e.target.value })} className="tabular-nums" />
                </div>
                <div className="space-y-1.5">
                  <Label>Deductions (₹)</Label>
                  <Input type="number" min={0} value={cycleForm.deductions} onChange={(e) => setCycleForm({ ...cycleForm, deductions: e.target.value })} className="tabular-nums" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {DEFAULT_FREE_HOLIDAYS} holidays/month are free (4 weekly + 2 paid). <strong>Extra Holidays</strong> are unpaid — each removes one day&apos;s pay from the gross.
              </p>

              <Separator />

              {/* Payment fields */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={cycleForm.payment_status} onValueChange={(v) => setCycleForm({ ...cycleForm, payment_status: v as Cycle["payment_status"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {cycleForm.payment_status === "paid" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Amount Paid (₹)</Label>
                      <Input type="number" min={0} value={cycleForm.amount_paid} onChange={(e) => setCycleForm({ ...cycleForm, amount_paid: e.target.value })} className="tabular-nums" />
                      <p className="text-[10px] text-muted-foreground">
                        {(() => {
                          const ap = Number(cycleForm.amount_paid) || 0;
                          if (ap === 0) return "Nothing credited → shows as Not Paid.";
                          if (ap === cycleNet) return "Full amount → Paid.";
                          if (ap < cycleNet) return `Less than net (${formatCurrency(cycleNet)}) → Half/Less Paid · balance ${formatCurrency(cycleNet - ap)}.`;
                          return `More than net (${formatCurrency(cycleNet)}) → Over Paid · excess ${formatCurrency(ap - cycleNet)}.`;
                        })()}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Payment Date</Label>
                        <Input type="date" value={cycleForm.payment_date} onChange={(e) => setCycleForm({ ...cycleForm, payment_date: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>UPI Ref</Label>
                        <Input value={cycleForm.payment_ref} onChange={(e) => setCycleForm({ ...cycleForm, payment_ref: e.target.value })} placeholder="UTR / Txn ID" className="font-mono" />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={cycleForm.notes} onChange={(e) => setCycleForm({ ...cycleForm, notes: e.target.value })} placeholder="Optional — late payment reason, dispute, etc." />
                </div>
              </div>
            </form>
          )}

          <DialogFooter className="px-6 py-3 border-t bg-muted/20">
            <Button type="button" variant="outline" size="sm" onClick={() => setCycleOpen(false)}>Cancel</Button>
            <Button type="submit" form="cycle-form" size="sm" disabled={cycleSaving}>
              {cycleSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Clear Backlog Dialog ─────────────────────────────────────── */}
      <Dialog open={backlogOpen} onOpenChange={setBacklogOpen}>
        <DialogContent className="sm:max-w-2xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[90vh]">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Clear Backlog</DialogTitle>
            <DialogDescription>
              {backlogIntern && <>
                {backlogIntern.full_name} ({backlogIntern.intern_id})
                {backlogIntern.upi_id && <> · <span className="font-mono">{backlogIntern.upi_id}</span></>}
              </>}
            </DialogDescription>
          </DialogHeader>

          <form id="backlog-form" onSubmit={submitBacklog} className="min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            {backlogLoading ? (
              <div className="py-10 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : backlogUnpaid.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No unpaid cycles. Backlog is clear.
              </div>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Unpaid Months ({backlogUnpaid.length})
                  </p>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Paid Days</TableHead>
                          <TableHead className="text-right text-amber-700 dark:text-amber-400">Buffer</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead>State</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backlogUnpaid.map(c => {
                          const key = `${c.year}-${c.month}`;
                          const selected = backlogSelected.has(key);
                          return (
                            <TableRow key={key} className={selected ? "" : "opacity-50"}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleBacklog(key)}
                                  className="h-4 w-4 accent-primary"
                                />
                              </TableCell>
                              <TableCell className="text-sm">{MONTHS[c.month - 1]} {c.year}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number" min={0} max={31}
                                  value={c.paid_days}
                                  onChange={(e) => setBacklogPaidDays(key, Number(e.target.value))}
                                  disabled={!selected}
                                  className="h-7 w-16 ml-auto tabular-nums text-right"
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number" min={0} max={31}
                                  value={c.buffer_paid_days}
                                  onChange={(e) => setBacklogBuffer(key, Number(e.target.value))}
                                  disabled={!selected}
                                  className="h-7 w-16 ml-auto tabular-nums text-right"
                                />
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">
                                {formatCurrency(c.net_amount)}
                              </TableCell>
                              <TableCell>
                                {c.is_persisted
                                  ? <Badge variant="secondary" className="text-[10px]">draft</Badge>
                                  : <Badge variant="outline" className="text-[10px]">new</Badge>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-muted-foreground">
                      {backlogSelected.size} of {backlogUnpaid.length} selected
                    </span>
                    <span className="font-semibold">
                      Total payable: <span className="tabular-nums">{formatCurrency(backlogTotal)}</span>
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment Details
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Payment Date *</Label>
                      <Input
                        required
                        type="date"
                        value={backlogForm.payment_date}
                        onChange={(e) => setBacklogForm({ ...backlogForm, payment_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>UPI Ref *</Label>
                      <Input
                        required
                        value={backlogForm.payment_ref}
                        onChange={(e) => setBacklogForm({ ...backlogForm, payment_ref: e.target.value })}
                        placeholder="UTR / Txn ID"
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea
                      rows={2}
                      value={backlogForm.notes}
                      onChange={(e) => setBacklogForm({ ...backlogForm, notes: e.target.value })}
                      placeholder="Optional — e.g. 'Quarterly settlement Aug–Nov 2025'"
                    />
                  </div>
                </div>
              </>
            )}
          </form>

          <DialogFooter className="px-6 py-3 border-t bg-muted/20">
            <Button type="button" variant="outline" size="sm" onClick={() => setBacklogOpen(false)}>Cancel</Button>
            <Button
              type="submit"
              form="backlog-form"
              size="sm"
              disabled={backlogSaving || backlogLoading || backlogSelected.size === 0}
            >
              {backlogSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Record Payment ({formatCurrency(backlogTotal)})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Intern Confirm ────────────────────────────────────── */}
      <AlertDialog open={!!deleteIntern} onOpenChange={(o) => !o && setDeleteIntern(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate intern?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteIntern && <>
                <strong>{deleteIntern.full_name}</strong> ({deleteIntern.intern_id}) will be marked inactive.
                Existing payment history is preserved.
              </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteIntern}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}
