"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ShieldAlert, Search, RefreshCw, Loader2, Download, KeyRound, UserCog, Trash2, Circle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWorkspaceFeed } from "@/lib/use-workspace-feed";
import { LogTimeFilters } from "@/components/system/LogTimeFilters";
import {
  relTime, fullTime, roleClass, prettyRole, short, isSecurityEvent, severityOf, severityClass, toCSV,
  passesTimeFilter, istYearsOf, DEFAULT_LOG_TIME_FILTER, type LogTimeFilter,
} from "@/lib/log-ui";

const SEVERITIES = ["all", "critical", "warning", "info"] as const;

export default function SecurityAuditPage() {
  const { logs, serverNow, loading, refresh } = useWorkspaceFeed(1000);
  const [q, setQ] = useState("");
  const [sevF, setSevF] = useState<(typeof SEVERITIES)[number]>("all");
  const [timeF, setTimeF] = useState<LogTimeFilter>(DEFAULT_LOG_TIME_FILTER);

  const events = useMemo(() => logs.filter(isSecurityEvent), [logs]);
  const years = useMemo(() => istYearsOf(events.map((l) => l.created_at)), [events]);

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 };
    for (const l of events) c[severityOf(l)]++;
    return c;
  }, [events]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return events.filter((l) => {
      if (sevF !== "all" && severityOf(l) !== sevF) return false;
      if (!passesTimeFilter(l.created_at, timeF)) return false;
      if (!term) return true;
      return [l.actor_name, l.actor_emp_id, l.actor_role, l.action, l.summary, l.ip_address, l.target_id]
        .filter(Boolean).join(" ").toLowerCase().includes(term);
    });
  }, [events, q, sevF, timeF]);

  const exportCsv = () => {
    const blob = new Blob([toCSV(filtered)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-audit-${new Date(serverNow).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stat = [
    { label: "Critical", value: counts.critical, icon: <ShieldAlert size={15} />, tone: "text-rose-500" },
    { label: "Warnings", value: counts.warning, icon: <UserCog size={15} />, tone: "text-amber-500" },
    { label: "Informational", value: counts.info, icon: <KeyRound size={15} />, tone: "text-sky-500" },
    { label: "Total events", value: events.length, icon: <Trash2 size={15} />, tone: "text-muted-foreground" },
  ];

  return (
    <DashboardShell
      moduleKey="security_audit"
      title="Security & Audit"
      subtitle="Sensitive events only — logins, credential resets, permission and role changes, and account lifecycle"
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stat.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className={cn("mb-2", s.tone)}>{s.icon}</div>
                <p className="text-2xl font-bold text-foreground tabular-nums leading-none">{s.value}</p>
                <p className="text-[11px] text-muted-foreground mt-1.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search person, action, IP…" className="pl-9 h-9 text-sm" />
            </div>
            <select value={sevF} onChange={(e) => setSevF(e.target.value as any)} className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground capitalize">
              {SEVERITIES.map((s) => <option key={s} value={s}>{s === "all" ? "All severities" : s}</option>)}
            </select>
            <LogTimeFilters value={timeF} onChange={setTimeF} years={years} />
            <Button variant="outline" size="sm" className="h-9" onClick={refresh}><RefreshCw size={13} /> Refresh</Button>
            <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={filtered.length === 0}><Download size={13} /> Export</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur border-b border-border">
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Severity</th>
                    <th className="px-4 py-2.5 font-semibold">When</th>
                    <th className="px-4 py-2.5 font-semibold">Actor</th>
                    <th className="px-4 py-2.5 font-semibold">Event</th>
                    <th className="px-4 py-2.5 font-semibold">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-16 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto" size={20} /></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-16 text-center text-sm text-muted-foreground">No security events match your filters.</td></tr>
                  ) : (
                    filtered.map((l) => {
                      const sev = severityOf(l);
                      return (
                        <tr key={l.id} className="border-b border-border/60 hover:bg-muted/30 align-top">
                          <td className="px-4 py-3"><Badge variant="outline" className={cn("text-[9px] capitalize", severityClass(sev))}>{sev}</Badge></td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-xs text-foreground tabular-nums">{relTime(l.created_at, serverNow)}</div>
                            <div className="text-[10px] text-muted-foreground tabular-nums">{fullTime(l.created_at)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-medium text-foreground">{l.actor_name || "System"}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {l.actor_role && <Badge variant="outline" className={cn("text-[9px] capitalize", roleClass(l.actor_role))}>{prettyRole(l.actor_role)}</Badge>}
                              {l.actor_emp_id && <span className="text-[10px] text-muted-foreground">{l.actor_emp_id}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-foreground">{l.summary || l.action}</div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{l.action}{l.target_id ? " · " + l.target_id : ""}</div>
                            {l.changes && Object.keys(l.changes).length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {Object.entries(l.changes).slice(0, 4).map(([field, c]) => (
                                  <span key={field} className="text-[10px] text-muted-foreground">
                                    <b className="text-foreground">{field}</b>: {short(c.from, 24)} → {short(c.to, 24)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-muted-foreground font-mono">{l.ip_address || "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Circle size={7} className="fill-rose-500 text-rose-500" /> Security-relevant slice of the audit trail. The full record is in the <span className="font-medium text-foreground">Master Log Sheet</span>.
        </p>
      </div>
    </DashboardShell>
  );
}
