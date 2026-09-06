"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { supabase } from "@/lib/supabase";
import {
  Shield, Search, RefreshCw, Mail, LogIn, LogOut,
  UserPlus, AlertCircle, Calendar, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import dayjs from "@/lib/dayjs";
import isToday from "dayjs/plugin/isToday";
dayjs.extend(isToday);

interface AuditLog {
  id:          string;
  user_id:     string | null;
  action:      string;
  target_type: string | null;
  target_id:   string | null;
  metadata:    Record<string, unknown>;
  ip_address:  string | null;
  created_at:  string;
  employee?:   { name: string; email: string; employee_id: string } | null;
}

const ACTION_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  login_success:           { icon: <LogIn className="h-3 w-3" />,       color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", label: "Login" },
  login_failed:            { icon: <AlertCircle className="h-3 w-3" />, color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",                label: "Login Failed" },
  employee_created:        { icon: <UserPlus className="h-3 w-3" />,    color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",   label: "Employee Created" },
  mailbox_provisioned:     { icon: <Mail className="h-3 w-3" />,        color: "bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/20",           label: "Mailbox Provisioned" },
  offboarding_started:     { icon: <UserPlus className="h-3 w-3" />,    color: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",   label: "Offboarding Started" },
  offboarding_finalized:   { icon: <LogOut className="h-3 w-3" />,      color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",                label: "Offboarded" },
  statutory_events_seeded: { icon: <Calendar className="h-3 w-3" />,    color: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",   label: "Events Seeded" },
};

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  const [logs, setLogs]               = useState<AuditLog[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage]               = useState(0);
  const [total, setTotal]             = useState(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("audit_logs")
        .select("*, employee:employees!audit_logs_user_id_fkey(name,email,employee_id)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (actionFilter) query = query.eq("action", actionFilter);
      if (search)       query = query.or(`action.ilike.%${search}%,target_id.ilike.%${search}%`);

      const { data, count, error } = await query;
      if (!error) {
        setLogs((data || []) as AuditLog[]);
        setTotal(count || 0);
      }
    } catch { /* keep last */ }
    setLoading(false);
  }, [page, search, actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function formatMetadata(meta: Record<string, unknown>) {
    if (!meta) return null;
    const entries = Object.entries(meta).filter(([k]) => !["password", "hash"].includes(k));
    if (!entries.length) return null;
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ");
  }

  const stats = [
    { label: "Total Events",   value: total,                                                                       color: "" },
    { label: "Logins Today",   value: logs.filter(l => l.action === "login_success" && dayjs(l.created_at).isToday()).length, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Failed Logins",  value: logs.filter(l => l.action === "login_failed").length,                        color: "text-red-600 dark:text-red-400" },
    { label: "Offboardings",   value: logs.filter(l => l.action.startsWith("offboarding")).length,                 color: "text-orange-600 dark:text-orange-400" },
  ];

  return (
    <DashboardShell
      moduleKey="audit_log"
      title="Audit Log"
      subtitle="All system events — logins, provisioning, offboarding, and changes."
      actions={
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search actions or targets…"
              className="pl-9"
            />
          </div>
          <Select value={actionFilter || "all"} onValueChange={(v) => { setActionFilter(v === "all" ? "" : v); setPage(0); }}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="All Actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {Object.entries(ACTION_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className={cn("text-2xl font-semibold tabular-nums", s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {[1,2,3,4,5].map(j => (
                        <TableCell key={j}><div className="h-3 bg-muted rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                      <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No audit events found
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map(log => {
                    const meta = ACTION_META[log.action];
                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1", meta?.color)}>
                            {meta?.icon}
                            {meta?.label || log.action.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.employee ? (
                            <div>
                              <div className="text-xs font-medium">{log.employee.name}</div>
                              <div className="text-xs text-muted-foreground">{log.employee.employee_id}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">System</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.target_type && (
                            <>
                              <span className="font-medium capitalize">{log.target_type}</span>
                              {log.target_id && <span className="text-muted-foreground"> · {log.target_id.slice(0, 20)}…</span>}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <span className="text-xs text-muted-foreground truncate block">
                            {formatMetadata(log.metadata)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {dayjs(log.created_at).format("MMM D, YYYY HH:mm")}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-medium tabular-nums">{page + 1} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
