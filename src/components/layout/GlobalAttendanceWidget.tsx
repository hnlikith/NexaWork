"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import React, { useState, useEffect, useCallback } from "react";
import { Clock, Play, Pause, Square, AlertTriangle, FileCheck2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { isPayrollInternOnly } from "@/lib/payroll-access";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { getPresenceSessionId } from "@/lib/log-ui";

type AttSession = {
  employee_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
};

type PauseState = {
  pauseStart: number | null;       // Date.now() when pause began
  totalPausedSeconds: number;      // running total of paused seconds across this day
};

const emptyPause: PauseState = { pauseStart: null, totalPausedSeconds: 0 };

function pauseKey(userId: string) {
  return `att-pause-${userId}-${dayjs().format("YYYY-MM-DD")}`;
}

function loadPauseState(userId: string): PauseState {
  if (typeof window === "undefined") return emptyPause;
  try {
    const raw = localStorage.getItem(pauseKey(userId));
    if (!raw) return emptyPause;
    const parsed = JSON.parse(raw);
    return {
      pauseStart: typeof parsed.pauseStart === "number" ? parsed.pauseStart : null,
      totalPausedSeconds: typeof parsed.totalPausedSeconds === "number" ? parsed.totalPausedSeconds : 0,
    };
  } catch {
    return emptyPause;
  }
}

function savePauseState(userId: string, state: PauseState) {
  try {
    localStorage.setItem(pauseKey(userId), JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function clearPauseState(userId: string) {
  try {
    localStorage.removeItem(pauseKey(userId));
  } catch {
    // ignore
  }
}

function formatHMS(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function postPresenceStatus(status: string) {
  fetch("/api/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, device_id: getPresenceSessionId() }),
  }).catch(() => {});
}

export function GlobalAttendanceWidget() {
  const { user, loading: authLoading } = useAuth();

  const [activeSession, setActiveSession] = useState<AttSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(dayjs());
  const [elapsed, setElapsed] = useState(0);
  const [pauseState, setPauseState] = useState<PauseState>(emptyPause);

  // Late detection — protocol check-in threshold (HH:mm:ss)
  const [checkInThreshold, setCheckInThreshold] = useState("09:30:00");

  // Check-in gating — overdue sick-leave certificate
  const [blockingLeaves, setBlockingLeaves] = useState<any[]>([]);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [certUrl, setCertUrl] = useState("");
  const [certTarget, setCertTarget] = useState<any>(null);
  const [savingCert, setSavingCert] = useState(false);

  // Live wall-clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(dayjs()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch active attendance protocol to determine late threshold
  useEffect(() => {
    if (!user) return;
    const fetchProto = async () => {
      try {
        const { data: emp } = await supabase.from("employees").select("department").eq("id", user.id).maybeSingle();
        const { data: protos } = await supabase.from("attendance_protocols")
          .select("check_in_time, target_type, type")
          .eq("status", "active")
          .order("created_at", { ascending: false });
        const proto = protos?.find((p: any) => p.target_type === "All" || p.type === `Department:${emp?.department}`);
        if (proto?.check_in_time) setCheckInThreshold(proto.check_in_time);
      } catch {}
    };
    fetchProto();
  }, [user]);

  // Fetch today's session
  const fetchSession = useCallback(async () => {
    if (!user || authLoading) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const today = dayjs().format("YYYY-MM-DD");
      const { data, error } = await supabase
        .from("attendance_logs")
        .select("*")
        .eq("employee_id", user.id)
        .eq("date", today)
        .maybeSingle();

      if (error) {
        setActiveSession(null);
      } else {
        setActiveSession((data as AttSession) ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchSession();

    const chan = supabase.channel("global_att")
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_logs', filter: `employee_id=eq.${user.id}` },
        () => { setTimeout(fetchSession, 500); }
      )
      .subscribe();

    return () => { supabase.removeChannel(chan); };
  }, [user, authLoading, fetchSession]);

  // Load persisted pause state when the user becomes available
  useEffect(() => {
    if (!user) return;
    setPauseState(loadPauseState(user.id));
  }, [user]);

  // Tick the elapsed counter, subtracting paused time
  useEffect(() => {
    if (!activeSession?.clock_in || activeSession.clock_out) {
      setElapsed(0);
      return;
    }

    const start = dayjs(`2000-01-01 ${activeSession.clock_in}`);
    const tick = () => {
      const now = dayjs();
      const baseDiff = now.diff(
        dayjs().hour(start.hour()).minute(start.minute()).second(start.second()),
        "second"
      );
      let totalPaused = pauseState.totalPausedSeconds;
      if (pauseState.pauseStart) {
        totalPaused += Math.floor((Date.now() - pauseState.pauseStart) / 1000);
      }
      setElapsed(Math.max(0, baseDiff - totalPaused));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeSession, pauseState]);

  const isCheckedIn = !!(activeSession?.clock_in && !activeSession?.clock_out);
  const isPaused = isCheckedIn && pauseState.pauseStart !== null;

  const handleCheckIn = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      // ── gate: check for blocking sick-leave certificates ────────────────
      const blockRes = await fetch("/api/attendance/blocks-checkin");
      if (blockRes.ok) {
        const { blocked, leaves } = await blockRes.json();
        if (blocked && leaves?.length) {
          setBlockingLeaves(leaves);
          setCertTarget(leaves[0]);
          setCertUrl(leaves[0]?.certificate_url || "");
          setShowBlockDialog(true);
          setActionLoading(false);
          return;
        }
      }

      const today   = dayjs().format("YYYY-MM-DD");
      const nowTime = dayjs().format("HH:mm:ss");
      const [ph, pm] = checkInThreshold.split(":").map(Number);
      const threshold = dayjs().hour(ph).minute(pm).second(0);
      const checkInStatus = dayjs().isAfter(threshold) ? "late" : "present";
      const { error } = await supabase.from("attendance_logs").upsert({
        employee_id: user.id,
        date: today,
        clock_in: nowTime,
        status: checkInStatus,
      }, { onConflict: "employee_id,date" });
      if (error) throw error;
      if (isPayrollInternOnly(user.email)) {
        fetch("/api/interns/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "attendance.check_in", summary: `Checked in for attendance (marked as ${checkInStatus})` }),
        }).catch(() => {});
      }
      clearPauseState(user.id);
      setPauseState(emptyPause);
      postPresenceStatus("available");
      if (checkInStatus === "late") {
        toast.warning("Checked in — marked as Late");
      } else {
        toast.success("Checked in successfully");
      }
      await fetchSession();
    } catch {
      toast.error("Failed to check in");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCertSubmit = async () => {
    if (!certTarget || !certUrl.trim()) { toast.error("Paste the certificate URL"); return; }
    setSavingCert(true);
    try {
      const res = await fetch("/api/attendance/sick-leave", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: certTarget.id, action: "submit_cert", certificate_url: certUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.needsApproval) {
        toast.info("Certificate submitted — awaiting admin approval");
      } else {
        toast.success("Certificate accepted — you can now check in");
        setShowBlockDialog(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to submit");
    } finally {
      setSavingCert(false);
    }
  };

  const handleCheckOut = async () => {
    if (!user) return;
    setActionLoading(true);
    const today = dayjs().format("YYYY-MM-DD");
    const nowTime = dayjs().format("HH:mm:ss");
    try {
      const { error } = await supabase
        .from("attendance_logs")
        .update({ clock_out: nowTime })
        .eq("employee_id", user.id)
        .eq("date", today);
      if (error) throw error;
      if (isPayrollInternOnly(user.email)) {
        fetch("/api/interns/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "attendance.check_out", summary: "Checked out of attendance" }),
        }).catch(() => {});
      }
      clearPauseState(user.id);
      setPauseState(emptyPause);
      postPresenceStatus("offline");
      toast.success("Checked out successfully");
      await fetchSession();
    } catch {
      toast.error("Failed to check out");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = () => {
    if (!user) return;
    const next: PauseState = {
      pauseStart: Date.now(),
      totalPausedSeconds: pauseState.totalPausedSeconds,
    };
    savePauseState(user.id, next);
    setPauseState(next);
    postPresenceStatus("break");
    if (isPayrollInternOnly(user.email)) {
      fetch("/api/interns/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attendance.pause", summary: "Paused attendance (went on break)" }),
      }).catch(() => {});
    }
    toast.info("Attendance paused");
  };

  const handleResume = () => {
    if (!user || pauseState.pauseStart === null) return;
    const addedPaused = Math.floor((Date.now() - pauseState.pauseStart) / 1000);
    const next: PauseState = {
      pauseStart: null,
      totalPausedSeconds: pauseState.totalPausedSeconds + addedPaused,
    };
    savePauseState(user.id, next);
    setPauseState(next);
    postPresenceStatus("available");
    if (isPayrollInternOnly(user.email)) {
      fetch("/api/interns/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attendance.resume", summary: "Resumed attendance" }),
      }).catch(() => {});
    }
    toast.success("Attendance resumed");
  };

  if (loading || authLoading) return null;

  return (
    <>
    {/* ── blocking cert dialog ──────────────────────────────────────────────── */}
    <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle size={18} />
            Check-in Blocked
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-theme-muted">
            You have an overdue sick-leave certificate. Submit it to unlock check-in.
          </p>
          {certTarget && (
            <div className="rounded-xl border border-theme-border bg-theme-raised px-4 py-3 space-y-1">
              <p className="text-xs text-theme-muted">Sick leave</p>
              <p className="text-sm font-bold text-theme-fg">{certTarget.from_date} – {certTarget.to_date}</p>
              <p className="text-[11px] text-red-600 font-semibold">Deadline was {certTarget.certificate_deadline}</p>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-theme-muted block mb-1.5">
              Certificate Link <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-theme-subtle">(Google Drive, Dropbox…)</span>
            </label>
            <input type="url" value={certUrl} onChange={e => setCertUrl(e.target.value)}
              placeholder="https://drive.google.com/file/..."
              className="w-full rounded-lg border border-theme-border bg-theme-page px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary transition-all" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => setShowBlockDialog(false)} className="px-4 py-2 text-sm font-semibold text-theme-muted hover:text-theme-fg">
            Cancel
          </button>
          <Button onClick={handleCertSubmit} disabled={savingCert || !certUrl.trim()}
            className="min-w-[160px] bg-emerald-500 hover:bg-emerald-600 text-white">
            <FileCheck2 size={14} className="mr-1.5" />
            {savingCert ? "Submitting…" : "Submit Certificate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <div className="flex items-center gap-3">
      {/* Live clock */}
      <div className="hidden sm:flex items-center gap-2 text-sm">
        <Clock className="size-4 text-muted-foreground" />
        <span className="font-medium tabular-nums tracking-tight text-foreground">
          {currentTime.format("hh:mm A")}
        </span>
      </div>

      {isCheckedIn && (
        <>
          <Separator orientation="vertical" className="hidden sm:block h-5" />
          {/* Status badge */}
          <Badge
            variant={isPaused ? "outline" : "secondary"}
            className={cn(
              "gap-1.5 h-7 px-2.5 font-semibold tabular-nums",
              isPaused
                ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            )}
            title={isPaused ? "Paused" : "Active"}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isPaused ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
              )}
            />
            {formatHMS(elapsed)}
          </Badge>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {isCheckedIn ? (
          <>
            {isPaused ? (
              <Button onClick={handleResume} disabled={actionLoading}>
                <Play className="fill-current" />
                Resume
              </Button>
            ) : (
              <Button variant="outline" onClick={handlePause} disabled={actionLoading}>
                <Pause />
                Pause
              </Button>
            )}
            <Button variant="destructive" onClick={handleCheckOut} disabled={actionLoading}>
              <Square className="fill-current" />
              Check Out
            </Button>
          </>
        ) : (
          <Button onClick={handleCheckIn} disabled={actionLoading}>
            <Play className="fill-current" />
            Check In
          </Button>
        )}
      </div>
    </div>
    </>
  );
}
