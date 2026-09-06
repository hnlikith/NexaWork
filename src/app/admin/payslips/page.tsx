"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/layout/AuthProvider";
import { toast } from "sonner";
import { formatCurrency, getYearRange, cn } from "@/lib/utils";
import {
  FileText, RefreshCw, CheckCircle2, Send, IndianRupee, TrendingUp, Zap, Lock, Loader2,
} from "lucide-react";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i).toLocaleString("en-IN", { month: "long" }),
}));

function monthLabel(m: number, y: number) {
  return new Date(y, m - 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
}

function initials(name?: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

interface Employee { id: string; _id?: string; name: string; employeeId: string; department: string; }

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
  gross_pay: number;
  pf_deduction: number;
  professional_tax: number;
  tds_deduction: number;
  total_deductions: number;
  net_pay: number;
  status: "draft" | "approved" | "released";
  generated_by?: string;
  approved_at?: string;
  released_at?: string;
  created_at: string;
  employee?: { name: string; employee_id: string; department: string; designation: string };
}

function statusBadge(status: Payslip["status"]) {
  if (status === "released") return <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white capitalize">{status}</Badge>;
  if (status === "approved") return <Badge className="bg-sky-500 hover:bg-sky-500/90 text-white capitalize">{status}</Badge>;
  return <Badge variant="secondary" className="capitalize">{status}</Badge>;
}

export default function AdminPayslipsPage() {
  const { user } = useAuth();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payslips,  setPayslips]  = useState<Payslip[]>([]);

  const [selectedEmp,  setSelectedEmp]  = useState("");
  const [genMonth,     setGenMonth]     = useState(new Date().getMonth() + 1);
  const [genYear,      setGenYear]      = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState("all");

  const [generating, setGenerating]   = useState(false);
  const [loadingPayslips, setLoading] = useState(false);
  const [updatingId, setUpdatingId]   = useState<string | null>(null);

  useEffect(() => {
    axios.get("/api/users?limit=200").then((r) => {
      if (r.data.users?.length) setEmployees(r.data.users);
    }).catch(() => {});
  }, []);

  const loadPayslips = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedEmp) params.set("employeeId", selectedEmp);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const r = await axios.get(`/api/payslips?${params}`);
      setPayslips(r.data.payslips ?? []);
    } catch { setPayslips([]); }
    finally  { setLoading(false); }
  }, [selectedEmp, statusFilter]);

  useEffect(() => { loadPayslips(); }, [loadPayslips]);

  async function handleGenerate() {
    if (!selectedEmp) { toast.warning("Select an employee first"); return; }
    setGenerating(true);
    try {
      await axios.post("/api/payslips/generate", {
        employee_id:  selectedEmp,
        month:        genMonth,
        year:         genYear,
        generated_by: user?.id,
      });
      toast.success("Payslip generated");
      await loadPayslips();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Generation failed");
    } finally { setGenerating(false); }
  }

  async function updateStatus(payslip: Payslip, newStatus: "approved" | "released") {
    setUpdatingId(payslip.id);
    try {
      await axios.post("/api/payslips", {
        employee_id: payslip.employee_id,
        month:       payslip.month,
        year:        payslip.year,
        status:      newStatus,
        approved_by: user?.id,
      });
      toast.success(`Payslip ${newStatus}`);
      await loadPayslips();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Update failed");
    } finally { setUpdatingId(null); }
  }

  const filtered = statusFilter === "all" ? payslips : payslips.filter(p => p.status === statusFilter);

  const totalReleased = payslips.filter(p => p.status === "released").reduce((s, p) => s + p.net_pay, 0);
  const totalApproved = payslips.filter(p => p.status === "approved").length;
  const totalDraft    = payslips.filter(p => p.status === "draft").length;

  const stats = [
    { label: "Total Payslips", value: String(payslips.length),         icon: FileText,     tone: "text-foreground",  bg: "bg-muted" },
    { label: "Drafts",         value: String(totalDraft),              icon: Lock,         tone: "text-amber-600",   bg: "bg-amber-500/10" },
    { label: "Approved",       value: String(totalApproved),           icon: CheckCircle2, tone: "text-sky-600",     bg: "bg-sky-500/10" },
    { label: "Released Total", value: formatCurrency(totalReleased),   icon: IndianRupee,  tone: "text-emerald-600", bg: "bg-emerald-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="payslips_management"
      title="Payroll & Payslips"
      subtitle="Generate, approve, and release employee payslips with auto-linked earnings."
      actions={
        <Button variant="outline" size="sm" onClick={loadPayslips} disabled={loadingPayslips}>
          {loadingPayslips ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, tone, bg }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", bg)}>
                  <Icon size={15} className={tone} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={cn("text-lg font-semibold tabular-nums leading-tight", tone)}>{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-5">
          {/* Generator panel */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Zap size={15} className="text-amber-500" />
                  <span className="text-sm font-semibold text-foreground">Generate Payslip</span>
                </div>
                <p className="mb-4 text-xs text-muted-foreground leading-relaxed">
                  Auto-calculates from base salary, incentive grants, and sales commission for the selected period.
                </p>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Employee</Label>
                    <Select value={selectedEmp || "all"} onValueChange={(v) => setSelectedEmp(v === "all" ? "" : v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="All employees" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        {employees.map((e) => (
                          <SelectItem key={e.id || e._id} value={e.id || e._id || ""}>
                            {e.name} — {e.employeeId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Month</Label>
                      <Select value={String(genMonth)} onValueChange={(v) => setGenMonth(Number(v))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Year</Label>
                      <Select value={String(genYear)} onValueChange={(v) => setGenYear(Number(v))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {getYearRange().map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selectedEmp && (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Auto-linked sources</p>
                      {[
                        { label: "Base salary",        icon: IndianRupee, color: "text-muted-foreground" },
                        { label: "HRA (40% of basic)", icon: TrendingUp,  color: "text-sky-500" },
                        { label: "Incentive grants",   icon: Zap,         color: "text-amber-500" },
                        { label: "Sales commission",   icon: TrendingUp,  color: "text-emerald-500" },
                      ].map(({ label, icon: Icon, color }) => (
                        <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Icon size={12} className={color} />
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    type="button"
                    className="w-full"
                    disabled={generating || !selectedEmp}
                    onClick={handleGenerate}
                  >
                    {generating ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                    Generate Payslip
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payslips table */}
          <div className="lg:col-span-3">
            <Card className="p-0 overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">
                    Payslip Records
                    {selectedEmp && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        — {employees.find(e => (e.id || e._id) === selectedEmp)?.name}
                      </span>
                    )}
                  </span>
                </div>
                <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                  <TabsList>
                    <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                    <TabsTrigger value="draft" className="text-xs">Drafts</TabsTrigger>
                    <TabsTrigger value="approved" className="text-xs">Approved</TabsTrigger>
                    <TabsTrigger value="released" className="text-xs">Released</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Gross</TableHead>
                      <TableHead className="text-rose-500">Deductions</TableHead>
                      <TableHead className="text-emerald-600">Net Pay</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPayslips ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                          No payslips found. Generate one to get started.
                        </TableCell>
                      </TableRow>
                    ) : filtered.map((p) => {
                      const empName = p.employee?.name ?? "—";
                      const empId   = p.employee?.employee_id ?? "";
                      const isUpdating = updatingId === p.id;
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-[10px] font-semibold">{initials(empName)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium text-foreground">{empName}</p>
                                <p className="text-xs text-muted-foreground">{empId}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{monthLabel(p.month, p.year)}</TableCell>
                          <TableCell className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(p.gross_pay)}</TableCell>
                          <TableCell className="text-sm font-medium text-rose-500 tabular-nums">−{formatCurrency(p.total_deductions)}</TableCell>
                          <TableCell className="text-sm font-semibold text-emerald-600 tabular-nums">{formatCurrency(p.net_pay)}</TableCell>
                          <TableCell>{statusBadge(p.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {p.status === "draft" && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-sky-600 border-sky-500/30 hover:bg-sky-500 hover:text-white"
                                  disabled={isUpdating}
                                  onClick={() => updateStatus(p, "approved")}
                                >
                                  {isUpdating ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                  Approve
                                </Button>
                              )}
                              {p.status === "approved" && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 bg-emerald-500 hover:bg-emerald-500/90"
                                  disabled={isUpdating}
                                  onClick={() => updateStatus(p, "released")}
                                >
                                  {isUpdating ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                                  Release
                                </Button>
                              )}
                              {p.status === "released" && (
                                <span className="text-xs text-emerald-600 font-medium inline-flex items-center gap-1">
                                  <CheckCircle2 size={12} /> Released
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
                <span className="text-xs text-muted-foreground">{filtered.length} payslip{filtered.length !== 1 ? "s" : ""}</span>
                <span className="text-xs text-muted-foreground">
                  Net total: <span className="font-semibold text-foreground">
                    {formatCurrency(filtered.reduce((s, p) => s + p.net_pay, 0))}
                  </span>
                </span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
