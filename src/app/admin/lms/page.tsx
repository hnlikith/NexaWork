/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Plus, Users, BookOpen, Award, BarChart3,
  Search, Filter, Eye, Edit3, Trash2, Loader2,
  GraduationCap, Target, CheckCircle2, Zap,
  Clock, TrendingUp, MoreVertical, Star,
  ArrowUpRight, Megaphone, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/ToastLegacy";
import { cn } from "@/lib/utils";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult
} from "@hello-pangea/dnd";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KanbanCard {
  id: string;
  enrollmentId: string;
  employeeId: string;
  courseId: string;
  employeeName: string;
  employeeInitials: string;
  courseName: string;
  courseCategory: string;
  progress: number;
  enrolledAt: string;
  certId?: string;
}

type ColumnId = "not_started" | "in_progress" | "completed" | "certified";

interface KanbanColumn {
  id: ColumnId;
  title: string;
  color: string;
  bgColor: string;
  borderColor: string;
  headerBg: string;
  icon: React.ElementType;
  cards: KanbanCard[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500",
  "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500"
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getColumnForCard(progress: number, hasCert: boolean): ColumnId {
  if (hasCert) return "certified";
  if (progress >= 100) return "completed";
  if (progress > 0) return "in_progress";
  return "not_started";
}

const COLUMNS: Omit<KanbanColumn, "cards">[] = [
  {
    id: "not_started",
    title: "Not Started",
    color: "text-slate-400",
    bgColor: "bg-slate-500/5",
    borderColor: "border-slate-500/20",
    headerBg: "bg-slate-500/10",
    icon: BookOpen,
  },
  {
    id: "in_progress",
    title: "In Progress",
    color: "text-blue-400",
    bgColor: "bg-blue-500/5",
    borderColor: "border-blue-500/20",
    headerBg: "bg-blue-500/10",
    icon: Target,
  },
  {
    id: "completed",
    title: "Completed",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/5",
    borderColor: "border-emerald-500/20",
    headerBg: "bg-emerald-500/10",
    icon: CheckCircle2,
  },
  {
    id: "certified",
    title: "Certified",
    color: "text-amber-400",
    bgColor: "bg-amber-500/5",
    borderColor: "border-amber-500/20",
    headerBg: "bg-amber-500/10",
    icon: Award,
  },
];

// ─── Kanban Card Component ────────────────────────────────────────────────────

function LMSCard({
  card,
  index,
  columnId,
}: {
  card: KanbanCard;
  index: number;
  columnId: ColumnId;
}) {
  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={cn(
            "group rounded-2xl border bg-theme-surface p-4 space-y-3 transition-all duration-200 cursor-grab active:cursor-grabbing",
            "border-theme-border hover:border-theme-primary/40 hover:shadow-lg hover:shadow-black/10",
            snapshot.isDragging && "shadow-2xl shadow-black/30 rotate-1 border-theme-primary/60 scale-[1.02]"
          )}
        >
          {/* Employee row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-black shrink-0",
                  AVATAR_COLORS[
                    card.employeeName.charCodeAt(0) % AVATAR_COLORS.length
                  ]
                )}
              >
                {card.employeeInitials}
              </div>
              <div>
                <p className="text-xs font-bold text-theme-fg leading-none">
                  {card.employeeName}
                </p>
                <p className="text-[10px] text-theme-muted mt-0.5">
                  {new Date(card.enrolledAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
            </div>
            {columnId === "certified" && (
              <div className="h-6 w-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Star size={10} className="text-amber-400" fill="currentColor" />
              </div>
            )}
          </div>

          {/* Course */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-theme-fg leading-snug line-clamp-2">
              {card.courseName}
            </p>
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 uppercase font-black">
              {card.courseCategory}
            </Badge>
          </div>

          {/* Progress bar (only for in-progress) */}
          {columnId === "in_progress" && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black text-theme-muted uppercase tracking-wider">
                  Progress
                </span>
                <span className="text-[10px] font-black text-blue-400">
                  {card.progress}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-theme-raised overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${card.progress}%` }}
                />
              </div>
            </div>
          )}

          {columnId === "certified" && (
            <div className="flex items-center gap-1.5 text-[9px] font-black text-amber-400 uppercase tracking-wider">
              <Award size={10} />
              Certificate Issued
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminLMSPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState("courses");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [stats, setStats] = useState([
    { label: "Total Courses", value: "—", icon: BookOpen, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Enrolled Students", value: "—", icon: Users, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Certifications Issued", value: "—", icon: Award, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Avg. Progress", value: "—", icon: BarChart3, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ]);

  const [courses, setCourses] = useState<any[]>([]);
  const [pendingCerts, setPendingCerts] = useState<any[]>([]);

  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>(
    COLUMNS.map((c) => ({ ...c, cards: [] }))
  );

  // ─── Data Fetch ─────────────────────────────────────────────────────────────

  const fetchLMSData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [courseRes, enrollRes, certRes] = await Promise.all([
        supabase.from("lms_courses").select("id", { count: "exact", head: true }),
        supabase.from("lms_enrollments").select("id", { count: "exact", head: true }),
        supabase.from("lms_certifications").select("id", { count: "exact", head: true }),
      ]);

      // Courses with enrollment stats
      const { data: courseData } = await supabase
        .from("lms_courses")
        .select("*, lms_enrollments(progress_percent)")
        .order("created_at", { ascending: false });

      if (courseData) {
        const formatted = courseData.map((c) => {
          const enrollments = c.lms_enrollments || [];
          const avg = enrollments.length
            ? Math.round(
                enrollments.reduce(
                  (acc: number, e: any) => acc + (e.progress_percent || 0),
                  0
                ) / enrollments.length
              )
            : 0;
          return {
            id: c.id,
            title: c.title,
            category: c.category,
            students: enrollments.length,
            status: c.status === "published" ? "Published" : c.status === "archived" ? "Archived" : "Draft",
            completion: avg,
          };
        });
        setCourses(formatted);

        const allEnrollments = courseData.flatMap((c) => c.lms_enrollments || []);
        const globalAvg = allEnrollments.length
          ? Math.round(
              allEnrollments.reduce(
                (acc: number, e: any) => acc + (e.progress_percent || 0),
                0
              ) / allEnrollments.length
            )
          : 0;

        setStats([
          { label: "Total Courses", value: String(courseRes.count || 0), icon: BookOpen, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "Enrolled Students", value: String(enrollRes.count || 0), icon: Users, color: "text-violet-500", bg: "bg-violet-500/10" },
          { label: "Certifications Issued", value: String(certRes.count || 0), icon: Award, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "Avg. Progress", value: `${globalAvg}%`, icon: BarChart3, color: "text-emerald-500", bg: "bg-emerald-500/10" },
        ]);
      }

      // Kanban: enrollments grouped by progress stage
      const { data: enrollments } = await supabase
        .from("lms_enrollments")
        .select(
          `id, progress_percent, enrolled_at, employee_id, course_id,
           employees(name),
           lms_courses(title, category)`
        )
        .order("enrolled_at", { ascending: false });

      const { data: certs } = await supabase
        .from("lms_certifications")
        .select("id, employee_id, course_id");

      const certSet = new Set(
        (certs || []).map((c) => `${c.employee_id}:${c.course_id}`)
      );
      const certMap = new Map(
        (certs || []).map((c) => [`${c.employee_id}:${c.course_id}`, c.id])
      );

      const allCards: KanbanCard[] = (enrollments || []).map((e, idx) => {
        const key = `${e.employee_id}:${e.course_id}`;
        const hasCert = certSet.has(key);
        const name = (e.employees as any)?.name || "Unknown";
        const columnId = getColumnForCard(e.progress_percent || 0, hasCert);
        return {
          id: e.id,
          enrollmentId: e.id,
          employeeId: e.employee_id,
          courseId: e.course_id,
          employeeName: name,
          employeeInitials: getInitials(name),
          courseName: (e.lms_courses as any)?.title || "Unknown Course",
          courseCategory: (e.lms_courses as any)?.category || "General",
          progress: e.progress_percent || 0,
          enrolledAt: e.enrolled_at,
          certId: certMap.get(key),
          columnId,
        } as KanbanCard & { columnId: ColumnId };
      });

      setKanbanColumns(
        COLUMNS.map((col) => ({
          ...col,
          cards: allCards.filter((c: any) => c.columnId === col.id),
        }))
      );

      // Pending certs: completed but no cert
      const pendingList = allCards.filter(
        (c: any) => c.columnId === "completed"
      );
      setPendingCerts(pendingList.slice(0, 5));
    } catch (err) {
      console.error("LMS Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Real-time ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchLMSData();
    const channel = supabase
      .channel("lms_admin_board")
      .on("postgres_changes", { event: "*", schema: "public", table: "lms_courses" }, () => fetchLMSData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "lms_enrollments" }, () => fetchLMSData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "lms_certifications" }, () => fetchLMSData(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLMSData]);

  // ─── Drag & Drop ─────────────────────────────────────────────────────────────

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || source.droppableId === destination.droppableId) return;

    const fromColId = source.droppableId as ColumnId;
    const toColId = destination.droppableId as ColumnId;

    // Find the card being moved
    const fromCol = kanbanColumns.find((c) => c.id === fromColId)!;
    const card = fromCol.cards[source.index];
    if (!card) return;

    // Optimistic update
    setKanbanColumns((prev) =>
      prev.map((col) => {
        if (col.id === fromColId) {
          return { ...col, cards: col.cards.filter((c) => c.id !== draggableId) };
        }
        if (col.id === toColId) {
          const newCards = [...col.cards];
          newCards.splice(destination.index, 0, { ...card });
          return { ...col, cards: newCards };
        }
        return col;
      })
    );

    // Persist to DB
    try {
      if (toColId === "not_started") {
        await supabase
          .from("lms_enrollments")
          .update({ progress_percent: 0, completed_at: null })
          .eq("id", card.enrollmentId);
      } else if (toColId === "in_progress") {
        await supabase
          .from("lms_enrollments")
          .update({ progress_percent: Math.max(10, card.progress), completed_at: null })
          .eq("id", card.enrollmentId);
      } else if (toColId === "completed") {
        await supabase
          .from("lms_enrollments")
          .update({ progress_percent: 100, completed_at: new Date().toISOString() })
          .eq("id", card.enrollmentId);
      } else if (toColId === "certified") {
        // Mark complete + issue cert
        await supabase
          .from("lms_enrollments")
          .update({ progress_percent: 100, completed_at: new Date().toISOString() })
          .eq("id", card.enrollmentId);
        const { error: certErr } = await supabase.from("lms_certifications").insert({
          course_id: card.courseId,
          employee_id: card.employeeId,
          certificate_number: `CERT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          issue_date: new Date().toISOString().split("T")[0],
        });
        if (!certErr) {
          showToast(`Certificate issued to ${card.employeeName}!`, "success");
        }
      }
      showToast("Progress updated", "success");
    } catch {
      showToast("Failed to update. Rolling back.", "error");
      fetchLMSData(true);
    }
  };

  // ─── Issue Cert from Queue ───────────────────────────────────────────────────

  const issueCertificate = async (card: KanbanCard) => {
    try {
      await supabase.from("lms_certifications").insert({
        course_id: card.courseId,
        employee_id: card.employeeId,
        certificate_number: `CERT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        issue_date: new Date().toISOString().split("T")[0],
      });
      showToast(`Certificate issued to ${card.employeeName}!`, "success");
      fetchLMSData(true);
    } catch {
      showToast("Failed to issue certificate.", "error");
    }
  };

  // ─── Filtered Courses ────────────────────────────────────────────────────────

  const filteredCourses = courses.filter(
    (c) =>
      !searchQuery ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─── Engagement Heatmap (deterministic seeded heights) ──────────────────────

  const heatmapHeights = Array.from({ length: 24 }, (_, i) => {
    const peak = [9, 10, 11, 14, 15, 16];
    const base = peak.includes(i) ? 55 : 15;
    return base + ((i * 17 + 7) % 30);
  });

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardShell
      moduleKey="lms_academy"
      title="Academy Manager"
      subtitle="Track employee learning progress, manage curriculum, and issue certifications in real-time."
      actions={
        <Button
          className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold"
          onClick={() => (window.location.href = "/admin/lms/courses")}
        >
          <Plus size={16} className="mr-2" /> New Course
        </Button>
      }
    >
      <div className="space-y-8">

        {/* ── Stats Grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat, i) => (
            <div key={i} className="page-card flex items-center gap-3">
              <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", stat.bg)}>
                <stat.icon size={15} className={stat.color} />
              </div>
              <div>
                <p className="text-[11px] text-theme-muted">{stat.label}</p>
                <p className={cn("text-lg font-black leading-tight", stat.color)}>
                  {loading ? <span className="opacity-40">—</span> : stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Learning Progress Kanban ─────────────────────────────────────── */}
        <div className="page-card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-theme-border flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-black uppercase tracking-widest text-theme-fg flex items-center gap-2">
                <GraduationCap size={16} className="text-theme-primary" />
                Learning Progress Board
              </h3>
              <p className="text-[11px] text-theme-muted">
                Drag cards to update employee progress stages — changes sync instantly
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success" className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </Badge>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="h-64 flex items-center justify-center text-theme-muted">
                <Loader2 className="animate-spin mr-2" size={20} />
                <span className="text-xs font-black uppercase tracking-widest">Loading board...</span>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {kanbanColumns.map((col) => (
                    <div key={col.id} className={cn("rounded-2xl border overflow-hidden flex flex-col", col.borderColor)}>
                      {/* Column header */}
                      <div className={cn("px-4 py-3 flex items-center justify-between", col.headerBg)}>
                        <div className="flex items-center gap-2">
                          <col.icon size={14} className={col.color} />
                          <span className={cn("text-[11px] font-black uppercase tracking-widest", col.color)}>
                            {col.title}
                          </span>
                        </div>
                        <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full", col.headerBg, col.color)}>
                          {col.cards.length}
                        </span>
                      </div>

                      {/* Drop zone */}
                      <Droppable droppableId={col.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={cn(
                              "flex-1 min-h-[200px] p-3 space-y-3 transition-colors duration-200",
                              col.bgColor,
                              snapshot.isDraggingOver && "ring-2 ring-inset ring-theme-primary/30"
                            )}
                          >
                            {col.cards.length === 0 && !snapshot.isDraggingOver && (
                              <div className="h-full min-h-[160px] flex flex-col items-center justify-center gap-2 opacity-40">
                                <col.icon size={24} className={col.color} />
                                <span className="text-[10px] font-black uppercase tracking-widest text-theme-muted text-center">
                                  Drop cards here
                                </span>
                              </div>
                            )}
                            {col.cards.map((card, idx) => (
                              <LMSCard key={card.id} card={card} index={idx} columnId={col.id} />
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  ))}
                </div>
              </DragDropContext>
            )}
          </div>
        </div>

        {/* ── Bottom Row: Heatmap + Pending Certs ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Engagement Heatmap */}
          <div className="lg:col-span-2 page-card">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-theme-muted flex items-center gap-2">
                <BarChart3 size={16} /> Engagement Heatmap
              </h3>
              <Badge variant="success">Peak: 9AM – 4PM</Badge>
            </div>
            <div className="h-52 flex items-end gap-[3px] px-1">
              {heatmapHeights.map((h, i) => (
                <div key={i} className="flex-1 group relative">
                  <div
                    className="w-full rounded-t-sm bg-theme-primary/25 group-hover:bg-theme-primary transition-all duration-300"
                    style={{ height: `${h}%` }}
                  />
                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-[9px] px-1.5 py-0.5 rounded font-black whitespace-nowrap border border-theme-border pointer-events-none">
                    {i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`}
                    <span className="text-theme-muted ml-1">{h}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 px-1 text-[9px] font-black text-theme-muted uppercase tracking-widest">
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
          </div>

          {/* Pending Certs Queue */}
          <div className="page-card flex flex-col">
            <h3 className="text-sm font-black uppercase tracking-widest text-theme-muted mb-5 flex items-center gap-2">
              <Award size={16} className="text-amber-500" /> Pending Certs
            </h3>
            <div className="flex-1 space-y-3">
              {loading ? (
                <div className="py-8 text-center text-[10px] text-theme-muted font-black uppercase tracking-widest">
                  Loading...
                </div>
              ) : pendingCerts.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <CheckCircle2 size={28} className="mx-auto text-emerald-500/40" />
                  <p className="text-[10px] text-theme-muted font-black uppercase tracking-widest">
                    All caught up!
                  </p>
                </div>
              ) : (
                pendingCerts.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-theme-raised border border-theme-border hover:border-amber-500/40 transition-all group"
                  >
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0",
                        AVATAR_COLORS[card.employeeName.charCodeAt(0) % AVATAR_COLORS.length]
                      )}
                    >
                      {card.employeeInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-theme-fg truncate">
                        {card.employeeName}
                      </p>
                      <p className="text-[10px] text-theme-muted truncate">
                        {card.courseName}
                      </p>
                    </div>
                    <button
                      onClick={() => issueCertificate(card)}
                      className="shrink-0 h-7 px-2 rounded-lg bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-500/20"
                    >
                      Issue
                    </button>
                  </div>
                ))
              )}
            </div>
            <Button
              variant="secondary"
              className="w-full mt-4 text-[10px] font-black uppercase tracking-widest"
              onClick={() => (window.location.href = "/admin/lms/certifications")}
            >
              View All Certifications
            </Button>
          </div>
        </div>

        {/* ── Content Tabs ─────────────────────────────────────────────────── */}
        <div className="page-card p-0 overflow-hidden">
          <div className="border-b border-theme-border flex items-center justify-between px-6">
            <div className="flex gap-8">
              {(["courses", "students", "announcements"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "py-4 text-xs font-black uppercase tracking-widest transition-all relative",
                    activeTab === tab
                      ? "text-theme-primary"
                      : "text-theme-muted hover:text-theme-fg"
                  )}
                >
                  {tab}
                  {activeTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-theme-primary" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" size={12} />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-theme-page border border-theme-border rounded-lg pl-8 pr-4 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-theme-primary w-48"
                />
              </div>
              <Button variant="ghost" size="sm">
                <Filter size={14} />
              </Button>
            </div>
          </div>

          {/* Courses Tab */}
          {activeTab === "courses" && (
            <div>
              {loading ? (
                <div className="p-12 text-center text-theme-muted font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={16} /> Fetching courses...
                </div>
              ) : filteredCourses.length === 0 ? (
                <div className="p-16 text-center space-y-3">
                  <BookOpen size={36} className="mx-auto text-theme-muted/30" />
                  <p className="text-theme-muted font-black uppercase tracking-widest text-xs">
                    {searchQuery ? "No courses match your search" : "No courses yet. Create your first one."}
                  </p>
                  {!searchQuery && (
                    <Button
                      size="sm"
                      className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold"
                      onClick={() => (window.location.href = "/admin/lms/courses")}
                    >
                      <Plus size={14} className="mr-1.5" /> Create Course
                    </Button>
                  )}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-black uppercase tracking-widest text-theme-muted bg-theme-page/50 border-b border-theme-border">
                      <th className="px-6 py-4">Course</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Enrolled</th>
                      <th className="px-6 py-4">Avg. Progress</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border">
                    {filteredCourses.map((course) => (
                      <tr key={course.id} className="group hover:bg-theme-raised/30 transition-all">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-theme-raised flex items-center justify-center text-theme-primary">
                              <BookOpen size={16} />
                            </div>
                            <span className="font-bold text-theme-fg">{course.title}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary" className="text-[10px]">
                            {course.category}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 font-medium text-theme-muted">
                          {course.students} users
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 rounded-full bg-theme-raised overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  course.completion >= 80
                                    ? "bg-emerald-500"
                                    : course.completion >= 50
                                    ? "bg-blue-500"
                                    : "bg-amber-500"
                                )}
                                style={{ width: `${course.completion}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-theme-muted">
                              {course.completion}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant={
                              course.status === "Published"
                                ? "success"
                                : course.status === "Archived"
                                ? "danger"
                                : "default"
                            }
                          >
                            {course.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Eye size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-sky-500"
                              onClick={() => (window.location.href = "/admin/lms/courses")}
                            >
                              <Edit3 size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500">
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Students Tab */}
          {activeTab === "students" && (
            <div className="p-12 text-center space-y-3">
              <Users size={36} className="mx-auto text-theme-muted/30" />
              <p className="text-theme-muted font-black uppercase tracking-widest text-xs">
                Student leaderboard coming soon
              </p>
              <p className="text-[11px] text-theme-muted">
                Detailed per-student analytics tracked via the Learning Progress Board above
              </p>
            </div>
          )}

          {/* Announcements Tab */}
          {activeTab === "announcements" && (
            <div className="p-12 text-center space-y-3">
              <Megaphone size={36} className="mx-auto text-theme-muted/30" />
              <p className="text-theme-muted font-black uppercase tracking-widest text-xs">
                No announcements yet
              </p>
              <Button
                size="sm"
                className="bg-blue-500 hover:bg-blue-500 text-white font-bold"
              >
                <Plus size={14} className="mr-1.5" /> Post Announcement
              </Button>
            </div>
          )}

          <div className="px-6 py-3 border-t border-theme-border flex items-center justify-between text-[10px] font-black text-theme-muted uppercase tracking-widest bg-theme-page/20">
            <span>
              {activeTab === "courses" ? `${filteredCourses.length} courses` : ""}
            </span>
            <div className="flex items-center gap-1.5 text-theme-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Real-time sync active
            </div>
          </div>
        </div>

      </div>
    </DashboardShell>
  );
}
