"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Grid3x3, List, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { ProjectCard } from "./ProjectCard";
import { ProjectKanban } from "./ProjectKanban";
import { OversightMatrix } from "./OversightMatrix";

interface Project {
  id: string;
  name: string;
  description?: string;
  progress: number;
  phase: string;
  dueDate?: string;
  workflow_status?: string;
  teamIds?: string[];
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    todo: number;
    submitted: number;
  };
}

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  initialProjectId?: string;
}

export function ProjectModal({ isOpen, onClose, projects, initialProjectId }: ProjectModalProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"list" | "kanban" | "oversight">("list");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    if (isOpen && initialProjectId) {
      const proj = projects.find(p => p.id === initialProjectId);
      if (proj) {
        setSelectedProject(proj);
        setViewMode("kanban");
      }
    } else if (!isOpen) {
      setSelectedProject(null);
      setViewMode("list");
    }
  }, [isOpen, initialProjectId, projects]);

  if (!isOpen) return null;

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setViewMode("kanban");
  };

  const handleBackToList = () => {
    setSelectedProject(null);
    setViewMode("list");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-7xl max-h-[95vh] overflow-auto rounded-3xl border border-theme-border bg-theme-surface shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 px-8 py-6 border-b border-theme-border bg-theme-surface/95 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-4">
            {selectedProject ? (
              <>
                <button
                  onClick={handleBackToList}
                  className="h-10 w-10 flex items-center justify-center rounded-xl bg-theme-raised hover:bg-theme-border transition-all"
                  title="Back to list"
                >
                  <X size={18} className="text-theme-muted hover:text-theme-fg" />
                </button>
                <div>
                  <h2 className="text-xl font-black text-theme-fg tracking-tight">{selectedProject.name}</h2>
                  <p className="text-[10px] text-theme-muted font-bold uppercase tracking-widest mt-0.5">Project Oversight Engine</p>
                </div>
              </>
            ) : (
              <div>
                <h2 className="text-xl font-black text-theme-fg tracking-tight">Delivery Command Center</h2>
                <p className="text-[10px] text-theme-muted font-bold uppercase tracking-widest mt-0.5">Assigned Operational Cycles</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {selectedProject && (
              <div className="flex items-center gap-1 p-1 bg-theme-page rounded-xl border border-theme-border">
                <button
                  onClick={() => setViewMode("kanban")}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-[10px] font-black uppercase tracking-tight",
                    viewMode === "kanban"
                      ? "bg-theme-surface text-theme-primary shadow-sm border border-theme-border"
                      : "text-theme-muted hover:text-theme-fg"
                  )}
                >
                  <Grid3x3 size={14} /> Operations
                </button>
                <button
                  onClick={() => setViewMode("oversight")}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-[10px] font-black uppercase tracking-tight",
                    viewMode === "oversight"
                      ? "bg-theme-surface text-theme-primary shadow-sm border border-theme-border"
                      : "text-theme-muted hover:text-theme-fg"
                  )}
                >
                  <ShieldCheck size={14} /> Oversight Matrix
                </button>
              </div>
            )}
            
            <button
              onClick={onClose}
              className="h-10 w-10 flex items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
              title="Terminate session"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-8 bg-theme-page/30">
          {selectedProject ? (
            viewMode === "kanban" ? (
              <ProjectKanban
                projectId={selectedProject.id}
                projectName={selectedProject.name}
                progress={selectedProject.progress}
                onClose={handleBackToList}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 min-h-[500px]">
                  <div className="text-center mb-10 max-w-xl">
                      <h3 className="text-2xl font-black text-theme-fg uppercase tracking-tighter mb-2">Multi-Tier Progress Visualization</h3>
                      <p className="text-xs text-theme-muted font-medium leading-relaxed">
                          Real-time hierarchical synchronization tracking the workflow from Corporate Admin to Tactical Managers and Operational Team Leads.
                      </p>
                  </div>
                  <OversightMatrix project={selectedProject} className="max-w-4xl" />
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.length === 0 ? (
                <div className="col-span-full py-40 flex flex-col items-center justify-center space-y-6 opacity-40">
                  <div className="h-20 w-20 rounded-3xl bg-theme-raised flex items-center justify-center">
                    <Grid3x3 size={40} className="text-theme-muted" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-theme-muted">Operational Void</p>
                    <p className="text-[11px] text-theme-muted font-bold mt-1">No active projects detected in your current scope.</p>
                  </div>
                </div>
              ) : (
                projects.map((project) => (
                  <div 
                    key={project.id} 
                    onClick={() => handleProjectClick(project)}
                    className="transform transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <ProjectCard {...project} onClick={() => handleProjectClick(project)} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
