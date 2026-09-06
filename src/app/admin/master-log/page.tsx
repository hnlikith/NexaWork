"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  ScrollText, Search, RefreshCw, Clock, ArrowRight, Loader2, Circle, Download, ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWorkspaceFeed } from "@/lib/use-workspace-feed";
import { LogTimeFilters } from "@/components/system/LogTimeFilters";
import {
  relTime, fullTime, roleClass, prettyRole, short, sectionForAction, toCSV,
  screenLabel, passesTimeFilter, istYearsOf, DEFAULT_LOG_TIME_FILTER, type LogTimeFilter,
} from "@/lib/log-ui";

export default function MasterLogPage() {
  const { logs, serverNow, loading, refresh } = useWorkspaceFeed(500);
  const [q, setQ] = useState("");
  const [roleF, setRoleF] = useState("all");
  const [sectionF, setSectionF] = useState("all");
  const [timeF, setTimeF] = useState<LogTimeFilter>(DEFAULT_LOG_TIME_FILTER);
  const years = useMemo(() => istYearsOf(logs.map((l) => l.created_at)), [logs]);

  const sections = useMemo(
    () => Array.from(new Set(logs.map((l) => sectionForAction(l.action, l.section)))).sort(),
    [logs],
  );
  const roles = useMemo(
    () => Array.from(new Set(logs.map((l) => l.actor_role).filter(Boolean))) as string[],
    [logs],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (roleF !== "all" && (l.actor_role || "") !== roleF) return false;
      if (sectionF !== "all" && sectionForAction(l.action, l.section) !== sectionF) return false;
      if (!passesTimeFilter(l.created_at, timeF)) return false;
      if (!term) return true;
      return [l.actor_name, l.actor_emp_id, l.actor_role, l.section, l.action, l.summary, l.target_id, l.ip_address]
        .filter(Boolean).join(" ").toLowerCase().includes(term);
    });
  }, [logs, q, roleF, sectionF, timeF]);

  const todayCount = logs.filter(
    (l) => new Date(l.created_at).toDateString() === new Date(serverNow).toDateString(),
  ).length;

  const exportCsv = () => {
    const blob = new Blob([toCSV(filtered)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `master-log-${new Date(serverNow).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardShell
      moduleKey="master_log"
      title="Master Log Sheet"
      subtitle="Immutable audit trail — every action, who did it, and what changed, across the whole workspace"
    >
      <div className="flex flex-col gap-3">
        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Events today", value: todayCount, icon: <Clock size={14} />, tone: "text-primary" },
            { label: "Showing", value: filtered.length, icon: <ScrollText size={14} />, tone: "text-foreground" },
            { label: "Total captured", value: logs.length, icon: <ShieldCheck size={14} />, tone: "text-muted-foreground" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3">
                <div className={cn("mb-1.5", s.tone)}>{s.icon}</div>
                <p className="text-lg font-bold text-foreground tabular-nums">{s.value}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <Card>
          <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by person, employee ID, action, section, IP…" className="pl-9 h-9 text-sm" />
            </div>
            <select value={roleF} onChange={(e) => setRoleF(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground">
              <option value="all">All roles</option>
              {roles.map((r) => <option key={r} value={r}>{prettyRole(r)}</option>)}
            </select>
            <select value={sectionF} onChange={(e) => setSectionF(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground">
              <option value="all">All sections</option>
              {sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <LogTimeFilters value={timeF} onChange={setTimeF} years={years} />
            <Button variant="outline" size="sm" className="h-9" onClick={refresh}><RefreshCw size={13} /> Refresh</Button>
            <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={filtered.length === 0}><Download size={13} /> Export</Button>
          </CardContent>
        </Card>

        {/* Audit table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur border-b border-border">
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">When</th>
                    <th className="px-4 py-2.5 font-semibold">User</th>
                    <th className="px-4 py-2.5 font-semibold">Role</th>
                    <th className="px-4 py-2.5 font-semibold">Section</th>
                    <th className="px-4 py-2.5 font-semibold">Module &amp; path</th>
                    <th className="px-4 py-2.5 font-semibold">Action &amp; details</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-16 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto" size={20} /></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">No activity matches your filters yet.</td></tr>
                  ) : (
                    filtered.map((l) => (
                      <tr key={l.id} className="border-b border-border/60 hover:bg-muted/30 align-top">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-xs font-medium text-foreground tabular-nums">{relTime(l.created_at, serverNow)}</div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">{fullTime(l.created_at)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-foreground">{l.actor_name || "System"}</div>
                          {l.actor_emp_id && <div className="text-[10px] text-muted-foreground">{l.actor_emp_id}</div>}
                          {l.ip_address && <div className="text-[10px] text-muted-foreground font-mono">{l.ip_address}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {l.actor_role
                            ? <Badge variant="outline" className={cn("text-[9px] capitalize", roleClass(l.actor_role))}>{prettyRole(l.actor_role)}</Badge>
                            : <span className="text-[10px] text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3"><Badge variant="secondary" className="text-[10px]">{sectionForAction(l.action, l.section)}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-foreground">{l.path ? screenLabel(l.path) : "—"}</div>
                          {l.path && <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">{l.path}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-foreground">{l.summary || l.action}</div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{l.action}{l.target_id ? " · " + l.target_id : ""}</div>
                          {l.changes && Object.keys(l.changes).length > 0 && (
                            <div className="mt-1.5 flex flex-col gap-1">
                              {Object.entries(l.changes).slice(0, 6).map(([field, c]) => (
                                <div key={field} className="flex items-center gap-1.5 text-[10px]">
                                  <span className="font-semibold text-foreground">{field}:</span>
                                  <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-600 line-through decoration-rose-400/50">{short(c.from)}</span>
                                  <ArrowRight size={9} className="text-muted-foreground" />
                                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600">{short(c.to)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Circle size={7} className="fill-emerald-500 text-emerald-500" /> Live &amp; append-only — new entries stream in automatically. Showing the latest {logs.length} of the permanent record. For live presence see <span className="font-medium text-foreground">Workspace Monitor</span>.
        </p>
      </div>
    </DashboardShell>
  );
}
