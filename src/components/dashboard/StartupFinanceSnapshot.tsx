"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import Link from "next/link";
import { Building2, ArrowUpRight, ArrowDownRight, Sparkles, Gauge, Pencil } from "lucide-react";
import { Card } from "@/components/ui/CardLegacy";
import { Button } from "@/components/ui/ButtonLegacy";
import { formatCurrency } from "@/lib/utils";

interface StartupFinanceSnapshotProps {
 companyRevenue: number;
 profitPercentage: number;
 expensePercentage: number;
 companyStage: string;
 equityMin: number;
 equityMax: number;
 canEdit?: boolean;
}

export function StartupFinanceSnapshot({
 companyRevenue,
 profitPercentage,
 expensePercentage,
 companyStage,
 equityMin,
 equityMax,
 canEdit = false,
}: StartupFinanceSnapshotProps) {
 const profitAmount = (companyRevenue * profitPercentage) / 100;
 const expenseAmount = (companyRevenue * expensePercentage) / 100;
 const allocationData = [
 { name: "Revenue", value: companyRevenue, color: "#38bdf8" },
 { name: "Profit", value: profitAmount, color: "#34d399" },
 { name: "Expense", value: expenseAmount, color: "#f59e0b" },
 ];
 const maxAllocationValue = Math.max(...allocationData.map((item) => item.value), 1);

 return (
 <Card className="mb-6 overflow-hidden border-0 bg-[#08121f] p-0 text-white shadow-[0_20px_60px_rgba(8,18,31,0.35)]">
 <div className="border-b border-white/10 px-6 py-4 lg:px-7">
 <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
 <div>
 <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/75">Financial Management Dashboard</p>
 <h2 className="mt-2 flex items-center gap-2 text-2xl font-semibold">
 <Building2 size={22} className="text-cyan-300" />
 NexaWork Startup Snapshot
 </h2>
 </div>
 <div className="flex items-center gap-3">
 <div className="rounded-full border border-white/10 bg-theme-surface/80 px-4 py-2 text-xs text-theme-subtle/75">
 {canEdit ? "Live data with super admin controls" : "Shared live data from super admin configuration"}
 </div>
 {canEdit && (
 <Link href="/admin/config">
 <Button size="sm" className="bg-cyan-500 text-theme-primary hover:bg-cyan-400">
 <Pencil size={14} />
 Edit Values
 </Button>
 </Link>
 )}
 </div>
 </div>
 </div>

 <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-7">
 <div className="space-y-4">
 <div className="grid gap-4 sm:grid-cols-2">
 {[
 {
 label: "Revenue",
 value: formatCurrency(companyRevenue),
 note: "Current topline setup",
 icon: Building2,
 accent: "text-sky-300",
 },
 {
 label: "Profit Pool",
 value: formatCurrency(profitAmount),
 note: `${profitPercentage}% margin target`,
 icon: ArrowUpRight,
 accent: "text-emerald-300",
 },
 {
 label: "Expense Runway",
 value: formatCurrency(expenseAmount),
 note: `${expensePercentage}% operating use`,
 icon: ArrowDownRight,
 accent: "text-amber-200",
 },
 {
 label: "Equity Band",
 value: `${equityMin}% - ${equityMax}%`,
 note: companyStage,
 icon: Sparkles,
 accent: "text-fuchsia-300",
 },
 ].map(({ label, value, note, icon: Icon, accent }) => (
 <div key={label} className="rounded-2xl border border-white/10 bg-theme-surface/80[0.04] p-4 backdrop-blur-sm">
 <div className="flex items-center justify-between">
 <p className="text-sm text-theme-subtle/80">{label}</p>
 <Icon size={18} className={accent} />
 </div>
 <p className="mt-3 text-2xl font-bold">{value}</p>
 <p className="mt-1 text-xs text-theme-subtle/65">{note}</p>
 </div>
 ))}
 </div>

 <div className="rounded-2xl border border-white/10 bg-theme-surface/80[0.04] p-4">
 <div className="mb-3 flex items-center justify-between">
 <div>
 <p className="text-sm font-medium text-theme-subtle">Startup Position</p>
 <p className="text-xs text-theme-subtle/65">Built for an early-stage company, not a mature enterprise balance sheet.</p>
 </div>
 <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
 {companyStage}
 </span>
 </div>
 <div className="h-3 overflow-hidden rounded-full bg-theme-surface/80">
 <div className="flex h-full">
 <div className="bg-emerald-400" style={{ width: `${profitPercentage}%` }} />
 <div className="bg-amber-300" style={{ width: `${expensePercentage}%` }} />
 </div>
 </div>
 <div className="mt-3 flex items-center justify-between text-xs text-theme-subtle/70">
 <span>Profit ratio {profitPercentage}%</span>
 <span>Expense ratio {expensePercentage}%</span>
 </div>
 </div>
 </div>

 <div className="grid gap-4 lg:grid-rows-[1fr_1fr]">
 <div className="rounded-2xl border border-white/10 bg-theme-surface/80[0.04] p-4">
 <div className="mb-2 flex items-center gap-2 text-sm font-medium text-theme-subtle">
 <Gauge size={16} className="text-emerald-300" />
 Gross Profit Margin
 </div>
 <div className="flex h-[210px] items-center justify-center">
 <div
 className="relative flex h-44 w-44 items-center justify-center rounded-full"
 style={{
 background: `conic-gradient(#22c55e 0 ${profitPercentage}%, rgba(255,255,255,0.08) ${profitPercentage}% 100%)`,
 }}
 >
 <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-[#08121f] text-center">
 <p className="text-3xl font-bold">{profitPercentage}%</p>
 <p className="text-[11px] text-theme-subtle/65">margin</p>
 </div>
 </div>
 </div>
 <div className="-mt-2 text-center">
 <p className="text-xs text-theme-subtle/65">Configured profit margin for the current startup stage</p>
 </div>
 </div>

 <div className="rounded-2xl border border-white/10 bg-theme-surface/80[0.04] p-4">
 <div className="mb-2 text-sm font-medium text-theme-subtle">Profit vs Expense Mix</div>
 <div className="mt-5 space-y-4">
 {[
 { label: "Profit", percentage: profitPercentage, amount: profitAmount, color: "bg-emerald-400" },
 { label: "Expense", percentage: expensePercentage, amount: expenseAmount, color: "bg-amber-300" },
 ].map(({ label, percentage, amount, color }) => (
 <div key={label}>
 <div className="mb-1 flex items-center justify-between text-sm">
 <span className="text-theme-subtle/80">{label}</span>
 <span className="font-semibold">{percentage}%</span>
 </div>
 <div className="h-3 overflow-hidden rounded-full bg-theme-surface/80">
 <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
 </div>
 <p className="mt-1 text-xs text-theme-subtle/65">{formatCurrency(amount)}</p>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>

 <div className="border-t border-white/10 px-6 py-5 lg:px-7">
 <div className="mb-3 text-sm font-medium text-theme-subtle">Revenue Allocation</div>
 <div className="grid gap-4 md:grid-cols-3">
 {allocationData.map((item) => (
 <div key={item.name} className="rounded-2xl border border-white/10 bg-theme-surface/80[0.04] p-4">
 <div className="flex items-center justify-between text-sm">
 <span className="text-theme-subtle/80">{item.name}</span>
 <span className="font-semibold">{formatCurrency(item.value)}</span>
 </div>
 <div className="mt-4 flex h-28 items-end">
 <div
 className="w-full rounded-t-2xl"
 style={{
 height: `${(item.value / maxAllocationValue) * 100}%`,
 backgroundColor: item.color,
 }}
 />
 </div>
 </div>
 ))}
 </div>
 </div>
 </Card>
 );
}
