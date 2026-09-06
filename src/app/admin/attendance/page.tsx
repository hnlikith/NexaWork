"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import React, { useState, useEffect, useRef } from "react";
import {
  Users, Clock, CalendarDays, Search, Download, UserCheck, UserX,
  TrendingUp, ChevronLeft, ChevronRight, Edit2, X, CheckCircle2,
  AlarmClock, Palmtree, LayoutGrid, List, CalendarRange, Play, Square, Timer,
  RotateCcw, Target, Coffee, ChevronDown, Settings, Check, Landmark, Building2, ShieldAlert,
  ArrowRightLeft, FileCheck2, AlertTriangle, Link2, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { TimePicker } from "@/components/ui/TimePickerLegacy";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/ToastLegacy";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermission } from "@/hooks/usePermission";
import dayjs from "@/lib/dayjs";

// ─── Types ───────────────────────────────────────────────
type AttStatus = "present" | "late" | "absent" | "leave" | "holiday" | "half_day" | "on_duty";
type ViewTab = "daily" | "logsheet" | "summary" | "leaves" | "weekoff_requests" | "sick_certs" | "holidays" | "protocols";

interface LeaveRequest {
  id: string;
  employee_id: string;
  type: string;
  from_date: string;
  to_date: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  employee: { name: string, department: string };
}

interface Employee {
  id: string;
  name: string;
  department: string;
  designation: string;
  employee_id: string;
  monthly_leave_quota: number;
  leave_balance: number;
}

interface DayRecord {
  clock_in: string | null;
  clock_out: string | null;
  status: AttStatus;
  note?: string;
  id?: string;
}

const STATUS_CELL: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  late: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  absent: "bg-red-500/15 text-red-600 dark:text-red-400",
  leave: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  holiday: "bg-theme-raised text-theme-subtle",
  on_duty: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
};

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "default" | "info"> = {
  present: "success", late: "warning", absent: "danger", leave: "info", holiday: "default", half_day: "warning", on_duty: "info"
};

