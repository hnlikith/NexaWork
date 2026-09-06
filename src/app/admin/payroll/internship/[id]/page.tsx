"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Printer, Loader2, CheckCircle2, Clock, AlertCircle,
  Mail, Calendar, IndianRupee, User, Wallet,
} from "lucide-react";
import dayjs from "@/lib/dayjs";

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
  created_at: string;
  buffer_total_days: number;
  buffer_paid_days_total: number;
}

interface Month {
  id: string | null;
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
  payment_date: string | null;
  payment_ref: string | null;
  notes: string | null;
  is_persisted: boolean;
  is_buffer_month: boolean;
}

interface Totals {
  total_months: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_paid: number;
  total_pending: number;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function initials(name?: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function statusBadge(status: Month["payment_status"]) {
  if (status === "paid")    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 gap-1"><CheckCircle2 className="h-3 w-3" /> Paid</Badge>;
  if (status === "failed")  return <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20 gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
}

export default function StatementPage() {
  const params = useParams<{ id: string }>();
  const internId = params?.id as string;

  const [intern, setIntern] = useState<Intern | null>(null);
  const [months, setMonths] = useState<Month[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!internId) return;
    setLoading(true);
    fetch(`/api/interns/${internId}/statement`)
      .then(r => r.json())
      .then(j => {
        if (j.error) throw new Error(j.error);
        setIntern(j.intern);
        setMonths(j.months ?? []);
        setTotals(j.totals);
      })
      .catch((err: Error) => toast.error(err.message ?? "Failed to load statement"))
      .finally(() => setLoading(false));
  }, [internId]);

  function handlePrint() {
    window.print();
  }

  if (loading || !intern || !totals) {
    return (
      <DashboardShell moduleKey="payroll_internship" title="Statement">
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  const bufferDaysBetweenJoinStart = intern.buffer_total_days;
  const preBillingBuffer = intern.buffer_paid_days_total;

  return (
    <DashboardShell
      moduleKey="payroll_internship"
      title={`Statement — ${intern.full_name}`}
      subtitle={`Stipend history from ${dayjs(intern.starting_date).format("MMM YYYY")} to ${dayjs().format("MMM YYYY")}`}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/payroll/internship">
              <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back
            </Link>
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-w-4xl mx-auto" id="statement-print">
        {/* Profile header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="text-base font-semibold">{initials(intern.full_name)}</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-lg font-semibold">{intern.full_name}</h2>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <Badge variant="outline" className="text-xs"><User className="mr-1 h-3 w-3" /> {intern.intern_id}</Badge>
                    {intern.upi_id && (
                      <Badge variant="outline" className="text-xs font-mono">
                        <Wallet className="mr-1 h-3 w-3" /> {intern.upi_id}
                      </Badge>
                    )}
                    {intern.is_active
                      ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Active</Badge>
                      : <Badge variant="secondary">Inactive</Badge>}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Monthly Stipend</p>
                <p className="text-2xl font-semibold tabular-nums">{formatCurrency(intern.stipend_amount)}</p>
              </div>
            </div>

            <Separator className="my-5" />

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Joining Date</p>
                <p className="font-medium tabular-nums">{dayjs(intern.joining_date).format("DD MMM YYYY")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Starting Date</p>
                <p className="font-medium tabular-nums">{dayjs(intern.starting_date).format("DD MMM YYYY")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Billing Date</p>
                <p className="font-medium tabular-nums">{dayjs(intern.billing_date).format("DD MMM YYYY")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Joining→Starting Buffer</p>
                <p className="font-medium tabular-nums">{bufferDaysBetweenJoinStart} day(s)</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pre-billing Buffer (Paid)</p>
                <p className="font-medium tabular-nums">{preBillingBuffer} day(s)</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Statement Generated</p>
                <p className="font-medium tabular-nums">{dayjs().format("DD MMM YYYY")}</p>
              </div>
            </div>

            {intern.notes && (
              <>
                <Separator className="my-5" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm">{intern.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Months Active",  value: String(totals.total_months),               bg: "bg-muted",         tone: "text-foreground" },
            { label: "Total Earned",   value: formatCurrency(totals.total_net),         bg: "bg-muted",         tone: "text-foreground" },
            { label: "Paid",           value: formatCurrency(totals.total_paid),        bg: "bg-emerald-500/10",tone: "text-emerald-600 dark:text-emerald-400" },
            { label: "Pending",        value: formatCurrency(totals.total_pending),     bg: "bg-amber-500/10",  tone: "text-amber-600 dark:text-amber-400" },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
                <p className={cn("text-xl font-semibold tabular-nums mt-1", k.tone)}>{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Month-by-month table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Month-by-Month Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Paid Days</TableHead>
                  <TableHead className="text-right">Buffer</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid On</TableHead>
                  <TableHead>UPI Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      No cycles yet.
                    </TableCell>
                  </TableRow>
                ) : months.map((m, idx) => (
                  <TableRow key={`${m.year}-${m.month}-${idx}`} className={m.is_buffer_month ? "bg-amber-500/[0.04]" : ""}>
                    <TableCell className="text-sm">
                      <div className="font-medium">{MONTHS[m.month - 1]} {m.year}</div>
                      {m.is_buffer_month && <div className="text-[10px] text-amber-700 dark:text-amber-400">Buffer Month</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.paid_days}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">
                      {m.buffer_paid_days > 0 ? `+${m.buffer_paid_days}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(m.gross_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">
                      {m.deductions > 0 ? `−${formatCurrency(m.deductions)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(m.net_amount)}</TableCell>
                    <TableCell>{statusBadge(m.payment_status)}</TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {m.payment_date ? dayjs(m.payment_date).format("DD MMM YYYY") : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{m.payment_ref ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Print footer */}
        <div className="hidden print:block text-center text-xs text-muted-foreground pt-6 border-t">
          Statement generated {dayjs().format("DD MMM YYYY, HH:mm")} · NexaWork
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          aside, header, nav { display: none !important; }
          #statement-print { padding: 0 !important; }
          button, [role="navigation"] { display: none !important; }
        }
      `}</style>
    </DashboardShell>
  );
}
