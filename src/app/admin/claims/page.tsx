"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import axios from "axios";
import { usePermission } from "@/hooks/usePermission";
import {
  FileText, Clock, CheckCircle2, IndianRupee, RefreshCw, ListOrdered, Loader2,
} from "lucide-react";

interface Claim {
  _id: string;
  amount: number;
  status: string;
  cycle: number;
  queue_position?: number;
  requested_at: string;
  employee?: { name: string; employeeId: string; department: string };
  incentive?: { amount: number; month: number; year: number };
}

function initials(name?: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function monthLabel(m: number, y: number) {
  return new Date(y, m - 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  if (status === "approved") return <Badge className="bg-sky-500 hover:bg-sky-500/90 text-white capitalize">{status}</Badge>;
  if (status === "paid")     return <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white capitalize">{status}</Badge>;
  if (status === "queued")   return <Badge className="bg-purple-500 hover:bg-purple-500/90 text-white capitalize">{status}</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="capitalize">{status}</Badge>;
  return <Badge variant="secondary" className="capitalize">{status}</Badge>;
}

export default function AdminClaimsPage() {
  const { canEdit } = usePermission("claims");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [cycleConfirm, setCycleConfirm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const url = `/api/claims${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`;
      const res = await axios.get(url);
      setClaims(res.data.claims || []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  async function processClaim(claimId: string) {
    setProcessing(claimId);
    try {
      await axios.post("/api/claims", { action: "process", claimId });
      toast.success("Payout dispatched");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Payout sync error");
    } finally {
      setProcessing(null);
    }
  }

  async function advanceCycle() {
    setCycleConfirm(false);
    try {
      await axios.post("/api/claims", { action: "advance_cycle" });
      toast.success("Claim cycle advanced; queues re-serialized");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Cycle shift error");
    }
  }

  const filtered = statusFilter === "all" ? claims : claims.filter((c) => c.status === statusFilter);
  const pending  = claims.filter((c) => c.status === "pending").length;
  const approved = claims.filter((c) => c.status === "approved").length;
  const paid     = claims.filter((c) => c.status === "paid").length;
  const queued   = claims.filter((c) => c.status === "queued").length;
  const totalAmt = claims.reduce((s, c) => s + c.amount, 0);

  const stats = [
    { label: "Total",    value: claims.length, icon: FileText,     tone: "text-foreground",  bg: "bg-muted" },
    { label: "Pending",  value: pending,       icon: Clock,        tone: "text-amber-600",   bg: "bg-amber-500/10" },
    { label: "Approved", value: approved,      icon: CheckCircle2, tone: "text-sky-600",     bg: "bg-sky-500/10" },
    { label: "Queued",   value: queued,        icon: ListOrdered,  tone: "text-purple-600",  bg: "bg-purple-500/10" },
    { label: "Paid",     value: paid,          icon: IndianRupee,  tone: "text-emerald-600", bg: "bg-emerald-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="claims"
      title="Claims"
      subtitle="Review and process employee incentive claim requests."
      actions={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={() => setCycleConfirm(true)}>
            <RefreshCw size={13} /> Advance Cycle
          </Button>
        ) : null
      }
    >
      <div className="space-y-5">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
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

        <Card className="p-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
                <TabsTrigger value="approved" className="text-xs">Approved</TabsTrigger>
                <TabsTrigger value="queued" className="text-xs">Queued</TabsTrigger>
                <TabsTrigger value="paid" className="text-xs">Paid</TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              Total pool: <span className="font-semibold text-foreground">{formatCurrency(totalAmt)}</span>
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead className="text-center">Queue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      No claims found
                    </TableCell>
                  </TableRow>
                ) : filtered.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[10px] font-semibold">{initials(c.employee?.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">{c.employee?.name}</p>
                          <p className="text-xs text-muted-foreground">{c.employee?.department} · {c.employee?.employeeId}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-emerald-600 tabular-nums">{formatCurrency(c.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.incentive ? monthLabel(c.incentive.month, c.incentive.year) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">#{c.cycle}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {c.queue_position ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/10 text-xs font-semibold text-purple-600">
                          {c.queue_position}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(c.requested_at)}</TableCell>
                    <TableCell className="text-right">
                      {canEdit && c.status === "approved" && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 bg-emerald-500 hover:bg-emerald-500/90"
                          disabled={processing === c._id}
                          onClick={() => processClaim(c._id)}
                        >
                          {processing === c._id ? <Loader2 size={13} className="animate-spin" /> : null}
                          Process Payout
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
            <span className="text-xs text-muted-foreground">{filtered.length} claim{filtered.length !== 1 ? "s" : ""}</span>
            <span className="text-xs text-muted-foreground">{approved} ready to process</span>
          </div>
        </Card>
      </div>

      {/* Advance cycle confirm */}
      <AlertDialog open={cycleConfirm} onOpenChange={setCycleConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Advance Claim Cycle?</AlertDialogTitle>
            <AlertDialogDescription>
              This moves all queued claims to the next cycle and re-positions employees in queue. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={advanceCycle}>
              <RefreshCw size={13} /> Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}
