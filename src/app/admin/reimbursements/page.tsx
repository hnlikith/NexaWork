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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import axios from "axios";
import { usePermission } from "@/hooks/usePermission";
import {
  FileText, Clock, CheckCircle2, IndianRupee, AlertCircle, Tag, Banknote, Loader2,
} from "lucide-react";

interface Reimbursement {
  _id: string;
  title: string;
  category: string;
  amount: number;
  description?: string;
  status: string;
  reject_reason?: string;
  createdAt: string;
  employee?: { name: string; employeeId: string; department: string };
}

const CATEGORY_COLORS: Record<string, string> = {
  Meals:    "text-orange-600 border-orange-500/20 bg-orange-500/10",
  Travel:   "text-sky-600 border-sky-500/20 bg-sky-500/10",
  Events:   "text-purple-600 border-purple-500/20 bg-purple-500/10",
  Supplies: "",
  Training: "text-emerald-600 border-emerald-500/20 bg-emerald-500/10",
};

function initials(name?: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function statusBadge(status: string) {
  if (status === "approved") return <Badge className="bg-sky-500 hover:bg-sky-500/90 text-white capitalize">{status}</Badge>;
  if (status === "paid")     return <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white capitalize">{status}</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="capitalize">{status}</Badge>;
  return <Badge variant="secondary" className="capitalize">{status}</Badge>;
}

export default function AdminReimbursementsPage() {
  const { canEdit } = usePermission("reimbursements");
  const [items, setItems] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const url = `/api/reimbursements${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`;
      const res = await axios.get(url);
      setItems(res.data.reimbursements || []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  async function handleAction(id: string, action: "approve" | "reject" | "pay", reason?: string) {
    setProcessing(id);
    try {
      await axios.post("/api/reimbursements", { action, reimbursementId: id, reason });
      toast.success(`Request ${action === "approve" ? "approved" : action === "pay" ? "marked paid" : "rejected"}`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to update request");
    } finally {
      setProcessing(null);
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    const target = rejectTarget;
    const reason = rejectReason;
    setRejectTarget(null);
    setRejectReason("");
    await handleAction(target.id, "reject", reason);
  }

  const filtered = statusFilter === "all" ? items : items.filter((i) => i.status === statusFilter);
  const pending  = items.filter((i) => i.status === "pending").length;
  const approved = items.filter((i) => i.status === "approved").length;
  const paid     = items.filter((i) => i.status === "paid").length;
  const totalAmt = items.reduce((s, i) => s + i.amount, 0);

  const stats = [
    { label: "Total",    value: items.length, icon: FileText,     tone: "text-foreground",  bg: "bg-muted" },
    { label: "Pending",  value: pending,      icon: Clock,        tone: "text-amber-600",   bg: "bg-amber-500/10" },
    { label: "Approved", value: approved,     icon: CheckCircle2, tone: "text-sky-600",     bg: "bg-sky-500/10" },
    { label: "Paid",     value: paid,         icon: IndianRupee,  tone: "text-emerald-600", bg: "bg-emerald-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="reimbursements"
      title="Reimbursements"
      subtitle="Review and process employee expense reimbursement requests."
    >
      <div className="space-y-5">
        {/* Stat tiles */}
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

        <Card className="p-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
                <TabsTrigger value="approved" className="text-xs">Approved</TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs">Rejected</TabsTrigger>
                <TabsTrigger value="paid" className="text-xs">Paid</TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              Total requested: <span className="font-semibold text-foreground">{formatCurrency(totalAmt)}</span>
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      No reimbursements found
                    </TableCell>
                  </TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[10px] font-semibold">{initials(r.employee?.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">{r.employee?.name}</p>
                          <p className="text-xs text-muted-foreground">{r.employee?.department} · {r.employee?.employeeId}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-foreground">{r.title}</p>
                      {r.description && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{r.description}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("gap-1", CATEGORY_COLORS[r.category])}>
                        <Tag size={10} /> {r.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-emerald-600 tabular-nums">{formatCurrency(r.amount)}</TableCell>
                    <TableCell>
                      {statusBadge(r.status)}
                      {r.reject_reason && (
                        <p className="mt-1 text-[10px] text-rose-500 max-w-[140px] truncate">{r.reject_reason}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canEdit && r.status === "pending" && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              className="bg-emerald-500 hover:bg-emerald-500/90 h-8"
                              disabled={processing === r._id}
                              onClick={() => handleAction(r._id, "approve")}
                            >
                              {processing === r._id ? <Loader2 size={13} className="animate-spin" /> : null}
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 text-rose-600 border-rose-500/30 hover:bg-rose-500 hover:text-white"
                              disabled={processing === r._id}
                              onClick={() => { setRejectReason(""); setRejectTarget({ id: r._id, name: r.employee?.name ?? "Employee" }); }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {canEdit && r.status === "approved" && (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8"
                            disabled={processing === r._id}
                            onClick={() => handleAction(r._id, "pay")}
                          >
                            {processing === r._id ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={12} />}
                            Mark Paid
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
            <span className="text-xs text-muted-foreground">{filtered.length} request{filtered.length !== 1 ? "s" : ""}</span>
            <span className="text-xs text-muted-foreground">{pending} awaiting review</span>
          </div>
        </Card>
      </div>

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive flex-shrink-0">
              <AlertCircle size={16} />
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">Reject Reimbursement</DialogTitle>
              <DialogDescription className="text-xs">
                Rejecting request from <span className="font-medium text-foreground">{rejectTarget?.name}</span>. Please provide a reason.
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason…"
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" size="sm" disabled={!rejectReason.trim()} onClick={confirmReject}>
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
