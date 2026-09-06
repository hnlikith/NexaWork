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
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, CalendarDays, Loader2, Save, Wallet, CheckCircle2, Clock, AlertCircle,
  IndianRupee, Info, CircleDollarSign,
} from "lucide-react";
import { DEFAULT_FREE_HOLIDAYS } from "@/lib/internshipMath";
import dayjs from "@/lib/dayjs";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface Cycle {
  id: string | null;
  intern_id: string;
  full_name: string;
  intern_code: string;
  upi_id: string | null;
  stipend_amount: number;
  month: number;
  year: number;
  paid_days: number;
  buffer_paid_days: number;
  holidays_taken: number;
  extra_leave_days: number;
  gross_amount: number;
  deductions: number;
  net_amount: number;
  payment_status: "pending" | "paid" | "failed";
  is_persisted: boolean;
}

interface UnpaidCycle {
  id: string | null; month: number; year: number; net_amount: number;
  payment_status: "pending" | "paid" | "failed"; is_persisted: boolean;
}

function initials(name?: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

/** Client-side mirror of computeCycle: effective days = paid + buffer − extra holidays. */
function calcRow(stipend: number, paidDays: number, buffer: number, extra: number, deductions: number) {
  const eff = Math.max(0, paidDays + buffer - extra);
  const gross = Math.round((Number(stipend) / 30) * eff);
  const net = Math.max(0, gross - Number(deductions || 0));
  return { eff, gross, net };
}

function statusBadge(status: Cycle["payment_status"]) {
  if (status === "paid") return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 gap-1"><CheckCircle2 className="h-3 w-3" /> Paid</Badge>;
  if (status === "failed") return <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20 gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
}

export default function InternshipManagePage() {
  const { user } = useAuth();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());

  const [rows, setRows] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(false);
  // Per-row editable draft state, keyed by intern_id: { extra, deductions }
  const [edits, setEdits] = useState<Record<string, { extra: string; deductions: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Auto-allot payment modal
  const [payOpen, setPayOpen] = useState(false);
  const [payIntern, setPayIntern] = useState<Cycle | null>(null);
  const [unpaid, setUnpaid] = useState<UnpaidCycle[]>([]);
  const [payForm, setPayForm] = useState({ amount: "", payment_date: "", payment_ref: "" });
  const [payLoading, setPayLoading] = useState(false);
  const [paySubmitting, setPaySubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/interns/cycles?month=${month}&year=${year}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      const cs: Cycle[] = json.cycles || [];
      setRows(cs);
      const e: Record<string, { extra: string; deductions: string }> = {};
      for (const c of cs) e[c.intern_id] = { extra: String(c.extra_leave_days ?? 0), deductions: String(c.deductions ?? 0) };
      setEdits(e);
    } catch (err: any) {
      toast.error(err.message || "Failed to load cycles");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const yearOptions = useMemo(() => {
    const y = today.getFullYear();
    return [y - 1, y, y + 1];
  }, [today]);

  function isDirty(c: Cycle) {
    const e = edits[c.intern_id];
    if (!e) return false;
    return Number(e.extra) !== Number(c.extra_leave_days ?? 0) || Number(e.deductions) !== Number(c.deductions ?? 0);
  }

  async function saveRow(c: Cycle) {
    const e = edits[c.intern_id];
    if (!e) return;
    const extra = Math.max(0, Number(e.extra) || 0);
    const deductions = Math.max(0, Number(e.deductions) || 0);
    const { gross, net } = calcRow(c.stipend_amount, c.paid_days, c.buffer_paid_days, extra, deductions);
    setSavingId(c.intern_id);
    try {
      const id = c.id ?? "new";
      const body: Record<string, unknown> = c.id
        ? { extra_leave_days: extra, deductions, holidays_taken: DEFAULT_FREE_HOLIDAYS + extra }
        : {
            intern_id: c.intern_id, month: c.month, year: c.year,
            paid_days: c.paid_days, buffer_paid_days: c.buffer_paid_days,
            holidays_taken: DEFAULT_FREE_HOLIDAYS + extra, extra_leave_days: extra,
            gross_amount: gross, deductions, net_amount: net,
          };
      const res = await fetch(`/api/interns/cycles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast.success(`${c.full_name}: ${extra > 0 ? `${extra} extra holiday(s) applied` : "updated"} — net ${formatCurrency(net)}`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function openPay(c: Cycle) {
    setPayIntern(c);
    setPayOpen(true);
    setPayLoading(true);
    setUnpaid([]);
    setPayForm({ amount: "", payment_date: dayjs().format("YYYY-MM-DD"), payment_ref: "" });
    try {
      const res = await fetch(`/api/interns/${c.intern_id}/unpaid`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load unpaid");
      const list: UnpaidCycle[] = json.unpaid || [];
      setUnpaid(list);
      const total = list.reduce((s, u) => s + Number(u.net_amount), 0);
      setPayForm((f) => ({ ...f, amount: String(total) }));
    } catch (err: any) {
      toast.error(err.message || "Failed to load unpaid cycles");
    } finally {
      setPayLoading(false);
    }
  }

  const unpaidTotal = useMemo(() => unpaid.reduce((s, u) => s + Number(u.net_amount), 0), [unpaid]);

  // Preview which cycles a given amount would clear (oldest-first, full-cover only).
  const allotPreview = useMemo(() => {
    let remaining = Number(payForm.amount) || 0;
    const covered: UnpaidCycle[] = [];
    for (const u of unpaid) {
      if (Number(u.net_amount) > remaining) break;
      remaining -= Number(u.net_amount);
      covered.push(u);
    }
    return { covered, leftover: Math.round(remaining) };
  }, [payForm.amount, unpaid]);

  async function submitPay() {
    if (!payIntern) return;
    if (!payForm.amount || Number(payForm.amount) <= 0) return toast.error("Enter an amount greater than 0");
    if (!payForm.payment_date || !payForm.payment_ref.trim()) return toast.error("Payment date and reference are required");
    setPaySubmitting(true);
    try {
      const res = await fetch("/api/interns/cycles/auto-allot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intern_id: payIntern.intern_id,
          amount: Number(payForm.amount),
          payment_date: payForm.payment_date,
          payment_ref: payForm.payment_ref.trim(),
          paid_by: user?.id ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Payment failed");
      toast.success(`Paid ${json.covered} cycle(s)${json.leftover > 0 ? ` · ${formatCurrency(json.leftover)} left unallocated` : ""}`);
      setPayOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
    } finally {
      setPaySubmitting(false);
    }
  }

  return (
    <DashboardShell moduleKey="payroll_internship">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/payroll/internship">
              <Button variant="ghost" size="sm" className="text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Stipend</Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Holidays &amp; Payments</h1>
              <p className="text-sm text-muted-foreground">Set extra holidays (auto-adjusts stipend) and record payments.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Rule banner */}
        <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Every intern gets <strong>{DEFAULT_FREE_HOLIDAYS} free paid holidays</strong> per 30-day month (4 weekly + 2 paid).
            Enter only the <strong>extra</strong> holidays beyond that — each extra holiday is unpaid (LOP) and automatically reduces the stipend
            by one day&apos;s pay (stipend ÷ 30).
          </span>
        </div>

        {/* Grid */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Intern</TableHead>
                    <TableHead className="text-right">Stipend</TableHead>
                    <TableHead className="text-center">Paid Days</TableHead>
                    <TableHead className="text-center w-[130px]">Extra Holidays</TableHead>
                    <TableHead className="text-center w-[120px]">Deductions</TableHead>
                    <TableHead className="text-right">Net Payable</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                    ))
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">No interns due for {MONTHS[month - 1]} {year}.</TableCell></TableRow>
                  ) : (
                    rows.map((c) => {
                      const e = edits[c.intern_id] ?? { extra: "0", deductions: "0" };
                      const extra = Math.max(0, Number(e.extra) || 0);
                      const deductions = Math.max(0, Number(e.deductions) || 0);
                      const { gross, net } = calcRow(c.stipend_amount, c.paid_days, c.buffer_paid_days, extra, deductions);
                      const dirty = isDirty(c);
                      const paid = c.payment_status === "paid";
                      return (
                        <TableRow key={c.intern_id} className={cn(dirty && "bg-amber-500/5")}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8"><AvatarFallback className="text-[10px]">{initials(c.full_name)}</AvatarFallback></Avatar>
                              <div className="min-w-0">
                                <div className="font-medium text-sm truncate">{c.full_name}</div>
                                <div className="text-[11px] text-muted-foreground font-mono">{c.intern_code}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(c.stipend_amount)}</TableCell>
                          <TableCell className="text-center tabular-nums text-muted-foreground">
                            {c.paid_days}{c.buffer_paid_days > 0 ? ` +${c.buffer_paid_days}` : ""}{extra > 0 ? <span className="text-rose-600 dark:text-rose-400"> −{extra}</span> : ""}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" min={0} max={60} disabled={paid}
                              value={e.extra}
                              onChange={(ev) => setEdits((p) => ({ ...p, [c.intern_id]: { ...e, extra: ev.target.value } }))}
                              className="h-8 text-center tabular-nums"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" min={0} disabled={paid}
                              value={e.deductions}
                              onChange={(ev) => setEdits((p) => ({ ...p, [c.intern_id]: { ...e, deductions: ev.target.value } }))}
                              className="h-8 text-center tabular-nums"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-semibold tabular-nums">{formatCurrency(net)}</div>
                            {gross !== net && <div className="text-[11px] text-muted-foreground tabular-nums">gross {formatCurrency(gross)}</div>}
                          </TableCell>
                          <TableCell className="text-center">{statusBadge(c.payment_status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm" variant={dirty ? "default" : "outline"}
                                disabled={!dirty || paid || savingId === c.intern_id}
                                onClick={() => saveRow(c)}
                              >
                                {savingId === c.intern_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => openPay(c)}>
                                <Wallet className="h-3.5 w-3.5" /> Pay
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Auto-allot payment modal */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-primary" /> Record Payment — {payIntern?.full_name}</DialogTitle>
            <DialogDescription>
              Enter a lump sum. It auto-clears unpaid months oldest-first — only months the amount fully covers are marked paid.
            </DialogDescription>
          </DialogHeader>

          {payLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total unpaid ({unpaid.length} month{unpaid.length !== 1 ? "s" : ""})</span>
                <span className="font-semibold tabular-nums">{formatCurrency(unpaidTotal)}</span>
              </div>

              {unpaid.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">Nothing pending — this intern is fully paid up.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Amount Paid (₹)</Label>
                      <Input type="number" min={0} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="tabular-nums" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Payment Date</Label>
                      <Input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment Reference (UTR / Txn ID)</Label>
                    <Input value={payForm.payment_ref} onChange={(e) => setPayForm({ ...payForm, payment_ref: e.target.value })} placeholder="e.g. UTR123456789" className="font-mono" />
                  </div>

                  {/* Allocation preview */}
                  <div className="rounded-lg border px-4 py-3 text-sm space-y-1">
                    <div className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-wide font-semibold"><IndianRupee className="h-3 w-3" /> This will clear</div>
                    {allotPreview.covered.length === 0 ? (
                      <p className="text-muted-foreground">Amount doesn&apos;t fully cover the oldest unpaid month yet.</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {allotPreview.covered.map((u) => (
                          <li key={`${u.year}-${u.month}`} className="flex justify-between tabular-nums">
                            <span>{MONTHS[u.month - 1]} {u.year}</span>
                            <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(u.net_amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {allotPreview.leftover > 0 && (
                      <div className="flex justify-between text-amber-600 dark:text-amber-400 pt-1 border-t mt-1"><span>Left unallocated</span><span className="tabular-nums">{formatCurrency(allotPreview.leftover)}</span></div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={submitPay} disabled={paySubmitting || payLoading || unpaid.length === 0 || allotPreview.covered.length === 0}>
              {paySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Record &amp; Auto-Allot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
