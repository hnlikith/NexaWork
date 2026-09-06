/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge, statusBadgeVariant } from "@/components/ui/BadgeLegacy";
import { Button } from "@/components/ui/ButtonLegacy";
import { useApi } from "@/hooks/useApi";
import { useToast } from "@/components/ui/ToastLegacy";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import axios from "axios";
import { Zap, AlertCircle, X, Plus } from "lucide-react";

interface Incentive {
  _id: string;
  amount: number;
  base_amount: number;
  month: number;
  year: number;
  status: string;
}

interface PriorityReq {
  _id: string;
  amount: number;
  reason: string;
  status: string;
  createdAt: string;
}

export default function PriorityPage() {
  const { request } = useApi();
  const { showToast } = useToast();
  const [claimable, setClaimable] = useState<Incentive[]>([]);
  const [requests, setRequests] = useState<PriorityReq[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ incentiveId: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [incRes, reqRes] = await Promise.all([
        request<{ incentives: Incentive[] }>({ url: "/api/incentives" }),
        request<{ requests: PriorityReq[] }>({ url: "/api/priority" }),
      ]);
      setClaimable(
        (incRes.incentives ?? []).filter(
          (i) => i.status === "claimable" || i.status === "held"
        )
      );
      setRequests(reqRes.requests ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post("/api/priority", form);
      setShowForm(false);
      setForm({ incentiveId: "", reason: "" });
      await load();
      showToast("Priority request submitted!", "success");
    } catch (err: unknown) {
      showToast(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardShell
      moduleKey="my_priority_payout"
      title="Priority Payout"
      subtitle="Request an urgent payout that bypasses the normal processing queue."
      actions={
        <Button
          onClick={() => setShowForm(!showForm)}
          variant={showForm ? "secondary" : "primary"}
          size="sm"
        >
          {showForm ? (
            <><X size={13} className="mr-1.5" /> Cancel</>
          ) : (
            <><Plus size={13} className="mr-1.5" /> New Request</>
          )}
        </Button>
      }
    >
      <div className="space-y-5">

        {/* Info Banner */}
        <div className="flex items-start gap-3 rounded-xl border border-theme-border bg-amber-500/5 px-4 py-3">
          <Zap size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-xs font-semibold text-amber-600">Priority Payout</p>
            <p className="mt-0.5 text-xs leading-relaxed text-theme-muted">
              Request an urgent payout that bypasses the normal queue. Admin must approve before processing.
            </p>
          </div>
        </div>

        {/* Request Form */}
        {showForm && (
          <div className="page-card overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
              <Zap size={15} className="text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-fg">Submit Priority Request</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-theme-muted">
                  Select Incentive
                </label>
                <Select value={form.incentiveId || undefined} onValueChange={(v) => setForm({ ...form, incentiveId: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="— Select an incentive —" /></SelectTrigger>
                  <SelectContent>
                    {claimable.map((i) => (
                      <SelectItem key={i._id} value={i._id}>
                        {new Date(i.year, i.month - 1).toLocaleString("en-IN", {
                          month: "long",
                          year: "numeric",
                        })}{" "}
                        — {formatCurrency(i.amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-theme-muted">
                  Reason (min 10 characters)
                </label>
                <textarea
                  rows={4}
                  minLength={10}
                  required
                  className="field resize-none"
                  placeholder="Briefly explain why this payout is urgent..."
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-theme-border bg-amber-500/5 px-4 py-3">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                <p className="text-xs text-theme-muted">
                  This request requires manual verification by the administration team before processing.
                </p>
              </div>

              <div className="flex justify-end border-t border-theme-border pt-4">
                <Button type="submit" loading={submitting} size="sm">
                  Submit Request
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* My Priority Requests Table */}
        <div className="page-card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-fg">My Priority Requests</h3>
            </div>
            <span className="text-xs text-theme-subtle">
              {requests.length} request{requests.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-theme-primary border-t-transparent" />
                <p className="text-xs font-semibold text-theme-muted">Loading requests…</p>
              </div>
            </div>
          ) : requests.length === 0 ? (
            <div className="py-16 text-center text-theme-subtle">
              <p className="text-sm font-medium">No priority requests yet</p>
              <p className="mt-1 text-xs">Use &quot;New Request&quot; to request an urgent payout.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted">
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Reason</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border">
                  {requests.map((r) => (
                    <tr key={r._id} className="hover:bg-theme-raised/40 transition-colors">
                      <td className="px-5 py-3 text-xs font-semibold text-theme-fg">
                        {formatCurrency(r.amount)}
                      </td>
                      <td className="max-w-xs truncate px-5 py-3 text-xs text-theme-muted">
                        {r.reason}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusBadgeVariant(r.status)}>
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-theme-muted">
                        {formatDate(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-theme-border bg-theme-page px-5 py-2.5">
            <span className="text-xs text-theme-subtle">
              Priority payouts are subject to admin approval and compliance review.
            </span>
          </div>
        </div>

      </div>
    </DashboardShell>
  );
}