const STATUS_LABEL: Record<string, string> = {
  present: "P", late: "L", absent: "A", leave: "Le", holiday: "H", on_duty: "OD",
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatDurationDisplay(clock_in: string, clock_out: string | null, recordDate?: string) {
  if (!clock_in) return "—";
  const dateRef = recordDate || dayjs().format("YYYY-MM-DD");
  const start = dayjs(`${dateRef} ${clock_in}`);
  const end = clock_out ? dayjs(`${dateRef} ${clock_out}`) : dayjs();

  const diffMin = end.diff(start, 'minute');
  if (diffMin < 0) return "0 hr 0 min";

  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return `${hrs} hr ${mins} min`;
}

// ─── Live duration for currently checked-in employees ─────
function LiveDuration({ clockIn, recordDate }: { clockIn: string; recordDate: string }) {
  const [now, setNow] = useState(dayjs());
  useEffect(() => {
    const iv = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(iv);
  }, []);
  const diff = now.diff(dayjs(`${recordDate} ${clockIn}`), "second");
  if (diff < 0) return <span className="text-theme-fg font-semibold tabular-nums">—</span>;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return (
    <span className="flex items-center gap-1 text-emerald-500 font-bold tabular-nums text-xs">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
      {`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
    </span>
  );
}

// ─── Digital Clock & Session Timer ────────────────────────
function DigitalClock({ clockIn, clockOut }: { clockIn?: string | null, clockOut?: string | null }) {
  const [now, setNow] = useState(dayjs());

  useEffect(() => {
    const inv = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(inv);
  }, []);

  const getSessionDuration = () => {
    if (!clockIn) return "00 hr 00 min";
    const today = dayjs().format("YYYY-MM-DD");
    const start = dayjs(`${today} ${clockIn}`);
    const end = clockOut ? dayjs(`${today} ${clockOut}`) : now;
    const diff = end.diff(start, 'minute');
    if (diff < 0) return "00 hr 00 min";
    const h = Math.floor(Math.abs(diff) / 60);
    const m = Math.abs(diff) % 60;
    return `${h} hr ${m} min`;
  };

  const getExactSessionTimer = () => {
    if (!clockIn) return "00:00:00";
    const today = dayjs().format("YYYY-MM-DD");
    const start = dayjs(`${today} ${clockIn}`);
    const end = clockOut ? dayjs(`${today} ${clockOut}`) : now;
    const diff = end.diff(start, 'second');
    if (diff < 0) return "00:00:00";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-8 mr-8 border-r border-theme-border pr-8">
      <div className="flex flex-col items-end">
        <div className={cn("text-3xl font-bold tabular-nums leading-none tracking-tight", clockIn ? "text-theme-fg" : "text-theme-subtle/30")}>
          {clockIn ? dayjs(`2000-01-01 ${clockIn}`).format("hh:mm:ss") : "00:00:00"}
          <span className="text-xs ml-1 opacity-50 uppercase">{clockIn ? dayjs(`2000-01-01 ${clockIn}`).format("A") : "AM"}</span>
        </div>
        <p className="text-xs font-medium text-theme-muted mt-1">Start Time</p>
      </div>

      <div className="flex flex-col items-end">
        <div className={cn(
          "text-3xl font-bold tabular-nums leading-none tracking-tight transition-colors duration-500",
          clockIn && !clockOut ? "text-emerald-500" : "text-theme-fg",
          !clockIn && "text-theme-subtle/30"
        )}>
          {getExactSessionTimer()}
        </div>
        <p className="text-xs font-medium text-theme-muted mt-1">
          {clockOut ? "Total Duration" : "Running Session"}
        </p>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────
export default function AdminAttendancePage() {
  const { showToast } = useToast();
  const { canEdit, canDelete, canExport } = usePermission("attendance");
  const [tab, setTab] = useState<ViewTab>("daily");
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [showMonthSelect, setShowMonthSelect] = useState(false);
  const [showYearSelect, setShowYearSelect] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dailyLogs, setDailyLogs] = useState<Record<string, DayRecord & { modified_by_name?: string }>>({});
  const [monthLogs, setMonthLogs] = useState<Record<string, Record<string, DayRecord>>>({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("employee");
  const [showOverride, setShowOverride] = useState(false);
  const [targetEmp, setTargetEmp] = useState<any>(null);
  const [overrideForm, setOverrideForm] = useState({
    clock_in: "",
    clock_out: "",
    status: "present" as AttStatus,
    reason: ""
  });

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leaveTypeMap, setLeaveTypeMap] = useState<Record<string, Record<string, string>>>({});
  const [weekoffRequests, setWeekoffRequests] = useState<any[]>([]);
  const [sickCerts, setSickCerts] = useState<any[]>([]);
  const [actionLoading2, setActionLoading2] = useState<string | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    empId: "",
    type: "casual",
    from: dayjs().format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD"),
    reason: ""
  });

  // Protocols
  const [protocols, setProtocols] = useState<any[]>([]);
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [protocolForm, setProtocolForm] = useState({
    title: "General Shift",
    check_in_time: "09:00:00",
    check_out_time: "18:00:00",
    type: "All",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"]
  });

  // Holidays
  const [holidays, setHolidays] = useState<Record<string, any>>({});
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayForm, setHolidayForm] = useState({
    title: "",
    description: "",
    type: "public",
    color: "#ef4444",
    is_half_day: false,
    start_time: "09:00:00",
    end_time: "13:00:00"
  });
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [attSettings, setAttSettings] = useState<any>({
    id: 1,
    holiday_is_paid_leave: false,
    // Weekly-off policy
    weekoff_mode: "flexible",            // 'flexible' | 'fixed_weekend'
    weekoffs_per_month: 4,
    max_weekoffs_per_week: 1,
    weekoff_carry_forward: true,
    recycle_day: 25,
    lock_day: 28,
    auto_assign_sundays: true,
    fixed_weekend_days: ["Sun", "Sat"],
    // Sick-leave policy
    sick_leave_forward_days: 2,
    sick_leave_backward_days: 2,
    certificate_deadline_days: 7,
    require_cert_approval: true,
  });

  // Initial Auth & Data
  async function init() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
        if (profile) setUserRole(profile.role);
      }

      const empRes = await fetch('/api/employees').then(r => r.json());
      setEmployees(empRes.employees || []);

      await loadLogsForDate(selectedDate);
      await loadSettings();
    } finally {
      setLoading(false);
    }
  }

  async function loadLogsForDate(dateStr: string) {
    const { data: att } = await supabase.from("attendance_logs").select("*, modified_by_name:employees!modified_by(name)").eq("date", dateStr);
    const logMap: Record<string, DayRecord & { modified_by_name?: string }> = {};
    att?.forEach(l => {
      logMap[l.employee_id] = { clock_in: l.clock_in, clock_out: l.clock_out, status: l.status, id: l.id, modified_by_name: l.modified_by_name?.name };
    });
    setDailyLogs(logMap);
    const mStart = dayjs(dateStr).startOf("month").format("YYYY-MM-DD");
    const mEnd   = dayjs(dateStr).endOf("month").format("YYYY-MM-DD");
    loadLeaveTypeMap(mStart, mEnd);
  }

  async function loadMonthData() {
    const start = dayjs(selectedDate).startOf('month').format("YYYY-MM-DD");
    const end = dayjs(selectedDate).endOf('month').format("YYYY-MM-DD");
    const { data } = await supabase.from("attendance_logs").select("*").gte("date", start).lte("date", end);
    const bigMap: Record<string, Record<string, DayRecord>> = {};
    data?.forEach(l => {
      if (!bigMap[l.employee_id]) bigMap[l.employee_id] = {};
      bigMap[l.employee_id][l.date] = { clock_in: l.clock_in, clock_out: l.clock_out, status: l.status };
    });
    setMonthLogs(bigMap);
    loadLeaveTypeMap(start, end);
    loadHolidays(); // needed by log sheet for auto-absent calculation
  }

  async function loadLeaveTypeMap(start: string, end: string) {
    const { data } = await supabase.from("leave_requests")
      .select("employee_id, from_date, to_date, start_date, end_date, type, status")
      .gte("start_date", start).lte("end_date", end)
      .in("status", ["approved", "Approved"]);
    const map: Record<string, Record<string, string>> = {};
    data?.forEach(req => {
      if (!map[req.employee_id]) map[req.employee_id] = {};
      let d = dayjs(req.from_date || req.start_date);
      const endD = dayjs(req.to_date || req.end_date);
      while (!d.isAfter(endD)) { map[req.employee_id][d.format("YYYY-MM-DD")] = req.type; d = d.add(1, "day"); }
    });
    setLeaveTypeMap(map);
  }

  async function loadLeaves() {
    const { data } = await supabase.from("leave_requests")
      .select("*, employee:employees(name, department)")
      .order("created_at", { ascending: false });
    setLeaves(data || []);
  }

  async function loadWeekoffRequests() {
    const res = await fetch("/api/attendance/weekoff/change-request?all=1");
    if (res.ok) setWeekoffRequests(await res.json());
  }

  async function loadSickCerts() {
    const res = await fetch("/api/attendance/sick-leave?all=1");
    if (res.ok) setSickCerts(await res.json());
  }

  async function handleWeekoffDecision(id: string, action: "approve" | "reject") {
    setActionLoading2(id + action);
    try {
      const res = await fetch("/api/attendance/weekoff/change-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(`Request ${action}d`, "success");
      await loadWeekoffRequests();
    } catch (e: any) { showToast(e.message || "Failed", "error"); }
    finally { setActionLoading2(null); }
  }

  async function handleSickCertDecision(id: string, action: "approve" | "reject") {
    setActionLoading2(id + action);
    try {
      const res = await fetch("/api/attendance/sick-leave", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(`Certificate ${action}d`, "success");
      await loadSickCerts();
    } catch (e: any) { showToast(e.message || "Failed", "error"); }
    finally { setActionLoading2(null); }
  }

  async function loadHolidays() {
    const start = dayjs(selectedDate).startOf('month').format("YYYY-MM-DD");
    const end = dayjs(selectedDate).endOf('month').format("YYYY-MM-DD");
    const { data } = await supabase.from("system_holidays").select("*").gte("date", start).lte("date", end);
    const hm: Record<string, any> = {};
    data?.forEach(h => hm[h.date] = h);
    setHolidays(hm);
  }

  async function loadProtocols() {
    const { data } = await supabase.from("attendance_protocols").select("*").order("created_at", { ascending: false });
    setProtocols(data || []);
  }

  async function loadSettings() {
    const { data } = await supabase.from("attendance_settings").select("*").eq("id", 1).maybeSingle();
    if (data) setAttSettings((prev: any) => ({ ...prev, ...data }));
  }

  // Update a single setting field in local state (persisted on Save).
  function setSetting(key: string, value: any) {
    setAttSettings((prev: any) => ({ ...prev, [key]: value }));
  }

  // Persist the entire settings object via admin API route (bypasses RLS).
  async function saveSettings() {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/attendance/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...attSettings, id: 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast("Attendance settings saved.", "success");
    } catch (e: any) {
      showToast(e.message || "Failed to save settings", "error");
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => { init(); }, []); // Run once on mount
  useEffect(() => { loadLogsForDate(selectedDate); }, [selectedDate]); // Refetch on date change
  useEffect(() => {
    if (tab === "leaves") loadLeaves();
    else if (tab === "weekoff_requests") loadWeekoffRequests();
    else if (tab === "sick_certs") loadSickCerts();
    else if (tab === "holidays") loadHolidays();
    else if (tab === "protocols") loadProtocols();
    else if (tab !== "daily") loadMonthData();
  }, [tab, selectedDate]);

  useEffect(() => {
    const chan = supabase.channel("att_updates").on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, (payload: any) => {
      // Optimistic state update from payload — no waiting for a full round-trip
      if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
        const rec = payload.new;
        if (rec?.date === selectedDate) {
          setDailyLogs(prev => ({
            ...prev,
            [rec.employee_id]: { clock_in: rec.clock_in, clock_out: rec.clock_out, status: rec.status, id: rec.id },
          }));
        }
      } else if (payload.eventType === "DELETE") {
        const rec = payload.old;
        if (rec?.date === selectedDate) {
          setDailyLogs(prev => { const next = { ...prev }; delete next[rec.employee_id]; return next; });
        }
      }
      // Full reload for accuracy (modified_by_name join etc.)
      loadLogsForDate(selectedDate);
      if (tab !== "daily") loadMonthData();
    }).subscribe();

    const chan2 = supabase.channel("holidays_updates").on('postgres_changes', { event: '*', schema: 'public', table: 'system_holidays' }, () => {
      loadHolidays();
    }).subscribe();
    const chan3 = supabase.channel("settings_updates").on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_settings' }, () => {
      loadSettings();
    }).subscribe();

    // Polling fallback for daily tab — catches any missed real-time events
    const isToday = selectedDate === dayjs().format("YYYY-MM-DD");
    const pollId = tab === "daily" && isToday
      ? setInterval(() => loadLogsForDate(selectedDate), 10_000)
      : null;

    return () => {
      supabase.removeChannel(chan);
      supabase.removeChannel(chan2);
      supabase.removeChannel(chan3);
      if (pollId) clearInterval(pollId);
    };
  }, [tab, selectedDate]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowHolidayModal(false);
        setShowLeaveModal(false);
        setShowOverride(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  // Actions
  async function handleCheckAction(type: "in" | "out") {
    if (!userId) return;
    setChecking(true);
    try {
      const nowTime = dayjs().format("HH:mm:ss");
      const today = dayjs().format("YYYY-MM-DD");

      if (type === "in") {
        const isLate = dayjs().hour() >= 10;
        const status: AttStatus = isLate ? "late" : "present";

        // Optimistic UI Update
        setDailyLogs(prev => ({
          ...prev,
          [userId]: { ...prev[userId], clock_in: nowTime, status: status } as any
        }));

        const { error } = await supabase.from("attendance_logs").upsert({
          employee_id: userId,
          date: today,
          clock_in: nowTime,
          status: status
        }, { onConflict: "employee_id,date" });

        if (error) {
          console.error("Attendance Sync Error:", error);
          throw new Error(`Sync Error: ${error.message}`);
        }
        showToast("Mission Protocol Initiated", "success");
      } else {
        const { error } = await supabase.from("attendance_logs").update({ clock_out: nowTime })
          .eq("employee_id", userId).eq("date", today);

        if (error) {
          console.error("Attendance Sync Error:", error);
          throw new Error(`Sync Error: ${error.message}`);
        }

        // Optimistic UI Update
        setDailyLogs(prev => ({
          ...prev,
          [userId]: { ...prev[userId], clock_out: nowTime } as any
        }));

        showToast("Protocol Safely Concluded", "success");
      }

      // Refresh to ensure absolute consistency
      if (selectedDate === today) loadLogsForDate(today);
    } catch (e: any) {
      console.error("Critical Attendance Error:", e);
      showToast(e.message, "error");
      // Revert on error
      loadLogsForDate(selectedDate);
    } finally {
      setChecking(false);
    }
  }

  async function handleAdminOverride() {
    if (!targetEmp || !userId) return;
    setChecking(true);
    try {
      const { error } = await supabase.from("attendance_logs").upsert({
        employee_id: targetEmp.id,
        date: selectedDate,
        clock_in: overrideForm.clock_in || null,
        clock_out: overrideForm.clock_out || null,
        status: overrideForm.status,
        modified_by: userId,
        modified_at: dayjs().toISOString(),
        modification_reason: overrideForm.reason
      }, { onConflict: "employee_id,date" });

      if (error) throw error;
      showToast(`Protocol updated for ${targetEmp.name}`, "success");
      setShowOverride(false);
      loadLogsForDate(selectedDate);
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setChecking(false);
    }
  }

  async function handleAdminDelete(empId: string) {
    if (!confirm("Are you sure you want to purge this attendance record? This will be logged.")) return;
    try {
      const { error } = await supabase.from("attendance_logs").delete().eq("employee_id", empId).eq("date", selectedDate);
      if (error) throw error;
      showToast("Record purged successfully", "success");
      loadLogsForDate(selectedDate);
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function handleLeaveStatus(id: string, status: "approved" | "rejected") {
    try {
      const { data: req, error: fetchErr } = await supabase.from("leave_requests")
        .select("*, emp:employees(monthly_leave_quota, weekly_off_allotment)")
        .eq("id", id).single();
      if (fetchErr) throw fetchErr;

      const { error } = await supabase.from("leave_requests").update({ status, approved_by: userId }).eq("id", id);
      if (error) throw error;

      if (status === "approved" && req) {
        // Mark attendance_logs as "leave" for each day in the range
        let d = dayjs(req.from_date || req.start_date);
        const endD = dayjs(req.to_date || req.end_date);
        while (!d.isAfter(endD)) {
          await supabase.from("attendance_logs").upsert(
            { employee_id: req.employee_id, date: d.format("YYYY-MM-DD"), status: "leave", clock_in: null, clock_out: null },
            { onConflict: "employee_id,date" }
          );
          d = d.add(1, "day");
        }
        // Deduct quota for Sick Leave or Weekly Off
        const empQ = req.emp;
        if (req.type === "Sick Leave" && empQ && Number(empQ.monthly_leave_quota) > 0) {
          await supabase.from("employees").update({ monthly_leave_quota: Number(empQ.monthly_leave_quota) - 1 }).eq("id", req.employee_id);
        } else if (req.type === "Weekly Off" && empQ && Number(empQ.weekly_off_allotment) > 0) {
          await supabase.from("employees").update({ weekly_off_allotment: Number(empQ.weekly_off_allotment) - 1 }).eq("id", req.employee_id);
        }
      }

      // Notify the employee
      if (req) {
        const dateLabel = dayjs(req.from_date || req.start_date).format("D MMM YYYY");
        try { await supabase.from("system_notifications").insert({
          user_id: req.employee_id,
          title: `Leave ${status === "approved" ? "Approved" : "Rejected"}: ${req.type}`,
          message: `Your ${req.type} request for ${dateLabel} has been ${status}.`,
          type: status === "approved" ? "success" : "danger",
          link: "/dashboard/attendance"
        }); } catch {}
      }

      showToast(`Leave ${status} successfully`, "success");
      loadLeaves(); loadLogsForDate(selectedDate);
      if (tab !== "daily") loadMonthData();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function handleManualLeave() {
    if (!leaveForm.empId) return;
    try {
      const dayCount = dayjs(leaveForm.to).diff(dayjs(leaveForm.from), 'day') + 1;
      const { error } = await supabase.from("leave_requests").insert({
        employee_id: leaveForm.empId,
        type: leaveForm.type,
        from_date: leaveForm.from,
        to_date: leaveForm.to,
        start_date: leaveForm.from,
        end_date: leaveForm.to,
        days: dayCount,
        reason: leaveForm.reason,
        status: userRole === "admin" ? "Approved" : "Pending",
        approved_by: userRole === "admin" ? userId : null
      });
      if (error) throw error;
      showToast("Leave induction completed", "success");
      setShowLeaveModal(false);
      loadLeaves();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function handleHolidaySubmit() {
    if (!holidayForm.title || !holidayDate) return;
    try {
      const { error } = await supabase.from("system_holidays").upsert({
        date: holidayDate,
        title: holidayForm.title,
        description: holidayForm.description,
        type: holidayForm.type,
        color: holidayForm.color,
        is_half_day: holidayForm.is_half_day,
        start_time: holidayForm.is_half_day ? holidayForm.start_time : null,
        end_time: holidayForm.is_half_day ? holidayForm.end_time : null
      }, { onConflict: "date" });
      if (error) throw error;
      showToast("Holiday protocol published successfully", "success");
      setShowHolidayModal(false);
      loadHolidays();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function handleProtocolSubmit() {
    if (!protocolForm.title) return;
    try {
      const { data, error } = await supabase.from("attendance_protocols").insert({
        title: protocolForm.title,
        check_in_time: protocolForm.check_in_time,
        check_out_time: protocolForm.check_out_time,
        target_type: protocolForm.type,
        type: protocolForm.type,
        days: protocolForm.days,
        effective_from: new Date().toISOString().split("T")[0],
        status: "active",
      }).select();
      if (error) {
        console.error("Protocol insert error:", JSON.stringify(error));
        throw error;
      }

      // Broadcast notification to employees
      await supabase.from("notifications").insert({
        title: "📋 New Timing Protocol Published",
        message: `"${protocolForm.title}" is now active. Check-in: ${protocolForm.check_in_time} → Check-out: ${protocolForm.check_out_time}. Active days: ${protocolForm.days.join(", ")}.`,
        type: "info",
        target: protocolForm.type === "All" ? "all" : protocolForm.type,
        created_by: userId,
      });

      // Play notification chime
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
      } catch { /* audio ctx unavailable */ }

      showToast("Timing Protocol published & employees notified!", "success");
      setShowProtocolModal(false);
      loadProtocols();
    } catch (e: any) {
      showToast(e.message || "Failed to save protocol", "error");
    }
  }


  const depts = ["All", ...new Set(employees.map(e => e.department).filter(Boolean))];
  const filtered = employees.filter(e => {
    const mSearch = e.name.toLowerCase().includes(search.toLowerCase());
    const mDept = deptFilter === "All" || e.department === deptFilter;
    return mSearch && mDept;
  });

  const presentCount = Object.values(dailyLogs).filter(l => l.status === "present" || l.status === "late").length;
  const lateCount = Object.values(dailyLogs).filter(l => l.status === "late").length;
  const absentCount = employees.length - presentCount;

  const myTodayLog = userId ? dailyLogs[userId] : null;
  const isSelectedToday = selectedDate === dayjs().format("YYYY-MM-DD");

  return (
    <>
      <DashboardShell
      moduleKey="attendance"
        title="Attendance Dashboard"
        subtitle="View and manage employee attendance records."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowSettingsModal(true)} className="h-10 w-10 p-0 rounded-xl hover:bg-theme-primary/10 hover:text-theme-primary transition-all">
              <Settings size={16} />
            </Button>
            {canExport && (
              <Button variant="secondary" size="sm" className="h-10 px-4 rounded-xl font-bold">
                <Download size={14} className="mr-2" /> Export
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex rounded-xl border border-theme-border bg-theme-raised p-1 gap-0.5 shadow-inner">
              {[
                { key: "daily",            label: "Daily Attendance",  icon: List },
                { key: "logsheet",         label: "Log Sheet",         icon: LayoutGrid },
                { key: "summary",          label: "Monthly Summary",   icon: CalendarRange },
                { key: "leaves",           label: "Leave Approval",    icon: Palmtree },
                { key: "weekoff_requests", label: "Weekoff Requests",  icon: ArrowRightLeft },
                { key: "sick_certs",       label: "Sick Leave",        icon: ShieldAlert },
                { key: "holidays",         label: "Holidays",          icon: Palmtree },
                { key: "protocols",        label: "Shift Times",       icon: AlarmClock },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setTab(key as ViewTab)}
                  className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all", tab === key ? "bg-theme-surface text-theme-fg shadow-sm" : "text-theme-muted hover:text-theme-fg")}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedDate(dayjs(selectedDate).subtract(1, 'day').format("YYYY-MM-DD"))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-theme-border bg-theme-surface text-theme-muted hover:text-theme-fg transition-all"><ChevronLeft size={14} /></button>
              <div className="flex items-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-4 py-1.5 group">
                <CalendarDays size={14} className="text-theme-primary" />
                <span className="text-xs font-bold text-theme-fg tabular-nums">{dayjs(selectedDate).format("D MMM, YYYY")}</span>
                {!isSelectedToday && (
                  <button
                    onClick={() => setSelectedDate(dayjs().format("YYYY-MM-DD"))}
                    title="Reset to Today"
                    className="ml-2 p-1 rounded-md bg-theme-primary/10 text-theme-primary hover:bg-theme-primary hover:text-white transition-all"
                  >
                    <RotateCcw size={10} />
                  </button>
                )}
              </div>
              <button onClick={() => setSelectedDate(dayjs(selectedDate).add(1, 'day').format("YYYY-MM-DD"))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-theme-border bg-theme-surface text-theme-muted hover:text-theme-fg transition-all"><ChevronRight size={14} /></button>
            </div>
          </div>

          {tab === "daily" && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: "Total", value: employees.length, icon: Users, color: "text-theme-fg", bg: "bg-theme-raised" },
                  { label: "Present", value: presentCount, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-500/10" },
                  { label: "Late", value: lateCount, icon: AlarmClock, color: "text-amber-600", bg: "bg-amber-500/10" },
                  { label: "Absent", value: absentCount, icon: UserX, color: "text-red-500", bg: "bg-red-500/10" },
                  { label: "On Duty", value: Object.values(dailyLogs).filter(l => l.status === 'on_duty').length, icon: Target, color: "text-indigo-600", bg: "bg-indigo-500/10" },
                ].map((s) => (
                  <div key={s.label} className="page-card flex items-center gap-3">
                    <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", s.bg)}><s.icon size={16} className={s.color} /></div>
                    <div><p className="text-[11px] text-theme-muted">{s.label}</p><p className={cn("text-xl font-black tabular-nums", s.color)}>{s.value}</p></div>
                  </div>
                ))}
              </div>

              <div className="page-card p-0 overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-theme-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between bg-theme-page/10">
                  <div className="flex flex-wrap gap-1.5">
                    {depts.map(d => (
                      <button key={d} onClick={() => setDeptFilter(d)} className={cn("rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all", deptFilter === d ? "bg-theme-primary text-theme-surface shadow-md" : "bg-theme-raised text-theme-muted hover:text-theme-fg")}>{d}</button>
                    ))}
                  </div>
                  <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" size={13} />
                    <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-52 rounded-xl border border-theme-border bg-theme-page pl-9 pr-3 text-xs text-theme-fg outline-none focus:border-theme-strong" />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-theme-border bg-theme-page text-left text-xs font-semibold text-theme-muted">
                        <th className="px-5 py-3">Employee</th>
                        <th className="px-5 py-3">Department / Designation</th>
                        <th className="px-5 py-3">Check In</th>
                        <th className="px-5 py-3">Check Out</th>
                        <th className="px-5 py-3">Hours</th>
                        <th className="px-5 py-3">Leave Quota</th>
                        <th className="px-5 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border">
                      {loading ? (
                        <tr><td colSpan={7} className="px-6 py-12 text-center text-xs text-theme-muted">Loading attendance data...</td></tr>
                      ) : filtered.map(emp => {
                        const log: any = dailyLogs[emp.id];
                        const isAdmin = userRole === "admin";
                        return (
                          <tr key={emp.id} className="group hover:bg-theme-raised/30 transition-colors">
                            <td className="px-5 py-3"><div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-theme-primary text-theme-surface text-[10px] font-bold">{getInitials(emp.name)}</div>
                              <span className="text-sm font-semibold text-theme-fg">{emp.name}</span>
                              {emp.id === userId && <Badge variant="default" className="text-[10px] h-5 rounded-md">YOU</Badge>}
                            </div></td>
                            <td className="px-5 py-3"><p className="text-xs font-semibold text-theme-fg">{emp.department}</p><p className="text-xs text-theme-muted">{emp.designation}</p></td>
                            <td className="px-5 py-3">
                              <div className="flex flex-col">
                                <span className="tabular-nums text-xs font-bold text-theme-fg">{log?.clock_in ? dayjs(`2000-01-01 ${log.clock_in}`).format("hh:mm A") : "—"}</span>
                                {log?.clock_in && <span className="text-[10px] text-theme-subtle font-medium mt-0.5">{dayjs(selectedDate).format("DD MMM, YYYY")}</span>}
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex flex-col">
                                <span className="tabular-nums text-xs font-bold text-theme-fg">{log?.clock_out ? dayjs(`2000-01-01 ${log.clock_out}`).format("hh:mm A") : "—"}</span>
                                {log?.clock_out && <span className="text-[10px] text-theme-subtle font-medium mt-0.5">{dayjs(selectedDate).format("DD MMM, YYYY")}</span>}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs font-semibold text-theme-fg tabular-nums">
                              {log?.clock_in && !log?.clock_out
                                ? <LiveDuration clockIn={log.clock_in} recordDate={selectedDate} />
                                : (log?.clock_in ? formatDurationDisplay(log.clock_in, log.clock_out, selectedDate) : "—")}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-theme-muted">
                                <Coffee size={13} />
                                <span className="tabular-nums tracking-tight">{emp.monthly_leave_quota || 0} L/M</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <div className="flex flex-col items-end gap-0.5">
                                  <Badge variant={STATUS_BADGE[log?.status || 'absent']}>{log?.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1).replace('_', ' ') : "Absent"}</Badge>
                                  {log?.status === "leave" && leaveTypeMap[emp.id]?.[selectedDate] && (
                                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                                      leaveTypeMap[emp.id][selectedDate] === "Sick Leave" ? "bg-indigo-500/10 text-indigo-600" :
                                      leaveTypeMap[emp.id][selectedDate] === "Weekly Off" ? "bg-sky-500/10 text-sky-600" :
                                      "bg-amber-500/10 text-amber-600"
                                    )}>{leaveTypeMap[emp.id][selectedDate]}</span>
                                  )}
                                  {log?.modified_by_name && (
                                    <span className="text-xs font-medium text-amber-600 mt-1 opacity-80">Modified by {log.modified_by_name}</span>
                                  )}
                                </div>
                                {isAdmin && (canEdit || canDelete) && (
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {canEdit && (
                                      <button
                                        onClick={() => {
                                          setTargetEmp(emp);
                                          setOverrideForm({
                                            clock_in: log?.clock_in || "09:00:00",
                                            clock_out: log?.clock_out || "18:00:00",
                                            status: log?.status || "present",
                                            reason: ""
                                          });
                                          setShowOverride(true);
                                        }}
                                        className="p-1.5 rounded-lg bg-theme-raised text-theme-muted hover:text-theme-fg transition-all"
                                      >
                                        <Edit2 size={13} />
                                      </button>
                                    )}
                                    {canDelete && log && (
                                      <button
                                        onClick={() => handleAdminDelete(emp.id)}
                                        className="p-1.5 rounded-lg bg-rose-50 text-rose-400 hover:text-rose-600 transition-all"
                                      >
                                        <X size={13} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── LOG SHEET ── */}
          {tab === "logsheet" && (
            <div className="page-card overflow-hidden p-0">
              <div className="border-b border-theme-border px-5 py-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-theme-fg">Monthly Log Sheet — {dayjs(selectedDate).format("MMMM YYYY")}</h3>
                <div className="flex items-center gap-4 text-xs font-medium text-theme-muted">
                  {["P: Present", "L: Late", "A: Absent", "Le: Leave"].map(l => <span key={l}>{l}</span>)}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="border-b border-theme-border bg-theme-page">
                    <th className="sticky left-0 bg-theme-page px-4 py-3 text-left font-bold text-theme-muted min-w-[180px] z-10">Employee</th>
                    {Array.from({ length: dayjs(selectedDate).daysInMonth() }, (_, i) => i + 1).map(d => (
                      <th key={d} className={cn("px-1 text-center font-bold min-w-[32px]", d === dayjs().date() && isSelectedToday ? "text-theme-primary" : "text-theme-muted")}>{d}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-theme-border">
                    {filtered.map(emp => (
                      <tr key={emp.id} className="hover:bg-theme-raised/10 transition-colors">
                        <td className="sticky left-0 bg-theme-surface px-4 py-2 z-10 font-bold text-theme-fg text-[11px]">{emp.name}</td>
                        {Array.from({ length: dayjs(selectedDate).daysInMonth() }, (_, i) => i + 1).map(d => {
                          const dateObj = dayjs(selectedDate).date(d);
                          const dateCode = dateObj.format("YYYY-MM-DD");
                          const today = dayjs().format("YYYY-MM-DD");
                          const st = monthLogs[emp.id]?.[dateCode]?.status;
                          const leaveType = st === "leave" ? leaveTypeMap[emp.id]?.[dateCode] : undefined;
                          const dayOfWeek = dateObj.day(); // 0=Sun 6=Sat
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const isHoliday = !!holidays[dateCode];
                          const isPast = dateCode < today;
                          // Auto-absent: past working day with no record
                          const empHasAnyRecord = Object.keys(monthLogs[emp.id] || {}).length > 0;
                          const isAutoAbsent = !st && isPast && !isWeekend && !isHoliday;

                          const cellLabel = st === "leave"
                            ? (leaveType === "Sick Leave" ? "SL" : leaveType === "Weekly Off" ? "WO" : leaveType === "Unpaid" ? "UL" : "Le")
                            : (st ? STATUS_LABEL[st] : isAutoAbsent ? "A" : "—");
                          const cellClass = st === "leave" && leaveType
                            ? (leaveType === "Sick Leave" ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400"
                              : leaveType === "Weekly Off" ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-400")
                            : st ? STATUS_CELL[st]
                            : isAutoAbsent
                              // dimmer red if never checked in at all; normal absent red if at least one record exists
                              ? (empHasAnyRecord ? STATUS_CELL["absent"] : "bg-red-500/8 text-red-400/60")
                              : "bg-theme-raised/30 text-theme-subtle/20";
                          return (
                            <td key={d} className="px-0.5 py-1 text-center">
                              <div className={cn("mx-auto h-6 flex items-center justify-center rounded text-[9px] font-black transition-all", leaveType ? "w-9 px-1" : "w-7", cellClass)}>
                                {cellLabel}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── MONTHLY SUMMARY ── */}
          {tab === "summary" && (
            <div className="page-card p-0 overflow-hidden">
              <div className="border-b border-theme-border px-5 py-4 font-bold text-theme-fg flex justify-between items-center">
                <span>Monthly Performance Audit — {dayjs(selectedDate).format("MMMM YYYY")}</span>
                <Target size={14} className="text-theme-muted" />
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted font-semibold">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3 text-center">Present</th>
                  <th className="px-5 py-3 text-center">Late</th>
                  <th className="px-5 py-3 text-center">Absent</th>
                  <th className="px-5 py-3 text-right">Total Duration</th>
                </tr></thead>
                <tbody className="divide-y divide-theme-border">
                  {filtered.map(emp => {
                    const logs = Object.values(monthLogs[emp.id] || {});
                    const p = logs.filter(l => l.status === 'present').length;
                    const l = logs.filter(l => l.status === 'late').length;
                    const a = logs.filter(l => l.status === 'absent').length;
                    let totalMin = 0;
                    logs.forEach(log => {
                      if (log.clock_in && log.clock_out) {
                        totalMin += Math.abs(dayjs(`2000-01-01 ${log.clock_out}`).diff(dayjs(`2000-01-01 ${log.clock_in}`), 'm'));
                      }
                    });
                    return (
                      <tr key={emp.id} className="hover:bg-theme-raised/40 transition-colors">
                        <td className="px-5 py-3 font-semibold text-theme-fg">{emp.name}</td>
                        <td className="px-5 py-3 text-center font-semibold text-emerald-600">{p}</td>
                        <td className="px-5 py-3 text-center font-semibold text-amber-600">{l}</td>
                        <td className="px-5 py-3 text-center font-semibold text-red-500">{a}</td>
                        <td className="px-5 py-3 text-right font-medium tabular-nums">{Math.floor(totalMin / 60)} hr {totalMin % 60} min</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* ── LEAVE APPROVAL ── */}
          {tab === "leaves" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-base font-black text-theme-fg tracking-tight">Active Leave Protocols</h3>
                {userRole === "admin" && (
                  <Button onClick={() => setShowLeaveModal(true)} size="sm" className="rounded-xl font-bold bg-theme-primary text-white">
                    <Palmtree size={14} className="mr-2" /> Manual Entry
                  </Button>
                )}
              </div>

              <div className="page-card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border bg-theme-page text-left text-xs font-semibold text-theme-muted">
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Duration</th>
                      <th className="px-5 py-3">Reason</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border">
                    {leaves.length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-xs text-theme-muted">No pending protocols found.</td></tr>
                    ) : leaves.map(req => (
                      <tr key={req.id} className="hover:bg-theme-raised/30 transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-theme-fg">{req.employee?.name}</p>
                          <p className="text-xs text-theme-muted mt-0.5">{req.employee?.department}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold",
                            req.type === "Sick Leave" ? "bg-indigo-500/10 text-indigo-700" :
                            req.type === "Weekly Off" ? "bg-sky-500/10 text-sky-700" :
                            req.type === "Unpaid" ? "bg-amber-500/10 text-amber-700" :
                            "bg-theme-raised text-theme-muted"
                          )}>{req.type}</span>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-theme-fg">{dayjs(req.from_date).format("D MMM")} — {dayjs(req.to_date).format("D MMM")}</p>
                          <p className="text-xs text-theme-muted">{dayjs(req.to_date).diff(dayjs(req.from_date), 'day') + 1} Days</p>
                        </td>
                        <td className="px-5 py-3 text-sm text-theme-muted max-w-xs truncate">{req.reason || "—"}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {req.status.toLowerCase() === "pending" ? (
                              <>
                                <button onClick={() => handleLeaveStatus(req.id, "approved")} className="h-8 w-8 flex items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all"><CheckCircle2 size={14} /></button>
                                <button onClick={() => handleLeaveStatus(req.id, "rejected")} className="h-8 w-8 flex items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-all"><X size={14} /></button>
                              </>
                            ) : (
                              <Badge variant={req.status.toLowerCase() === "approved" ? "success" : "danger"}>{req.status.toUpperCase()}</Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Weekoff Change Requests Tab ─────────────────────────────── */}
          {tab === "weekoff_requests" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-black text-theme-fg tracking-tight">Weekoff Change Requests</h3>
                <button onClick={loadWeekoffRequests} className="text-xs text-theme-primary hover:underline">Refresh</button>
              </div>
              <div className="page-card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border bg-theme-page text-left text-xs font-semibold text-theme-muted">
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3">Original Date</th>
                      <th className="px-5 py-3">Requested Date</th>
                      <th className="px-5 py-3">Reason</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border">
                    {weekoffRequests.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-12 text-center text-xs text-theme-muted">No weekoff change requests.</td></tr>
                    ) : weekoffRequests.map(req => (
                      <tr key={req.id} className="hover:bg-theme-raised/30 transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-theme-fg">{req.employee?.name ?? "—"}</p>
                          <p className="text-xs text-theme-muted">{req.employee?.department ?? ""}</p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-theme-fg">{dayjs(req.original_date).format("DD MMM YYYY")}</p>
                          <p className="text-xs text-theme-muted">{dayjs(req.original_date).format("dddd")}</p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-emerald-600">{req.requested_date ? dayjs(req.requested_date).format("DD MMM YYYY") : "—"}</p>
                          <p className="text-xs text-theme-muted">{req.requested_date ? dayjs(req.requested_date).format("dddd") : ""}</p>
                        </td>
                        <td className="px-5 py-3 text-xs text-theme-muted max-w-xs">{req.reason}</td>
                        <td className="px-5 py-3">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold",
                            req.status === "pending"  ? "bg-amber-500/10 text-amber-700" :
                            req.status === "approved" ? "bg-emerald-500/10 text-emerald-700" :
                            "bg-red-500/10 text-red-700"
                          )}>{req.status}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {req.status === "pending" ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleWeekoffDecision(req.id, "approve")}
                                disabled={actionLoading2 === req.id + "approve"}
                                className="h-8 px-3 flex items-center gap-1 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white text-xs font-bold transition-all disabled:opacity-50">
                                <CheckCircle2 size={13} /> Approve
                              </button>
                              <button
                                onClick={() => handleWeekoffDecision(req.id, "reject")}
                                disabled={actionLoading2 === req.id + "reject"}
                                className="h-8 px-3 flex items-center gap-1 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white text-xs font-bold transition-all disabled:opacity-50">
                                <X size={13} /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-theme-muted">Decided by {req.decider?.name ?? "admin"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Sick Leave / Certificate Approvals Tab ───────────────────── */}
          {tab === "sick_certs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-black text-theme-fg tracking-tight">Sick Leave & Certificates</h3>
                <button onClick={loadSickCerts} className="text-xs text-theme-primary hover:underline">Refresh</button>
              </div>
              <div className="page-card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border bg-theme-page text-left text-xs font-semibold text-theme-muted">
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3">Period</th>
                      <th className="px-5 py-3">Reason</th>
                      <th className="px-5 py-3">Certificate</th>
                      <th className="px-5 py-3">Deadline</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border">
                    {sickCerts.length === 0 ? (
                      <tr><td colSpan={7} className="px-6 py-12 text-center text-xs text-theme-muted">No sick leaves found.</td></tr>
                    ) : sickCerts.map(sl => (
                      <tr key={sl.id} className={cn("hover:bg-theme-raised/30 transition-colors", sl.blocks_checkin && "bg-red-500/5")}>
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-theme-fg">{sl.employee?.name ?? "—"}</p>
                          <p className="text-xs text-theme-muted">{sl.employee?.department ?? ""}</p>
                          {sl.blocks_checkin && <span className="text-[9px] font-bold text-red-600 flex items-center gap-0.5 mt-0.5"><AlertTriangle size={9} /> Check-in blocked</span>}
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-theme-fg">{dayjs(sl.from_date).format("DD MMM")} – {dayjs(sl.to_date).format("DD MMM YYYY")}</p>
                          <p className="text-xs text-theme-muted">{sl.days} day(s)</p>
                        </td>
                        <td className="px-5 py-3 text-xs text-theme-muted max-w-[160px] truncate">{sl.reason}</td>
                        <td className="px-5 py-3">
                          {sl.certificate_url ? (
                            <a href={sl.certificate_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-theme-primary hover:underline">
                              <Link2 size={11} /> View <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span className="text-xs text-theme-subtle">Not submitted</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          <span className={cn(dayjs().isAfter(dayjs(sl.certificate_deadline)) && sl.cert_status === "pending" ? "text-red-600 font-bold" : "text-theme-muted")}>
                            {dayjs(sl.certificate_deadline).format("DD MMM YYYY")}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold",
                            sl.cert_status === "pending"   ? "bg-amber-500/10 text-amber-700" :
                            sl.cert_status === "submitted" ? "bg-indigo-500/10 text-indigo-700" :
                            sl.cert_status === "approved"  ? "bg-emerald-500/10 text-emerald-700" :
                            "bg-red-500/10 text-red-700"
                          )}>{sl.cert_status}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {sl.cert_status === "submitted" && sl.approval_required ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleSickCertDecision(sl.id, "approve")}
                                disabled={actionLoading2 === sl.id + "approve"}
                                className="h-8 px-3 flex items-center gap-1 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white text-xs font-bold transition-all disabled:opacity-50">
                                <FileCheck2 size={13} /> Approve
                              </button>
                              <button
                                onClick={() => handleSickCertDecision(sl.id, "reject")}
                                disabled={actionLoading2 === sl.id + "reject"}
                                className="h-8 px-3 flex items-center gap-1 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white text-xs font-bold transition-all disabled:opacity-50">
                                <X size={13} /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-theme-muted">
                              {sl.cert_status === "approved" ? `✓ ${sl.decider?.name ?? "admin"}` : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "holidays" && (
            <div className="enterprise-card bg-theme-surface p-0 overflow-hidden flex flex-col border border-theme-border shadow-xl h-[650px]">
              <div className="p-4 border-b border-theme-border flex items-center justify-between bg-theme-page/50">
                <div className="flex items-center gap-4">
                  {/* Custom Month Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowMonthSelect(!showMonthSelect); setShowYearSelect(false); }}
                      className="flex items-center gap-2 text-xl font-black text-theme-fg tracking-tight hover:text-theme-primary transition-colors"
                    >
                      {dayjs(selectedDate).format('MMMM')}
                      <ChevronDown size={16} className="text-theme-subtle" />
                    </button>
                    {showMonthSelect && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowMonthSelect(false)} />
                        <div className="absolute top-full left-0 mt-2 w-48 bg-theme-surface border border-theme-border rounded-xl shadow-2xl z-50 p-2 grid grid-cols-2 gap-1 animate-in slide-in-from-top-2">
                          {Array.from({ length: 12 }).map((_, i) => (
                            <button
                              key={i}
                              onClick={() => { setSelectedDate(dayjs(selectedDate).month(i).format('YYYY-MM-DD')); setShowMonthSelect(false); }}
                              className={cn(
                                "text-left px-3 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all",
                                dayjs(selectedDate).month() === i ? "bg-theme-primary text-white" : "text-theme-fg hover:bg-theme-raised"
                              )}
                            >
                              {dayjs().month(i).format('MMM')}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Custom Year Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowYearSelect(!showYearSelect); setShowMonthSelect(false); }}
                      className="flex items-center gap-2 text-xl font-black text-theme-fg tracking-tight hover:text-theme-primary transition-colors"
                    >
                      {dayjs(selectedDate).year()}
                      <ChevronDown size={16} className="text-theme-subtle" />
                    </button>
                    {showYearSelect && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowYearSelect(false)} />
                        <div className="absolute top-full left-0 mt-2 w-32 bg-theme-surface border border-theme-border rounded-xl shadow-2xl z-50 p-2 flex flex-col gap-1 animate-in slide-in-from-top-2">
                          {Array.from({ length: 7 }).map((_, i) => {
                            const yr = dayjs().year() - 3 + i;
                            return (
                              <button
                                key={yr}
                                onClick={() => { setSelectedDate(dayjs(selectedDate).year(yr).format('YYYY-MM-DD')); setShowYearSelect(false); }}
                                className={cn(
                                  "text-left px-3 py-2 text-xs font-bold rounded-lg transition-all text-center",
                                  dayjs(selectedDate).year() === yr ? "bg-theme-primary text-white" : "text-theme-fg hover:bg-theme-raised"
                                )}
                              >
                                {yr}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {userRole === "admin" && (
                    <button
                      onClick={() => {
                        const today = dayjs().format('YYYY-MM-DD');
                        setHolidayDate(today);
                        setHolidayForm({ title: "", description: "", type: "public", color: "#ef4444", is_half_day: false, start_time: "09:00:00", end_time: "13:00:00" });
                        setShowHolidayModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-theme-primary text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-theme-primary/90 transition-all shadow-md shadow-theme-primary/25"
                    >
                      <CalendarDays size={13} />
                      Add Holiday
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 p-1 bg-theme-surface border border-theme-border rounded-2xl shadow-sm">
                    <button
                      onClick={() => setSelectedDate(dayjs(selectedDate).subtract(1, 'month').format('YYYY-MM-DD'))}
                      className="p-2.5 hover:bg-theme-raised rounded-xl transition-all text-theme-subtle hover:text-theme-primary"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => setSelectedDate(dayjs().format('YYYY-MM-DD'))}
                      className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-theme-muted hover:text-theme-primary hover:bg-theme-raised rounded-xl transition-all"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setSelectedDate(dayjs(selectedDate).add(1, 'month').format('YYYY-MM-DD'))}
                      className="p-2.5 hover:bg-theme-raised rounded-xl transition-all text-theme-subtle hover:text-theme-primary"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-theme-page">
                <div className="grid grid-cols-7 border-b border-theme-border bg-theme-surface">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-theme-muted">{day}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 flex-1 auto-rows-[1fr]">
                  {Array.from({ length: dayjs(selectedDate).startOf('month').day() }).map((_, i) => <div key={`empty-${i}`} className="border-r border-b border-theme-border bg-theme-surface/30 min-h-[60px]" />)}

                  {Array.from({ length: dayjs(selectedDate).daysInMonth() }).map((_, i) => {
                    const dNum = i + 1;
                    const dateStr = dayjs(selectedDate).date(dNum).format('YYYY-MM-DD');
                    const holi = holidays[dateStr];
                    const isToday = dateStr === dayjs().format('YYYY-MM-DD');
                    const isSelected = dateStr === selectedDate;

                    return (
                      <div
                        key={dateStr}
                        onClick={() => {
                          setSelectedDate(dateStr);
                          setHolidayDate(dateStr);
                          setHolidayForm({
                            title: holi?.title || "",
                            description: holi?.description || "",
                            type: holi?.type || "public",
                            color: holi?.color || "#ef4444",
                            is_half_day: holi?.is_half_day || false,
                            start_time: holi?.start_time || "09:00:00",
                            end_time: holi?.end_time || "13:00:00"
                          });
                          if (userRole === "admin") setShowHolidayModal(true);
                        }}
                        className={cn(
                          "relative border-r border-b border-theme-border p-1.5 transition-all min-h-[80px] flex flex-col group overflow-visible cursor-pointer",
                          isSelected ? "bg-theme-raised" : "bg-theme-surface/50 hover:bg-theme-raised/40",
                          isToday ? "ring-2 ring-inset ring-theme-primary" : ""
                        )}
                      >
                        <div className="flex justify-between items-start mb-0.5 z-10">
                          <span className={cn(
                            "text-xs font-black w-6 h-6 flex items-center justify-center rounded-full transition-colors",
                            isToday ? "bg-theme-primary text-white" :
                              isSelected ? "bg-theme-fg text-theme-surface" : "text-theme-fg/90 group-hover:text-theme-primary group-hover:bg-theme-primary/10"
                          )}>
                            {dNum}
                          </span>
                        </div>
                        {holi && (
                          <div className="mt-auto space-y-1 rounded px-1.5 py-1 mb-1 shadow-sm relative group/holi z-20" style={{ backgroundColor: `${holi.color}20`, borderLeft: `3px solid ${holi.color}` }}>
                            <span className="block text-[9px] font-black uppercase tracking-widest truncate" style={{ color: holi.color }}>{holi.title}</span>
                            {holi.is_half_day && <span className="block text-[9px] font-bold tabular-nums opacity-100" style={{ color: holi.color }}>{dayjs(`2000-01-01 ${holi.start_time}`).format('HH:mm')} - {dayjs(`2000-01-01 ${holi.end_time}`).format('HH:mm')}</span>}

                            {/* Hover Tooltip Popup */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-theme-surface border border-theme-border rounded-xl shadow-2xl p-4 opacity-0 pointer-events-none group-hover/holi:opacity-100 transition-all duration-200 z-[100] transform scale-95 group-hover/holi:scale-100">
                              <h4 className="text-sm font-black uppercase tracking-widest mb-1.5 border-b border-theme-border pb-1.5" style={{ color: holi.color }}>{holi.title}</h4>
                              {holi.description && <p className="text-[12px] text-theme-subtle mb-3 leading-relaxed font-medium">{holi.description}</p>}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-black px-2 py-1 rounded bg-theme-raised text-theme-fg uppercase tracking-wider">{holi.type}</span>
                                {holi.is_half_day ? (
                                  <span className="text-[10px] font-black px-2 py-1 rounded bg-theme-raised text-theme-fg uppercase tracking-wider tabular-nums">{dayjs(`2000-01-01 ${holi.start_time}`).format('HH:mm')} - {dayjs(`2000-01-01 ${holi.end_time}`).format('HH:mm')}</span>
                                ) : (
                                  <span className="text-[10px] font-black px-2 py-1 rounded bg-theme-raised text-theme-fg uppercase tracking-wider">Full Day</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── TIMING PROTOCOLS ── */}
          {tab === "protocols" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-base font-black text-theme-fg tracking-tight">Timing Protocols</h3>
                {userRole === "admin" && (
                  <Button onClick={() => setShowProtocolModal(true)} size="sm" className="rounded-xl font-bold bg-theme-primary text-white">
                    <AlarmClock size={14} className="mr-2" /> New Protocol
                  </Button>
                )}
              </div>
              
              <div className="page-card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border bg-theme-page text-left text-xs font-semibold text-theme-muted">
                      <th className="px-5 py-3">Protocol Title</th>
                      <th className="px-5 py-3">Timing Setup</th>
                      <th className="px-5 py-3">Target Scope</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border">
                    {protocols.length === 0 ? (
                      <tr><td colSpan={4} className="px-6 py-12 text-center text-xs text-theme-muted">No timing protocols found.</td></tr>
                    ) : protocols.map(p => (
                      <tr key={p.id} className="hover:bg-theme-raised/30 transition-colors">
                        <td className="px-5 py-3">
                           <p className="text-sm font-semibold text-theme-fg">{p.title}</p>
                           <p className="text-xs text-theme-muted mt-0.5">{p.days?.length} Days/Week</p>
                        </td>
                        <td className="px-5 py-3">
                           <div className="flex items-center gap-2">
                             <Badge variant="default" className="tabular-nums text-[10px] uppercase">{dayjs(`2000-01-01 ${p.check_in_time}`).format("hh:mm A")}</Badge>
                             <span className="text-theme-subtle">to</span>
                             <Badge variant="default" className="tabular-nums text-[10px] uppercase">{dayjs(`2000-01-01 ${p.check_out_time}`).format("hh:mm A")}</Badge>
                           </div>
                        </td>
                        <td className="px-5 py-3 text-xs font-semibold text-theme-fg">{p.type}</td>
                        <td className="px-5 py-3 text-right">
                           <button onClick={async () => {
                             if(confirm("Delete this protocol?")) {
                               await supabase.from("attendance_protocols").delete().eq("id", p.id);
                               loadProtocols();
                             }
                           }} className="p-1.5 rounded-lg bg-rose-50 text-rose-400 hover:text-rose-600 transition-all inline-flex">
                             <X size={13} />
                           </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DashboardShell>

      <div className={cn(
        "fixed inset-0 z-[10000] flex justify-end bg-black/40 backdrop-blur-[2px] transition-all duration-1000 ease-in-out",
        showHolidayModal ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}>
        {/* Backdrop Click */}
        <div className="absolute inset-0 cursor-pointer" onClick={() => setShowHolidayModal(false)} />

        <div
          className={cn(
            "w-full max-w-md bg-theme-surface h-full shadow-2xl border-l border-theme-border relative flex flex-col transition-all duration-1000 ease-in-out"
          )}
          style={{
            transform: showHolidayModal ? 'translateX(0) rotateY(0) scale(1)' : 'translateX(100%) rotateY(-15deg) scale(0.95)',
            transformOrigin: 'right center',
            perspective: '2000px',
            opacity: showHolidayModal ? 1 : 0
          }}
        >
          <div className="p-6 border-b border-theme-border flex items-center justify-between bg-theme-surface">
            <div>
              <h3 className="text-xl font-black text-theme-fg tracking-tight">
                {holidays[holidayDate] ? "Edit Holiday" : "New Holiday"}
              </h3>
              <p className="text-xs text-theme-muted font-medium mt-1">
                {holidays[holidayDate]
                  ? `Editing: ${dayjs(holidayDate).format('DD MMMM, YYYY')}`
                  : `Setting holiday for ${dayjs(holidayDate).format('DD MMMM, YYYY')}`
                }
              </p>
            </div>
            <button onClick={() => setShowHolidayModal(false)} className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-theme-raised transition-all text-theme-muted hover:text-theme-fg border border-theme-border">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="space-y-4">
              <div className="p-4 bg-theme-page/50 border border-theme-border rounded-2xl">
                <label className="block text-[10px] font-black text-theme-muted uppercase tracking-widest mb-2">Selected Date</label>
                <div className="flex items-center gap-3 text-theme-fg">
                  <CalendarDays size={18} className="text-theme-primary" />
                  <span className="text-lg font-bold">{dayjs(holidayDate).format('DD MMMM, YYYY')}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-theme-muted uppercase tracking-widest mb-2">Event Title</label>
                <input
                  type="text"
                  value={holidayForm.title}
                  onChange={e => setHolidayForm({ ...holidayForm, title: e.target.value })}
                  placeholder="e.g. Christmas Day"
                  className="w-full h-12 bg-theme-page border border-theme-border rounded-xl px-4 text-sm font-bold text-theme-fg outline-none focus:border-theme-primary focus:ring-4 focus:ring-theme-primary/10 transition-all shadow-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-theme-muted uppercase tracking-widest mb-2">Description</label>
                <textarea
                  value={holidayForm.description}
                  onChange={e => setHolidayForm({ ...holidayForm, description: e.target.value })}
                  placeholder="Enter holiday details or reason..."
                  className="w-full h-28 p-4 bg-theme-page border border-theme-border rounded-xl text-sm font-medium text-theme-fg outline-none focus:border-theme-primary focus:ring-4 focus:ring-theme-primary/10 resize-none transition-all shadow-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-theme-muted uppercase tracking-widest mb-2">Category</label>
                  <div className="hidden">
                    <Select value={holidayForm.type} onValueChange={(v) => setHolidayForm({ ...holidayForm, type: v })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="government">Government Holiday</SelectItem>
                        <SelectItem value="public">Public Holiday</SelectItem>
                        <SelectItem value="company">Company Holiday</SelectItem>
                        <SelectItem value="restricted">Restricted Holiday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                      className="w-full h-12 bg-theme-page border border-theme-border rounded-xl px-4 flex items-center justify-between group hover:border-theme-primary transition-all shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        {(() => {
                          const cat = [
                            { id: 'government', label: 'Government Holiday', icon: Landmark, color: 'text-amber-500' },
                            { id: 'public', label: 'Public Holiday', icon: Users, color: 'text-blue-500' },
                            { id: 'company', label: 'Company Holiday', icon: Building2, color: 'text-emerald-500' },
                            { id: 'restricted', label: 'Restricted Holiday', icon: ShieldAlert, color: 'text-rose-500' },
                          ].find(c => c.id === holidayForm.type) || { label: 'Select Category', icon: List, color: 'text-theme-muted' };
                          const Icon = cat.icon;
                          return (
                            <>
                              <div className={cn("p-1.5 rounded-lg bg-theme-surface border border-theme-border group-hover:border-theme-primary/30 transition-colors", cat.color)}>
                                <Icon size={14} />
                              </div>
                              <span className="text-sm font-bold text-theme-fg">{cat.label}</span>
                            </>
                          );
                        })()}
                      </div>
                      <ChevronDown size={14} className={cn("text-theme-muted transition-transform duration-300", showCategoryDropdown ? "rotate-180" : "")} />
                    </button>

                    {showCategoryDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowCategoryDropdown(false)} />
                        <div className="absolute top-full left-0 right-0 mt-2 bg-theme-surface border border-theme-border rounded-2xl shadow-2xl z-50 p-2 space-y-1 animate-in slide-in-from-top-2 duration-200">
                          {[
                            { id: 'government', label: 'Government Holiday', icon: Landmark, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                            { id: 'public', label: 'Public Holiday', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                            { id: 'company', label: 'Company Holiday', icon: Building2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                            { id: 'restricted', label: 'Restricted Holiday', icon: ShieldAlert, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                          ].map(cat => {
                            const Icon = cat.icon;
                            const isSelected = holidayForm.type === cat.id;
                            return (
                              <button
                                key={cat.id}
                                onClick={() => {
                                  setHolidayForm({ ...holidayForm, type: cat.id });
                                  setShowCategoryDropdown(false);
                                }}
                                className={cn(
                                  "w-full flex items-center justify-between p-2.5 rounded-xl transition-all group/opt",
                                  isSelected ? "bg-theme-primary text-white shadow-lg shadow-theme-primary/20" : "hover:bg-theme-page text-theme-fg"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn("p-2 rounded-lg transition-colors", isSelected ? "bg-white/20" : cn("bg-theme-surface border border-theme-border group-hover/opt:border-theme-primary/30", cat.color))}>
                                    <Icon size={16} />
                                  </div>
                                  <span className={cn("text-xs font-bold", isSelected ? "text-white" : "text-theme-fg")}>{cat.label}</span>
                                </div>
                                {isSelected && <Check size={14} />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-theme-muted uppercase tracking-widest mb-2">UI Accent</label>
                  <div className="flex gap-2 p-1 bg-theme-page border border-theme-border rounded-xl h-12">
                    <input
                      type="color"
                      value={holidayForm.color}
                      onChange={e => setHolidayForm({ ...holidayForm, color: e.target.value })}
                      className="flex-1 h-full rounded-lg cursor-pointer bg-transparent border-none p-0"
                    />
                    <div className="w-10 h-full rounded-lg" style={{ backgroundColor: holidayForm.color }} />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-theme-page/30 border border-theme-border rounded-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all", holidayForm.is_half_day ? "bg-theme-primary text-white" : "bg-theme-raised text-theme-muted")}>
                      <Clock size={20} />
                    </div>
                    <div>
                      <span className="block text-xs font-black text-theme-fg uppercase tracking-widest">Half Day Session</span>
                      <span className="text-[10px] text-theme-muted font-medium">Toggle for specific timing</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    id="hd"
                    checked={holidayForm.is_half_day}
                    onChange={e => setHolidayForm({ ...holidayForm, is_half_day: e.target.checked })}
                    className="w-6 h-6 rounded-lg bg-theme-page border-theme-border text-theme-primary focus:ring-offset-0 focus:ring-0 cursor-pointer"
                  />
                </div>

                {holidayForm.is_half_day && (
                  <div className="grid grid-cols-2 gap-4 mt-4 animate-in slide-in-from-top-2 duration-300">
                    <div>
                      <label className="block text-[10px] font-black text-theme-muted uppercase tracking-widest mb-2">Starts At</label>
                      <input type="time" value={holidayForm.start_time} onChange={e => setHolidayForm({ ...holidayForm, start_time: e.target.value })} className="w-full h-11 bg-theme-page border border-theme-border rounded-xl px-4 text-sm font-bold text-theme-fg outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-theme-muted uppercase tracking-widest mb-2">Ends At</label>
                      <input type="time" value={holidayForm.end_time} onChange={e => setHolidayForm({ ...holidayForm, end_time: e.target.value })} className="w-full h-11 bg-theme-page border border-theme-border rounded-xl px-4 text-sm font-bold text-theme-fg outline-none" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 bg-theme-surface border-t border-theme-border flex items-center justify-between gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
            {holidays[holidayDate] ? (
              <button onClick={async () => {
                if (confirm("Permanently delete this holiday from calendar?")) {
                  await supabase.from("system_holidays").delete().eq("date", holidayDate);
                  setShowHolidayModal(false); loadHolidays();
                }
              }} className="px-5 py-3 text-sm font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-red-200/40 hover:border-red-300/60">
                Delete
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowHolidayModal(false)} className="px-6 py-3 text-sm font-black uppercase tracking-widest text-theme-muted hover:text-theme-fg transition-all">Cancel</button>
              <Button onClick={handleHolidaySubmit} className="px-8 h-12 bg-theme-primary text-white shadow-lg shadow-theme-primary/25 rounded-xl font-black uppercase tracking-widest text-[11px]">
                {holidays[holidayDate] ? "Update Holiday" : "Publish Holiday"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* MANUAL LEAVE MODAL */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-theme-surface rounded-2xl shadow-2xl overflow-hidden border border-theme-border animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-theme-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-theme-fg">Manual Leave Entry</h3>
              <button onClick={() => setShowLeaveModal(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-theme-raised transition-colors text-theme-muted hover:text-theme-fg">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1.5">Select Employee</label>
                <Select value={leaveForm.empId || undefined} onValueChange={(v) => setLeaveForm({ ...leaveForm, empId: v })}>
                  <SelectTrigger className="w-full h-11"><SelectValue placeholder="Choose Employee..." /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.employee_id})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-theme-muted mb-1.5">From Date</label>
                  <input type="date" value={leaveForm.from} onChange={(e) => setLeaveForm({ ...leaveForm, from: e.target.value })} className="w-full h-11 bg-theme-page border border-theme-border rounded-xl px-4 text-sm font-medium text-theme-fg outline-none shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-theme-muted mb-1.5">To Date</label>
                  <input type="date" value={leaveForm.to} onChange={(e) => setLeaveForm({ ...leaveForm, to: e.target.value })} className="w-full h-11 bg-theme-page border border-theme-border rounded-xl px-4 text-sm font-medium text-theme-fg outline-none shadow-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1.5">Leave Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {['sick', 'casual', 'earned', 'unpaid'].map(t => (
                    <button key={t} onClick={() => setLeaveForm({ ...leaveForm, type: t })} className={cn("h-10 text-xs font-semibold capitalize rounded-lg border transition-all", leaveForm.type === t ? "bg-theme-primary text-theme-surface border-theme-primary" : "bg-theme-page text-theme-muted border-theme-border hover:bg-theme-raised")}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1.5">Reason (Optional)</label>
                <textarea value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="w-full h-24 p-4 bg-theme-page border border-theme-border rounded-xl text-sm font-medium text-theme-fg outline-none focus:border-theme-primary resize-none shadow-sm" />
              </div>
            </div>

            <div className="p-6 bg-theme-page border-t border-theme-border flex items-center justify-end gap-3">
              <button onClick={() => setShowLeaveModal(false)} className="px-6 py-2.5 text-sm font-semibold text-theme-muted hover:text-theme-fg rounded-lg transition-colors">Cancel</button>
              <Button onClick={handleManualLeave}>Apply Protocol</Button>
            </div>
          </div>
        </div>
      )}

    {/* TIMING PROTOCOL MODAL */}
      {showProtocolModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
           <div className="w-full max-w-lg bg-theme-surface rounded-2xl shadow-2xl overflow-hidden border border-theme-border animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-theme-border flex items-center justify-between">
                 <div>
                   <h3 className="text-lg font-black text-theme-fg">Timing Protocol</h3>
                   <p className="text-[10px] font-bold text-theme-muted uppercase tracking-widest mt-1">Configure automated shift rules</p>
                 </div>
                 <button onClick={() => setShowProtocolModal(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-theme-raised transition-colors text-theme-muted hover:text-theme-fg">
                    <X size={18} />
                 </button>
              </div>
              
              <div className="p-6 space-y-5">
                 <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-theme-muted mb-2">Protocol Title</label>
                    <input 
                      type="text" 
                      value={protocolForm.title}
                      onChange={(e) => setProtocolForm({...protocolForm, title: e.target.value})}
                      placeholder="e.g. General Shift, Night Shift..."
                      className="w-full h-11 bg-theme-page border border-theme-border rounded-xl px-4 text-sm font-bold text-theme-fg outline-none focus:border-theme-primary transition-all shadow-sm" 
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-xs font-black uppercase tracking-widest text-theme-muted mb-2">Check-in Time</label>
                       <input 
                         type="time" 
                         value={protocolForm.check_in_time}
                         onChange={(e) => setProtocolForm({...protocolForm, check_in_time: e.target.value})}
                         className="w-full h-11 bg-theme-page border border-theme-border rounded-xl px-4 text-sm font-bold text-theme-fg outline-none shadow-sm" 
                       />
                    </div>
                    <div>
                       <label className="block text-xs font-black uppercase tracking-widest text-theme-muted mb-2">Check-out Time</label>
                       <input 
                         type="time" 
                         value={protocolForm.check_out_time}
                         onChange={(e) => setProtocolForm({...protocolForm, check_out_time: e.target.value})}
                         className="w-full h-11 bg-theme-page border border-theme-border rounded-xl px-4 text-sm font-bold text-theme-fg outline-none shadow-sm" 
                       />
                    </div>
                 </div>

                 <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-theme-muted mb-2">Target Scope</label>
                    <Select value={protocolForm.type} onValueChange={(v) => setProtocolForm({...protocolForm, type: v})}>
                      <SelectTrigger className="w-full h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">Global - All Employees</SelectItem>
                        {depts.filter(d => d !== "All").map(d => <SelectItem key={d} value={`Department:${d}`}>{d} Department</SelectItem>)}
                      </SelectContent>
                    </Select>
                 </div>

                 <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-theme-muted mb-2">Active Days</label>
                    <div className="flex flex-wrap gap-2">
                       {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                         const isActive = protocolForm.days.includes(day);
                         return (
                           <button 
                             key={day}
                             onClick={() => {
                               const newDays = isActive 
                                 ? protocolForm.days.filter(d => d !== day)
                                 : [...protocolForm.days, day];
                               setProtocolForm({...protocolForm, days: newDays});
                             }}
                             className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all border", 
                               isActive ? "bg-theme-primary text-white border-theme-primary shadow-sm" : "bg-theme-page text-theme-muted border-theme-border hover:bg-theme-raised"
                             )}
                           >
                             {day}
                           </button>
                         )
                       })}
                    </div>
                 </div>
              </div>

              <div className="p-6 bg-theme-page border-t border-theme-border flex items-center justify-end gap-3">
                 <button onClick={() => setShowProtocolModal(false)} className="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-theme-muted hover:text-theme-fg rounded-lg transition-colors">Cancel</button>
                 <Button onClick={handleProtocolSubmit} className="text-[11px] font-black uppercase tracking-widest px-6 h-10 shadow-lg shadow-theme-primary/20">Establish Protocol</Button>
              </div>
           </div>
        </div>
      )}

      {/* ADMIN OVERRIDE MODAL */}
      {showOverride && targetEmp && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-2xl bg-theme-surface rounded-2xl shadow-2xl overflow-hidden border border-theme-border animate-in zoom-in-95 duration-200">
            <div className="p-7 border-b border-theme-border flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 flex items-center justify-center bg-gradient-to-br from-theme-primary to-theme-primary/80 text-theme-surface rounded-full font-bold text-base">
                  {getInitials(targetEmp.name)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-theme-fg">{targetEmp.name}</h3>
                  <p className="text-xs text-theme-muted font-medium">{targetEmp.employee_id} • {targetEmp.designation}</p>
                </div>
              </div>
              <button onClick={() => setShowOverride(false)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-theme-raised transition-colors text-theme-muted hover:text-theme-fg">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-7">
              {/* Time Pickers - Full Width */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-theme-fg mb-3">Clock In</label>
                  <TimePicker
                    value={overrideForm.clock_in}
                    onChange={(time) => setOverrideForm({ ...overrideForm, clock_in: time })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-theme-fg mb-3">Clock Out</label>
                  <TimePicker
                    value={overrideForm.clock_out}
                    onChange={(time) => setOverrideForm({ ...overrideForm, clock_out: time })}
                  />
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-theme-border to-transparent"></div>

              <div>
                <label className="block text-sm font-semibold text-theme-fg mb-4">Attendance Status</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['present', 'late', 'absent', 'on_duty', 'half_day', 'leave'] as AttStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setOverrideForm({ ...overrideForm, status: s })}
                      className={cn(
                        "h-11 text-xs font-bold capitalize rounded-lg border transition-all",
                        overrideForm.status === s
                          ? "bg-theme-primary text-theme-surface border-theme-primary shadow-md"
                          : "bg-theme-page text-theme-muted border-theme-border hover:bg-theme-raised hover:border-theme-primary/50"
                      )}
                    >
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-theme-fg mb-3">Reason for Override</label>
                <textarea
                  placeholder="e.g. Forgot to sign in, System downtime, Technical issue..."
                  value={overrideForm.reason}
                  onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                  className="w-full h-28 p-4 bg-theme-page border border-theme-border rounded-xl text-sm font-medium text-theme-fg outline-none focus:border-theme-primary focus:ring-2 focus:ring-theme-primary/20 transition-all resize-none shadow-sm"
                />
              </div>
            </div>

            <div className="p-7 bg-theme-page border-t border-theme-border flex items-center justify-end gap-3">
              <button
                onClick={() => setShowOverride(false)}
                className="px-7 py-3 text-sm font-semibold text-theme-muted hover:text-theme-fg hover:bg-theme-raised rounded-lg transition-colors"
              >
                Cancel
              </button>
              <Button
                onClick={handleAdminOverride}
                disabled={checking}
              >
                {checking ? "Applying..." : "Confirm Override"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-theme-surface w-full max-w-lg rounded-[2rem] shadow-2xl border border-theme-border overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-7 border-b border-theme-border bg-gradient-to-br from-theme-surface to-theme-page/30">
              <div className="flex items-center justify-between mb-5">
                <div className="h-12 w-12 flex items-center justify-center bg-theme-primary/10 text-theme-primary rounded-2xl">
                  <Settings size={24} />
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-theme-raised transition-colors text-theme-muted hover:text-theme-fg">
                  <X size={20} />
                </button>
              </div>
              <h3 className="text-2xl font-black text-theme-fg tracking-tight">Attendance Controls</h3>
              <p className="text-sm text-theme-muted font-medium mt-1">Configure global attendance rules and protocols.</p>
            </div>

            <div className="p-6 space-y-5 max-h-[62vh] overflow-y-auto">

              {/* Holidays */}
              <SettingToggle
                icon={Palmtree}
                label="Holidays as Paid Leave"
                sub="Government holidays are automatically paid."
                value={attSettings.holiday_is_paid_leave}
                onToggle={() => setSetting("holiday_is_paid_leave", !attSettings.holiday_is_paid_leave)}
              />

              {/* Weekly Off Policy */}
              <div className="rounded-2xl border border-theme-border bg-theme-page p-4 space-y-3.5">
                <div className="flex items-center gap-2">
                  <CalendarRange size={16} className="text-theme-primary" />
                  <h4 className="text-[13px] font-black text-theme-fg uppercase tracking-wide">Weekly Off Policy</h4>
                </div>

                {/* Mode radios — selecting one reveals its conditions below */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: "flexible",      t: "Flexible quota", d: "Employees pre-allot N offs/month" },
                    { v: "fixed_weekend", t: "Fixed weekend",  d: "Chosen days auto-off for everyone" },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setSetting("weekoff_mode", opt.v)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all",
                        attSettings.weekoff_mode === opt.v
                          ? "border-theme-primary bg-theme-primary/5 ring-1 ring-theme-primary/30"
                          : "border-theme-border hover:border-theme-primary/40"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0", attSettings.weekoff_mode === opt.v ? "border-theme-primary" : "border-theme-border")}>
                          {attSettings.weekoff_mode === opt.v && <span className="h-2 w-2 rounded-full bg-theme-primary" />}
                        </span>
                        <span className="text-[13px] font-bold text-theme-fg">{opt.t}</span>
                      </div>
                      <p className="text-[10px] text-theme-muted mt-1 leading-snug">{opt.d}</p>
                    </button>
                  ))}
                </div>

                {/* Flexible-mode conditions */}
                {attSettings.weekoff_mode === "flexible" && (
                  <div className="space-y-2.5 pt-1">
                    <SettingNumber icon={CalendarRange} label="Weekly offs per month" value={attSettings.weekoffs_per_month} min={0} max={10} onChange={(v: number) => setSetting("weekoffs_per_month", v)} />
                    <SettingNumber icon={Coffee} label="Max off-days per week" value={attSettings.max_weekoffs_per_week} min={1} max={2} onChange={(v: number) => setSetting("max_weekoffs_per_week", v)} />
                    <SettingNumber icon={RotateCcw} label="Recycle day" sub="Day of month balances reset fresh." value={attSettings.recycle_day} min={1} max={28} onChange={(v: number) => setSetting("recycle_day", v)} />
                    <SettingNumber icon={AlarmClock} label="Lock day" sub="Pre-allotment deadline (day of month)." value={attSettings.lock_day} min={1} max={28} onChange={(v: number) => setSetting("lock_day", v)} />
                    <SettingToggle icon={RotateCcw} label="Carry forward unused off" sub="Unused week-1 off → week-2, week-3 → week-4 (paired)." value={attSettings.weekoff_carry_forward} onToggle={() => setSetting("weekoff_carry_forward", !attSettings.weekoff_carry_forward)} />
                    <SettingToggle icon={CalendarDays} label="Auto-assign Sundays after lock" sub="If an employee never pre-allots, every Sunday becomes their off." value={attSettings.auto_assign_sundays} onToggle={() => setSetting("auto_assign_sundays", !attSettings.auto_assign_sundays)} />
                  </div>
                )}

                {/* Fixed-weekend-mode conditions */}
                {attSettings.weekoff_mode === "fixed_weekend" && (
                  <div className="pt-1">
                    <p className="text-[11px] text-theme-muted mb-2 font-medium">Days marked as weekly off for everyone:</p>
                    <div className="flex flex-wrap gap-2">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => {
                        const on = (attSettings.fixed_weekend_days || []).includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              const cur: string[] = attSettings.fixed_weekend_days || [];
                              setSetting("fixed_weekend_days", on ? cur.filter((x) => x !== d) : [...cur, d]);
                            }}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border transition-all", on ? "bg-theme-primary text-theme-surface border-theme-primary" : "border-theme-border text-theme-muted hover:border-theme-primary/40")}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Sick Leave Policy */}
              <div className="rounded-2xl border border-theme-border bg-theme-page p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Coffee size={16} className="text-theme-primary" />
                  <h4 className="text-[13px] font-black text-theme-fg uppercase tracking-wide">Sick Leave Policy</h4>
                </div>
                <SettingNumber label="Selectable days forward (today + N)" value={attSettings.sick_leave_forward_days} min={0} max={30} onChange={(v: number) => setSetting("sick_leave_forward_days", v)} />
                <SettingNumber label="Selectable days backward (today − N)" value={attSettings.sick_leave_backward_days} min={0} max={30} onChange={(v: number) => setSetting("sick_leave_backward_days", v)} />
                <SettingNumber label="Certificate deadline (days after leave)" value={attSettings.certificate_deadline_days} min={1} max={60} onChange={(v: number) => setSetting("certificate_deadline_days", v)} />
                <SettingToggle label="Require approval for late certificate" sub="If on, a late certificate needs head approval before check-in is unblocked." value={attSettings.require_cert_approval} onToggle={() => setSetting("require_cert_approval", !attSettings.require_cert_approval)} />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex gap-2">
                <Target size={14} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] font-medium text-amber-700/80 leading-relaxed">
                  Changes sync in real-time across all employee and lead dashboards.
                </p>
              </div>
            </div>

            <div className="p-6 bg-theme-page border-t border-theme-border flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowSettingsModal(false)} className="px-6 rounded-xl font-bold">Cancel</Button>
              <Button onClick={saveSettings} disabled={savingSettings} className="px-8 rounded-xl font-bold">
                {savingSettings ? "Saving…" : "Save Settings"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Reusable settings controls (Attendance Controls modal) ───────────────────
function SettingNumber({ icon: Icon, label, sub, value, min, max, onChange }: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  label: string; sub?: string; value: number; min?: number; max?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-theme-border bg-theme-surface">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && <Icon size={15} className="text-theme-muted shrink-0" />}
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-theme-fg leading-tight">{label}</p>
          {sub && <p className="text-[10px] text-theme-muted mt-0.5 leading-snug">{sub}</p>}
        </div>
      </div>
      <input
        type="number"
        value={value ?? 0}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min ?? 0, Math.min(max ?? 999, parseInt(e.target.value) || 0)))}
        className="w-16 shrink-0 rounded-lg border border-theme-border bg-theme-page px-2 py-1.5 text-sm font-bold text-theme-fg text-center"
      />
    </div>
  );
}

function SettingToggle({ icon: Icon, label, sub, value, onToggle }: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  label: string; sub?: string; value: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-theme-border bg-theme-surface cursor-pointer" onClick={onToggle}>
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && <Icon size={15} className={cn("shrink-0", value ? "text-emerald-500" : "text-theme-muted")} />}
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-theme-fg leading-tight">{label}</p>
          {sub && <p className="text-[10px] text-theme-muted mt-0.5 leading-snug">{sub}</p>}
        </div>
      </div>
      <div className={cn("w-11 h-6 rounded-full relative transition-all shrink-0", value ? "bg-emerald-500" : "bg-theme-border")}>
        <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm", value ? "left-6" : "left-1")} />
      </div>
    </div>
  );
}
