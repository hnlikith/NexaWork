"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Users, UserPlus, Briefcase, Calendar, Cake, GraduationCap,
  TrendingUp, Network, ClipboardCheck, FileText, ArrowRight, Loader2,
} from "lucide-react";
import dayjs from "@/lib/dayjs";

interface HRStats {
  totalEmployees: number;
  activeEmployees: number;
  newThisMonth: number;
  presentToday: number;
  pendingLeaves: number;
  openRoles: number;
  upcomingInterviews: number;
  birthdaysThisWeek: number;
}

interface Birthday { id: string; name: string; date: string; type: "birthday" | "anniversary"; years_completed?: number }
interface RecentHire { id: string; name: string; employee_id: string; designation: string; joining_date: string }
interface PendingLeave { id: string; employee_name: string; type: string; start_date: string; end_date: string; reason: string | null }

function initials(name?: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

const QUICK_LINKS = [
  { href: "/admin/users",         label: "Employees",      icon: Users,           desc: "Add, edit, and view profiles" },
  { href: "/admin/recruitment",   label: "Recruitment",    icon: UserPlus,        desc: "Hiring pipeline" },
  { href: "/admin/ats",           label: "Resume Scanner", icon: FileText,        desc: "AI-scored applications" },
  { href: "/admin/interviews",    label: "Interviews",     icon: Briefcase,       desc: "Schedule & feedback" },
  { href: "/admin/attendance",    label: "Attendance",     icon: ClipboardCheck,  desc: "Daily logs, leaves, shifts" },
  { href: "/admin/kpi",           label: "KPI / KRA",      icon: TrendingUp,      desc: "Performance scoring" },
  { href: "/admin/lms",           label: "Academy",        icon: GraduationCap,   desc: "Courses & certifications" },
  { href: "/admin/teams",         label: "Teams",          icon: Network,         desc: "Department structure" },
  { href: "/admin/org-chart",     label: "Org Chart",      icon: Network,         desc: "Hierarchy visualisation" },
  { href: "/admin/shifts",        label: "Shifts",         icon: Calendar,        desc: "Roster planning" },
  { href: "/admin/hr/job-clusters", label: "Job Clusters", icon: Briefcase,       desc: "Role templates & bands" },
];

export default function HRLanding() {
  const [stats, setStats] = useState<HRStats>({
    totalEmployees: 0, activeEmployees: 0, newThisMonth: 0, presentToday: 0,
    pendingLeaves: 0, openRoles: 0, upcomingInterviews: 0, birthdaysThisWeek: 0,
  });
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [recentHires, setRecentHires] = useState<RecentHire[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<PendingLeave[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const today = dayjs().format("YYYY-MM-DD");
    const monthStart = dayjs().startOf("month").format("YYYY-MM-DD");
    const weekEnd = dayjs().add(7, "day").format("MM-DD");
    const todayMMDD = dayjs().format("MM-DD");

    const results = await Promise.allSettled([
      // 0 total employees
      supabase.from("employees").select("id", { count: "exact", head: true }),
      // 1 active employees
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true),
      // 2 new this month
      supabase.from("employees").select("id", { count: "exact", head: true }).gte("joining_date", monthStart),
      // 3 present today
      supabase.from("attendance_logs").select("id", { count: "exact", head: true }).eq("date", today).not("clock_in", "is", null),
      // 4 pending leaves
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      // 5 open roles
      supabase.from("job_openings").select("id", { count: "exact", head: true }).eq("status", "open"),
      // 6 upcoming interviews
      supabase.from("interviews").select("id", { count: "exact", head: true }).gte("scheduled_at", dayjs().toISOString()).lte("scheduled_at", dayjs().add(7, "day").toISOString()),
      // 7 recent hires
      supabase.from("employees").select("id, name, employee_id, designation, joining_date").order("joining_date", { ascending: false }).limit(5),
      // 8 pending leave detail
      supabase.from("leave_requests")
        .select("id, type, start_date, end_date, reason, employee:employees!leave_requests_employee_id_fkey(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
      // 9 birthdays / anniversaries (rough — server-side filter via raw match)
      supabase.from("employees").select("id, name, dob, joining_date").eq("is_active", true).limit(200),
    ]);

    const safeCount = (i: number) => results[i].status === "fulfilled" ? ((results[i] as PromiseFulfilledResult<{ count: number | null }>).value?.count ?? 0) : 0;

    const newStats: HRStats = {
      totalEmployees: safeCount(0),
      activeEmployees: safeCount(1),
      newThisMonth: safeCount(2),
      presentToday: safeCount(3),
      pendingLeaves: safeCount(4),
      openRoles: safeCount(5),
      upcomingInterviews: safeCount(6),
      birthdaysThisWeek: 0,
    };

    // Recent hires
    if (results[7].status === "fulfilled") {
      const data = (results[7] as PromiseFulfilledResult<{ data: RecentHire[] | null }>).value?.data ?? [];
      setRecentHires(data);
    }

    // Pending leaves
    if (results[8].status === "fulfilled") {
      const rows = ((results[8] as PromiseFulfilledResult<{ data: unknown[] | null }>).value?.data ?? []) as Array<{
        id: string; type: string; start_date: string; end_date: string; reason: string | null;
        employee: { name: string } | { name: string }[] | null;
      }>;
      setPendingLeaves(rows.map(r => ({
        id: r.id,
        type: r.type,
        start_date: r.start_date,
        end_date: r.end_date,
        reason: r.reason,
        employee_name: Array.isArray(r.employee) ? r.employee[0]?.name ?? "—" : r.employee?.name ?? "—",
      })));
    }

    // Birthdays/anniversaries in next 7 days
    if (results[9].status === "fulfilled") {
      const emps = ((results[9] as PromiseFulfilledResult<{ data: Array<{ id: string; name: string; dob: string | null; joining_date: string | null }> | null }>).value?.data ?? []);
      const upcoming: Birthday[] = [];
      for (const e of emps) {
        const inWindow = (mmdd?: string | null) => {
          if (!mmdd) return false;
          return mmdd >= todayMMDD && mmdd <= weekEnd;
        };
        const dobMMDD = e.dob ? e.dob.slice(5, 10) : null;
        const joinMMDD = e.joining_date ? e.joining_date.slice(5, 10) : null;
        if (inWindow(dobMMDD)) upcoming.push({ id: e.id, name: e.name, date: dobMMDD!, type: "birthday" });
        if (inWindow(joinMMDD) && e.joining_date) {
          const years = dayjs().year() - parseInt(e.joining_date.slice(0, 4));
          if (years >= 1) upcoming.push({ id: `a-${e.id}`, name: e.name, date: joinMMDD!, type: "anniversary", years_completed: years });
        }
      }
      newStats.birthdaysThisWeek = upcoming.length;
      setBirthdays(upcoming.sort((a, b) => a.date.localeCompare(b.date)));
    }

    setStats(newStats);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const kpis = [
    { label: "Total Employees",    value: stats.totalEmployees,    icon: Users,         accent: "text-sky-600 dark:text-sky-400",         bg: "bg-sky-500/10" },
    { label: "Active",             value: stats.activeEmployees,   icon: ClipboardCheck, accent: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Joined This Month",  value: stats.newThisMonth,      icon: UserPlus,      accent: "text-indigo-600 dark:text-indigo-400",   bg: "bg-indigo-500/10" },
    { label: "Present Today",      value: stats.presentToday,      icon: Calendar,      accent: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-500/10" },
    { label: "Pending Leaves",     value: stats.pendingLeaves,     icon: FileText,      accent: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-500/10" },
    { label: "Open Roles",         value: stats.openRoles,         icon: Briefcase,     accent: "text-purple-600 dark:text-purple-400",   bg: "bg-purple-500/10" },
    { label: "Interviews (7d)",    value: stats.upcomingInterviews, icon: Calendar,     accent: "text-orange-600 dark:text-orange-400",   bg: "bg-orange-500/10" },
    { label: "Birthdays (7d)",     value: stats.birthdaysThisWeek, icon: Cake,          accent: "text-pink-600 dark:text-pink-400",       bg: "bg-pink-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="hr_dashboard"
      title="HR Hub"
      subtitle="People operations — hiring, attendance, performance, learning."
    >
      <div className="space-y-6">
        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map(k => (
            <Card key={k.label}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className={cn("h-10 w-10 rounded-md flex items-center justify-center", k.bg, k.accent)}>
                  <k.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : k.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick links + lists */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick links */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Jump to</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {QUICK_LINKS.map(q => (
                  <Link
                    key={q.href}
                    href={q.href}
                    className="group flex items-start gap-3 rounded-md border p-3 hover:border-primary/40 hover:bg-muted/30 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground group-hover:text-foreground flex items-center justify-center flex-shrink-0">
                      <q.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{q.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{q.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Birthdays & anniversaries */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">This Week</CardTitle>
              <Badge variant="secondary">{birthdays.length}</Badge>
            </CardHeader>
            <CardContent>
              {birthdays.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No birthdays or anniversaries in the next 7 days.</p>
              ) : (
                <div className="space-y-3">
                  {birthdays.map(b => (
                    <div key={b.id} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{initials(b.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.type === "birthday" ? "🎂 Birthday" : `🎉 ${b.years_completed}y anniversary`}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">{b.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pending approvals + recent hires */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Pending Leave Requests</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/attendance">
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {pendingLeaves.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No pending leave requests.</p>
              ) : (
                <div className="space-y-3">
                  {pendingLeaves.map(l => (
                    <div key={l.id} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{l.employee_name}</p>
                          <Badge variant="outline" className="text-[10px]">{l.type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                          {dayjs(l.start_date).format("MMM D")} → {dayjs(l.end_date).format("MMM D, YYYY")}
                        </p>
                        {l.reason && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{l.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Recent Hires</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/users">
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentHires.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No recent hires.</p>
              ) : (
                <div className="space-y-3">
                  {recentHires.map(h => (
                    <div key={h.id} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="text-xs">{initials(h.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{h.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {h.employee_id} · {h.designation || "—"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {h.joining_date ? dayjs(h.joining_date).format("DD MMM") : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
