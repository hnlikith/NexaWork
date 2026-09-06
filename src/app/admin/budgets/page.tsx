"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart3, Search, IndianRupee, TrendingUp, TrendingDown,
  AlertCircle, Plus, Pencil, Trash2, Building2, Users, Globe, Calendar,
  Layers, RefreshCw, LayoutList, Check, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/supabase";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface BudgetAllocation {
  id: string;
  budget_id: string;
  category: string;
  label: string | null;
  allocated: number;
  linked_sub_id: string | null;
  sort_order: number;
  subscriptions?: { name: string; sub_number: string; category: string } | null;
}

interface Budget {
  id: string;
  budget_number: string;
  name: string;
  scope_type: "department" | "team" | "company";
  department_name: string | null;
  team_id: string | null;
  fiscal_year: number;
  fiscal_month: number | null;
  total_amount: number;
  category: string;
  notes: string | null;
  status: "active" | "closed" | "draft";
  created_by_name: string | null;
  created_by_emp_id: string | null;
  created_at: string;
  teams?: { name: string } | null;
  budget_allocations?: BudgetAllocation[];
  actual_spent?: number;
  purchase_spent?: number;
  sub_spent?: number;
}

interface Team { id: string; name: string; department?: string }

/* ─── Constants ─────────────────────────────────────────────────────────── */
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const BUDGET_CATEGORIES = [
  "General","Technology","Marketing","Operations","HR","Finance",
  "Legal","Infrastructure","Product","Research","Sales","Other",
];

const ALLOC_CATEGORIES = [
  "Salaries","Software","Infrastructure","Marketing","Travel","Training",
  "Subscriptions","Office","Legal","Research","Miscellaneous",
];

const SCOPE_ICONS: Record<string, React.ElementType> = {
  department: Building2,
  team:       Users,
  company:    Globe,
};

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function utilBar(pct: number, isOver: boolean) {
  if (isOver) return { bar: "bg-rose-500",    text: "text-rose-500" };
  if (pct >= 85) return { bar: "bg-amber-500", text: "text-amber-600" };
  return { bar: "bg-emerald-500", text: "text-emerald-600" };
}

function scopeBadge(b: Budget) {
  const Icon = SCOPE_ICONS[b.scope_type];
  const label = b.scope_type === "department"
    ? b.department_name || "Dept"
    : b.scope_type === "team"
      ? (b.teams?.name || "Team")
      : "Company";
  const cls =
    b.scope_type === "department" ? "text-sky-700 dark:text-sky-400 border-sky-500/30 bg-sky-500/10" :
    b.scope_type === "team"       ? "text-violet-700 dark:text-violet-400 border-violet-500/30 bg-violet-500/10" :
                                    "text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10";
  return (
    <Badge variant="outline" className={cn("gap-1 capitalize", cls)}>
      <Icon size={10} /> {label}
    </Badge>
  );
}

