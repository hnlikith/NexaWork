"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/layout/AuthProvider";
import { cn } from "@/lib/utils";
import { TrendingUp, Award, Target, AlertCircle, Star, CheckCircle2 } from "lucide-react";
import dayjs from "@/lib/dayjs";
import axios from "axios";

interface KpiMetric {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  kpi_score: number;
  kpi_entries: any[];
  kra_score: number;
  kra_metrics: any;
  behavioral_score: number;
  behavioral_metrics: any;
  final_score: number;
  rating_label: string;
  remarks?: string;
  entered_at?: string;
  updated_at?: string;
  employee?: { id: string; name: string; employeeId: string; department: string };
}

export function EmployeeKpiDashboard() {
  const { user } = useAuth();
  const [currentKpi, setCurrentKpi] = useState<KpiMetric | null>(null);
  const [previousKpi, setPreviousKpi] = useState<KpiMetric | null>(null);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<"improving" | "stable" | "declining">("stable");

  const fetchKpiData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      // Fetch current month KPI
      const now = dayjs();
      const { data: currentRes } = await axios.get(`/api/kpi`, {
        params: {
          employeeId: user.id,
          month: now.month() + 1,
          year: now.year()
        }
      });

      const current = currentRes.data?.[0] || null;
      setCurrentKpi(current);

      // Fetch previous month for trend
      const prevMonth = now.subtract(1, "month");
      const { data: prevRes } = await axios.get(`/api/kpi`, {
        params: {
          employeeId: user.id,
          month: prevMonth.month() + 1,
          year: prevMonth.year()
        }
      });

      const previous = prevRes.data?.[0] || null;
      if (previous) {
        setPreviousKpi(previous);

        // Calculate trend
        if (current?.final_score && previous?.final_score) {
          const diff = current.final_score - previous.final_score;
          if (diff > 2) setTrend("improving");
          else if (diff < -2) setTrend("declining");
          else setTrend("stable");
        }
      }
    } catch (err) {
      console.error("KPI fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchKpiData();

    // Poll every 5 seconds for real-time updates
    const interval = setInterval(fetchKpiData, 5000);
    return () => clearInterval(interval);
  }, [fetchKpiData]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-64 rounded-3xl bg-theme-raised" />
        <div className="h-32 rounded-2xl bg-theme-raised" />
      </div>
    );
  }

  if (!currentKpi) {
    return (
      <div className="rounded-3xl border border-theme-border bg-theme-surface p-8">
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <AlertCircle size={32} className="text-theme-subtle/40" />
          <div className="text-center">
            <p className="text-sm font-black text-theme-fg uppercase tracking-widest">No KPI Data Yet</p>
            <p className="text-[10px] text-theme-muted mt-1">HR will enter your performance metrics here</p>
          </div>
        </div>
      </div>
    );
  }

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case "Outstanding":
        return { bg: "from-emerald-500/20 to-emerald-500/5", text: "text-emerald-700 dark:text-emerald-400", badge: "bg-emerald-100 text-emerald-700" };
      case "Exceeds":
        return { bg: "from-sky-500/20 to-sky-500/5", text: "text-sky-700 dark:text-sky-400", badge: "bg-sky-100 text-sky-700" };
      case "Meets":
        return { bg: "from-amber-500/20 to-amber-500/5", text: "text-amber-700 dark:text-amber-400", badge: "bg-amber-100 text-amber-700" };
      case "Needs Improvement":
        return { bg: "from-orange-500/20 to-orange-500/5", text: "text-orange-700 dark:text-orange-400", badge: "bg-orange-100 text-orange-700" };
      case "Poor":
        return { bg: "from-red-500/20 to-red-500/5", text: "text-red-700 dark:text-red-400", badge: "bg-red-100 text-red-700" };
      default:
        return { bg: "from-theme-primary/10 to-transparent", text: "text-theme-fg", badge: "bg-theme-raised text-theme-fg" };
    }
  };

  const ratingStyle = getRatingColor(currentKpi.rating_label);

  const getTrendIcon = () => {
    if (trend === "improving") return <TrendingUp size={16} className="text-emerald-500" />;
    if (trend === "declining") return <TrendingUp size={16} className="rotate-180 text-red-500" />;
    return <Target size={16} className="text-theme-muted" />;
  };

  return (
    <div className="space-y-6">
      {/* Main Performance Card - Matching Admin Panel Design */}
      <div className={cn(
        "rounded-3xl border border-theme-border bg-gradient-to-br p-8 overflow-hidden relative",
        ratingStyle.bg
      )}>
        {/* Background Decoration */}
        <div className="absolute top-0 right-0 p-8 transform translate-x-1/4 -translate-y-1/4 opacity-5 pointer-events-none">
          <Award size={240} className="text-theme-fg" />
        </div>

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-theme-subtle uppercase tracking-[0.3em]">Your Performance Score</span>
          </div>

          {/* Main Score */}
          <div className="grid grid-cols-2 gap-12 mb-12">
            <div>
              <h2 className="text-5xl font-black text-theme-fg tracking-tighter mb-2">
                {currentKpi.final_score.toFixed(1)}
              </h2>
              <p className="text-[10px] font-black text-theme-muted uppercase tracking-widest leading-loose">Overall Performance Score</p>
              <div className="mt-6 h-1 w-full bg-theme-primary/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-theme-primary rounded-full"
                  style={{ width: `${Math.min(currentKpi.final_score, 100)}%` }}
                />
              </div>
            </div>

            <div className="space-y-4">
              {/* KPI Component Score */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">KPI Score</span>
                  <span className="text-2xl font-black text-emerald-600">{currentKpi.kpi_score.toFixed(1)}</span>
                </div>
                <div className="h-0.5 w-full bg-emerald-500/20 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(currentKpi.kpi_score, 100)}%` }} />
                </div>
              </div>

              {/* KRA Component Score */}
              <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-sky-700 dark:text-sky-400 uppercase tracking-widest">KRA Score</span>
                  <span className="text-2xl font-black text-sky-600">{currentKpi.kra_score.toFixed(1)}</span>
                </div>
                <div className="h-0.5 w-full bg-sky-500/20 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500" style={{ width: `${Math.min(currentKpi.kra_score, 100)}%` }} />
                </div>
              </div>

              {/* Behavioral Component Score */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">Behavioral</span>
                  <span className="text-2xl font-black text-amber-600">{currentKpi.behavioral_score.toFixed(1)}</span>
                </div>
                <div className="h-0.5 w-full bg-amber-500/20 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${Math.min(currentKpi.behavioral_score, 100)}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Rating Badge and Trend */}
          <div className="flex gap-8 border-t border-theme-border/40 pt-8">
            <div>
              <span className="block text-[8px] font-black text-theme-muted uppercase tracking-widest mb-2">Performance Rating</span>
              <div className={cn("px-4 py-2.5 rounded-2xl font-black text-sm uppercase tracking-widest inline-block", ratingStyle.badge)}>
                {currentKpi.rating_label === "Outstanding" && <Star size={14} className="inline mr-1.5" fill="currentColor" />}
                {currentKpi.rating_label === "Exceeds" && <CheckCircle2 size={14} className="inline mr-1.5" />}
                {currentKpi.rating_label}
              </div>
            </div>

            <div>
              <span className="block text-[8px] font-black text-theme-muted uppercase tracking-widest mb-2">Trend Status</span>
              <div className="flex items-center gap-2 text-sm font-black text-theme-fg">
                {getTrendIcon()}
                <span className="capitalize">{trend}</span>
                {previousKpi && (
                  <span className={cn(
                    "ml-2 text-xs",
                    currentKpi.final_score > previousKpi.final_score ? "text-emerald-600" : "text-red-600"
                  )}>
                    {currentKpi.final_score > previousKpi.final_score ? "↑" : "↓"}
                    {Math.abs(currentKpi.final_score - previousKpi.final_score).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Section */}
      {currentKpi.remarks && (
        <div className="rounded-2xl border border-theme-border bg-theme-page/50 p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-theme-raised rounded-lg mt-1">
              <AlertCircle size={16} className="text-theme-primary" />
            </div>
            <div>
              <p className="text-[10px] font-black text-theme-muted uppercase tracking-widest mb-2">Manager Feedback</p>
              <p className="text-sm text-theme-fg leading-relaxed">{currentKpi.remarks}</p>
            </div>
          </div>
        </div>
      )}

      {/* Period Info */}
      <div className="text-center space-y-2">
        <p className="text-sm font-black text-theme-fg uppercase tracking-widest">
          {dayjs().month(currentKpi.month - 1).year(currentKpi.year).format("MMMM YYYY")}
        </p>
        {currentKpi.updated_at && (
          <p className="text-[10px] text-theme-muted font-bold">
            Last Updated: {dayjs(currentKpi.updated_at).format("MMM DD, YYYY HH:mm")}
          </p>
        )}
      </div>
    </div>
  );
}
