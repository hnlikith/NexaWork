"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import axios from "axios";
import { cn } from "@/lib/utils";
import { GripHorizontal, Calendar, User, AlertCircle, CheckCircle2, X, Send, ShieldCheck, MessageSquare, ExternalLink, Clock, Plus, ListTodo } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAuth } from "@/components/layout/AuthProvider";
import { useToast } from "@/components/ui/ToastLegacy";
import { Button } from "@/components/ui/ButtonLegacy";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: "TODO" | "IN_PROGRESS" | "SUBMITTED" | "COMPLETED";
  submission_notes?: string;
  submission_url?: string;
  review_feedback?: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  assignee?: { id: string; name: string };
  due_date?: string;
  estimated_hours?: number;
  spent_hours?: number;
  task_type?: "strategic" | "operational";
  last_updated_by?: { name: string };
  updated_at: string;
  project_id: string;
}

interface KanbanProps {
  projectId: string;
  projectName: string;
  progress: number;
  onClose?: () => void;
}

const statusConfig = {
  TODO: { label: "To Do", color: "bg-slate-500", bgLight: "bg-slate-100", textColor: "text-slate-700" },
  IN_PROGRESS: { label: "In Progress", color: "bg-blue-500", bgLight: "bg-blue-100", textColor: "text-blue-700" },
  SUBMITTED: { label: "Awaiting Review", color: "bg-amber-500", bgLight: "bg-amber-100", textColor: "text-amber-700" },
  COMPLETED: { label: "Completed", color: "bg-emerald-500", bgLight: "bg-emerald-100", textColor: "text-emerald-700" },
};

const priorityConfig = {
  Low: "text-slate-600",
  Medium: "text-amber-600",
  High: "text-orange-600",
  Critical: "text-red-600",
};