function statusBadge(status: Budget["status"]) {
  if (status === "active") return <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white capitalize">{status}</Badge>;
  if (status === "draft")  return <Badge variant="secondary" className="capitalize">{status}</Badge>;
  return <Badge variant="outline" className="capitalize text-muted-foreground">{status}</Badge>;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2.5 shadow-md text-xs">
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-medium text-foreground tabular-nums">{formatCurrency(p.value * 1000)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function BudgetsPage() {
  const [activeTab, setActiveTab] = useState<"budgets" | "allocations">("budgets");

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [teams, setTeams]     = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch]           = useState("");
  const [filterScope, setFilterScope] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterYear, setFilterYear]   = useState(String(CURRENT_YEAR));

  /* dialog state */
  const [showModal, setShowModal]         = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [saving, setSaving]               = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<Budget | null>(null);
  const [deleting, setDeleting]           = useState(false);

  /* allocations tab */
  const [allocBudget, setAllocBudget]     = useState<Budget | null>(null);
  const [allocations, setAllocations]     = useState<BudgetAllocation[]>([]);
  const [loadingAllocs, setLoadingAllocs] = useState(false);

  const [newAllocCat, setNewAllocCat]     = useState("General");
  const [newAllocLabel, setNewAllocLabel] = useState("");
  const [newAllocAmt, setNewAllocAmt]     = useState("");
  const [savingAlloc, setSavingAlloc]     = useState(false);

  /* form fields */
  const [fName, setFName]         = useState("");
  const [fScope, setFScope]       = useState<"department"|"team"|"company">("department");
  const [fDept, setFDept]         = useState("");
  const [fTeamId, setFTeamId]     = useState("");
  const [fYear, setFYear]         = useState(String(CURRENT_YEAR));
  const [fMonth, setFMonth]       = useState("");
  const [fAmount, setFAmount]     = useState("");
  const [fCategory, setFCategory] = useState("General");
  const [fNotes, setFNotes]       = useState("");
  const [fStatus, setFStatus]     = useState<"active"|"closed"|"draft">("active");

  /* fetch */
  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)                   params.set("search", search);
      if (filterScope !== "all")    params.set("scope_type", filterScope);
      if (filterStatus !== "all")   params.set("status", filterStatus);
      if (filterYear)               params.set("year", filterYear);
      const res = await fetch(`/api/budgets?${params}`);
      const json = await res.json();
      setBudgets(json.budgets || []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [search, filterScope, filterStatus, filterYear]);

  const fetchTeams = useCallback(async () => {
    const { data } = await supabase.from("teams").select("id, name, department").order("name");
    setTeams(data || []);
  }, []);

  const fetchAllocations = useCallback(async (budgetId: string) => {
    setLoadingAllocs(true);
    try {
      const res = await fetch(`/api/budgets/${budgetId}/allocations`);
      const json = await res.json();
      setAllocations(json.allocations || []);
    } finally {
      setLoadingAllocs(false);
    }
  }, []);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);
  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  useEffect(() => {
    const channel = supabase
      .channel("budgets-rt-v1")
      .on("postgres_changes", { event: "*", schema: "public", table: "budgets" }, () => fetchBudgets())
      .on("postgres_changes", { event: "*", schema: "public", table: "budget_allocations" }, () => {
        fetchBudgets();
        if (allocBudget) fetchAllocations(allocBudget.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchBudgets, fetchAllocations, allocBudget]);

  /* modal */
  const openAdd = () => {
    setEditingBudget(null);
    setFName(""); setFScope("department"); setFDept(""); setFTeamId("");
    setFYear(String(CURRENT_YEAR)); setFMonth(""); setFAmount("");
    setFCategory("General"); setFNotes(""); setFStatus("active");
    setShowModal(true);
  };

  const openEdit = (b: Budget) => {
    setEditingBudget(b);
    setFName(b.name); setFScope(b.scope_type);
    setFDept(b.department_name || ""); setFTeamId(b.team_id || "");
    setFYear(String(b.fiscal_year)); setFMonth(b.fiscal_month ? String(b.fiscal_month) : "");
    setFAmount(String(b.total_amount)); setFCategory(b.category);
    setFNotes(b.notes || ""); setFStatus(b.status);
    setShowModal(true);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!fName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: fName.trim(), scope_type: fScope,
        department_name: fScope === "department" ? fDept || null : null,
        team_id: fScope === "team" ? fTeamId || null : null,
        fiscal_year: parseInt(fYear) || CURRENT_YEAR,
        fiscal_month: fMonth ? parseInt(fMonth) : null,
        total_amount: parseFloat(fAmount) || 0,
        category: fCategory, notes: fNotes || null, status: fStatus,
      };
      if (editingBudget) {
        await fetch(`/api/budgets/${editingBudget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Budget updated");
      } else {
        await fetch("/api/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Budget created");
      }
      setShowModal(false);
      fetchBudgets();
    } catch (err: any) {
      toast.error(err.message || "Failed to save budget");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await fetch(`/api/budgets/${confirmDelete.id}`, { method: "DELETE" });
      toast.success("Budget deleted");
      setConfirmDelete(null);
      fetchBudgets();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  /* allocations */
  const openAllocations = (b: Budget) => {
    setAllocBudget(b);
    fetchAllocations(b.id);
    setActiveTab("allocations");
  };

  const handleAddAlloc = async () => {
    if (!allocBudget || !newAllocAmt) return;
    setSavingAlloc(true);
    try {
      await fetch(`/api/budgets/${allocBudget.id}/allocations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newAllocCat, label: newAllocLabel || null, allocated: parseFloat(newAllocAmt) }),
      });
      setNewAllocCat("General"); setNewAllocLabel(""); setNewAllocAmt("");
      fetchAllocations(allocBudget.id);
      toast.success("Allocation added");
    } catch (err: any) {
      toast.error(err.message || "Failed to add allocation");
    } finally {
      setSavingAlloc(false);
    }
  };

  const handleDeleteAlloc = async (allocId: string) => {
    if (!allocBudget) return;
    try {
      await fetch(`/api/budgets/${allocBudget.id}/allocations?allocId=${allocId}`, { method: "DELETE" });
      fetchAllocations(allocBudget.id);
      toast.success("Allocation removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove");
    }
  };

  /* computed */
  const totalBudget = budgets.reduce((s, b) => s + b.total_amount, 0);
  const totalSpent  = budgets.reduce((s, b) => s + (b.actual_spent || 0), 0);
  const remaining   = totalBudget - totalSpent;
  const overCount   = budgets.filter(b => (b.actual_spent || 0) > b.total_amount).length;
  const chartData   = budgets.slice(0, 8).map(b => ({
    name: b.name.split(" ")[0].slice(0, 8),
    Budget: Math.round(b.total_amount / 1000),
    Spent:  Math.round((b.actual_spent || 0) / 1000),
  }));
  const departments = [...new Set(teams.filter(t => t.department).map(t => t.department!))].sort();
  const teamsForDept = fDept ? teams.filter(t => t.department === fDept) : teams;
  const totalAllocated = allocations.reduce((s, a) => s + a.allocated, 0);

  const stats = [
    { label: "Total Budget", value: formatCurrency(totalBudget),              icon: IndianRupee,  tone: "text-foreground",  bg: "bg-muted" },
    { label: "Total Spent",  value: formatCurrency(totalSpent),               icon: TrendingDown, tone: "text-sky-600",     bg: "bg-sky-500/10" },
    { label: "Remaining",    value: formatCurrency(Math.max(remaining, 0)),   icon: TrendingUp,   tone: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Over Budget",  value: String(overCount),                        icon: AlertCircle,  tone: "text-rose-500",    bg: "bg-rose-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="budgets"
      title="Budgets"
      subtitle="Plan and monitor spend across departments, teams, and the company."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={fetchBudgets} title="Refresh">
            <RefreshCw size={13} />
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus size={13} /> New Budget
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, tone, bg }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", bg)}>
                  <Icon size={15} className={tone} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={cn("text-xl font-semibold tabular-nums leading-tight", tone)}>{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 size={15} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Budget vs Spend</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {[{ dot: "bg-sky-500", label: "Budget" }, { dot: "bg-emerald-500", label: "Spent" }].map(({ dot, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={cn("h-2 w-2 rounded-full flex-shrink-0", dot)} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barCategoryGap="30%" barGap={3}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `₹${v}K`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", radius: 6 }} />
                  <Bar dataKey="Budget" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Spent"  fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Tabs + filters + table */}
        <Card className="p-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList>
                <TabsTrigger value="budgets" className="text-xs gap-1.5"><IndianRupee size={11} /> Budgets</TabsTrigger>
                <TabsTrigger value="allocations" className="text-xs gap-1.5"><LayoutList size={11} /> Allocations</TabsTrigger>
              </TabsList>
            </Tabs>
            {activeTab === "budgets" && (
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filterYear || "all"} onValueChange={(v) => setFilterYear(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-8 w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterScope} onValueChange={setFilterScope}>
                  <SelectTrigger className="h-8 w-[130px]"><SelectValue placeholder="Scope" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Scopes</SelectItem>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
                  <Input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search budgets…"
                    className="h-8 w-44 pl-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* BUDGETS TAB */}
          {activeTab === "budgets" && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Budget</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Spent</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Utilisation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : budgets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-16 text-center text-sm text-muted-foreground">
                        No budgets yet — click <span className="font-medium text-foreground">New Budget</span> to create one.
                      </TableCell>
                    </TableRow>
                  ) : budgets.map(b => {
                    const spent  = b.actual_spent || 0;
                    const isOver = spent > b.total_amount;
                    const pct    = b.total_amount > 0 ? Math.min((spent / b.total_amount) * 100, 100) : 0;
                    const rem    = b.total_amount - spent;
                    const { bar, text } = utilBar(pct, isOver);
                    return (
                      <TableRow key={b.id} className="group">
                        <TableCell>
                          <p className="text-sm font-medium text-foreground">{b.name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">{b.budget_number}</p>
                        </TableCell>
                        <TableCell>{scopeBadge(b)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar size={11} />
                            {b.fiscal_month ? `${MONTHS[b.fiscal_month - 1].slice(0, 3)} ${b.fiscal_year}` : `FY ${b.fiscal_year}`}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{formatCurrency(b.total_amount)}</TableCell>
                        <TableCell className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(spent)}</TableCell>
                        <TableCell className={cn("text-sm font-medium tabular-nums", isOver ? "text-rose-500" : "text-emerald-600")}>
                          {isOver ? `−${formatCurrency(Math.abs(rem))}` : formatCurrency(rem)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                              <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={cn("text-[11px] font-semibold tabular-nums inline-flex items-center gap-0.5", text)}>
                              {isOver ? `${((spent / b.total_amount) * 100).toFixed(0)}%` : `${pct.toFixed(0)}%`}
                              {isOver && <AlertCircle size={10} className="text-rose-500" />}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(b.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Allocations" onClick={() => openAllocations(b)}>
                              <Layers size={13} />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(b)}>
                              <Pencil size={13} />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" title="Delete" onClick={() => setConfirmDelete(b)}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {!loading && budgets.length > 0 && (
                <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
                  <span className="text-xs text-muted-foreground">{budgets.length} budget{budgets.length !== 1 ? "s" : ""}</span>
                  <span className="text-xs text-muted-foreground">
                    Overall utilisation: <span className="font-semibold text-foreground">
                      {totalBudget > 0 ? `${((totalSpent / totalBudget) * 100).toFixed(1)}%` : "—"}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ALLOCATIONS TAB */}
          {activeTab === "allocations" && (
            <div>
              <div className="border-b border-border bg-muted/30 px-5 py-3 flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground">Budget:</span>
                <Select
                  value={allocBudget?.id || undefined}
                  onValueChange={(v) => {
                    const b = budgets.find(x => x.id === v);
                    if (b) { setAllocBudget(b); fetchAllocations(b.id); }
                  }}
                >
                  <SelectTrigger className="h-8 w-[300px]"><SelectValue placeholder="— Select a budget —" /></SelectTrigger>
                  <SelectContent>
                    {budgets.map(b => <SelectItem key={b.id} value={b.id}>{b.name} ({b.budget_number})</SelectItem>)}
                  </SelectContent>
                </Select>
                {allocBudget && (
                  <span className="text-xs text-muted-foreground">
                    Total: <span className="font-semibold text-foreground tabular-nums">{formatCurrency(allocBudget.total_amount)}</span>
                    {" · "}Allocated: <span className="font-semibold text-foreground tabular-nums">{formatCurrency(totalAllocated)}</span>
                    {" · "}Remaining: <span className={cn("font-semibold tabular-nums", totalAllocated > allocBudget.total_amount ? "text-rose-500" : "text-emerald-600")}>
                      {formatCurrency(allocBudget.total_amount - totalAllocated)}
                    </span>
                  </span>
                )}
              </div>

              {!allocBudget ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  Select a budget to view and manage its allocations.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-5 py-3">
                    <Select value={newAllocCat} onValueChange={setNewAllocCat}>
                      <SelectTrigger className="h-8 w-[160px] flex-shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ALLOC_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      value={newAllocLabel} onChange={e => setNewAllocLabel(e.target.value)}
                      placeholder="Line-item label (optional)"
                      className="h-8 flex-1 min-w-[200px]"
                    />
                    <Input
                      value={newAllocAmt} onChange={e => setNewAllocAmt(e.target.value)}
                      type="number" min={0} placeholder="Amount"
                      className="h-8 w-32"
                    />
                    <Button
                      type="button" size="sm" className="h-8"
                      onClick={handleAddAlloc}
                      disabled={savingAlloc || !newAllocAmt}
                    >
                      {savingAlloc ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                      Add
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Label</TableHead>
                          <TableHead>Linked Subscription</TableHead>
                          <TableHead className="text-right">Allocated</TableHead>
                          <TableHead className="w-[60px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingAllocs ? (
                          Array.from({ length: 3 }).map((_, i) => (
                            <TableRow key={i}>
                              {Array.from({ length: 5 }).map((_, j) => (
                                <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : allocations.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                              No allocations yet — add one above.
                            </TableCell>
                          </TableRow>
                        ) : allocations.map(a => (
                          <TableRow key={a.id} className="group">
                            <TableCell>
                              <Badge variant="secondary" className="font-normal">{a.category}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {a.label || <span className="italic">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {a.subscriptions
                                ? <span className="font-medium text-foreground">{a.subscriptions.name} <span className="text-muted-foreground tabular-nums">{a.subscriptions.sub_number}</span></span>
                                : <span className="italic">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-foreground tabular-nums">{formatCurrency(a.allocated)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button" variant="ghost" size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-opacity"
                                onClick={() => handleDeleteAlloc(a.id)}
                              >
                                <Trash2 size={12} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      {!loadingAllocs && allocations.length > 0 && (
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={3} className="text-xs font-semibold text-muted-foreground">Total Allocated</TableCell>
                            <TableCell className="text-right font-semibold text-foreground tabular-nums">{formatCurrency(totalAllocated)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableFooter>
                      )}
                    </Table>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Add / Edit Budget Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-2xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-6rem)] sm:max-h-[85vh]">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="text-sm font-semibold">{editingBudget ? "Edit Budget" : "New Budget"}</DialogTitle>
            <DialogDescription className="text-xs">{editingBudget ? "Update budget details below." : "Create a new budget plan."}</DialogDescription>
          </DialogHeader>

          <form id="budget-form" onSubmit={handleSave} className="min-h-0 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* left */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Budget Name *</Label>
                  <Input value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. Engineering Q1 2025" autoFocus />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Scope</Label>
                  <Tabs value={fScope} onValueChange={(v) => { setFScope(v as typeof fScope); setFDept(""); setFTeamId(""); }}>
                    <TabsList className="grid grid-cols-3 w-full">
                      <TabsTrigger value="department" className="text-xs">Department</TabsTrigger>
                      <TabsTrigger value="team" className="text-xs">Team</TabsTrigger>
                      <TabsTrigger value="company" className="text-xs">Company</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {fScope === "department" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Department</Label>
                    <Select value={fDept || undefined} onValueChange={setFDept}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="— Select department —" /></SelectTrigger>
                      <SelectContent>
                        {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {fScope === "team" && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Department (filter)</Label>
                      <Select value={fDept || "all"} onValueChange={(v) => { setFDept(v === "all" ? "" : v); setFTeamId(""); }}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All departments</SelectItem>
                          {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Team *</Label>
                      <Select value={fTeamId || undefined} onValueChange={setFTeamId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="— Select team —" /></SelectTrigger>
                        <SelectContent>
                          {teamsForDept.map(t => <SelectItem key={t.id} value={t.id}>{t.name}{t.department ? ` · ${t.department}` : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={fCategory} onValueChange={setFCategory}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUDGET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* right */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fiscal Year</Label>
                    <Select value={fYear} onValueChange={setFYear}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Month (opt.)</Label>
                    <Select value={fMonth || "all"} onValueChange={(v) => setFMonth(v === "all" ? "" : v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Full Year" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Full Year</SelectItem>
                        {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Total Budget Amount (₹)</Label>
                  <Input value={fAmount} onChange={e => setFAmount(e.target.value)} type="number" min={0} placeholder="0" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Tabs value={fStatus} onValueChange={(v) => setFStatus(v as typeof fStatus)}>
                    <TabsList className="grid grid-cols-3 w-full">
                      <TabsTrigger value="active" className="text-xs">Active</TabsTrigger>
                      <TabsTrigger value="draft" className="text-xs">Draft</TabsTrigger>
                      <TabsTrigger value="closed" className="text-xs">Closed</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={3} placeholder="Optional notes…" className="resize-none" />
                </div>
              </div>
            </div>
          </form>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-between gap-2 border-t border-border bg-background px-6 py-4">
            <div className="text-xs text-muted-foreground">
              {fAmount && !isNaN(parseFloat(fAmount)) && parseFloat(fAmount) > 0
                ? <><span className="font-semibold text-foreground tabular-nums">{formatCurrency(parseFloat(fAmount))}</span> total budget</>
                : "Enter an amount to continue"}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" form="budget-form" size="sm" disabled={saving || !fName.trim()}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {editingBudget ? "Save Changes" : "Create Budget"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete budget?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">&ldquo;{confirmDelete?.name}&rdquo;</span> and its allocations will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}
