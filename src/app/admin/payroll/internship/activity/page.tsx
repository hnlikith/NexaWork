"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Activity, Wallet, CalendarDays, RefreshCw, Radio,
  Clock, ArrowRight, ShieldCheck, ScrollText,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { LogTimeFilters } from "@/components/system/LogTimeFilters";
import {
  relTime, fullTime, roleClass, prettyRole, sectionForAction,
  passesTimeFilter, istYearsOf, DEFAULT_LOG_TIME_FILTER, type LogTimeFilter,
} from "@/lib/log-ui";

interface Event {
  id: string;
  action: string;
  section: string;
  summary: string;
  target_type: string | null;
  target_id: string | null;
  actor_name: string | null;
  actor_emp_id: string | null;
  actor_role: string | null;
  created_at: string;
}
interface Account { id: string; name: string; email: string; employee_id: string; role: string }
interface Presence {
  user_id: string;
  last_seen: string;
  current_path: string | null;
  status: string | null;
}

function initials(name?: string | null) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function InternActivityPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState({ total: 0, payments: 0, holidays: 0 });
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [selectedIntern, setSelectedIntern] = useState<string | null>(null);
  const [timeF, setTimeF] = useState<LogTimeFilter>(DEFAULT_LOG_TIME_FILTER);
  const [serverNow, setServerNow] = useState(Date.now());
  const acctRef = useRef<Account | null>(null);

  // Live wall-clock tick for relative timestamps
  useEffect(() => {
    const t = setInterval(() => setServerNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true);
    try {
      const res = await fetch("/api/interns/activity", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setAccount(json.account);
        acctRef.current = json.account;
        setPresence(json.presence || null);
        setEvents(json.events || []);
        setStats(json.stats || { total: 0, payments: 0, holidays: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("intern-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => {
        load(false);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, () => {
        load(false);
      })
      .subscribe((status) => { setLive(status === "SUBSCRIBED"); });

    const poll = setInterval(() => load(false), 5000);
    const onFocus = () => load(false);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  // Extract unique intern names mentioned in the events summaries
  const internNames = useMemo(() => {
    const names = new Set<string>();
    events.forEach((e) => {
      const match = e.summary.match(/for\s+([^"]+?)(?:\s+NAM\d+|$)/i);
      if (match && match[1]) {
        names.add(match[1].trim());
      }
    });
    return Array.from(names).sort();
  }, [events]);

  const years = useMemo(() => istYearsOf(events.map((e) => e.created_at)), [events]);

  // Filter events by selected intern + the IST time-of-day / date filter
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!passesTimeFilter(e.created_at, timeF)) return false;
      if (selectedIntern && !e.summary.toLowerCase().includes(selectedIntern.toLowerCase())) return false;
      return true;
    });
  }, [events, selectedIntern, timeF]);

  const getPresenceStatus = () => {
    if (!presence) {
      return {
        label: "Offline",
        color: "text-muted-foreground bg-muted/10 border-muted-foreground/20",
        dot: "bg-muted-foreground",
      };
    }
    
    const lastSeen = dayjs(presence.last_seen);
    const diffSecs = dayjs().diff(lastSeen, "second");
    
    if (diffSecs > 60) {
      const timeAgo = lastSeen.fromNow();
      return {
        label: `Offline (Last active ${timeAgo})`,
        color: "text-muted-foreground bg-muted/10 border-muted-foreground/20",
        dot: "bg-muted-foreground",
      };
    }
    
    if (presence.status === "idle") {
      const lastIdleEvent = events.find(
        (e) => e.action === "intern.became_inactive" || e.action === "intern.idle"
      );
      const idleTimeStr = lastIdleEvent
        ? ` (since ${dayjs(lastIdleEvent.created_at).format("hh:mm A")})`
        : "";
      return {
        label: `Inactive${idleTimeStr}`,
        color: "text-amber-600 bg-amber-500/10 border-amber-500/30 dark:text-amber-400",
        dot: "bg-amber-500 animate-pulse",
      };
    }
    
    if (presence.status === "break") {
      return {
        label: "On Break",
        color: "text-blue-500 bg-blue-500/10 border-blue-500/30 dark:text-blue-400",
        dot: "bg-blue-500 animate-pulse",
      };
    }
    
    return {
      label: "Active now",
      color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30 dark:text-emerald-400",
      dot: "bg-emerald-500 animate-pulse",
    };
  };

  const statusInfo = getPresenceStatus();

  const statCards = [
    { label: "Total Actions", value: stats.total, icon: Activity },
    { label: "Payments Recorded", value: stats.payments, icon: Wallet },
    { label: "Holidays Set", value: stats.holidays, icon: CalendarDays },
  ];

  // Helper to render log summaries and highlight intern names clickable
  function renderSummary(summary: string, onNameClick: (name: string) => void) {
    const match = summary.match(/(.*?for\s+)([^"]+?)(?:\s+NAM\d+\/INT|\s+NAM\d+|$)(.*)/i);
    
    if (match) {
      const prefix = match[1];
      const name = match[2].trim();
      const suffix = summary.slice(prefix.length + name.length);
      
      return (
        <span>
          {prefix}
          <button
            onClick={() => onNameClick(name)}
            className="text-primary hover:underline font-semibold focus:outline-none cursor-pointer p-0 bg-transparent border-none inline"
          >
            {name}
          </button>
          {suffix}
        </span>
      );
    }
    return <span>{summary}</span>;
  }

  return (
    <DashboardShell moduleKey="payroll_internship">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/payroll/internship">
              <Button variant="ghost" size="sm" className="text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Stipend</Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2"><Activity className="h-4.5 w-4.5 text-primary" /> Intern Activity</h1>
              <p className="text-xs text-muted-foreground">
                Everything the internship-payroll helper has done{account ? ` — ${account.name}` : ""}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("gap-1.5", live ? "text-emerald-600 border-emerald-500/30" : "text-muted-foreground")}>
              <Radio className={cn("h-3 w-3", live && "animate-pulse")} /> {live ? "Live" : "Polling"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => load(true)} className="h-8"><RefreshCw className="h-3 w-3" /> Refresh</Button>
          </div>
        </div>

        {/* Account card */}
        {account && (
          <Card className="shadow-sm">
            <CardContent className="flex items-center gap-3 py-3">
              <Avatar className="h-9 w-9"><AvatarFallback>{initials(account.name)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground text-sm leading-none">{account.name}</span>
                  <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold border", statusInfo.color)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusInfo.dot)} />
                    {statusInfo.label}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{account.email} · {account.employee_id}</div>
                {presence && dayjs().diff(dayjs(presence.last_seen), "second") <= 60 && presence.current_path && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    <span className="font-semibold text-theme-fg">Current Screen:</span>
                    <span>{presence.current_path.includes("manage") ? "Holidays & Payments" : "Internship Stipend"}</span>
                  </div>
                )}
              </div>
              <Badge variant="secondary" className="text-[10px]">Scoped: Internship only</Badge>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {statCards.map((s) => (
            <Card key={s.label} className="shadow-sm">
              <CardContent className="flex items-center gap-3 py-2.5">
                <div className="rounded-lg bg-primary/10 p-2 shrink-0"><s.icon className="h-4 w-4 text-primary" /></div>
                <div className="min-w-0">
                  <div className="text-lg font-bold tabular-nums leading-none">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 border rounded-lg px-4 py-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-muted-foreground">Filter by Intern:</span>
            <Select value={selectedIntern || "all"} onValueChange={(v) => setSelectedIntern(v === "all" ? null : v)}>
              <SelectTrigger className="w-[180px] h-7 text-xs bg-background">
                <SelectValue placeholder="All Interns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Interns</SelectItem>
                {internNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedIntern && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedIntern(null)} className="h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-0 text-xs">
                Clear Filter
              </Button>
            )}
            <span className="mx-1 h-4 w-px bg-border" />
            <LogTimeFilters value={timeF} onChange={setTimeF} years={years} />
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            Showing {filteredEvents.length} of {events.length} logs
          </span>
        </div>

        {/* Logs Table */}
        <Card className="shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredEvents.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                <Activity className="h-6 w-6 mx-auto mb-2 opacity-40 animate-pulse" />
                {selectedIntern ? `No logs found for "${selectedIntern}"` : "No activity recorded yet."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="w-full text-left">
                  <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur border-b border-border">
                    <TableRow className="text-[10px] uppercase tracking-wide text-muted-foreground border-b hover:bg-transparent">
                      <TableHead className="px-4 py-2.5 font-semibold">When</TableHead>
                      <TableHead className="px-4 py-2.5 font-semibold">User</TableHead>
                      <TableHead className="px-4 py-2.5 font-semibold">Role</TableHead>
                      <TableHead className="px-4 py-2.5 font-semibold">Section</TableHead>
                      <TableHead className="px-4 py-2.5 font-semibold">Action &amp; details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((e) => {
                      return (
                        <TableRow key={e.id} className="border-b border-border/60 hover:bg-muted/30 align-top">
                          <TableCell className="px-4 py-3 whitespace-nowrap">
                            <div className="text-xs font-medium text-foreground tabular-nums">{relTime(e.created_at, serverNow)}</div>
                            <div className="text-[10px] text-muted-foreground tabular-nums">{fullTime(e.created_at)}</div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="text-xs font-medium text-foreground">{e.actor_name || account?.name || "System"}</div>
                            {(e.actor_emp_id || account?.employee_id) && <div className="text-[10px] text-muted-foreground">{e.actor_emp_id || account?.employee_id}</div>}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            {e.actor_role || account?.role ? (
                              <Badge variant="outline" className={cn("text-[9px] capitalize", roleClass(e.actor_role || account?.role))}>
                                {prettyRole(e.actor_role || account?.role)}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <Badge variant="secondary" className="text-[10px]">
                              {sectionForAction(e.action, e.section)}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3 leading-relaxed">
                            <div className="text-xs text-foreground">
                              {renderSummary(e.summary, (name) => {
                                setSelectedIntern(name);
                              })}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              {e.action}
                              {e.target_id ? " · " + e.target_id : ""}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
