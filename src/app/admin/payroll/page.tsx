"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  IndianRupee, Download, Play, CheckCircle2, Clock, Users, FileText, Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useApi } from "@/hooks/useApi";
import { usePermission } from "@/hooks/usePermission";

interface PayrollRecord {
  id: string;
  empId: string;
  empName: string;
  empCode: string;
  dept: string;
  empType: string;
  base: number;
  incentive: number;
  deductions: number;
  gross: number;
  net: number;
  status: "draft" | "processed" | "paid";
}

function initials(name?: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function statusBadge(status: string) {
  if (status === "processed") return <Badge className="bg-sky-500 hover:bg-sky-500/90 text-white capitalize"><CheckCircle2 size={10} /> {status}</Badge>;
  if (status === "paid")      return <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white capitalize"><CheckCircle2 size={10} /> {status}</Badge>;
  return <Badge variant="secondary" className="capitalize"><Clock size={10} /> {status}</Badge>;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const YEARS = [2026, 2025];

export default function PayrollPage() {
  const { request } = useApi();
  const { canCreate, canEdit, canExport } = usePermission("payroll");

  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState("all");
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PayrollRecord | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await request<{ payrolls: PayrollRecord[] }>({ url: `/api/payroll?month=${month}&year=${year}` });
      setRecords(res.payrolls || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month, year]);

  async function handleRunPayroll() {
    setActing(true);
    try {
      const drafts = records.filter(r => r.status === "draft");
      if (drafts.length === 0) { toast.info("No drafted payrolls available to process."); return; }

      await request({ url: "/api/payroll", method: "POST", data: { action: "generate_drafts", payrolls: drafts, month, year } });
      toast.success("Payroll processed");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActing(false);
    }
  }

  async function handleDisburse(id: string) {
    try {
      await request({ url: "/api/payroll", method: "POST", data: { action: "disburse", employee_id: id } });
      toast.success("Salary disbursed");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function saveManualOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRecord) return;
    try {
      await request({ url: "/api/payroll", method: "POST", data: { action: "manual_override", record: editingRecord, month, year } });
      toast.success("Manual override applied");
      setEditingRecord(null);
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const filtered = filter === "all" ? records : records.filter((r) => r.status === filter);

  const totalGross      = filtered.reduce((s, r) => s + r.gross, 0);
  const totalNet        = filtered.reduce((s, r) => s + r.net, 0);
  const totalDeductions = filtered.reduce((s, r) => s + r.deductions, 0);
  const draft           = records.filter((r) => r.status === "draft").length;
  const processed       = records.filter((r) => r.status === "processed").length;

  const stats = [
    { label: "Gross Payout",  value: formatCurrency(totalGross),     icon: IndianRupee, tone: "text-foreground",   bg: "bg-muted" },
    { label: "Net Payout",    value: formatCurrency(totalNet),       icon: IndianRupee, tone: "text-emerald-600",  bg: "bg-emerald-500/10" },
    { label: "Deductions",    value: formatCurrency(totalDeductions),icon: IndianRupee, tone: "text-rose-500",     bg: "bg-rose-500/10" },
    { label: "Employees",     value: String(filtered.length),        icon: Users,       tone: "text-sky-600",      bg: "bg-sky-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="payroll"
      title="Payroll"
      subtitle={`Salary disbursement for ${MONTHS[month - 1]} ${year}`}
      actions={
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-8 w-[90px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {canExport && (
            <Button variant="outline" size="sm"><Download size={13} /> Export</Button>
          )}
          {canCreate && (
            <Button size="sm" onClick={handleRunPayroll} disabled={acting || draft === 0}>
              {acting ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
              Run Payroll
            </Button>
          )}
        </div>
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

        <Card className="p-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="draft" className="text-xs">Draft</TabsTrigger>
                <TabsTrigger value="processed" className="text-xs">Processed</TabsTrigger>
                <TabsTrigger value="paid" className="text-xs">Paid</TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {draft} draft · {processed} ready to disburse
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead className="text-emerald-600">Incentive (+)</TableHead>
                  <TableHead className="text-rose-500">Deductions (−)</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Net Pay</TableHead>
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
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                      No payroll records found
                    </TableCell>
                  </TableRow>
                ) : filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[10px] font-semibold">{initials(row.empName)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">{row.empName}</p>
                          <p className="text-xs text-muted-foreground">{row.empCode} · {row.empType.replace('_', ' ')}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.dept}</TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{formatCurrency(row.base)}</TableCell>
                    <TableCell className="text-xs font-medium text-emerald-600 tabular-nums">+{formatCurrency(row.incentive)}</TableCell>
                    <TableCell className="text-xs font-medium text-rose-500 tabular-nums">−{formatCurrency(row.deductions)}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(row.gross)}</TableCell>
                    <TableCell className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(row.net)}</TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button type="button" variant="outline" size="sm" className="h-8">
                          <FileText size={11} /> Payslip
                        </Button>
                        {canEdit && row.status === "draft" && (
                          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setEditingRecord(row)}>
                            Edit
                          </Button>
                        )}
                        {canEdit && row.status === "processed" && (
                          <Button type="button" size="sm" className="h-8 bg-emerald-500 hover:bg-emerald-500/90" onClick={() => handleDisburse(row.id)}>
                            Disburse
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
            <span className="text-xs text-muted-foreground">{filtered.length} of {records.length} employees</span>
            <span className="text-xs text-muted-foreground">
              Net total: <span className="font-semibold text-foreground">{formatCurrency(totalNet)}</span>
            </span>
          </div>
        </Card>
      </div>

      {/* Manual override dialog */}
      <Dialog open={!!editingRecord} onOpenChange={(o) => !o && setEditingRecord(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manual Payroll Override</DialogTitle>
            <DialogDescription className="text-xs">
              {editingRecord?.empName} ({editingRecord?.empCode})
            </DialogDescription>
          </DialogHeader>
          {editingRecord && (
            <form id="payroll-override" onSubmit={saveManualOverride} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Base Salary (₹)</Label>
                  <Input
                    type="number" required value={editingRecord.base}
                    onChange={(e) => setEditingRecord({ ...editingRecord, base: Number(e.target.value), gross: Number(e.target.value) + editingRecord.incentive, net: (Number(e.target.value) + editingRecord.incentive) - editingRecord.deductions })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-emerald-600">Incentive (+)</Label>
                  <Input
                    type="number" required value={editingRecord.incentive}
                    onChange={(e) => setEditingRecord({ ...editingRecord, incentive: Number(e.target.value), gross: editingRecord.base + Number(e.target.value), net: (editingRecord.base + Number(e.target.value)) - editingRecord.deductions })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-rose-500">Deductions (−)</Label>
                  <Input
                    type="number" required value={editingRecord.deductions}
                    onChange={(e) => setEditingRecord({ ...editingRecord, deductions: Number(e.target.value), net: editingRecord.gross - Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Net Pay</Label>
                  <Input type="number" readOnly value={editingRecord.net} className="bg-muted/50 font-semibold" />
                </div>
              </div>
            </form>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditingRecord(null)}>Cancel</Button>
            <Button type="submit" form="payroll-override" size="sm">Apply Adjustments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
