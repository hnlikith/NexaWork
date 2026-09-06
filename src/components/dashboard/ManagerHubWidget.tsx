"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/layout/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Users, ClipboardCheck, FileText, Wallet, TrendingUp,
  AlertCircle, ArrowRight, Loader2, Crown, Network,
} from "lucide-react";
import dayjs from "@/lib/dayjs";

interface ManagerStats {
  teamSize: number;
  presentToday: number;
  pendingLeaveApprovals: number;
  pendingReimbursementApprovals: number;
  averageKPI: number;
}

interface PendingApproval {
  id: string;
  kind: "leave" | "reimbursement";
  employee_name: string;
  amount: number | null;
  detail: string;
  created_at: string;
}

function initials(name?: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

export function ManagerHubWidget() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ManagerStats>({
    teamSize: 0, presentToday: 0, pendingLeaveApprovals: 0,
    pendingReimbursementApprovals: 0, averageKPI: 0,
  });
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);

  const isManager = !!(user?.is_dept_lead || user?.is_team_lead);
  const scopeLabel = user?.is_dept_lead ? "Department" : "Team";

  const load = useCallback(async () => {
    if (!user || !isManager) return;
    setLoading(true);
    const today = dayjs().format("YYYY-MM-DD");

    // Build scope filter for team members.
    // - dept_lead: all employees in their managed department (managed_department_id)
    // - team_lead: all employees in their managed team (managed_team_id)
    let teamQuery = supabase.from("employees").select("id, name, kpi_score").eq("is_active", true);
    if (user.is_dept_lead && user.managed_department_id) {
      teamQuery = teamQuery.eq("department_id", user.managed_department_id);
    } else if (user.is_team_lead && user.managed_team_id) {
      teamQuery = teamQuery.eq("team_id", user.managed_team_id);
    } else if (user.department) {
      // Fallback: same department
      teamQuery = teamQuery.eq("department", user.department);
    }

    const { data: teamRows } = await teamQuery;
    const teamIds = (teamRows ?? []).map(r => r.id);

    const results = await Promise.allSettled([
      // Present today (team only)
      teamIds.length > 0
        ? supabase.from("attendance_logs").select("id", { count: "exact", head: true }).eq("date", today).not("clock_in", "is", null).in("employee_id", teamIds)
        : Promise.resolve({ count: 0 }),
      // Pending leave approvals targeting this manager
      supabase.from("leave_requests")
        .select("id, type, start_date, end_date, reason, created_at, employee:employees!leave_requests_employee_id_fkey(name)")
        .eq("status", "pending")
        .eq("approver_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
      // Pending reimbursement approvals targeting this manager
      supabase.from("reimbursement_requests")
        .select("id, amount, description, created_at, employee:employees!reimbursement_requests_employee_id_fkey(name)")
        .eq("status", "pending")
        .eq("approver_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const present = results[0].status === "fulfilled"
      ? ((results[0] as PromiseFulfilledResult<{ count: number | null }>).value?.count ?? 0)
      : 0;

    const leaveRows = results[1].status === "fulfilled"
      ? ((results[1] as PromiseFulfilledResult<{ data: unknown[] | null }>).value?.data ?? []) as Array<{
          id: string; type: string; start_date: string; end_date: string; reason: string | null; created_at: string;
          employee: { name: string } | { name: string }[] | null;
        }>
      : [];
    const reimbRows = results[2].status === "fulfilled"
      ? ((results[2] as PromiseFulfilledResult<{ data: unknown[] | null }>).value?.data ?? []) as Array<{
          id: string; amount: number; description: string | null; created_at: string;
          employee: { name: string } | { name: string }[] | null;
        }>
      : [];

    const combined: PendingApproval[] = [
      ...leaveRows.map(r => ({
        id: r.id,
        kind: "leave" as const,
        employee_name: Array.isArray(r.employee) ? r.employee[0]?.name ?? "—" : r.employee?.name ?? "—",
        amount: null,
        detail: `${r.type} · ${dayjs(r.start_date).format("DD MMM")} → ${dayjs(r.end_date).format("DD MMM")}`,
        created_at: r.created_at,
      })),
      ...reimbRows.map(r => ({
        id: r.id,
        kind: "reimbursement" as const,
        employee_name: Array.isArray(r.employee) ? r.employee[0]?.name ?? "—" : r.employee?.name ?? "—",
        amount: r.amount,
        detail: r.description || "Reimbursement request",
        created_at: r.created_at,
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);

    const totalKPI = (teamRows ?? []).reduce((acc, r) => acc + (Number(r.kpi_score) || 0), 0);
    const avgKPI = teamRows && teamRows.length > 0 ? totalKPI / teamRows.length : 0;

    setStats({
      teamSize: teamRows?.length ?? 0,
      presentToday: present,
      pendingLeaveApprovals: leaveRows.length,
      pendingReimbursementApprovals: reimbRows.length,
      averageKPI: Math.round(avgKPI),
    });
    setApprovals(combined);
    setLoading(false);
  }, [user, isManager]);

  useEffect(() => { load(); }, [load]);

  if (!isManager) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Crown className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-sm">Manager Hub</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {scopeLabel} scope · {user?.is_dept_lead ? "Department Lead" : "Team Lead"}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {stats.teamSize} {stats.teamSize === 1 ? "report" : "reports"}
        </Badge>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs">Team Size</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums mt-1">{loading ? "—" : stats.teamSize}</p>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardCheck className="h-3.5 w-3.5" />
              <span className="text-xs">Present Today</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
              {loading ? "—" : stats.presentToday}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="text-xs">Pending Approvals</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums mt-1 text-amber-600 dark:text-amber-400">
              {loading ? "—" : stats.pendingLeaveApprovals + stats.pendingReimbursementApprovals}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs">Avg Team KPI</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums mt-1">{loading ? "—" : `${stats.averageKPI}%`}</p>
          </div>
        </div>

        {/* Approvals inbox */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Approvals Inbox</h4>
            {approvals.length > 0 && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/department-lead/teams">
                  Open queue <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : approvals.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No pending approvals.</p>
          ) : (
            <div className="space-y-2">
              {approvals.map(a => (
                <div key={`${a.kind}-${a.id}`} className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/30 transition-colors">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{initials(a.employee_name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{a.employee_name}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] capitalize",
                          a.kind === "leave"
                            ? "bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/20"
                            : "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",
                        )}
                      >
                        {a.kind}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{a.detail}</p>
                  </div>
                  {a.amount !== null && (
                    <p className="text-sm font-semibold tabular-nums">
                      ₹{Number(a.amount).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links to team-scoped views */}
        <div className="flex flex-wrap gap-2 pt-3 border-t">
          <Button asChild variant="outline" size="sm">
            <Link href="/department-lead/teams">
              <Users className="mr-2 h-3.5 w-3.5" /> My {scopeLabel}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/department-lead/org-chart">
              <Network className="mr-2 h-3.5 w-3.5" /> Org Chart
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/attendance">
              <ClipboardCheck className="mr-2 h-3.5 w-3.5" /> Attendance
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/kpi">
              <TrendingUp className="mr-2 h-3.5 w-3.5" /> KPI
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
