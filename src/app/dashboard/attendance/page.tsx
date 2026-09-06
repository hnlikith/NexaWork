"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarDays, Clock, Play, Square, ChevronLeft, ChevronRight,
  ChevronDown, UserCheck, Timer, X, RotateCcw, ListFilter,
  CheckCircle2, AlertCircle, AlertTriangle, Link2, Send,
  CalendarClock, ArrowRightLeft, FileCheck2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { supabase } from "@/lib/supabase";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/BadgeLegacy";
import { Button } from "@/components/ui/ButtonLegacy";
import { useToast } from "@/components/ui/ToastLegacy";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttStatus = "present" | "late" | "absent" | "leave" | "holiday" | "half_day" | "on_duty";

interface DayRecord { clock_in: string | null; clock_out: string | null; status: AttStatus; date: string }

interface SickLeave {
  id: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  certificate_url: string | null;
  certificate_deadline: string;
  cert_status: "pending" | "submitted" | "approved" | "rejected";
  blocks_checkin: boolean;
  created_at: string;
}

interface WeekoffDay {
  id: string;
  off_date: string;
  week_index: number;
  status: "allotted" | "taken" | "changed";
  source: "preallot" | "auto_sunday" | "changed" | "carry";
}

interface ChangeRequest {
  id: string;
  original_date: string;
  requested_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
}