export function ProjectKanban({ projectId, projectName, progress, onClose }: KanbanProps) {
  const [tasks, setTasks] = useState<Record<string, Task[]>>({
    TODO: [],
    IN_PROGRESS: [],
    SUBMITTED: [],
    COMPLETED: [],
  });
  const [submittingTask, setSubmittingTask] = useState<Task | null>(null);
  const [reviewingTask, setReviewingTask] = useState<Task | null>(null);
  const [breakingTask, setBreakingTask] = useState<Task | null>(null);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragSource, setDragSource] = useState<string | null>(null);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("project_tasks")
        .select(`
          id,
          title,
          description,
          status,
          priority,
          due_date,
          estimated_hours,
          spent_hours,
          submission_notes,
          submission_url,
          review_feedback,
          task_type,
          updated_at,
          project_id,
          assignee:employees!assigned_to(id, name),
          last_updated_by_emp:employees!last_updated_by(name)
        `)
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Group by status
      const grouped: Record<string, Task[]> = {
        TODO: [],
        IN_PROGRESS: [],
        SUBMITTED: [],
        COMPLETED: [],
      };

      data?.forEach((task: any) => {
        const t: Task = {
          ...task,
          last_updated_by: task.last_updated_by_emp
        };
        grouped[task.status].push(t);
      });

      setTasks(grouped);
    } catch (err) {
      console.error("Fetch tasks error:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTasks();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`tasks:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_tasks",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [projectId, fetchTasks]);

  const handleDragStart = (task: Task, status: string) => {
    setDraggedTask(task);
    setDragSource(status);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetStatus: string) => {
    if (!draggedTask || !dragSource || dragSource === targetStatus) return;

    try {
      // Update task status and audit info
      const { error } = await supabase
        .from("project_tasks")
        .update({
          status: targetStatus,
          last_updated_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", draggedTask.id);

      if (error) throw error;

      // Update local state optimistically
      const updatedTasks = { ...tasks };
      updatedTasks[dragSource] = updatedTasks[dragSource].filter((t) => t.id !== draggedTask.id);
      updatedTasks[targetStatus as keyof typeof tasks] = [
        { 
          ...draggedTask, 
          status: targetStatus as any, 
          updated_at: new Date().toISOString(),
          last_updated_by: { name: user?.name || 'Unknown' }
        },
        ...updatedTasks[targetStatus as keyof typeof tasks],
      ];
      setTasks(updatedTasks);
    } catch (err) {
      console.error("Update task error:", err);
      fetchTasks(); // Revert on error
    } finally {
      setDraggedTask(null);
      setDragSource(null);
    }
  };

  const Column = ({ status, tasks: columnTasks }: { status: string; tasks: Task[] }) => {
    const config = statusConfig[status as keyof typeof statusConfig];
    const count = columnTasks.length;

    return (
      <div
        onDragOver={handleDragOver}
        onDrop={() => handleDrop(status)}
        className="flex flex-col gap-0 rounded-2xl border border-theme-border bg-theme-page/50 overflow-hidden"
      >
        {/* Column Header */}
        <div className={cn("px-4 py-3 border-b border-theme-border", config.bgLight)}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full", config.color)} />
              <span className="text-xs font-black text-theme-fg uppercase tracking-wide">{config.label}</span>
            </div>
            <span className={cn("text-xs font-bold px-2 py-1 rounded-full", config.bgLight, config.textColor)}>
              {count}
            </span>
          </div>
        </div>

        {/* Tasks Container */}
        <div className="flex-1 overflow-y-auto space-y-2 p-3 min-h-[300px]">
          {columnTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <AlertCircle size={20} className="text-theme-subtle/40" />
              <p className="text-xs text-theme-muted">No tasks</p>
            </div>
          ) : (
            columnTasks.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={() => handleDragStart(task, status)}
                className={cn(
                  "group p-4 rounded-2xl bg-theme-surface border border-theme-border/60 hover:border-theme-primary/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all cursor-grab active:cursor-grabbing relative overflow-hidden",
                  task.task_type === 'strategic' && "ring-1 ring-theme-primary/30 bg-theme-primary/[0.02]"
                )}
              >
                {/* Visual Accent */}
                <div className={cn("absolute top-0 left-0 w-1 h-full", 
                    task.task_type === 'strategic' ? "bg-theme-primary" :
                    task.priority === 'Critical' ? "bg-red-500" :
                    task.priority === 'High' ? "bg-amber-500" :
                    "bg-theme-border"
                )} />

                {/* Task Header */}
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1">
                    {task.task_type === 'strategic' && (
                      <span className="text-[8px] font-black uppercase text-theme-primary bg-theme-primary/10 px-1.5 py-0.5 rounded-md mb-1.5 inline-block tracking-tighter">Strategic Goal</span>
                    )}
                    <h4 className="text-xs font-black text-theme-fg leading-snug tracking-tight group-hover:text-theme-primary transition-colors">{task.title}</h4>
                  </div>
                  <GripHorizontal size={14} className="text-theme-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Task Meta Row */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={cn("text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-theme-raised", priorityConfig[task.priority])}>
                    {task.priority}
                  </span>
                  {task.due_date && (
                    <div className="flex items-center gap-1 text-[8px] font-bold text-theme-muted">
                      <Calendar size={10} />
                      <span className={dayjs(task.due_date).isBefore(dayjs()) ? "text-red-500" : ""}>
                        {dayjs(task.due_date).format("MMM DD")}
                      </span>
                    </div>
                  )}
                  {/* Audit Info */}
                  <div className="flex items-center gap-1 text-[8px] font-bold text-theme-muted italic">
                    <Clock size={10} />
                    <span>{dayjs(task.updated_at).format("HH:mm")}</span>
                  </div>
                </div>

                {/* Footer with Assignee & Last Updater */}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-theme-border/40">
                  <div className="flex flex-col gap-1">
                    {task.assignee ? (
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-full bg-theme-primary/10 flex items-center justify-center text-[7px] font-black text-theme-primary border border-theme-primary/20">
                          {task.assignee.name.charAt(0)}
                        </div>
                        <span className="text-[9px] font-bold text-theme-muted">{task.assignee.name}</span>
                      </div>
                    ) : (
                      <span className="text-[8px] text-theme-subtle italic font-medium">Unassigned</span>
                    )}
                    {task.last_updated_by && (
                      <p className="text-[7px] text-theme-muted font-bold uppercase tracking-tight">
                        Updated: {task.last_updated_by.name}
                      </p>
                    )}
                  </div>
                  
                  {task.estimated_hours && (
                    <span className="text-[8px] font-black text-theme-muted uppercase tracking-tighter">
                      {task.spent_hours || 0} / {task.estimated_hours}H
                    </span>
                  )}
                </div>

                {/* Quick Action Overlays */}
                <div className="mt-3 flex flex-col gap-1.5">
                   {task.task_type === 'strategic' && (user?.role === 'admin' || user?.is_dept_lead || user?.is_team_lead) && (
                      <Button 
                        size="xs" 
                        variant="secondary"
                        className="w-full text-[9px] font-black uppercase h-7 border-theme-primary/20 text-theme-primary hover:bg-theme-primary/10"
                        onClick={(e) => { e.stopPropagation(); setBreakingTask(task); }}
                      >
                        Decompose Scope
                      </Button>
                   )}
                   {task.status === 'IN_PROGRESS' && task.assignee?.id === user?.id && (
                      <Button 
                        size="xs" 
                        variant="primary"
                        className="w-full text-[9px] font-black uppercase h-7 bg-theme-primary hover:bg-theme-primary/90"
                        onClick={(e) => { e.stopPropagation(); setSubmittingTask(task); }}
                      >
                        Submit Review
                      </Button>
                   )}
                   {task.status === 'SUBMITTED' && (user?.role === 'admin' || user?.is_dept_lead || user?.is_team_lead) && (
                      <Button 
                        size="xs" 
                        variant="secondary"
                        className="w-full text-[9px] font-black uppercase h-7 border-amber-500/20 text-amber-600 hover:bg-amber-500/10"
                        onClick={(e) => { e.stopPropagation(); setReviewingTask(task); }}
                      >
                        Verify Deliverable
                      </Button>
                   )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-theme-raised animate-pulse rounded-lg" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-96 bg-theme-raised animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-theme-fg">{projectName}</h2>
          <p className="text-xs text-theme-muted mt-1">Kanban Board</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-theme-muted uppercase tracking-wide font-bold">Overall Progress</p>
            <p className="text-2xl font-black text-theme-fg">{progress}%</p>
          </div>
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-theme-primary/20 to-transparent border-2 border-theme-primary/30 flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs font-bold text-theme-muted">Progress</p>
              <p className="text-lg font-black text-theme-primary">{progress}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="h-3 w-full bg-theme-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-theme-primary to-theme-primary/70 transition-all duration-500 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] text-theme-muted text-right">
          {Object.values(tasks)
            .flat()
            .filter((t) => t.status === "COMPLETED").length} of {Object.values(tasks).flat().length} tasks completed
        </p>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(statusConfig).map(([status, _]) => (
          <Column key={status} status={status} tasks={tasks[status as keyof typeof tasks] || []} />
        ))}
      </div>

      {/* Modals */}
      {submittingTask && (
        <SubmissionModal 
          task={submittingTask} 
          onClose={() => setSubmittingTask(null)} 
          onSuccess={fetchTasks} 
        />
      )}
      {reviewingTask && (
        <AuditModal 
          task={reviewingTask} 
          onClose={() => setReviewingTask(null)} 
          onSuccess={fetchTasks} 
        />
      )}
      {breakingTask && (
        <BreakdownModal 
          task={breakingTask} 
          onClose={() => setBreakingTask(null)} 
          onSuccess={fetchTasks} 
        />
      )}
    </div>
  );
}

// ── Submission Modal (Employee Tier) ──────────────────────────────────
function SubmissionModal({ task, onClose, onSuccess }: { task: Task; onClose: () => void; onSuccess: () => void }) {
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("project_tasks")
        .update({
          status: "SUBMITTED",
          submission_notes: notes,
          submission_url: url,
          updated_at: new Date().toISOString()
        })
        .eq("id", task.id);

      if (error) throw error;
      showToast("Work submitted for review", "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Submission failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-lg rounded-2xl bg-theme-surface shadow-2xl border border-theme-border overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-theme-border bg-theme-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-primary text-theme-surface shadow-sm">
              <Send size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-theme-fg uppercase tracking-tight">Submit Work</h3>
              <p className="text-[10px] text-theme-muted font-bold mt-0.5">{task.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-theme-muted hover:bg-theme-raised transition-all">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-theme-muted">Submission Notes</label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe what you've accomplished..."
              className="w-full h-32 rounded-xl border border-theme-border bg-theme-raised/50 p-4 text-xs font-bold outline-none focus:border-theme-primary transition-all resize-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-theme-muted">Resource URL (Optional)</label>
            <div className="relative">
               <ExternalLink size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
               <input 
                type="text" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Link to file, repository, or document"
                className="w-full h-10 rounded-xl border border-theme-border bg-theme-raised/50 pl-9 pr-4 text-xs font-bold outline-none focus:border-theme-primary transition-all"
              />
            </div>
          </div>
        </div>
        <div className="bg-theme-raised/50 flex justify-end gap-3 border-t border-theme-border px-6 py-4">
          <Button variant="secondary" size="sm" onClick={onClose} className="text-[10px] font-black uppercase">Cancel</Button>
          <Button size="sm" onClick={handleSubmit} loading={submitting} className="text-[10px] font-black uppercase px-6">
            Dispatch to Lead
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Audit Modal (Lead Tier) ──────────────────────────────────
function AuditModal({ task, onClose, onSuccess }: { task: Task; onClose: () => void; onSuccess: () => void }) {
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();

  const handleAudit = async (status: "COMPLETED" | "IN_PROGRESS") => {
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("project_tasks")
        .update({
          status,
          review_feedback: feedback,
          reviewer_id: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", task.id);

      if (error) throw error;
      showToast(status === 'COMPLETED' ? "Submission Approved" : "Submission Rejected", "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Audit failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-xl rounded-2xl bg-theme-surface shadow-2xl border border-theme-border overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-theme-border bg-theme-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-theme-surface shadow-sm shadow-amber-500/20">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-theme-fg uppercase tracking-tight">Audit Submission</h3>
              <p className="text-[10px] text-theme-muted font-bold mt-0.5">{task.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-theme-muted hover:bg-theme-raised transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="rounded-xl border border-theme-border bg-theme-raised/40 p-5 space-y-4">
            <div className="flex items-start gap-3">
               <div className="h-8 w-8 rounded-full bg-theme-primary/10 flex items-center justify-center text-[10px] font-black text-theme-primary">
                 {task.assignee?.name?.charAt(0)}
               </div>
               <div className="flex-1">
                 <p className="text-xs font-black text-theme-fg">{task.assignee?.name}</p>
                 <p className="text-[10px] text-theme-muted font-bold uppercase tracking-widest mt-0.5">Contributor</p>
               </div>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-theme-muted">Submission Data</label>
              <div className="p-3 rounded-lg bg-theme-surface border border-theme-border text-xs leading-relaxed text-theme-fg font-medium italic">
                {task.submission_notes || "No notes provided."}
              </div>
            </div>
            {task.submission_url && (
               <a 
                href={task.submission_url} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center gap-2 text-[10px] font-black text-theme-primary hover:underline"
               >
                 <ExternalLink size={12} /> View Submission Resource
               </a>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-theme-muted flex items-center gap-2">
               <MessageSquare size={12} className="text-theme-primary" /> Review Feedback
            </label>
            <textarea 
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Provide constructive feedback for the contributor..."
              className="w-full h-24 rounded-xl border border-theme-border bg-theme-raised/50 p-4 text-xs font-bold outline-none focus:border-theme-primary transition-all resize-none"
            />
          </div>
        </div>

        <div className="bg-theme-raised/50 flex justify-end gap-3 border-t border-theme-border px-6 py-4">
          <Button variant="secondary" size="sm" onClick={() => handleAudit('IN_PROGRESS')} loading={submitting} className="text-[10px] font-black uppercase text-rose-500 hover:text-rose-600">
            Request Revision
          </Button>
          <Button size="sm" onClick={() => handleAudit('COMPLETED')} loading={submitting} className="text-[10px] font-black uppercase px-6 bg-emerald-600 hover:bg-emerald-700">
            Approve & Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Breakdown Modal (Lead Tier) ──────────────────────────────────
function BreakdownModal({ task, onClose, onSuccess }: { task: Task; onClose: () => void; onSuccess: () => void }) {
  const [subtasks, setSubtasks] = useState<{ title: string; assignee_id: string }[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    // Fetch potential assignees (team members)
    const fetchTeam = async () => {
      const { data } = await supabase.from('employees').select('id, name, role');
      setEmployees(data || []);
    };
    fetchTeam();
  }, []);

  const addSubtask = () => {
    setSubtasks([...subtasks, { title: "", assignee_id: "" }]);
  };

  const removeSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  const handleBreakdown = async () => {
    if (subtasks.length === 0) {
      showToast("Please add at least one operational task.", "error");
      return;
    }
    if (subtasks.some(s => !s.title || !s.assignee_id)) {
      showToast("All tasks must have a title and assignee.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const tasksToInsert = subtasks.map(s => ({
        project_id: task.project_id,
        parent_task_id: task.id,
        title: s.title,
        status: 'TODO',
        priority: 'Medium',
        assigned_to: s.assignee_id,
        task_type: 'operational',
        last_updated_by: user?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase.from('project_tasks').insert(tasksToInsert);
      if (error) throw error;

      // Update parent strategic task to show it's being worked on
      await supabase.from('project_tasks').update({ status: 'IN_PROGRESS', updated_at: new Date().toISOString() }).eq('id', task.id);

      showToast(`Successfully decomposed into ${subtasks.length} tasks`, "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Breakdown failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-2xl rounded-2xl bg-theme-surface shadow-2xl border border-theme-border overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-theme-border bg-theme-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-primary text-theme-surface shadow-sm">
              <ListTodo size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-theme-fg uppercase tracking-tight">Decompose Strategic Goal</h3>
              <p className="text-[10px] text-theme-muted font-bold mt-0.5">Define Operational Units for: {task.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-theme-muted hover:bg-theme-raised transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div className="p-4 rounded-xl bg-theme-raised/50 border border-theme-border border-dashed">
            <p className="text-[10px] font-black uppercase text-theme-primary tracking-widest mb-2">Goal Description</p>
            <p className="text-xs font-bold text-theme-muted italic leading-relaxed">{task.description || "No specific scope details provided by manager."}</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-theme-muted">Operational Breakdown</label>
              <Button size="xs" variant="secondary" onClick={addSubtask} className="h-7 text-[9px] font-black uppercase">
                <Plus size={12} className="mr-1" /> Add Task
              </Button>
            </div>

            <div className="space-y-3">
              {subtasks.map((s, i) => (
                <div key={i} className="flex gap-3 items-start animate-in slide-in-from-top-2 duration-200">
                  <div className="flex-1 space-y-2">
                    <input 
                      placeholder="Operational task title..."
                      value={s.title}
                      onChange={(e) => {
                        const newS = [...subtasks];
                        newS[i].title = e.target.value;
                        setSubtasks(newS);
                      }}
                      className="w-full h-9 bg-theme-page border border-theme-border rounded-lg px-3 text-xs font-bold text-theme-fg outline-none focus:border-theme-primary"
                    />
                    <Select
                      value={s.assignee_id || undefined}
                      onValueChange={(v) => {
                        const newS = [...subtasks];
                        newS[i].assignee_id = v;
                        setSubtasks(newS);
                      }}
                    >
                      <SelectTrigger className="w-full h-9 text-[10px]"><SelectValue placeholder="Assign Member..." /></SelectTrigger>
                      <SelectContent>
                        {employees.map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.name} ({e.role})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <button 
                    onClick={() => removeSubtask(i)}
                    className="mt-2 p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-all"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {subtasks.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-theme-border rounded-2xl">
                  <p className="text-[10px] font-bold text-theme-muted uppercase">No tasks defined yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-theme-raised/50 flex justify-end gap-3 border-t border-theme-border px-6 py-4">
          <Button variant="secondary" size="sm" onClick={onClose} className="text-[10px] font-black uppercase">Cancel</Button>
          <Button size="sm" onClick={handleBreakdown} loading={submitting} className="text-[10px] font-black uppercase px-8 bg-theme-primary hover:bg-theme-primary/90">
            Publish Tasks
          </Button>
        </div>
      </div>
    </div>
  );
}
