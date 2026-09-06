"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { cn } from "@/lib/utils";
import { Calendar, Users, TrendingUp, ChevronRight } from "lucide-react";
import dayjs from "@/lib/dayjs";

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  progress: number;
  phase: string;
  dueDate?: string;
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    todo: number;
    submitted: number;
  };
  onClick?: () => void;
}

const phaseConfig: Record<string, { label: string; color: string; bg: string }> = {
  SCOPING: { label: "Scoping", color: "text-slate-600", bg: "bg-slate-100" },
  IMPLEMENTATION: { label: "Implementation", color: "text-blue-500", bg: "bg-blue-100" },
  REVIEW: { label: "Review", color: "text-amber-600", bg: "bg-amber-100" },
  COMPLETED: { label: "Completed", color: "text-emerald-600", bg: "bg-emerald-100" },
};

export function ProjectCard({ id, name, description, progress, phase, dueDate, tasks, onClick }: ProjectCardProps) {
  const phaseInfo = phaseConfig[phase] || phaseConfig.IMPLEMENTATION;
  const isOverdue = dueDate && dayjs(dueDate).isBefore(dayjs()) && progress < 100;
  const progressColor =
    progress === 100
      ? "from-emerald-500 to-emerald-600"
      : progress >= 75
        ? "from-blue-500 to-blue-500"
        : progress >= 50
          ? "from-amber-500 to-amber-600"
          : "from-red-500 to-red-600";

  return (
    <div
      onClick={onClick}
      className="group rounded-2xl border border-theme-border bg-theme-surface hover:border-theme-primary/40 hover:shadow-lg transition-all cursor-pointer overflow-hidden"
    >
      {/* Header with Phase Badge */}
      <div className="p-4 border-b border-theme-border bg-theme-raised/50">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-theme-fg line-clamp-2">{name}</h3>
          </div>
          <ChevronRight size={18} className="text-theme-muted group-hover:text-theme-primary flex-shrink-0 transition-colors" />
        </div>
        <div className={cn("w-fit text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg", phaseInfo.bg, phaseInfo.color)}>
          {phaseInfo.label}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Description */}
        {description && <p className="text-xs text-theme-muted line-clamp-2">{description}</p>}

        {/* Progress Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-theme-muted uppercase tracking-wide">Progress</span>
            <span className={cn("text-sm font-black", progress === 100 ? "text-emerald-600" : "text-theme-fg")}>
              {progress}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full bg-theme-border rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500 bg-gradient-to-r", progressColor)}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Task Summary */}
          <div className="text-xs text-theme-muted">
            {tasks.completed} of {tasks.total} tasks completed
          </div>
        </div>

        {/* Task Breakdown */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-100 dark:bg-slate-900/30 p-2 text-center">
            <p className="text-[10px] text-slate-700 dark:text-slate-400 font-bold">To Do</p>
            <p className="text-sm font-black text-slate-600">{tasks.todo}</p>
          </div>
          <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2 text-center">
            <p className="text-[10px] text-blue-700 dark:text-blue-400 font-bold">In Progress</p>
            <p className="text-sm font-black text-blue-500">{tasks.inProgress}</p>
          </div>
          <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2 text-center">
            <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">Review</p>
            <p className="text-sm font-black text-amber-600">{tasks.submitted || 0}</p>
          </div>
          <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2 text-center">
            <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">Done</p>
            <p className="text-sm font-black text-emerald-600">{tasks.completed}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 pt-2 border-t border-theme-border/40">
          {dueDate && (
            <div className={cn("flex items-center gap-1 text-[10px]", isOverdue ? "text-red-600 font-bold" : "text-theme-muted")}>
              <Calendar size={12} />
              <span>{dayjs(dueDate).format("MMM DD")}</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-[10px] text-theme-muted">
            <TrendingUp size={12} />
            <span>{progress === 100 ? "Complete" : `${100 - progress}% left`}</span>
          </div>
        </div>
      </div>

      {/* Hover Indicator */}
      <div className="absolute inset-0 border-2 border-theme-primary/0 group-hover:border-theme-primary/20 rounded-2xl pointer-events-none transition-all" />
    </div>
  );
}