interface WeekoffCycleData {
  cycle: any;
  offDays: WeekoffDay[];
  changeRequests: ChangeRequest[];
  settings: {
    weekoffs_per_month: number;
    max_weekoffs_per_week: number;
    weekoff_carry_forward: boolean;
    lock_day: number;
    recycle_day: number;
    weekoff_mode: string;
  };
  canAllot: boolean;
  isLocked: boolean;
  cycleKey: string;
  lockDay: number;
  recycleDay: number;
}

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_CELL: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  late:    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20",
  absent:  "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  leave:   "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/20",
  holiday: "bg-theme-raised text-theme-subtle border-theme-border",
  on_duty: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
};

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  present: "success", late: "warning", absent: "danger", leave: "info", holiday: "default", on_duty: "info",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user, loading } = useAuth();
  const { showToast } = useToast();

  // ── view state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]         = useState<"calendar" | "logsheet">("calendar");
  const [currentMonth, setCurrentMonth]   = useState(dayjs());
  const [selectedDate, setSelectedDate]   = useState(dayjs().format("YYYY-MM-DD"));
  const [statusFilter, setStatusFilter]   = useState<string | null>(null);
  const [showMonthSelect, setShowMonthSelect] = useState(false);
  const [showYearSelect, setShowYearSelect]   = useState(false);

  // ── attendance data ─────────────────────────────────────────────────────────
  const [logs, setLogs]               = useState<Record<string, DayRecord>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<{ clock_in: string | null; clock_out: string | null; status: string } | null>(null);
  const [elapsed, setElapsed]         = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [employeeData, setEmployeeData] = useState<{ monthly_leave_quota: number; weekly_off_allotment: number } | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [holidays, setHolidays]       = useState<Record<string, any>>({});
  const [currentTime, setCurrentTime] = useState(dayjs());
  const [activeProtocol, setActiveProtocol] = useState<any>(null);
  const [attSettings, setAttSettings] = useState<any>({ id: 1, holiday_is_paid_leave: false });

  // ── weekoff cycle (current month) ──────────────────────────────────────────
  const [weekoffData, setWeekoffData]   = useState<WeekoffCycleData | null>(null);
  const [weekoffLoading, setWeekoffLoading] = useState(false);
  const [showWeekoffModal, setShowWeekoffModal] = useState(false);
  const [selectedOffDates, setSelectedOffDates] = useState<string[]>([]);
  const [savingWeekoff, setSavingWeekoff] = useState(false);

  // ── weekoff cycle (next month pre-allotment) ────────────────────────────────
  const [nextMonthWeekoffData, setNextMonthWeekoffData] = useState<WeekoffCycleData | null>(null);
  const [nextMonthWeekoffLoading, setNextMonthWeekoffLoading] = useState(false);
  const [showNextMonthModal, setShowNextMonthModal] = useState(false);
  const [nextMonthSelectedOffDates, setNextMonthSelectedOffDates] = useState<string[]>([]);
  const [savingNextMonthWeekoff, setSavingNextMonthWeekoff] = useState(false);

  // ── weekoff change request ──────────────────────────────────────────────────
  const [showChangeReqModal, setShowChangeReqModal] = useState(false);
  const [changeReqForm, setChangeReqForm] = useState({ original_date: "", requested_date: "", reason: "" });
  const [savingChangeReq, setSavingChangeReq] = useState(false);

  // ── sick leave ──────────────────────────────────────────────────────────────
  const [sickLeaves, setSickLeaves]     = useState<SickLeave[]>([]);
  const [showSickLeaveModal, setShowSickLeaveModal] = useState(false);
  const [sickLeaveForm, setSickLeaveForm] = useState({ from_date: dayjs().format("YYYY-MM-DD"), to_date: dayjs().format("YYYY-MM-DD"), reason: "", certificate_url: "" });
  const [savingSickLeave, setSavingSickLeave] = useState(false);

  // ── cert submit ─────────────────────────────────────────────────────────────
  const [showCertModal, setShowCertModal] = useState(false);
  const [certTarget, setCertTarget]       = useState<SickLeave | null>(null);
  const [certUrl, setCertUrl]             = useState("");
  const [savingCert, setSavingCert]       = useState(false);

  // ── old leave modal ─────────────────────────────────────────────────────────
  const [showCheckModal, setShowCheckModal]           = useState(false);
  const [selectedDateForCheck, setSelectedDateForCheck] = useState<string | null>(null);
  const [takeLeaveType, setTakeLeaveType]             = useState<"Request" | null>(null);
  const [leaveDate, setLeaveDate]                     = useState(dayjs().format("YYYY-MM-DD"));
  const [leaveReason, setLeaveReason]                 = useState("");

  // ── live clock ──────────────────────────────────────────────────────────────
  useEffect(() => { const t = setInterval(() => setCurrentTime(dayjs()), 1000); return () => clearInterval(t); }, []);

  // ── keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTakeLeaveType(null); setShowCheckModal(false);
        setShowWeekoffModal(false); setShowChangeReqModal(false);
        setShowSickLeaveModal(false); setShowCertModal(false);
        setShowNextMonthModal(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ── protocol ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetch_ = async () => {
      if (!user || loading) return;
      try {
        const { data: emp } = await supabase.from("employees").select("department").eq("id", user.id).single();
        const { data: protos } = await supabase.from("attendance_protocols").select("*").eq("status", "active").order("created_at", { ascending: false });
        if (protos) {
          const proto = protos.find(p => p.target_type === "All" || p.type === `Department:${emp?.department}`);
          setActiveProtocol(proto);
        }
      } catch {}
    };
    fetch_();
  }, [user, loading]);

  // ── fetch settings ──────────────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from("attendance_settings").select("*").eq("id", 1).maybeSingle();
    if (data) setAttSettings(data);
  }, []);

  // ── fetch attendance logs ────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    if (!user) return; // don't touch dataLoading — keeps the spinner alive until user is ready
    setDataLoading(true);
    try {
      const start = currentMonth.startOf("month").format("YYYY-MM-DD");
      const end   = currentMonth.endOf("month").format("YYYY-MM-DD");
      const { data } = await supabase.from("attendance_logs").select("*").eq("employee_id", user.id).gte("date", start).lte("date", end);
      const map: Record<string, DayRecord> = {};
      data?.forEach(l => { map[l.date] = l; });
      setLogs(map);
      setActiveSession(map[dayjs().format("YYYY-MM-DD")] ?? null);
      const { data: emp } = await supabase.from("employees").select("monthly_leave_quota, weekly_off_allotment").eq("id", user.id).maybeSingle();
      if (emp) setEmployeeData(emp);
      const { data: lr } = await supabase.from("leave_requests").select("*").eq("employee_id", user.id).order("created_at", { ascending: false });
      if (lr) setLeaveRequests(lr);
      const { data: holi } = await supabase.from("system_holidays").select("*").gte("date", start).lte("date", end);
      const hm: Record<string, any> = {};
      holi?.forEach(h => { hm[h.date] = h; });
      setHolidays(hm);
    } catch (e) { console.error(e); } finally { setDataLoading(false); }
  }, [user, currentMonth]);

  // ── fetch weekoff cycle ──────────────────────────────────────────────────────
  const fetchWeekoffCycle = useCallback(async () => {
    if (!user) return;
    setWeekoffLoading(true);
    try {
      const res = await fetch("/api/attendance/weekoff");
      if (res.ok) {
        const data: WeekoffCycleData = await res.json();
        setWeekoffData(data);
        setSelectedOffDates(data.offDays.filter(d => d.source === "preallot" || d.source === "carry").map(d => d.off_date));
      }
    } catch {} finally { setWeekoffLoading(false); }
  }, [user]);

  // ── fetch sick leaves ────────────────────────────────────────────────────────
  const fetchSickLeaves = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/attendance/sick-leave");
      if (res.ok) setSickLeaves(await res.json());
    } catch {}
  }, [user]);

  // ── fetch / save next-month weekoff cycle ─────────────────────────────────
  const fetchNextMonthCycle = useCallback(async () => {
    if (!user) return;
    setNextMonthWeekoffLoading(true);
    try {
      const nextKey = dayjs().add(1, "month").format("YYYY-MM");
      const res = await fetch(`/api/attendance/weekoff?month=${nextKey}`);
      if (res.ok) {
        const data: WeekoffCycleData = await res.json();
        setNextMonthWeekoffData(data);
        setNextMonthSelectedOffDates(
          data.offDays.filter(d => d.source === "preallot" || d.source === "carry").map(d => d.off_date)
        );
      } else {
        const json = await res.json().catch(() => ({}));
        showToast(json.error || "Cannot open next-month pre-allotment yet", "warning");
      }
    } catch {} finally { setNextMonthWeekoffLoading(false); }
  }, [user]);

  const toggleNextMonthOffDate = (dateStr: string) => {
    if (!nextMonthWeekoffData) return;
    const { max_weekoffs_per_week, weekoffs_per_month } = nextMonthWeekoffData.settings;
    const wk = Math.ceil(dayjs(dateStr).date() / 7);
    setNextMonthSelectedOffDates(prev => {
      if (prev.includes(dateStr)) return prev.filter(d => d !== dateStr);
      if (prev.length >= weekoffs_per_month) { showToast(`Max ${weekoffs_per_month} weekoffs/month`, "warning"); return prev; }
      const perWk = prev.filter(d => Math.ceil(dayjs(d).date() / 7) === wk).length;
      if (perWk >= max_weekoffs_per_week) { showToast(`Max ${max_weekoffs_per_week} per week`, "warning"); return prev; }
      return [...prev, dateStr];
    });
  };

  const saveNextMonthAllotment = async () => {
    if (!nextMonthWeekoffData) return;
    setSavingNextMonthWeekoff(true);
    try {
      const res = await fetch("/api/attendance/weekoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offDates: nextMonthSelectedOffDates, cycleKey: nextMonthWeekoffData.cycleKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const nextMonthName = dayjs().add(1, "month").format("MMMM");
      showToast(`${json.saved} weekoff(s) saved for ${nextMonthName}`, "success");
      setShowNextMonthModal(false);
      await fetchNextMonthCycle();
    } catch (e: any) { showToast(e.message || "Failed to save", "error"); }
    finally { setSavingNextMonthWeekoff(false); }
  };

  // ── init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchLogs(); fetchSettings(); fetchWeekoffCycle(); fetchSickLeaves();
    if (!user) return;
    const s1 = supabase.channel("emp-leaves").on("postgres_changes", { event: "UPDATE", schema: "public", table: "employees", filter: `id=eq.${user.id}` }, (p: any) => setEmployeeData({ monthly_leave_quota: p.new.monthly_leave_quota, weekly_off_allotment: p.new.weekly_off_allotment })).subscribe();
    const s2 = supabase.channel("lr-sync").on("postgres_changes",   { event: "*", schema: "public", table: "leave_requests", filter: `employee_id=eq.${user.id}` }, () => fetchLogs()).subscribe();
    const s3 = supabase.channel("holi-sync").on("postgres_changes", { event: "*", schema: "public", table: "system_holidays" }, () => fetchLogs()).subscribe();
    const s4 = supabase.channel("att-sync").on("postgres_changes",  { event: "*", schema: "public", table: "attendance_logs", filter: `employee_id=eq.${user.id}` }, () => fetchLogs()).subscribe();
    const s5 = supabase.channel("set-sync").on("postgres_changes",  { event: "*", schema: "public", table: "attendance_settings" }, () => fetchSettings()).subscribe();
    const s6 = supabase.channel("sl-sync").on("postgres_changes",   { event: "*", schema: "public", table: "sick_leaves", filter: `employee_id=eq.${user.id}` }, () => fetchSickLeaves()).subscribe();
    // Polling fallback — keeps stats in sync if real-time events are missed
    const poll = setInterval(() => fetchLogs(), 10_000);
    return () => { [s1,s2,s3,s4,s5,s6].forEach(s => supabase.removeChannel(s)); clearInterval(poll); };
  }, [fetchLogs, fetchSettings, fetchWeekoffCycle, fetchSickLeaves, user]);

  // ── elapsed timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    let iv: NodeJS.Timeout;
    if (activeSession?.clock_in && !activeSession.clock_out) {
      const [h,m,s] = activeSession.clock_in.split(":").map(Number);
      const start = dayjs().hour(h).minute(m).second(s);
      iv = setInterval(() => { const d = dayjs().diff(start, "second"); setElapsed(d > 0 ? d : 0); }, 1000);
    } else setElapsed(0);
    return () => clearInterval(iv);
  }, [activeSession]);

  // ── derived ─────────────────────────────────────────────────────────────────
  const todayStr    = dayjs().format("YYYY-MM-DD");
  const startDay    = currentMonth.startOf("month").day();
  const daysInMonth = currentMonth.daysInMonth();
  const calDays: (string | null)[] = [];
  for (let i = 0; i < startDay; i++) calDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calDays.push(currentMonth.date(i).format("YYYY-MM-DD"));

  const presentDays = Object.values(logs).filter(l => l.status === "present").length;
  const lateDays    = Object.values(logs).filter(l => l.status === "late").length;
  const absentDays  = Object.values(logs).filter(l => l.status === "absent").length;

  const allottedDates = new Set(weekoffData?.offDays.filter(d => d.status === "allotted").map(d => d.off_date) ?? []);
  const changedDates  = new Set(weekoffData?.offDays.filter(d => d.status === "changed").map(d => d.off_date) ?? []);
  const pendingCerts  = sickLeaves.filter(l => l.cert_status === "pending" && !l.certificate_url);
  const blockingLeave = sickLeaves.find(l => l.blocks_checkin && l.cert_status !== "approved");

  // ── weekoff picker helpers ───────────────────────────────────────────────────
  const toggleOffDate = (dateStr: string) => {
    if (!weekoffData) return;
    const { max_weekoffs_per_week, weekoffs_per_month } = weekoffData.settings;
    const wk = Math.ceil(dayjs(dateStr).date() / 7);

    setSelectedOffDates(prev => {
      if (prev.includes(dateStr)) return prev.filter(d => d !== dateStr);
      if (prev.length >= weekoffs_per_month) { showToast(`Max ${weekoffs_per_month} weekoffs per month`, "warning"); return prev; }
      const perWk = prev.filter(d => Math.ceil(dayjs(d).date() / 7) === wk).length;
      if (perWk >= max_weekoffs_per_week) { showToast(`Max ${max_weekoffs_per_week} per week`, "warning"); return prev; }
      return [...prev, dateStr];
    });
  };

  const saveWeekoffAllotment = async () => {
    if (!weekoffData) return;
    setSavingWeekoff(true);
    try {
      const res = await fetch("/api/attendance/weekoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offDates: selectedOffDates, cycleKey: weekoffData.cycleKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(`${json.saved} weekoff(s) saved`, "success");
      setShowWeekoffModal(false);
      await fetchWeekoffCycle();
    } catch (e: any) { showToast(e.message || "Failed to save", "error"); }
    finally { setSavingWeekoff(false); }
  };

  // ── weekoff change request ───────────────────────────────────────────────────
  const openChangeReq = (offDate: string) => {
    setChangeReqForm({ original_date: offDate, requested_date: "", reason: "" });
    setShowChangeReqModal(true);
  };

  const submitChangeReq = async () => {
    if (!changeReqForm.requested_date || !changeReqForm.reason.trim()) {
      showToast("Fill in all fields", "warning"); return;
    }
    setSavingChangeReq(true);
    try {
      const res = await fetch("/api/attendance/weekoff/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changeReqForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast("Change request submitted for approval", "success");
      setShowChangeReqModal(false);
      await fetchWeekoffCycle();
    } catch (e: any) { showToast(e.message || "Failed", "error"); }
    finally { setSavingChangeReq(false); }
  };

  // ── sick leave ────────────────────────────────────────────────────────────────
  const submitSickLeave = async () => {
    if (!sickLeaveForm.reason.trim()) { showToast("Reason is required", "warning"); return; }
    setSavingSickLeave(true);
    try {
      const res = await fetch("/api/attendance/sick-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sickLeaveForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast("Sick leave submitted", "success");
      setShowSickLeaveModal(false);
      setSickLeaveForm({ from_date: todayStr, to_date: todayStr, reason: "", certificate_url: "" });
      await fetchSickLeaves();
    } catch (e: any) { showToast(e.message || "Failed", "error"); }
    finally { setSavingSickLeave(false); }
  };

  // ── certificate submit ────────────────────────────────────────────────────────
  const submitCert = async () => {
    if (!certUrl.trim()) { showToast("Paste the certificate URL", "warning"); return; }
    if (!certTarget) return;
    setSavingCert(true);
    try {
      const res = await fetch("/api/attendance/sick-leave", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: certTarget.id, action: "submit_cert", certificate_url: certUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(json.needsApproval ? "Submitted — awaiting admin approval" : "Certificate accepted", "success");
      setShowCertModal(false); setCertUrl("");
      await fetchSickLeaves();
    } catch (e: any) { showToast(e.message || "Failed", "error"); }
    finally { setSavingCert(false); }
  };

  // ── legacy leave submit (Request type only) ────────────────────────────────────
  const submitLeave = async () => {
    if (!user) return;
    if (!leaveReason.trim()) { showToast("Please provide a reason", "warning"); return; }
    setActionLoading(true);
    try {
      const dateLabel = dayjs(leaveDate).format("D MMM YYYY");
      const notifBatch: any[] = [];
      const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
      admins?.forEach(a => notifBatch.push({ user_id: a.id, title: `Leave Request — ${user.name || user.email}`, message: `Unpaid leave request for ${dateLabel}. Reason: ${leaveReason}`, type: "warning", link: "/admin/attendance" }));
      const { error } = await supabase.from("leave_requests").insert({ employee_id: user.id, type: "Unpaid", start_date: leaveDate, end_date: leaveDate, from_date: leaveDate, to_date: leaveDate, days: 1, reason: leaveReason, status: "pending" });
      if (error) throw error;
      if (notifBatch.length) await supabase.from("system_notifications").insert(notifBatch);
      setTakeLeaveType(null); setShowCheckModal(false); setLeaveReason("");
      fetchLogs(); showToast("Leave request sent for approval", "success");
    } catch (e: any) { showToast(e.message || "Failed", "error"); }
    finally { setActionLoading(false); }
  };

  // ── check in / out ─────────────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      const thresholdStr = activeProtocol?.check_in_time ?? "09:30:00";
      const [ph, pm] = thresholdStr.split(":").map(Number);
      const threshold = dayjs().hour(ph).minute(pm).second(0);
      const checkInStatus = dayjs().isAfter(threshold) ? "late" : "present";
      const { error } = await supabase.from("attendance_logs").upsert({
        employee_id: user.id, date: todayStr, clock_in: dayjs().format("HH:mm:ss"), status: checkInStatus,
      }, { onConflict: "employee_id,date" });
      if (error) throw error;
      showToast(checkInStatus === "late" ? "Checked in — marked Late" : "Checked in", checkInStatus === "late" ? "warning" : "success");
      await fetchLogs();
    } catch { showToast("Failed to check in", "error"); } finally { setActionLoading(false); }
  };

  const handleCheckOut = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from("attendance_logs").update({ clock_out: dayjs().format("HH:mm:ss") }).eq("employee_id", user.id).eq("date", todayStr);
      if (error) throw error;
      showToast("Checked out", "success"); setShowCheckModal(false); await fetchLogs();
    } catch { showToast("Failed to check out", "error"); } finally { setActionLoading(false); }
  };

  const handleDayClick = (dateStr: string) => {
    // If clicking on an allotted weekoff day (post-lock) → change request
    if (allottedDates.has(dateStr) && weekoffData?.isLocked) {
      openChangeReq(dateStr); return;
    }
    setSelectedDate(dateStr); setSelectedDateForCheck(dateStr); setTakeLeaveType(null); setShowCheckModal(true);
  };

  const closeModal = () => { setShowCheckModal(false); setTakeLeaveType(null); };

  // ── sick leave date window ──────────────────────────────────────────────────────
  const sickMinDate = attSettings?.sick_leave_backward_days
    ? dayjs().subtract(attSettings.sick_leave_backward_days, "day").format("YYYY-MM-DD")
    : dayjs().subtract(2, "day").format("YYYY-MM-DD");
  const sickMaxDate = attSettings?.sick_leave_forward_days
    ? dayjs().add(attSettings.sick_leave_forward_days, "day").format("YYYY-MM-DD")
    : dayjs().add(2, "day").format("YYYY-MM-DD");

  return (
    <DashboardShell moduleKey="my_attendance" title="Attendance" subtitle="Track and manage your daily attendance.">
      <div className="space-y-5">

        {/* ── blocking sick-leave banner ─────────────────────────────────── */}
        {blockingLeave && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/8 px-5 py-4">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Check-in blocked — outstanding certificate</p>
              <p className="text-xs text-theme-muted mt-0.5">Your sick leave ({blockingLeave.from_date}) certificate is overdue. Submit it to unlock check-in.</p>
            </div>
            <button onClick={() => { setCertTarget(blockingLeave); setCertUrl(blockingLeave.certificate_url || ""); setShowCertModal(true); }}
              className="shrink-0 text-xs font-bold text-red-600 hover:underline">
              Submit Now →
            </button>
          </div>
        )}

        {/* ── stat cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total Logged",  value: presentDays + lateDays, color: "text-theme-fg",    bg: "bg-theme-raised",   icon: UserCheck },
            { label: "Present",       value: presentDays,            color: "text-emerald-600", bg: "bg-emerald-500/10", icon: UserCheck },
            { label: "Late Starts",   value: lateDays,               color: "text-amber-600",   bg: "bg-amber-500/10",   icon: Clock },
            { label: "Absent",        value: absentDays,             color: "text-red-500",     bg: "bg-red-500/10",     icon: CalendarDays },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} className="page-card flex items-center gap-3">
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", bg)}>
                <Icon size={15} className={color} />
              </div>
              <div>
                <p className="text-[11px] text-theme-muted">{label}</p>
                <p className={cn("text-lg font-black leading-tight", color)}>
                  {dataLoading ? <span className="text-theme-subtle/50 text-sm">—</span> : value}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">

          {/* ── calendar / logsheet ────────────────────────────────────────── */}
          <div className="xl:col-span-2 space-y-4">
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="w-fit">
              <TabsList className="h-auto rounded-xl border border-theme-border bg-theme-raised p-1 gap-0.5">
                <TabsTrigger value="calendar" className="rounded-lg px-4 py-1.5 text-xs font-semibold text-theme-muted data-active:bg-theme-surface data-active:text-theme-fg data-active:shadow-sm">
                  <CalendarDays size={14} /> Calendar
                </TabsTrigger>
                <TabsTrigger value="logsheet" className="rounded-lg px-4 py-1.5 text-xs font-semibold text-theme-muted data-active:bg-theme-surface data-active:text-theme-fg data-active:shadow-sm">
                  <ListFilter size={14} /> Log Sheet
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="page-card overflow-hidden p-0">
              {activeTab === "calendar" ? (
                <>
                  {/* calendar header */}
                  <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
                    <div className="flex items-center gap-3">
                      {/* month picker */}
                      <div className="relative">
                        <button onClick={() => { setShowMonthSelect(!showMonthSelect); setShowYearSelect(false); }} className="flex items-center gap-1.5 text-base font-bold text-theme-fg hover:text-theme-primary transition-colors">
                          {currentMonth.format("MMMM")} <ChevronDown size={14} className="text-theme-subtle" />
                        </button>
                        {showMonthSelect && (
                          <><div className="fixed inset-0 z-40" onClick={() => setShowMonthSelect(false)} />
                          <div className="absolute top-full left-0 mt-2 w-44 bg-theme-surface border border-theme-border rounded-xl shadow-2xl z-50 p-2 grid grid-cols-2 gap-1 animate-in slide-in-from-top-2">
                            {Array.from({ length: 12 }).map((_, i) => (
                              <button key={i} onClick={() => { setCurrentMonth(currentMonth.month(i)); setShowMonthSelect(false); }}
                                className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg transition-all", currentMonth.month() === i ? "bg-theme-primary text-theme-surface" : "text-theme-fg hover:bg-theme-raised")}>
                                {dayjs().month(i).format("MMM")}
                              </button>
                            ))}
                          </div></>
                        )}
                      </div>
                      {/* year picker */}
                      <div className="relative">
                        <button onClick={() => { setShowYearSelect(!showYearSelect); setShowMonthSelect(false); }} className="flex items-center gap-1.5 text-base font-bold text-theme-fg hover:text-theme-primary transition-colors">
                          {currentMonth.year()} <ChevronDown size={14} className="text-theme-subtle" />
                        </button>
                        {showYearSelect && (
                          <><div className="fixed inset-0 z-40" onClick={() => setShowYearSelect(false)} />
                          <div className="absolute top-full left-0 mt-2 w-28 bg-theme-surface border border-theme-border rounded-xl shadow-2xl z-50 p-2 flex flex-col gap-1 animate-in slide-in-from-top-2">
                            {Array.from({ length: 7 }).map((_, i) => { const yr = dayjs().year() - 3 + i; return (
                              <button key={yr} onClick={() => { setCurrentMonth(currentMonth.year(yr)); setShowYearSelect(false); }}
                                className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg transition-all text-center", currentMonth.year() === yr ? "bg-theme-primary text-theme-surface" : "text-theme-fg hover:bg-theme-raised")}>
                                {yr}
                              </button>
                            ); })}
                          </div></>
                        )}
                      </div>
                    </div>
                    {/* day navigator */}
                    <div className="flex items-center gap-1 p-0.5 bg-theme-raised border border-theme-border rounded-xl">
                      <button onClick={() => { const n = dayjs(selectedDate).subtract(1,"day"); setSelectedDate(n.format("YYYY-MM-DD")); if (!n.isSame(currentMonth,"month")) setCurrentMonth(n); }} className="p-2 hover:bg-theme-surface rounded-lg transition-all text-theme-subtle hover:text-theme-primary"><ChevronLeft size={15} /></button>
                      <div className="px-3 py-1.5 flex items-center gap-2 text-xs font-semibold text-theme-fg min-w-[110px] justify-center">
                        <CalendarDays size={12} className="text-theme-muted" />
                        {dayjs(selectedDate).isSame(dayjs(),"day") ? "Today" : dayjs(selectedDate).isSame(dayjs().subtract(1,"day"),"day") ? "Yesterday" : dayjs(selectedDate).isSame(dayjs().add(1,"day"),"day") ? "Tomorrow" : dayjs(selectedDate).format("DD MMM, YYYY")}
                        {selectedDate !== todayStr && (
                          <button onClick={() => { setSelectedDate(todayStr); setCurrentMonth(dayjs()); }} className="p-0.5 hover:text-theme-primary transition-colors"><RotateCcw size={11} /></button>
                        )}
                      </div>
                      <button onClick={() => { const n = dayjs(selectedDate).add(1,"day"); setSelectedDate(n.format("YYYY-MM-DD")); if (!n.isSame(currentMonth,"month")) setCurrentMonth(n); }} className="p-2 hover:bg-theme-surface rounded-lg transition-all text-theme-subtle hover:text-theme-primary"><ChevronRight size={15} /></button>
                    </div>
                  </div>

                  {/* calendar grid */}
                  <div className="bg-theme-page">
                    <div className="grid grid-cols-7 border-b border-theme-border bg-theme-surface">
                      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                        <div key={d} className="py-3 text-center text-xs font-semibold uppercase tracking-wide text-theme-muted">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {calDays.map((dateStr, idx) => {
                        if (!dateStr) return <div key={`e-${idx}`} className="border-r border-b border-theme-border bg-theme-surface/30 min-h-[92px] sm:min-h-[104px]" />;
                        const isToday    = dateStr === todayStr;
                        const isSelected = dateStr === selectedDate;
                        const log        = logs[dateStr];
                        const holi       = holidays[dateStr];
                        const isOff      = allottedDates.has(dateStr);
                        const isChanged  = changedDates.has(dateStr);
                        const dayNum     = dayjs(dateStr).date();
                        return (
                          <div key={dateStr} onClick={() => handleDayClick(dateStr)}
                            className={cn("relative border-r border-b border-theme-border p-2 min-h-[92px] sm:min-h-[104px] flex flex-col group cursor-pointer transition-all overflow-visible",
                              isSelected ? "bg-theme-raised" : "bg-theme-surface/50 hover:bg-theme-raised/40",
                              isToday ? "ring-2 ring-inset ring-theme-primary" : "",
                              log ? STATUS_CELL[log.status] : "",
                              isOff && !log ? "bg-sky-500/10 border-sky-500/20" : ""
                            )}>
                            <div className="flex justify-between items-start mb-1">
                              <span className={cn("text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                                isToday ? "bg-theme-primary text-theme-surface" : isSelected ? "bg-theme-fg text-theme-surface" : "text-theme-fg/90 group-hover:text-theme-primary group-hover:bg-theme-primary/10"
                              )}>{dayNum}</span>
                              {isOff && !log && <span className="text-[9px] font-bold text-sky-600 bg-sky-500/15 px-1.5 py-0.5 rounded">OFF</span>}
                              {isChanged && <span className="text-[9px] font-bold text-amber-600 bg-amber-500/15 px-1.5 py-0.5 rounded">CHG</span>}
                              {log && !holi && !isOff && <span className="text-[10px] font-semibold capitalize bg-white/50 dark:bg-black/20 text-theme-fg px-1.5 py-0.5 rounded">{log.status}</span>}
                            </div>
                            {holi && (
                              <div className="mt-auto rounded px-1.5 py-1 mb-1" style={{ backgroundColor: `${holi.color}20`, borderLeft: `2px solid ${holi.color}` }}>
                                <span className="block text-[11px] font-semibold truncate" style={{ color: holi.color }}>{holi.title}</span>
                              </div>
                            )}
                            {isOff && !log && (
                              <div className="mt-auto text-[9px] text-sky-600 font-semibold px-0.5">
                                {weekoffData?.isLocked ? "Tap to change →" : "Weekoff"}
                              </div>
                            )}
                            <div className="flex-1 flex flex-col justify-end">
                              {log && (
                                <div className="mt-auto bg-white/50 dark:bg-black/20 px-1.5 py-1 rounded space-y-0.5">
                                  {log.clock_in && <div className="flex justify-between gap-1 text-[10px] tabular-nums text-theme-fg/80"><span className="text-[9px] font-semibold text-theme-muted">IN</span>{dayjs(`2000-01-01 ${log.clock_in}`).format("HH:mm")}</div>}
                                  {log.clock_out && <div className="flex justify-between gap-1 text-[10px] tabular-nums text-theme-fg/80"><span className="text-[9px] font-semibold text-theme-muted">OUT</span>{dayjs(`2000-01-01 ${log.clock_out}`).format("HH:mm")}</div>}
                                </div>
                              )}
                            </div>
                            {isToday && activeSession && !activeSession.clock_out && <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/10 to-transparent pointer-events-none animate-pulse" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                /* log sheet */
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-theme-border px-5 py-4">
                    <div>
                      <h3 className="text-sm font-semibold text-theme-fg">Monthly Log Sheet</h3>
                      <p className="text-xs text-theme-muted mt-0.5">{currentMonth.format("MMMM YYYY")}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setStatusFilter(null)} className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold transition-all", statusFilter === null ? "bg-theme-fg text-theme-surface" : "bg-theme-raised text-theme-muted hover:text-theme-fg")}>All</button>
                      {Object.entries(STATUS_BADGE).map(([key, val]) => (
                        <button key={key} onClick={() => setStatusFilter(statusFilter === key ? null : key)}
                          className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all", statusFilter === key ? "ring-1 ring-inset ring-theme-fg bg-theme-raised" : "bg-theme-raised hover:bg-theme-border/50")}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", val==="success"?"bg-emerald-500":val==="warning"?"bg-amber-500":val==="danger"?"bg-red-500":"bg-theme-muted")} />
                          <span className={cn("capitalize", statusFilter===key?"text-theme-fg":"text-theme-muted")}>{key.replace("_"," ")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted">
                          <th className="px-5 py-3 font-semibold">Date</th>
                          <th className="px-5 py-3 font-semibold">Status</th>
                          <th className="px-5 py-3 font-semibold">In</th>
                          <th className="px-5 py-3 font-semibold">Out</th>
                          <th className="px-5 py-3 font-semibold">Hours</th>
                          <th className="px-5 py-3 font-semibold text-right">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-theme-border">
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                          const date = currentMonth.date(i+1).format("YYYY-MM-DD");
                          const log  = logs[date];
                          const holi = holidays[date];
                          const isWeekend = [0,6].includes(currentMonth.date(i+1).day());
                          const isOff = allottedDates.has(date);
                          if (statusFilter) {
                            if (statusFilter==="holiday" && !holi) return null;
                            if (statusFilter!=="holiday" && (!log || log.status!==statusFilter)) return null;
                          }
                          return (
                            <tr key={date} className={cn("hover:bg-theme-raised/40 transition-colors", date===todayStr&&"bg-theme-primary/5")}>
                              <td className="px-5 py-2.5">
                                <span className="text-xs font-semibold text-theme-fg">{currentMonth.date(i+1).format("DD")}</span>
                                <span className="ml-2 text-[10px] text-theme-subtle">{currentMonth.date(i+1).format("ddd")}</span>
                              </td>
                              <td className="px-5 py-2.5">
                                {holi ? <span className="text-xs text-theme-muted">Holiday</span>
                                : isOff && !log ? <span className="text-xs font-semibold text-sky-600">Weekoff</span>
                                : log ? <div className="flex items-center gap-1.5"><div className={cn("w-1.5 h-1.5 rounded-full", STATUS_BADGE[log.status]==="success"?"bg-emerald-500":STATUS_BADGE[log.status]==="warning"?"bg-amber-500":STATUS_BADGE[log.status]==="danger"?"bg-red-500":"bg-theme-muted")} /><span className="text-xs text-theme-fg capitalize">{log.status.replace("_"," ")}</span></div>
                                : <span className="text-xs text-theme-subtle">{isWeekend?"Weekend":"—"}</span>}
                              </td>
                              <td className="px-5 py-2.5 tabular-nums text-xs text-theme-fg">{log?.clock_in  ? dayjs(`2000-01-01 ${log.clock_in}`).format("HH:mm")  : "—"}</td>
                              <td className="px-5 py-2.5 tabular-nums text-xs text-theme-fg">{log?.clock_out ? dayjs(`2000-01-01 ${log.clock_out}`).format("HH:mm") : "—"}</td>
                              <td className="px-5 py-2.5 text-xs text-theme-muted">
                                {log?.clock_in && log?.clock_out ? `${Math.floor(dayjs(`2000-01-01 ${log.clock_out}`).diff(dayjs(`2000-01-01 ${log.clock_in}`),"minute")/60)}h ${dayjs(`2000-01-01 ${log.clock_out}`).diff(dayjs(`2000-01-01 ${log.clock_in}`),"minute")%60}m` : "—"}
                              </td>
                              <td className="px-5 py-2.5 text-right text-xs text-theme-subtle italic">{holi ? holi.title : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── sidebar ─────────────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* ── weekoff allotment card ───────────────────────────────────── */}
            <div className="page-card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
                <div className="flex items-center gap-2">
                  <CalendarClock size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Weekly Offs</h3>
                </div>
                {weekoffData?.canAllot && (
                  <button onClick={() => setShowWeekoffModal(true)}
                    className="text-xs font-bold text-theme-primary hover:underline">
                    Pre-allot →
                  </button>
                )}
              </div>
              <div className="px-5 py-4 space-y-3">
                {weekoffLoading ? (
                  <div className="flex items-center gap-2 text-xs text-theme-muted"><Loader2 size={13} className="animate-spin" /> Loading...</div>
                ) : weekoffData ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-theme-muted">Allotted this month</span>
                      <span className="text-sm font-black text-theme-fg">{weekoffData.offDays.filter(d=>d.status==="allotted").length} / {weekoffData.settings.weekoffs_per_month}</span>
                    </div>
                    <Progress value={(weekoffData.offDays.filter(d=>d.status==="allotted").length / weekoffData.settings.weekoffs_per_month) * 100} className="h-1.5" />

                    {weekoffData.isLocked ? (
                      <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2">
                        <AlertCircle size={12} className="text-amber-600 shrink-0" />
                        <span className="text-[11px] text-amber-700 font-semibold">Locked — change requests only</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2">
                        <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                        <span className="text-[11px] text-emerald-700 font-semibold">Open until {weekoffData.settings.lock_day}th of this month</span>
                      </div>
                    )}

                    {weekoffData.offDays.filter(d=>d.status==="allotted").length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {weekoffData.offDays.filter(d=>d.status==="allotted").map(d => (
                          <span key={d.id} className="text-[10px] font-semibold bg-sky-500/10 text-sky-700 px-2 py-1 rounded-md">
                            {dayjs(d.off_date).format("DD MMM")}
                            {d.source === "auto_sunday" && <span className="ml-1 opacity-60">(auto)</span>}
                          </span>
                        ))}
                      </div>
                    )}

                    {weekoffData.changeRequests.filter(r=>r.status==="pending").length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-500/10 px-3 py-2 rounded-lg">
                        <ArrowRightLeft size={11} />
                        {weekoffData.changeRequests.filter(r=>r.status==="pending").length} change request(s) pending
                      </div>
                    )}

                    {dayjs().date() >= (attSettings?.recycle_day ?? 25) && (
                      <button
                        onClick={async () => { await fetchNextMonthCycle(); setShowNextMonthModal(true); }}
                        disabled={nextMonthWeekoffLoading}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-theme-primary/40 bg-theme-primary/5 px-3 py-2 text-[11px] font-bold text-theme-primary hover:bg-theme-primary/10 transition-all disabled:opacity-60">
                        {nextMonthWeekoffLoading ? <Loader2 size={11} className="animate-spin" /> : <CalendarClock size={11} />}
                        Pre-allot {dayjs().add(1, "month").format("MMMM")}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-theme-muted">No cycle data yet.</p>
                )}
              </div>
            </div>

            {/* ── sick leave card ──────────────────────────────────────────── */}
            <div className="page-card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
                <div className="flex items-center gap-2">
                  <Timer size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Sick Leave</h3>
                </div>
                <button onClick={() => setShowSickLeaveModal(true)} className="text-xs font-bold text-theme-primary hover:underline">
                  Apply →
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                {sickLeaves.length === 0 ? (
                  <p className="text-xs text-theme-muted">No sick leaves this month.</p>
                ) : (
                  <ul className="space-y-2">
                    {sickLeaves.slice(0, 4).map(sl => (
                      <li key={sl.id} className="rounded-xl border border-theme-border bg-theme-raised px-3 py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-theme-fg">{dayjs(sl.from_date).format("DD MMM")} – {dayjs(sl.to_date).format("DD MMM")}</span>
                          <CertBadge status={sl.cert_status} />
                        </div>
                        {sl.blocks_checkin && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-red-600 font-semibold flex items-center gap-1">
                              <AlertTriangle size={10} /> Check-in blocked
                            </span>
                            <button onClick={() => { setCertTarget(sl); setCertUrl(sl.certificate_url||""); setShowCertModal(true); }}
                              className="text-[10px] font-bold text-theme-primary hover:underline">
                              Submit cert
                            </button>
                          </div>
                        )}
                        {!sl.certificate_url && sl.cert_status === "pending" && !sl.blocks_checkin && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-theme-muted">Due by {dayjs(sl.certificate_deadline).format("DD MMM")}</span>
                            <button onClick={() => { setCertTarget(sl); setCertUrl(""); setShowCertModal(true); }}
                              className="text-[10px] font-bold text-theme-primary hover:underline">
                              + Certificate
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* ── leave management (unpaid requests) ─────────────────────── */}
            <div className="page-card overflow-hidden p-0">
              <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
                <CalendarDays size={15} className="text-theme-muted" />
                <h3 className="text-sm font-semibold text-theme-fg">Leave Requests</h3>
              </div>
              <div className="px-5 py-4 space-y-4">
                {activeProtocol && (
                  <div className="rounded-xl border border-theme-border bg-theme-raised px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock size={12} className="text-theme-muted" />
                      <span className="text-xs font-semibold text-theme-muted">Active Protocol</span>
                    </div>
                    <p className="text-xs font-semibold text-theme-fg">{activeProtocol.name || activeProtocol.title}</p>
                    <div className="flex gap-3 text-xs text-theme-muted mt-1">
                      <span>In: <span className="font-semibold text-theme-fg">{dayjs(`2000-01-01 ${activeProtocol.check_in_time}`).format("hh:mm A")}</span></span>
                      <span>Out: <span className="font-semibold text-theme-fg">{dayjs(`2000-01-01 ${activeProtocol.check_out_time}`).format("hh:mm A")}</span></span>
                    </div>
                  </div>
                )}
                <Button size="sm" className="w-full" onClick={() => { setSelectedDate(todayStr); setSelectedDateForCheck(todayStr); setLeaveDate(todayStr); setLeaveReason(""); setTakeLeaveType("Request"); setShowCheckModal(true); }}>
                  Submit Unpaid Leave Request
                </Button>
              </div>
            </div>

            {/* ── leave history ──────────────────────────────────────────── */}
            <div className="page-card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
                <h3 className="text-sm font-semibold text-theme-fg">Leave History</h3>
                <ListFilter size={13} className="text-theme-subtle" />
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {leaveRequests.length === 0 ? (
                  <div className="py-8 text-center text-xs text-theme-subtle">No requests yet</div>
                ) : (
                  <ul className="divide-y divide-theme-border">
                    {leaveRequests.map(req => (
                      <li key={req.id} className="px-5 py-3 hover:bg-theme-raised/40 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-theme-fg">{req.type}</span>
                          <Badge variant={req.status==="Approved"?"success":req.status==="Rejected"?"danger":"warning"}>{req.status}</Badge>
                        </div>
                        <p className="text-[10px] text-theme-subtle tabular-nums">{dayjs(req.start_date).format("MMM DD")} – {dayjs(req.end_date).format("MMM DD")}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════ MODALS ════════════════════════════════════════════════ */}

      {/* ── Weekoff Pre-allotment Modal ────────────────────────────────────────── */}
      <Dialog open={showWeekoffModal} onOpenChange={setShowWeekoffModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock size={18} className="text-sky-500" />
              Pre-allot Weekly Offs — {dayjs().format("MMMM YYYY")}
            </DialogTitle>
          </DialogHeader>

          {weekoffData && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between rounded-xl bg-theme-raised border border-theme-border px-4 py-3 text-sm">
                <span className="text-theme-muted">Selected</span>
                <span className="font-black text-theme-fg">{selectedOffDates.length} / {weekoffData.settings.weekoffs_per_month}</span>
              </div>

              <p className="text-xs text-theme-muted">
                Click dates to pick your off days. Max <strong>{weekoffData.settings.max_weekoffs_per_week}</strong> per week.
                Lock date: <strong>{weekoffData.settings.lock_day}th</strong>.
              </p>

              {/* mini-calendar for current month */}
              <div className="rounded-xl border border-theme-border overflow-hidden">
                <div className="grid grid-cols-7 border-b border-theme-border bg-theme-raised">
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                    <div key={d} className="py-2 text-center text-[10px] font-bold text-theme-muted">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {(() => {
                    const month = dayjs();
                    const start = month.startOf("month");
                    const cells: React.ReactNode[] = [];
                    for (let i = 0; i < start.day(); i++) cells.push(<div key={`p${i}`} className="min-h-[40px] border-r border-b border-theme-border bg-theme-surface/30" />);
                    for (let d = 1; d <= month.daysInMonth(); d++) {
                      const ds = month.date(d).format("YYYY-MM-DD");
                      const isPast    = dayjs(ds).isBefore(dayjs(), "day");
                      const isAlready = allottedDates.has(ds) && !selectedOffDates.includes(ds);
                      const isPicked  = selectedOffDates.includes(ds);
                      const wk        = Math.ceil(d / 7);
                      const wkCount   = selectedOffDates.filter(x => Math.ceil(dayjs(x).date() / 7) === wk).length;
                      const wkFull    = wkCount >= weekoffData.settings.max_weekoffs_per_week && !isPicked;
                      cells.push(
                        <button key={ds} disabled={isPast || wkFull}
                          onClick={() => toggleOffDate(ds)}
                          className={cn("min-h-[40px] text-xs font-semibold border-r border-b border-theme-border transition-all flex items-center justify-center",
                            isPicked    ? "bg-sky-500 text-white"
                            : isAlready ? "bg-sky-500/20 text-sky-700"
                            : isPast    ? "bg-theme-surface/30 text-theme-subtle/40 cursor-not-allowed"
                            : wkFull    ? "bg-theme-surface/30 text-theme-subtle/40 cursor-not-allowed"
                            : "bg-theme-surface hover:bg-sky-500/10 hover:text-sky-600 text-theme-fg"
                          )}>
                          {d}
                        </button>
                      );
                    }
                    return cells;
                  })()}
                </div>
              </div>

              <p className="text-[10px] text-theme-muted">
                <span className="inline-block w-3 h-3 bg-sky-500 rounded-sm mr-1 align-middle" />Selected&nbsp;&nbsp;
                <span className="inline-block w-3 h-3 bg-sky-500/20 rounded-sm mr-1 align-middle" />Already saved
              </p>
            </div>
          )}

          <DialogFooter>
            <button onClick={() => setShowWeekoffModal(false)} className="px-4 py-2 text-sm font-semibold text-theme-muted hover:text-theme-fg">Cancel</button>
            <Button onClick={saveWeekoffAllotment} loading={savingWeekoff} className="min-w-[140px]">
              <CheckCircle2 size={14} className="mr-1.5" /> Save Offs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Next-Month Pre-allotment Modal ────────────────────────────────────── */}
      <Dialog open={showNextMonthModal} onOpenChange={setShowNextMonthModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock size={18} className="text-violet-500" />
              Pre-allot Weekly Offs — {dayjs().add(1, "month").format("MMMM YYYY")}
            </DialogTitle>
          </DialogHeader>

          {nextMonthWeekoffData && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between rounded-xl bg-theme-raised border border-theme-border px-4 py-3 text-sm">
                <span className="text-theme-muted">Selected</span>
                <span className="font-black text-theme-fg">
                  {nextMonthSelectedOffDates.length} / {nextMonthWeekoffData.settings.weekoffs_per_month}
                </span>
              </div>

              <p className="text-xs text-theme-muted">
                Pick your days off for {dayjs().add(1, "month").format("MMMM")}. Max{" "}
                <strong>{nextMonthWeekoffData.settings.max_weekoffs_per_week}</strong> per week.
                These lock on the <strong>{nextMonthWeekoffData.settings.lock_day}th</strong> of next month.
              </p>

              {/* mini-calendar for next month */}
              <div className="rounded-xl border border-theme-border overflow-hidden">
                <div className="grid grid-cols-7 border-b border-theme-border bg-theme-raised">
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                    <div key={d} className="py-2 text-center text-[10px] font-bold text-theme-muted">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {(() => {
                    const month = dayjs().add(1, "month");
                    const start = month.startOf("month");
                    const alreadySaved = new Set(
                      nextMonthWeekoffData.offDays.filter(d => d.status === "allotted").map(d => d.off_date)
                    );
                    const cells: React.ReactNode[] = [];
                    for (let i = 0; i < start.day(); i++)
                      cells.push(<div key={`p${i}`} className="min-h-[40px] border-r border-b border-theme-border bg-theme-surface/30" />);
                    for (let d = 1; d <= month.daysInMonth(); d++) {
                      const ds = month.date(d).format("YYYY-MM-DD");
                      const isAlready = alreadySaved.has(ds) && !nextMonthSelectedOffDates.includes(ds);
                      const isPicked  = nextMonthSelectedOffDates.includes(ds);
                      const wk        = Math.ceil(d / 7);
                      const wkCount   = nextMonthSelectedOffDates.filter(x => Math.ceil(dayjs(x).date() / 7) === wk).length;
                      const wkFull    = wkCount >= nextMonthWeekoffData.settings.max_weekoffs_per_week && !isPicked;
                      cells.push(
                        <button key={ds} disabled={wkFull}
                          onClick={() => toggleNextMonthOffDate(ds)}
                          className={cn("min-h-[40px] text-xs font-semibold border-r border-b border-theme-border transition-all flex items-center justify-center",
                            isPicked    ? "bg-violet-500 text-white"
                            : isAlready ? "bg-violet-500/20 text-violet-700"
                            : wkFull    ? "bg-theme-surface/30 text-theme-subtle/40 cursor-not-allowed"
                            : "bg-theme-surface hover:bg-violet-500/10 hover:text-violet-600 text-theme-fg"
                          )}>
                          {d}
                        </button>
                      );
                    }
                    return cells;
                  })()}
                </div>
              </div>

              <p className="text-[10px] text-theme-muted">
                <span className="inline-block w-3 h-3 bg-violet-500 rounded-sm mr-1 align-middle" />Selected&nbsp;&nbsp;
                <span className="inline-block w-3 h-3 bg-violet-500/20 rounded-sm mr-1 align-middle" />Already saved
              </p>
            </div>
          )}

          <DialogFooter>
            <button onClick={() => setShowNextMonthModal(false)} className="px-4 py-2 text-sm font-semibold text-theme-muted hover:text-theme-fg">Cancel</button>
            <Button onClick={saveNextMonthAllotment} loading={savingNextMonthWeekoff} className="min-w-[140px]">
              <CheckCircle2 size={14} className="mr-1.5" /> Save Offs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Request Modal ───────────────────────────────────────────────── */}
      <Dialog open={showChangeReqModal} onOpenChange={setShowChangeReqModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft size={18} className="text-amber-500" />
              Request Weekoff Change
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-theme-raised border border-theme-border px-4 py-3">
              <p className="text-xs text-theme-muted mb-0.5">Moving weekoff from</p>
              <p className="text-sm font-bold text-theme-fg">{dayjs(changeReqForm.original_date).format("dddd, DD MMMM YYYY")}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-theme-muted block mb-1.5">New Date <span className="text-red-500">*</span></label>
              <input type="date" value={changeReqForm.requested_date}
                onChange={e => setChangeReqForm(f => ({ ...f, requested_date: e.target.value }))}
                min={dayjs().format("YYYY-MM-DD")}
                max={dayjs().endOf("month").format("YYYY-MM-DD")}
                className="w-full rounded-lg border border-theme-border bg-theme-page px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary transition-all" />
            </div>
            <div>
              <label className="text-xs font-semibold text-theme-muted block mb-1.5">Reason <span className="text-red-500">*</span></label>
              <textarea value={changeReqForm.reason} onChange={e => setChangeReqForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Explain why you need to change this weekoff..."
                className="w-full rounded-lg border border-theme-border bg-theme-page px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary transition-all min-h-[90px] resize-none" />
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border border-theme-border bg-amber-500/5 px-4 py-3">
              <AlertCircle size={13} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-theme-muted">This request goes to your manager and HR for approval.</p>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowChangeReqModal(false)} className="px-4 py-2 text-sm font-semibold text-theme-muted hover:text-theme-fg">Cancel</button>
            <Button onClick={submitChangeReq} loading={savingChangeReq} className="min-w-[160px]">
              <Send size={13} className="mr-1.5" /> Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sick Leave Modal ───────────────────────────────────────────────────── */}
      <Dialog open={showSickLeaveModal} onOpenChange={setShowSickLeaveModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer size={18} className="text-indigo-500" />
              Apply for Sick Leave
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-theme-muted block mb-1.5">From <span className="text-red-500">*</span></label>
                <input type="date" value={sickLeaveForm.from_date} min={sickMinDate} max={sickMaxDate}
                  onChange={e => setSickLeaveForm(f => ({ ...f, from_date: e.target.value, to_date: e.target.value < f.to_date ? f.to_date : e.target.value }))}
                  className="w-full rounded-lg border border-theme-border bg-theme-page px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-theme-muted block mb-1.5">To <span className="text-red-500">*</span></label>
                <input type="date" value={sickLeaveForm.to_date} min={sickLeaveForm.from_date} max={sickMaxDate}
                  onChange={e => setSickLeaveForm(f => ({ ...f, to_date: e.target.value }))}
                  className="w-full rounded-lg border border-theme-border bg-theme-page px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary transition-all" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-theme-muted block mb-1.5">Reason <span className="text-red-500">*</span></label>
              <textarea value={sickLeaveForm.reason} onChange={e => setSickLeaveForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Describe your illness or condition..."
                className="w-full rounded-lg border border-theme-border bg-theme-page px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary transition-all min-h-[90px] resize-none" />
            </div>

            <div>
              <label className="text-xs font-semibold text-theme-muted block mb-1.5">
                <span className="flex items-center gap-1.5"><Link2 size={12} />Certificate URL <span className="text-theme-subtle font-normal">(optional now)</span></span>
              </label>
              <input type="url" value={sickLeaveForm.certificate_url}
                onChange={e => setSickLeaveForm(f => ({ ...f, certificate_url: e.target.value }))}
                placeholder="https://drive.google.com/... or Dropbox link"
                className="w-full rounded-lg border border-theme-border bg-theme-page px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary transition-all" />
            </div>

            {attSettings?.certificate_deadline_days && (
              <div className="flex items-start gap-2.5 rounded-xl border border-theme-border bg-indigo-500/5 px-4 py-3">
                <AlertCircle size={13} className="text-indigo-500 mt-0.5 shrink-0" />
                <p className="text-xs text-theme-muted">Certificate due within <strong>{attSettings.certificate_deadline_days} days</strong>. Missing it may block your check-in.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setShowSickLeaveModal(false)} className="px-4 py-2 text-sm font-semibold text-theme-muted hover:text-theme-fg">Cancel</button>
            <Button onClick={submitSickLeave} loading={savingSickLeave} className="min-w-[160px]">
              <Send size={13} className="mr-1.5" /> Submit Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Certificate Submit Modal ────────────────────────────────────────────── */}
      <Dialog open={showCertModal} onOpenChange={setShowCertModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 size={18} className="text-emerald-500" />
              Submit Certificate
            </DialogTitle>
          </DialogHeader>
          {certTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-theme-raised border border-theme-border px-4 py-3 space-y-1">
                <p className="text-xs text-theme-muted">Sick leave period</p>
                <p className="text-sm font-bold text-theme-fg">{dayjs(certTarget.from_date).format("DD MMM")} – {dayjs(certTarget.to_date).format("DD MMM YYYY")}</p>
                <p className="text-[10px] text-theme-subtle">{certTarget.reason}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-theme-muted block mb-1.5">
                  Certificate Link <span className="text-red-500">*</span>
                  <span className="ml-2 font-normal text-theme-subtle">(Google Drive, Dropbox, etc.)</span>
                </label>
                <input type="url" value={certUrl} onChange={e => setCertUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/..."
                  className="w-full rounded-lg border border-theme-border bg-theme-page px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary transition-all" />
              </div>
              {certTarget.blocks_checkin && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
                  <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-600">Your check-in is currently blocked. Submitting the certificate will {attSettings?.require_cert_approval ? "send it for admin approval" : "restore access"}.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setShowCertModal(false)} className="px-4 py-2 text-sm font-semibold text-theme-muted hover:text-theme-fg">Cancel</button>
            <Button onClick={submitCert} loading={savingCert} className="min-w-[160px]">
              <CheckCircle2 size={13} className="mr-1.5" /> Submit Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Attendance Log / Unpaid Leave Overlay ──────────────────────────────── */}
      {showCheckModal && selectedDateForCheck && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200" onClick={closeModal}>
          <div className="w-full max-w-lg rounded-2xl bg-theme-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-theme-fg">
                  {takeLeaveType ? "Leave Application" : "Attendance Log"}
                </h3>
                <p className="text-xs text-theme-muted">{dayjs(selectedDateForCheck).format("dddd, DD MMMM YYYY")}</p>
              </div>
              <button onClick={closeModal} className="rounded-full p-2 text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-colors">
                <X size={16} />
              </button>
            </div>

            {!takeLeaveType ? (
              <>
                <div className="p-6 space-y-5">
                  <div className="rounded-xl bg-theme-raised border border-theme-border px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-theme-muted mb-1">Current Time</p>
                      <p className="text-3xl font-black text-theme-fg tracking-tight">{currentTime.format("HH:mm:ss")}</p>
                      <p className="text-xs text-theme-subtle mt-1">{currentTime.format("dddd")}</p>
                    </div>
                    <Clock size={48} className="text-theme-border" />
                  </div>
                  {logs[selectedDateForCheck] && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-emerald-500/10 border border-theme-border p-3">
                        <p className="text-[10px] font-semibold text-emerald-700 mb-1">Check In</p>
                        <p className="text-xl font-black text-emerald-600 tabular-nums">{logs[selectedDateForCheck]?.clock_in ? dayjs(`2000-01-01 ${logs[selectedDateForCheck].clock_in}`).format("HH:mm:ss") : "—"}</p>
                      </div>
                      <div className="rounded-xl bg-amber-500/10 border border-theme-border p-3">
                        <p className="text-[10px] font-semibold text-amber-700 mb-1">Check Out</p>
                        <p className="text-xl font-black text-amber-600 tabular-nums">{logs[selectedDateForCheck]?.clock_out ? dayjs(`2000-01-01 ${logs[selectedDateForCheck].clock_out}`).format("HH:mm:ss") : "—"}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-theme-border bg-theme-page px-6 py-4">
                  <button onClick={closeModal} className="px-4 py-2 text-sm font-semibold text-theme-muted hover:text-theme-fg transition-colors">Close</button>
                  {selectedDateForCheck === todayStr && (
                    <>
                      {!logs[selectedDateForCheck]?.clock_in && (
                        <Button onClick={handleCheckIn} disabled={actionLoading} className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm">
                          <Play size={14} className="fill-current mr-1.5" /> Check In
                        </Button>
                      )}
                      {logs[selectedDateForCheck]?.clock_in && !logs[selectedDateForCheck]?.clock_out && (
                        <Button onClick={handleCheckOut} disabled={actionLoading} className="bg-red-500 hover:bg-red-600 text-white shadow-sm">
                          <Square size={14} className="fill-current mr-1.5" /> Check Out
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="p-6 space-y-5">
                  <div>
                    <label className="text-xs font-semibold text-theme-muted block mb-1.5">Effective Date</label>
                    <input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} className="w-full rounded-lg border border-theme-border bg-theme-page px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-theme-muted block mb-1.5">Reason <span className="text-red-500">*</span></label>
                    <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)} placeholder="Provide a reason for your unpaid leave request..." className="w-full rounded-lg border border-theme-border bg-theme-page px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary transition-all min-h-[120px] resize-none" />
                  </div>
                  <div className="flex items-start gap-2.5 rounded-xl border border-theme-border bg-amber-500/5 px-4 py-3">
                    <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-theme-muted">This unpaid leave request requires manual verification by administration.</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-theme-border bg-theme-page px-6 py-4">
                  <button onClick={() => setTakeLeaveType(null)} className="px-4 py-2 text-sm font-semibold text-theme-muted hover:text-theme-fg transition-colors">Back</button>
                  <Button onClick={submitLeave} loading={actionLoading} className="min-w-[160px]">Submit Request</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────────

function CertBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: "Cert pending",  cls: "bg-amber-500/10 text-amber-700" },
    submitted: { label: "Under review",  cls: "bg-indigo-500/10 text-indigo-700" },
    approved:  { label: "Cert approved", cls: "bg-emerald-500/10 text-emerald-700" },
    rejected:  { label: "Cert rejected", cls: "bg-red-500/10 text-red-700" },
  };
  const { label, cls } = map[status] ?? map.pending;
  return <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide", cls)}>{label}</span>;
}
