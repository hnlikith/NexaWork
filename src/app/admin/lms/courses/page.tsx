/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { motion, Reorder, AnimatePresence } from "framer-motion";
import {
  Plus, GripVertical, Trash2, Edit3, Eye,
  Video, FileText, HelpCircle, ChevronDown, ChevronRight,
  Save, Rocket, PlusCircle, FileUp, BookOpen,
  LayoutGrid, PenLine, Loader2, X, Check,
  Archive, Globe, FilePen, AlertCircle, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/ToastLegacy";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult
} from "@hello-pangea/dnd";

// ─── Types ───────────────────────────────────────────────────────────────────

type CourseStatus = "draft" | "published" | "archived";
type LessonType = "lesson" | "quiz" | "assignment";

interface DBLesson {
  id: string;
  title: string;
  lesson_type: LessonType;
  duration_minutes: number;
  order_index: number;
}

interface DBModule {
  id: string;
  title: string;
  order_index: number;
  isOpen: boolean;
  lessons: DBLesson[];
}

interface DBCourse {
  id: string;
  title: string;
  category: string;
  status: CourseStatus;
  level: string;
  description?: string;
  created_at: string;
  lms_enrollments?: { id: string }[];
}

type KanbanStatus = CourseStatus;

// ─── Kanban Column Config ─────────────────────────────────────────────────────

const STATUS_COLUMNS: {
  id: KanbanStatus;
  title: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  headerBg: string;
}[] = [
  {
    id: "draft",
    title: "Draft",
    icon: FilePen,
    color: "text-slate-400",
    bgColor: "bg-slate-500/5",
    borderColor: "border-slate-500/20",
    headerBg: "bg-slate-500/10",
  },
  {
    id: "published",
    title: "Published",
    icon: Globe,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/5",
    borderColor: "border-emerald-500/20",
    headerBg: "bg-emerald-500/10",
  },
  {
    id: "archived",
    title: "Archived",
    icon: Archive,
    color: "text-zinc-500",
    bgColor: "bg-zinc-500/5",
    borderColor: "border-zinc-500/20",
    headerBg: "bg-zinc-500/10",
  },
];

const LEVEL_COLORS: Record<string, string> = {
  beginner: "text-emerald-400",
  intermediate: "text-amber-400",
  advanced: "text-rose-400",
};

// ─── Course Kanban Card ───────────────────────────────────────────────────────

