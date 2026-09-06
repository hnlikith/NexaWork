"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, Check, Radio,
  CheckCircle2, CircleDollarSign, TrendingUp, XCircle, CalendarDays, X,
} from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type MonthStatus = "paid" | "half_paid" | "over_paid" | "not_paid" | null;

interface MonthCell {
  month: number; due: boolean; status: MonthStatus;
  persisted?: boolean; stipend?: number; net?: number; amount_paid?: number; per_day_rate?: number;
  paid_days?: number; buffer_paid_days?: number; extra_leave_days?: number; holidays_taken?: number;
  effective_days?: number; credited_days?: number;
  carry_in?: number; applied?: number; balance?: number; carry_out?: number; available?: number;
  carry_from?: { month: number; year: number } | null;
  applied_days?: number; carry_in_days?: number; carry_out_days?: number; balance_days?: number;
  payment_date?: string | null; payment_ref?: string | null;
}
interface SummaryData {
  intern: { id: string; full_name: string; intern_id: string; stipend_amount: number };
  year: number;
  months: MonthCell[];
  totals: { owed: number; paid: number; balance: number; carry_forward: number };
}
interface InternLite { id: string; full_name: string; intern_id: string }

// ── Badge config: label, colours, one-line meaning ──────────────────────────
const STATUS: Record<Exclude<MonthStatus, null>, { label: string; desc: string; cls: string; dot: string; icon: any }> = {
  paid:      { label: "Paid",           desc: "Full stipend credited for the month.",                         cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25", dot: "bg-emerald-500", icon: CheckCircle2 },
  half_paid: { label: "Half / Less Paid", desc: "Only part of the stipend credited — a balance is still due.", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",        dot: "bg-amber-500",   icon: CircleDollarSign },
  over_paid: { label: "Over Paid",      desc: "More than the month's stipend was credited (excess).",          cls: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/25",   dot: "bg-violet-500",  icon: TrendingUp },
  not_paid:  { label: "Not Paid",       desc: "No stipend credited yet for this month.",                       cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/25",           dot: "bg-rose-500",    icon: XCircle },
};

function initials(name?: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export function InternsSummary({ interns }: { interns: InternLite[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const [live, setLive] = useState(false);

  // Searchable dropdown
  const [dropOpen, setDropOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);

  const selected = interns.find((i) => i.id === selectedId) || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return interns;
    return interns.filter((i) => i.full_name.toLowerCase().includes(q) || i.intern_id.toLowerCase().includes(q));
  }, [interns, query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const load = useCallback(async (spinner = false) => {
    if (!selectedId) return;
    if (spinner) setLoading(true);
    try {
      const res = await fetch(`/api/interns/${selectedId}/summary?year=${year}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setData(json);
    } finally {
      setLoading(false);
    }
  }, [selectedId, year]);

  useEffect(() => { setData(null); setOpenMonth(null); if (selectedId) load(true); }, [selectedId, year, load]);

  // Realtime: internship payment/holiday actions all write to audit_logs (which
  // is in the realtime publication), so refetch on any such insert. 6s poll backs it up.
  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel("intern-summary")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => load(false))
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    const poll = setInterval(() => load(false), 6000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [selectedId, load]);

  const detail = openMonth != null ? data?.months.find((m) => m.month === openMonth) : null;

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        {/* ── Searchable intern dropdown + legend ─────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div ref={dropRef} className="relative w-full max-w-sm">
            <button
              type="button"
              onClick={() => setDropOpen((o) => !o)}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
            >
              {selected ? (
                <>
                  <Avatar className="h-6 w-6"><AvatarFallback className="text-[9px]">{initials(selected.full_name)}</AvatarFallback></Avatar>
                  <span className="font-medium truncate">{selected.full_name}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">{selected.intern_id}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Select an intern…</span>
              )}
              <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
            </button>
            {dropOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search interns…"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">No interns match.</div>
                  ) : filtered.map((i) => (
                    <button
                      key={i.id} type="button"
                      onClick={() => { setSelectedId(i.id); setDropOpen(false); setQuery(""); }}
                      className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 transition-colors", selectedId === i.id && "bg-muted/40")}
                    >
                      <Avatar className="h-6 w-6"><AvatarFallback className="text-[9px]">{initials(i.full_name)}</AvatarFallback></Avatar>
                      <span className="truncate">{i.full_name}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground font-mono">{i.intern_id}</span>
                      {selectedId === i.id && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(Object.keys(STATUS) as Array<keyof typeof STATUS>).map((k) => (
              <div key={k} className="flex items-center gap-1.5" title={STATUS[k].desc}>
                <span className={cn("h-2.5 w-2.5 rounded-full", STATUS[k].dot)} />
                <span className="text-[11px] font-medium text-foreground">{STATUS[k].label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Legend descriptions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {(Object.keys(STATUS) as Array<keyof typeof STATUS>).map((k) => (
            <div key={k} className={cn("rounded-lg border px-3 py-2 text-[11px] leading-snug", STATUS[k].cls)}>
              <span className="font-semibold">{STATUS[k].label}</span> — {STATUS[k].desc}
            </div>
          ))}
        </div>

        {!selected ? (
          <div className="py-16 text-center text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-40" />
            Pick an intern above to see their month-by-month stipend summary.
          </div>
        ) : (
          <>
            {/* Year nav + live + totals */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-lg font-semibold tabular-nums w-14 text-center">{year}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y + 1)}><ChevronRight className="h-4 w-4" /></Button>
                <Badge variant="outline" className={cn("ml-2 gap-1.5", live ? "text-emerald-600 border-emerald-500/30" : "text-muted-foreground")}>
                  <Radio className={cn("h-3 w-3", live && "animate-pulse")} /> {live ? "Live" : "Auto"}
                </Badge>
              </div>
              {data && (
                <div className="flex items-center gap-4 text-xs">
                  <span>Owed <b className="tabular-nums">{formatCurrency(data.totals.owed)}</b></span>
                  <span className="text-emerald-600">Paid <b className="tabular-nums">{formatCurrency(data.totals.paid)}</b></span>
                  <span className="text-rose-600">Balance <b className="tabular-nums">{formatCurrency(data.totals.balance)}</b></span>
                  {data.totals.carry_forward > 0 && (
                    <span className="text-violet-600">Carry-fwd <b className="tabular-nums">{formatCurrency(data.totals.carry_forward)}</b></span>
                  )}
                </div>
              )}
            </div>

            {/* 12-month grid */}
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(data?.months ?? []).map((m) => {
                  const s = m.status ? STATUS[m.status] : null;
                  const clickable = m.due;
                  return (
                    <button
                      key={m.month}
                      type="button"
                      disabled={!clickable}
                      onClick={() => setOpenMonth(m.month)}
                      className={cn(
                        "relative rounded-xl border p-3 text-left transition-all",
                        clickable ? "hover:shadow-sm hover:border-primary/40 cursor-pointer" : "opacity-45 cursor-default",
                        openMonth === m.month && "ring-2 ring-primary/40",
                        s ? s.cls : "bg-muted/20 border-border",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{MONTHS[m.month - 1]}</span>
                        {s && <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} />}
                      </div>
                      {m.due ? (
                        <>
                          <div className="mt-1 text-[11px] font-medium">{s?.label}</div>
                          <div className="text-[11px] tabular-nums opacity-80">
                            {formatCurrency(m.amount_paid ?? 0)} / {formatCurrency(m.net ?? 0)}
                          </div>
                          {(m.carry_in ?? 0) > 0 && (
                            <div className="text-[10px] tabular-nums text-sky-700 dark:text-sky-400">↩ {formatCurrency(m.carry_in ?? 0)} carried in</div>
                          )}
                          {(m.balance ?? 0) > 0 && (
                            <div className="text-[10px] tabular-nums font-medium text-rose-700 dark:text-rose-400">bal {formatCurrency(m.balance ?? 0)}</div>
                          )}
                          {(m.carry_out ?? 0) > 0 && (
                            <div className="text-[10px] tabular-nums text-violet-700 dark:text-violet-400">→ {formatCurrency(m.carry_out ?? 0)} to next</div>
                          )}
                        </>
                      ) : (
                        <div className="mt-1 text-[11px] text-muted-foreground">Not started</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Month detail panel */}
      {detail && detail.due && (
        <MonthDetail
          internName={selected?.full_name || ""}
          month={detail.month} year={year}
          d={detail}
          onClose={() => setOpenMonth(null)}
        />
      )}
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "green" | "rose" | "violet" | "sky" }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums",
        tone === "green" && "text-emerald-600 dark:text-emerald-400",
        tone === "rose" && "text-rose-600 dark:text-rose-400",
        tone === "violet" && "text-violet-600 dark:text-violet-400",
        tone === "sky" && "text-sky-600 dark:text-sky-400",
      )}>{value}</span>
    </div>
  );
}

function MonthDetail({ internName, month, year, d, onClose }: { internName: string; month: number; year: number; d: MonthCell; onClose: () => void }) {
  const s = d.status ? STATUS[d.status] : null;
  const Icon = s?.icon ?? CalendarDays;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <div className={cn("rounded-lg p-1.5", s?.cls)}><Icon className="h-4 w-4" /></div>
              <h3 className="font-semibold">{MONTHS_FULL[month - 1]} {year}</h3>
              {s && <Badge className={cn("border", s.cls)}>{s.label}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{internName} · {s?.desc}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-0.5">
          <Row label="Monthly stipend" value={formatCurrency(d.stipend ?? 0)} />
          <Row label="Per-day rate (÷30)" value={formatCurrency(d.per_day_rate ?? 0)} />
          <Row label="Payable days worked" value={`${d.effective_days ?? 0} days`} />
          <Row label="Holidays taken" value={`${d.holidays_taken ?? 0}${(d.extra_leave_days ?? 0) > 0 ? ` (incl. ${d.extra_leave_days} extra / LOP)` : ""}`} />

          <div className="pt-2 mt-1 border-t border-border" />
          {/* Carry-forward ledger — "to pay" and "carried" shown separately */}
          {(d.carry_in ?? 0) > 0 && (
            <Row label={`↩ Carried in${d.carry_from ? ` (from ${MONTHS[d.carry_from.month - 1]} ${d.carry_from.year})` : ""}`} value={`${formatCurrency(d.carry_in ?? 0)} · ${d.carry_in_days ?? 0} day(s)`} tone="sky" />
          )}
          <Row label="Amount owed this month (net)" value={formatCurrency(d.net ?? 0)} />
          <Row label="Direct payment this month" value={formatCurrency(d.amount_paid ?? 0)} tone="green" />
          <Row label="Covered this month" value={`${formatCurrency(d.applied ?? 0)} · ${d.applied_days ?? 0} day(s)`} tone="green" />

          {(d.balance ?? 0) > 0 && (
            <Row label="Still to pay this month" value={`${formatCurrency(d.balance ?? 0)} · ${d.balance_days ?? 0} day(s)`} tone="rose" />
          )}
          {(d.carry_out ?? 0) > 0 && (
            <Row label="→ Carried over to next month" value={`${formatCurrency(d.carry_out ?? 0)} · ${d.carry_out_days ?? 0} day(s)`} tone="violet" />
          )}

          {d.payment_ref && <Row label="Payment reference" value={d.payment_ref} />}
          {d.payment_date && <Row label="Paid on" value={d.payment_date} />}
        </div>
      </div>
    </div>
  );
}
