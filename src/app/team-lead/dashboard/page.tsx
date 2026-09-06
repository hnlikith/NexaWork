/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { cn, formatCurrency } from "@/lib/utils";
import { ProjectModal } from "@/components/projects/ProjectModal";
import { supabase } from "@/lib/supabase";
import dayjs from "@/lib/dayjs";
import {
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Briefcase,
  Activity,
  ArrowUpRight,
  UserCheck,
  UserX,
  Coffee,
  Check,
  LayoutGrid
} from "lucide-react";
import { useToast } from "@/components/ui/ToastLegacy";

interface TeamMember {
  id: string;
  name: string;
  designation: string;
  is_active: boolean;
  attendance_status?: 'present' | 'absent' | 'late' | 'break';
  clock_in?: string;
}

export default function LeadDashboard() {
  const { user } = useAuth();
  const { request } = useApi();
  const { showToast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"attendance" | "projects">("attendance");

  const openKanban = (projectId: string) => {
    setSelectedProjectId(projectId);
    setShowProjectModal(true);
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // 1. Fetch Team Members and their attendance
      // First, find the team where this user is lead
      const { data: teamData } = await supabase
        .from('teams')
        .select('id, name')
        .eq('lead_id', user.id)
        .maybeSingle();

      const targetTeamId = teamData?.id || (user as any).team_id;

      if (!targetTeamId) {
         setLoading(false);
         return;
      }

      const { data: memberData } = await supabase
        .from('employees')
        .select(`id, name, designation, is_active, team_id`)
        .eq('team_id', targetTeamId);

      // Fetch today's attendance for these members
      const today = dayjs().format('YYYY-MM-DD');
      const { data: attendanceData } = await supabase
        .from('attendance_logs')
        .select('employee_id, status, clock_in')
        .eq('date', today);

      const formattedMembers = memberData?.map(m => {
        const att = attendanceData?.find(a => a.employee_id === m.id);
        return {
          ...m,
          attendance_status: att?.status as any || 'absent',
          clock_in: att?.clock_in
        };
      }) || [];

      setMembers(formattedMembers);

      // 2. Fetch Team Projects assigned to this lead
      const { data: projectTeamsData } = await supabase
        .from('project_teams')
        .select(`*, project:projects(*)`)
        .eq('lead_id', user.id);

      // Fetch task stats for these projects
      const projIds = projectTeamsData?.map(p => (p.project as any).id) || [];
      const { data: taskData } = await supabase
        .from('project_tasks')
        .select('project_id, status')
        .in('project_id', projIds);

      const formattedProjects = projectTeamsData?.map(p => {
        const proj = p.project as any;
        const pTasks = taskData?.filter(t => t.project_id === proj.id) || [];
        return {
          id: proj.id,
          name: proj.name,
          description: proj.description,
          phase: proj.phase,
          progress: proj.progress || 0,
          pending_tasks: pTasks.filter(t => t.status === 'SUBMITTED').length,
          assignment_status: p.status
        };
      }) || [];

      setProjects(formattedProjects);
    } catch (err) {
      console.error("Load lead data error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
    const channel = supabase.channel('lead_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_teams' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  async function acceptProject(projectId: string) {
    try {
      const { error } = await supabase
        .from('project_teams')
        .update({ status: 'accepted' })
        .eq('project_id', projectId)
        .eq('lead_id', user?.id);
      
      if (error) throw error;
      showToast("Project accepted. You can now decompose into tasks.", "success");
      loadData();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  }

  const stats = [
    { label: "Team Size", value: members.length, icon: Users, color: "text-theme-fg", bg: "bg-theme-raised" },
    { label: "Present Today", value: members.filter(m => m.attendance_status === 'present').length, icon: UserCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Awaiting Review", value: projects.reduce((acc, p) => acc + p.pending_tasks, 0), icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Active Units", value: projects.length, icon: Briefcase, color: "text-sky-500", bg: "bg-sky-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="lead_dashboard"
      title="Tactical Operations Command"
      subtitle="Operationalize assigned projects and monitor team execution."
    >
      <div className="space-y-6">
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="page-card flex items-center gap-4">
              <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center", s.bg)}>
                <s.icon size={20} className={s.color} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-theme-muted">{s.label}</p>
                <p className="text-2xl font-black text-theme-fg">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-theme-raised/50 border border-theme-border w-fit">
          {[
            { id: 'attendance', label: 'Workforce', icon: UserCheck },
            { id: 'projects', label: 'Deployment Hub', icon: Briefcase },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                activeTab === t.id ? "bg-theme-surface text-theme-primary shadow-sm border border-theme-border" : "text-theme-muted hover:text-theme-fg"
              )}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 space-y-6">
            {activeTab === 'attendance' ? (
              <div className="page-card p-0 overflow-hidden shadow-lg border-theme-border/50">
                <div className="px-6 py-4 border-b border-theme-border flex items-center justify-between bg-theme-surface/50">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-theme-muted" />
                    <h3 className="text-sm font-black text-theme-fg uppercase tracking-tight">Team Roster</h3>
                  </div>
                  <Badge variant="info" className="text-[10px] font-black tracking-widest">REAL-TIME</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-theme-raised/50 text-[10px] font-black uppercase text-theme-muted tracking-widest">
                      <tr>
                        <th className="px-6 py-3">Operative</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Deployment</th>
                        <th className="px-6 py-3 text-right">Metrics</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border">
                      {members.map((member) => (
                        <tr key={member.id} className="hover:bg-theme-raised/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-theme-primary/10 text-theme-primary flex items-center justify-center text-[10px] font-black">
                                {member.name.split(' ').map(n => n[0]).join('')}
                              </div>
                              <div>
                                <p className="text-xs font-black text-theme-fg">{member.name}</p>
                                <p className="text-[10px] text-theme-muted font-bold">{member.designation}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge 
                              variant={
                                member.attendance_status === 'present' ? 'success' : 
                                member.attendance_status === 'absent' ? 'danger' : 
                                'warning'
                              }
                              className="capitalize text-[10px] font-black"
                            >
                              {member.attendance_status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-theme-muted">
                            {member.clock_in ? dayjs(`2000-01-01 ${member.clock_in}`).format('hh:mm A') : 'OFFLINE'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="secondary" size="xs" className="text-[9px] font-black uppercase">Stats</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {projects.map((proj) => (
                  <div 
                    key={proj.id} 
                    className={cn(
                        "page-card group hover:border-theme-primary/50 cursor-pointer transition-all border border-theme-border flex flex-col",
                        proj.assignment_status === 'pending' && "ring-2 ring-amber-500 ring-offset-4 ring-offset-theme-page animate-pulse-subtle"
                    )}
                  >
                     <div className="flex items-center justify-between mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-primary/10 text-theme-primary">
                           <Briefcase size={20} />
                        </div>
                        <Badge 
                            variant={proj.assignment_status === 'pending' ? "warning" : "info"} 
                            className="text-[9px] font-black"
                        >
                            {proj.assignment_status === 'pending' ? "NEW ASSIGNMENT" : proj.phase}
                        </Badge>
                     </div>
                     <div onClick={() => openKanban(proj.id)} className="flex-1">
                        <h4 className="text-sm font-black text-theme-fg group-hover:text-theme-primary transition-colors mb-1">{proj.name}</h4>
                        <p className="text-[10px] text-theme-muted mb-4 line-clamp-2 h-8">{proj.description}</p>
                        
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[9px] font-black text-theme-muted uppercase tracking-widest">
                            <span>Unit Progress</span>
                            <span className="text-theme-fg">{proj.progress || 0}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-theme-raised overflow-hidden">
                            <div className="h-full bg-theme-primary transition-all duration-500" style={{ width: `${proj.progress || 0}%` }} />
                            </div>
                        </div>
                     </div>

                     <div className="mt-4 pt-4 border-t border-theme-border">
                        {proj.assignment_status === 'pending' ? (
                            <Button 
                                variant="primary" 
                                size="sm" 
                                className="w-full text-[9px] font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-700"
                                onClick={(e) => { e.stopPropagation(); acceptProject(proj.id); }}
                            >
                                <Check size={12} className="mr-1.5" /> Accept & Decompose
                            </Button>
                        ) : (
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                className="w-full text-[9px] font-black uppercase tracking-widest"
                                onClick={(e) => { e.stopPropagation(); openKanban(proj.id); }}
                            >
                                <LayoutGrid size={12} className="mr-1.5" /> Break Down Tasks
                            </Button>
                        )}
                     </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Verification Queue */}
          <div className="page-card p-0 overflow-hidden shadow-lg border-theme-border/50">
            <div className="px-6 py-4 border-b border-theme-border bg-theme-surface/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-theme-muted" />
                <h3 className="text-sm font-black text-theme-fg uppercase tracking-tight">Review Pipeline</h3>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {projects.filter(p => p.pending_tasks > 0).length === 0 ? (
                <div className="py-12 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-3">
                    <CheckCircle2 size={24} />
                  </div>
                  <p className="text-xs font-black uppercase tracking-widest text-theme-fg">Clear Workspace</p>
                  <p className="text-[10px] text-theme-muted font-bold">All deliverables reviewed.</p>
                </div>
              ) : (
                projects.filter(p => p.pending_tasks > 0).map((project) => (
                  <div 
                    key={project.id} 
                    onClick={() => { setSelectedProjectId(project.id); setShowProjectModal(true); }}
                    className="p-4 rounded-xl border border-theme-border bg-theme-raised/50 hover:border-amber-500/50 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-black text-theme-fg group-hover:text-amber-500 transition-colors">{project.name}</h4>
                      <Badge variant="warning" className="text-[9px] font-black">{project.pending_tasks} PENDING</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-theme-border overflow-hidden">
                        <div className="h-full bg-sky-500" style={{ width: `${project.progress}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-theme-muted">{project.progress}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 bg-theme-raised/30 border-t border-theme-border">
              <Button className="w-full text-[10px] font-black uppercase py-4" variant="secondary">
                Oversight Matrix <ArrowUpRight size={14} className="ml-2" />
              </Button>
            </div>
          </div>

        </div>

      </div>

      <ProjectModal 
        isOpen={showProjectModal} 
        onClose={() => {
          setShowProjectModal(false);
          setSelectedProjectId(null);
        }} 
        projects={projects} 
        initialProjectId={selectedProjectId || undefined}
      />
    </DashboardShell>
  );
}
