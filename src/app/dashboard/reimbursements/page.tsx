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
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastLegacy";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import axios from "axios";
import {
  Receipt,
  Plus,
  X,
  IndianRupee,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface Reimbursement {
  _id: string;
  title: string;
  category: string;
  amount: number;
  description: string;
  status: string;
  reject_reason?: string;
  createdAt: string;
  paid_at?: string;
}

const CATEGORIES = [
  "travel",
  "food",
  "accommodation",
  "equipment",
  "medical",
  "training",
  "other",
];

export default function ReimbursementsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "travel",
    amount: "",
    description: "",
  });

  async function load() {
    try {
      const res = await axios.get("/api/reimbursements");
      setItems(res.data.reimbursements ?? []);
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
      await axios.post("/api/reimbursements", {
        ...form,
        amount: parseFloat(form.amount),
      });
      setShowForm(false);
      setForm({ title: "", category: "travel", amount: "", description: "" });
      await load();
      showToast("Reimbursement request submitted!", "success");
    } catch (err: unknown) {
      showToast(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const pending = items.filter((i) => i.status === "pending").length;
  const approved = items.filter((i) => i.status === "approved" || i.status === "paid").length;
  const rejected = items.filter((i) => i.status === "rejected").length;
  const totalAmount = items.reduce((s, i) => s + i.amount, 0);

  return (
    <DashboardShell
      moduleKey="my_reimbursements"
      title="Reimbursements"
      subtitle="Submit and track expense reimbursement requests."
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

        {/* Summary Stat Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total Requested", value: formatCurrency(totalAmount), icon: IndianRupee, color: "text-theme-fg",    bg: "bg-theme-raised",    sub: `${items.length} requests` },
            { label: "Pending Review",  value: String(pending),             icon: Clock,       color: "text-amber-600",   bg: "bg-amber-500/10",    sub: "Awaiting decision" },
            { label: "Approved / Paid", value: String(approved),            icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-500/10",  sub: "Processed" },
            { label: "Rejected",        value: String(rejected),            icon: XCircle,     color: "text-red-500",     bg: "bg-red-500/10",      sub: "Declined" },
          ].map(({ label, value, icon: Icon, color, bg, sub }) => (
            <div key={label} className="page-card flex items-center gap-3">
              <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
                <Icon size={17} className={color} />
              </div>
              <div>
                <p className="text-xs text-theme-muted">{label}</p>
                <p className={cn("text-xl font-black leading-tight", color)}>{value}</p>
                <p className="text-[10px] text-theme-subtle">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* New Request Form */}
        {showForm && (
          <div className="page-card overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
              <Receipt size={15} className="text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-fg">New Reimbursement Request</h3>
            </div>

            <form onSubmit={handleSubmit} className="p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-theme-muted">Title</label>
                  <input
                    className="field"
                    placeholder="e.g. Client dinner at XYZ"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-theme-muted">Category</label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c.charAt(0).toUpperCase() + c.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-theme-muted">Amount (₹)</label>
                  <input
                    type="number"
                    min="1"
                    className="field"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-theme-muted">Description</label>
                  <input
                    className="field"
                    placeholder="Brief description of the expense"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end border-t border-theme-border pt-4">
                <Button type="submit" loading={submitting} size="sm">
                  Submit Request
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Requests Table */}
        <div className="page-card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Receipt size={15} className="text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-fg">My Requests</h3>
            </div>
            <span className="text-xs text-theme-subtle">
              {items.length} request{items.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-theme-primary border-t-transparent" />
                <p className="text-xs font-semibold text-theme-muted">Loading requests…</p>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-theme-subtle">
              <p className="text-sm font-medium">No reimbursement requests yet</p>
              <p className="mt-1 text-xs">Click &quot;New Request&quot; to submit your first expense.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted">
                    <th className="px-5 py-3 font-semibold">Title</th>
                    <th className="px-5 py-3 font-semibold">Category</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border">
                  {items.map((item) => (
                    <tr key={item._id} className="hover:bg-theme-raised/40 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-xs font-semibold text-theme-fg">{item.title}</p>
                        {item.description && (
                          <p className="max-w-[200px] truncate text-[10px] text-theme-subtle">
                            {item.description}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs capitalize text-theme-muted">{item.category}</td>
                      <td className="px-5 py-3 text-xs font-semibold text-theme-fg">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <div>
                          <Badge variant={statusBadgeVariant(item.status)}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </Badge>
                          {item.reject_reason && (
                            <p className="mt-1 text-[10px] text-red-500">{item.reject_reason}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-theme-muted">{formatDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-theme-border bg-theme-page px-5 py-2.5">
            <span className="text-xs text-theme-subtle">
              Expenses are reviewed by the finance team within 3–5 business days.
            </span>
          </div>
        </div>

      </div>
    </DashboardShell>
  );
}