function CourseCard({
  course,
  index,
  isSelected,
  onSelect,
}: {
  course: DBCourse;
  index: number;
  isSelected: boolean;
  onSelect: (course: DBCourse) => void;
}) {
  const enrollCount = course.lms_enrollments?.length ?? 0;

  return (
    <Draggable draggableId={course.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onSelect(course)}
          className={cn(
            "rounded-2xl border p-4 space-y-3 cursor-pointer transition-all duration-200 group",
            isSelected
              ? "border-theme-primary bg-theme-primary/5 shadow-lg shadow-theme-primary/10"
              : "border-theme-border bg-theme-surface hover:border-theme-primary/40 hover:shadow-md",
            snapshot.isDragging && "shadow-2xl rotate-1 scale-[1.02] border-theme-primary/60"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="h-9 w-9 rounded-xl bg-theme-raised flex items-center justify-center text-theme-primary shrink-0">
              <BookOpen size={16} />
            </div>
            {isSelected && (
              <div className="h-5 w-5 rounded-full bg-theme-primary flex items-center justify-center shrink-0">
                <Check size={10} className="text-white" />
              </div>
            )}
          </div>
          <div>
            <p className="text-[12px] font-bold text-theme-fg leading-snug line-clamp-2">
              {course.title}
            </p>
            <p className="text-[10px] text-theme-muted mt-1">{course.category}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={cn("text-[9px] h-4 px-1.5 uppercase font-black", LEVEL_COLORS[course.level] || "")}>
              {course.level}
            </Badge>
            <span className="text-[10px] text-theme-muted font-bold">{enrollCount} enrolled</span>
          </div>
        </div>
      )}
    </Draggable>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManageCoursesPage() {
  const { showToast } = useToast();

  // View: 'board' = Kanban, 'builder' = module/lesson editor
  const [view, setView] = useState<"board" | "builder">("board");

  // Kanban state
  const [courses, setCourses] = useState<Record<KanbanStatus, DBCourse[]>>({
    draft: [],
    published: [],
    archived: [],
  });
  const [loadingCourses, setLoadingCourses] = useState(true);

  // Selected course for builder
  const [selectedCourse, setSelectedCourse] = useState<DBCourse | null>(null);

  // Builder state
  const [modules, setModules] = useState<DBModule[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [saving, setSaving] = useState(false);

  // New course form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Engineering");
  const [creatingCourse, setCreatingCourse] = useState(false);

  // ─── Fetch Courses ──────────────────────────────────────────────────────────

  const fetchCourses = useCallback(async (silent = false) => {
    if (!silent) setLoadingCourses(true);
    try {
      const { data, error } = await supabase
        .from("lms_courses")
        .select("*, lms_enrollments(id)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const grouped: Record<KanbanStatus, DBCourse[]> = {
        draft: [],
        published: [],
        archived: [],
      };
      (data || []).forEach((c) => {
        const status = (c.status as KanbanStatus) || "draft";
        grouped[status].push(c);
      });
      setCourses(grouped);
    } catch (err) {
      console.error("Fetch courses error:", err);
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  // ─── Fetch Modules for Selected Course ─────────────────────────────────────

  const fetchModules = useCallback(async (courseId: string) => {
    setLoadingModules(true);
    try {
      const { data: modData, error } = await supabase
        .from("lms_modules")
        .select("*, lms_lessons(*)")
        .eq("course_id", courseId)
        .order("order_index");

      if (error) throw error;

      const formatted: DBModule[] = (modData || []).map((m) => ({
        id: m.id,
        title: m.title,
        order_index: m.order_index,
        isOpen: true,
        lessons: ((m.lms_lessons || []) as DBLesson[]).sort(
          (a, b) => a.order_index - b.order_index
        ),
      }));
      setModules(formatted);
    } catch (err) {
      console.error("Fetch modules error:", err);
    } finally {
      setLoadingModules(false);
    }
  }, []);

  // ─── Real-time ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchCourses();
    const channel = supabase
      .channel("lms_courses_board")
      .on("postgres_changes", { event: "*", schema: "public", table: "lms_courses" }, () => fetchCourses(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "lms_modules" }, () => {
        if (selectedCourse) fetchModules(selectedCourse.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lms_lessons" }, () => {
        if (selectedCourse) fetchModules(selectedCourse.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCourses, fetchModules, selectedCourse]);

  // ─── Select Course → switch to builder ─────────────────────────────────────

  const handleSelectCourse = (course: DBCourse) => {
    setSelectedCourse(course);
    setView("builder");
    fetchModules(course.id);
  };

  // ─── Create New Course ──────────────────────────────────────────────────────

  const createCourse = async () => {
    if (!newTitle.trim()) return;
    setCreatingCourse(true);
    try {
      const slug = newTitle.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();
      const { data, error } = await supabase
        .from("lms_courses")
        .insert({ title: newTitle.trim(), slug, category: newCategory, status: "draft" })
        .select()
        .single();
      if (error) throw error;
      showToast("Course created!", "success");
      setNewTitle("");
      setShowNewForm(false);
      fetchCourses(true);
      if (data) handleSelectCourse(data);
    } catch (err: any) {
      showToast(err.message || "Failed to create course", "error");
    } finally {
      setCreatingCourse(false);
    }
  };

  // ─── Drag End: change course status ────────────────────────────────────────

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || source.droppableId === destination.droppableId) return;

    const fromStatus = source.droppableId as KanbanStatus;
    const toStatus = destination.droppableId as KanbanStatus;

    // Optimistic update
    const card = courses[fromStatus][source.index];
    if (!card) return;

    setCourses((prev) => {
      const fromList = [...prev[fromStatus]];
      const toList = [...prev[toStatus]];
      const [moved] = fromList.splice(source.index, 1);
      toList.splice(destination.index, 0, { ...moved, status: toStatus });
      return { ...prev, [fromStatus]: fromList, [toStatus]: toList };
    });

    // Persist
    try {
      await supabase.from("lms_courses").update({ status: toStatus }).eq("id", draggableId);
      showToast(`Course moved to ${toStatus}`, "success");
      if (selectedCourse?.id === draggableId) {
        setSelectedCourse((prev) => prev ? { ...prev, status: toStatus } : null);
      }
    } catch {
      showToast("Failed to update status", "error");
      fetchCourses(true);
    }
  };

  // ─── Module / Lesson DB Operations ──────────────────────────────────────────

  const addModule = async () => {
    if (!selectedCourse) return;
    const newOrder = modules.length;
    try {
      const { data, error } = await supabase
        .from("lms_modules")
        .insert({ course_id: selectedCourse.id, title: "New Module", order_index: newOrder })
        .select()
        .single();
      if (error) throw error;
      setModules((prev) => [...prev, { ...data, isOpen: true, lessons: [] }]);
    } catch {
      showToast("Failed to add module", "error");
    }
  };

  const deleteModule = async (modId: string) => {
    try {
      await supabase.from("lms_modules").delete().eq("id", modId);
      setModules((prev) => prev.filter((m) => m.id !== modId));
    } catch {
      showToast("Failed to delete module", "error");
    }
  };

  const updateModuleTitle = async (modId: string, title: string) => {
    setModules((prev) => prev.map((m) => (m.id === modId ? { ...m, title } : m)));
  };

  const saveModuleTitle = async (modId: string, title: string) => {
    try {
      await supabase.from("lms_modules").update({ title }).eq("id", modId);
    } catch {
      showToast("Failed to save module title", "error");
    }
  };

  const addLesson = async (modId: string, type: LessonType) => {
    const mod = modules.find((m) => m.id === modId);
    if (!mod) return;
    const newOrder = mod.lessons.length;
    const title = type === "lesson" ? "New Lesson" : type === "quiz" ? "New Quiz" : "New Assignment";
    try {
      const { data, error } = await supabase
        .from("lms_lessons")
        .insert({ module_id: modId, title, lesson_type: type, order_index: newOrder, duration_minutes: 5 })
        .select()
        .single();
      if (error) throw error;
      setModules((prev) =>
        prev.map((m) => (m.id === modId ? { ...m, lessons: [...m.lessons, data] } : m))
      );
    } catch {
      showToast("Failed to add lesson", "error");
    }
  };

  const deleteLesson = async (modId: string, lesId: string) => {
    try {
      await supabase.from("lms_lessons").delete().eq("id", lesId);
      setModules((prev) =>
        prev.map((m) =>
          m.id === modId ? { ...m, lessons: m.lessons.filter((l) => l.id !== lesId) } : m
        )
      );
    } catch {
      showToast("Failed to delete lesson", "error");
    }
  };

  const updateLessonTitle = (modId: string, lesId: string, title: string) => {
    setModules((prev) =>
      prev.map((m) =>
        m.id === modId
          ? { ...m, lessons: m.lessons.map((l) => (l.id === lesId ? { ...l, title } : l)) }
          : m
      )
    );
  };

  const saveLessonTitle = async (lesId: string, title: string) => {
    try {
      await supabase.from("lms_lessons").update({ title }).eq("id", lesId);
    } catch {
      showToast("Failed to save lesson title", "error");
    }
  };

  // ─── Publish / Draft Toggle ──────────────────────────────────────────────────

  const togglePublish = async () => {
    if (!selectedCourse) return;
    setSaving(true);
    const newStatus: CourseStatus =
      selectedCourse.status === "published" ? "draft" : "published";
    try {
      await supabase.from("lms_courses").update({ status: newStatus }).eq("id", selectedCourse.id);
      setSelectedCourse((prev) => (prev ? { ...prev, status: newStatus } : null));
      fetchCourses(true);
      showToast(
        newStatus === "published" ? "Course published!" : "Course moved to draft",
        "success"
      );
    } catch {
      showToast("Failed to update status", "error");
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardShell
      moduleKey="lms_courses"
      title="Manage Courses"
      subtitle={
        view === "builder" && selectedCourse
          ? `Editing: ${selectedCourse.title}`
          : "Organize and build your course curriculum"
      }
      actions={
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center rounded-xl border border-theme-border overflow-hidden bg-theme-raised">
            <button
              onClick={() => setView("board")}
              className={cn(
                "px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                view === "board"
                  ? "bg-theme-primary text-white"
                  : "text-theme-muted hover:text-theme-fg"
              )}
            >
              <LayoutGrid size={12} /> Board
            </button>
            <button
              onClick={() => {
                if (!selectedCourse) {
                  showToast("Select a course from the board first", "info");
                  return;
                }
                setView("builder");
              }}
              className={cn(
                "px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                view === "builder"
                  ? "bg-theme-primary text-white"
                  : "text-theme-muted hover:text-theme-fg"
              )}
            >
              <PenLine size={12} /> Builder
            </button>
          </div>

          {view === "builder" && selectedCourse && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setView("board")}>
                <ChevronRight size={14} className="rotate-180 mr-1" /> Back
              </Button>
              <Button
                className={cn(
                  "font-bold shadow-lg",
                  selectedCourse.status === "published"
                    ? "bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/20"
                    : "bg-emerald-500 hover:bg-emerald-600 text-black shadow-emerald-500/20"
                )}
                onClick={togglePublish}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : selectedCourse.status === "published" ? (
                  <FilePen size={16} className="mr-2" />
                ) : (
                  <Rocket size={16} className="mr-2" />
                )}
                {selectedCourse.status === "published" ? "Unpublish" : "Publish"}
              </Button>
            </>
          )}

          {view === "board" && (
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold"
              onClick={() => setShowNewForm(true)}
            >
              <Plus size={16} className="mr-2" /> New Course
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">

        {/* ── New Course Form ────────────────────────────────────────────── */}
        <AnimatePresence>
          {showNewForm && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="page-card"
            >
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-theme-muted block mb-1.5">
                    Course Title
                  </label>
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createCourse()}
                    placeholder="e.g. Engineering Excellence"
                    className="w-full bg-theme-page border border-theme-border rounded-xl px-4 py-2.5 text-sm text-theme-fg focus:outline-none focus:ring-2 focus:ring-theme-primary/40"
                  />
                </div>
                <div className="w-48">
                  <label className="text-[10px] font-black uppercase tracking-widest text-theme-muted block mb-1.5">
                    Category
                  </label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Engineering", "Sales", "HR", "Finance", "Operations", "Security", "Leadership"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <Button
                    className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold"
                    onClick={createCourse}
                    disabled={creatingCourse || !newTitle.trim()}
                  >
                    {creatingCourse ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </Button>
                  <Button variant="ghost" onClick={() => { setShowNewForm(false); setNewTitle(""); }}>
                    <X size={14} />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── BOARD VIEW ────────────────────────────────────────────────── */}
        {view === "board" && (
          <>
            {loadingCourses ? (
              <div className="h-80 flex items-center justify-center text-theme-muted">
                <Loader2 className="animate-spin mr-2" size={20} />
                <span className="text-xs font-black uppercase tracking-widest">Loading courses...</span>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {STATUS_COLUMNS.map((col) => (
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
                          {courses[col.id].length}
                        </span>
                      </div>

                      {/* Drop zone */}
                      <Droppable droppableId={col.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={cn(
                              "flex-1 min-h-[280px] p-3 space-y-3 transition-colors duration-200",
                              col.bgColor,
                              snapshot.isDraggingOver && "ring-2 ring-inset ring-theme-primary/30"
                            )}
                          >
                            {courses[col.id].length === 0 && !snapshot.isDraggingOver && (
                              <div className="min-h-[240px] flex flex-col items-center justify-center gap-2 opacity-30">
                                <col.icon size={28} className={col.color} />
                                <span className="text-[10px] font-black uppercase tracking-widest text-theme-muted text-center">
                                  {col.id === "draft"
                                    ? "No drafts yet"
                                    : col.id === "published"
                                    ? "Drag to publish"
                                    : "Archived courses"}
                                </span>
                              </div>
                            )}
                            {courses[col.id].map((course, idx) => (
                              <CourseCard
                                key={course.id}
                                course={course}
                                index={idx}
                                isSelected={selectedCourse?.id === course.id}
                                onSelect={handleSelectCourse}
                              />
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>

                      {/* Add in draft column */}
                      {col.id === "draft" && (
                        <div className={cn("px-3 pb-3", col.bgColor)}>
                          <button
                            onClick={() => setShowNewForm(true)}
                            className="w-full py-2.5 border border-dashed border-theme-border rounded-xl text-[10px] font-black uppercase text-theme-muted hover:border-theme-primary hover:text-theme-primary transition-all flex items-center justify-center gap-2"
                          >
                            <Plus size={12} /> Add Course
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </DragDropContext>
            )}

            {/* Tip */}
            <div className="flex items-center gap-2 text-[11px] text-theme-muted px-1">
              <AlertCircle size={12} />
              Click any card to open the Course Builder. Drag cards between columns to change status.
            </div>
          </>
        )}

        {/* ── BUILDER VIEW ──────────────────────────────────────────────── */}
        {view === "builder" && (
          <>
            {!selectedCourse ? (
              <div className="page-card py-20 text-center space-y-4">
                <BookOpen size={40} className="mx-auto text-theme-muted/30" />
                <p className="text-theme-muted font-black uppercase tracking-widest text-xs">
                  No course selected
                </p>
                <Button variant="secondary" onClick={() => setView("board")}>
                  Go to Board
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

                {/* Left sidebar: outline navigator */}
                <div className="lg:col-span-1">
                  <div className="page-card sticky top-24 space-y-4">
                    <div>
                      <h3 className="text-[10px] font-black uppercase text-theme-muted tracking-widest mb-1">
                        Course Outline
                      </h3>
                      <p className="text-xs font-bold text-theme-fg truncate">{selectedCourse.title}</p>
                    </div>
                    <div className="space-y-3">
                      {modules.map((mod, idx) => (
                        <div key={mod.id} className="space-y-1.5">
                          <div className="flex items-center gap-2 group cursor-pointer">
                            <div className="h-5 w-5 rounded bg-theme-raised flex items-center justify-center text-theme-muted text-[10px] font-bold shrink-0">
                              {idx + 1}
                            </div>
                            <span className="text-xs font-bold text-theme-fg truncate group-hover:text-theme-primary transition-colors">
                              {mod.title}
                            </span>
                          </div>
                          <div className="pl-7 space-y-1 border-l border-theme-border ml-2.5">
                            {mod.lessons.map((les) => (
                              <div
                                key={les.id}
                                className="text-[11px] text-theme-muted flex items-center gap-1.5 hover:text-theme-fg transition-colors cursor-pointer"
                              >
                                {les.lesson_type === "lesson" ? (
                                  <Video size={10} />
                                ) : les.lesson_type === "quiz" ? (
                                  <HelpCircle size={10} />
                                ) : (
                                  <FileUp size={10} />
                                )}
                                <span className="truncate">{les.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={addModule}
                      className="w-full py-2.5 border border-dashed border-theme-border rounded-xl text-[10px] font-black uppercase text-theme-muted hover:border-theme-primary hover:text-theme-primary transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={12} /> Add Module
                    </button>
                    <div className="flex items-center gap-1.5 text-[9px] text-theme-muted">
                      <RefreshCw size={10} className="text-emerald-400" />
                      Auto-saves on change
                    </div>
                  </div>
                </div>

                {/* Main editor */}
                <div className="lg:col-span-3 space-y-6 pb-24">
                  {loadingModules ? (
                    <div className="page-card py-20 text-center">
                      <Loader2 className="animate-spin mx-auto mb-3" size={24} />
                      <p className="text-xs font-black uppercase tracking-widest text-theme-muted">
                        Loading modules...
                      </p>
                    </div>
                  ) : (
                    <>
                      <Reorder.Group
                        axis="y"
                        values={modules}
                        onReorder={setModules}
                        className="space-y-4"
                      >
                        {modules.map((mod) => (
                          <Reorder.Item key={mod.id} value={mod}>
                            <div className="page-card p-0 overflow-hidden group/mod hover:border-theme-primary/30 transition-colors">
                              {/* Module header */}
                              <div className="bg-theme-raised/50 px-6 py-4 flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <GripVertical
                                    size={16}
                                    className="text-theme-muted/40 cursor-grab opacity-0 group-hover/mod:opacity-100 transition-opacity shrink-0"
                                  />
                                  <input
                                    value={mod.title}
                                    onChange={(e) => updateModuleTitle(mod.id, e.target.value)}
                                    onBlur={(e) => saveModuleTitle(mod.id, e.target.value)}
                                    className="bg-transparent text-sm font-black text-theme-fg focus:outline-none focus:ring-0 w-full"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() =>
                                      setModules((prev) =>
                                        prev.map((m) =>
                                          m.id === mod.id ? { ...m, isOpen: !m.isOpen } : m
                                        )
                                      )
                                    }
                                  >
                                    {mod.isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-rose-500 opacity-0 group-hover/mod:opacity-100 transition-opacity"
                                    onClick={() => deleteModule(mod.id)}
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </div>

                              <AnimatePresence>
                                {mod.isOpen && (
                                  <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: "auto" }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="p-6 space-y-3">
                                      <Reorder.Group
                                        axis="y"
                                        values={mod.lessons}
                                        onReorder={(newLessons) =>
                                          setModules((prev) =>
                                            prev.map((m) =>
                                              m.id === mod.id ? { ...m, lessons: newLessons } : m
                                            )
                                          )
                                        }
                                        className="space-y-2"
                                      >
                                        {mod.lessons.map((les) => (
                                          <Reorder.Item key={les.id} value={les}>
                                            <div className="flex items-center gap-3 p-3.5 bg-theme-surface border border-theme-border rounded-2xl hover:border-theme-primary/30 transition-all group/item shadow-sm">
                                              <GripVertical
                                                size={13}
                                                className="text-theme-muted/40 cursor-grab opacity-0 group-hover/item:opacity-100 shrink-0"
                                              />
                                              <div
                                                className={cn(
                                                  "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                                                  les.lesson_type === "lesson"
                                                    ? "bg-blue-500/10 text-blue-500"
                                                    : les.lesson_type === "quiz"
                                                    ? "bg-amber-500/10 text-amber-500"
                                                    : "bg-emerald-500/10 text-emerald-500"
                                                )}
                                              >
                                                {les.lesson_type === "lesson" ? (
                                                  <Video size={16} />
                                                ) : les.lesson_type === "quiz" ? (
                                                  <HelpCircle size={16} />
                                                ) : (
                                                  <FileUp size={16} />
                                                )}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <input
                                                  value={les.title}
                                                  onChange={(e) =>
                                                    updateLessonTitle(mod.id, les.id, e.target.value)
                                                  }
                                                  onBlur={(e) => saveLessonTitle(les.id, e.target.value)}
                                                  className="bg-transparent text-sm font-bold text-theme-fg focus:outline-none w-full"
                                                />
                                                <div className="flex items-center gap-2 mt-0.5">
                                                  <Badge
                                                    variant="secondary"
                                                    className="text-[9px] h-4 px-1.5 uppercase font-black"
                                                  >
                                                    {les.lesson_type}
                                                  </Badge>
                                                  <span className="text-[10px] text-theme-muted font-bold">
                                                    {les.duration_minutes}min
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-1.5 shrink-0">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-8 w-8 p-0 hover:bg-theme-primary/10 hover:text-theme-primary"
                                                >
                                                  <Edit3 size={13} />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-8 w-8 p-0 text-rose-500 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                                  onClick={() => deleteLesson(mod.id, les.id)}
                                                >
                                                  <Trash2 size={13} />
                                                </Button>
                                              </div>
                                            </div>
                                          </Reorder.Item>
                                        ))}
                                      </Reorder.Group>

                                      {/* Add lesson / quiz / assignment */}
                                      <div className="flex items-center gap-2 pt-1">
                                        {(
                                          [
                                            { type: "lesson" as LessonType, icon: PlusCircle, label: "Lesson" },
                                            { type: "quiz" as LessonType, icon: HelpCircle, label: "Quiz" },
                                            { type: "assignment" as LessonType, icon: FileUp, label: "Assignment" },
                                          ] as const
                                        ).map(({ type, icon: Icon, label }) => (
                                          <button
                                            key={type}
                                            onClick={() => addLesson(mod.id, type)}
                                            className="px-3 py-2 rounded-xl bg-theme-raised text-[10px] font-black uppercase text-theme-muted hover:text-theme-fg transition-all flex items-center gap-1.5 border border-transparent hover:border-theme-border"
                                          >
                                            <Icon size={11} /> {label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </Reorder.Item>
                        ))}
                      </Reorder.Group>

                      {/* Add module button */}
                      <div className="flex justify-center pt-4">
                        <button
                          onClick={addModule}
                          className="px-10 py-4 bg-theme-surface border border-theme-border rounded-[2rem] text-sm font-black uppercase tracking-widest text-theme-muted hover:border-theme-primary hover:text-theme-primary transition-all flex items-center gap-3 group shadow-lg"
                        >
                          <Plus size={18} className="group-hover:rotate-90 transition-transform" />
                          Add Module
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
