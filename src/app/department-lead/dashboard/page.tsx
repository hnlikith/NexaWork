/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client"; 

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { useApi } from "@/hooks/useApi";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { cn, formatCurrency } from "@/lib/utils";
import { ProjectModal } from "@/components/projects/ProjectModal";
import { supabase } from "@/lib/supabase";
import dayjs from "@/lib/dayjs";
import {
  Building2, PieChart, BarChart3, ShieldCheck, TrendingUp, Users, Target, Zap, LayoutGrid, Filter, 
  CalendarDays, ClipboardList, Search, Clock, ArrowRight, UserCheck, AlertCircle, Briefcase, ChevronRight, X, User, CheckCircle2
} from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/components/ui/ToastLegacy";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DelegationModal } from "@/components/projects/DelegationModal";

interface DeptStats {
  totalEmployees: number;
  activeTeams: number;
  overallAttendance: number;
  openTasks: number;
}

interface TeamPerf {
  name: string;
  attendance: number;
  productivity: number;
}

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "projects" | "teams" | "attendance" | "tasks">("overview");
  const [stats, setStats] = useState<DeptStats>({ totalEmployees: 0, activeTeams: 0, overallAttendance: 0, openTasks: 0 });
  const [loading, setLoading] = useState(true);
  
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [delegatingProject, setDelegatingProject] = useState<any | null>(null);
  const { showToast } = useToast();

  const loadDeptData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // 1. Get Department Context
      let { data: deptData } = await supabase.from('teams').select('id, name').eq('type', 'department').eq('head_id', user.id).maybeSingle();
      if (!deptData && user.department) {
        const { data: nameDept } = await supabase.from('teams').select('id, name').eq('type', 'department').eq('name', user.department).maybeSingle();
        deptData = nameDept;
      }
      if (!deptData) return;

      // 2. Fetch Teams & Employees
      const { data: teamsData } = await supabase.from('teams').select('*').eq('department_id', deptData.id);
      const teamIds = teamsData?.map(t => t.id) || [];
      const { data: empData } = await supabase.from('employees').select('*, teams(name)').in('team_id', teamIds);
      const employeeIds = empData?.map(e => e.id) || [];

      // 3. Fetch Projects
      const { data: deptProjects } = await supabase.from('projects').select('*, clients(name)').or(`department_id.eq.${deptData.id},manager_id.eq.${user.id}`);
      const { data: projTeams } = await supabase.from('project_teams').select('*').in('team_id', teamIds);

      // 4. Fetch Tasks & Attendance
      const { data: taskData } = await supabase.from('project_tasks').select('*, projects(name), employees(name)').in('assigned_to', employeeIds);
      const { data: attData } = await supabase.from('attendance_logs').select('*, employees(name, designation)').eq('date', dayjs().format('YYYY-MM-DD')).in('employee_id', employeeIds);

      // 5. Build Stats & State
      setTeams(teamsData || []);
      setEmployees(empData || []);
      setAttendance(attData || []);
      setTasks(taskData || []);
      setStats({
        totalEmployees: empData?.length || 0,
        activeTeams: teamsData?.length || 0,
        overallAttendance: empData?.length ? Math.round(((attData?.filter(a => a.status === 'present').length || 0) / empData.length) * 100) : 0,
        openTasks: taskData?.filter(t => t.status !== 'COMPLETED').length || 0
      });

      setProjects((deptProjects || []).map(p => ({
        ...p,
        teamIds: projTeams?.filter(pt => pt.project_id === p.id).map(pt => pt.team_id) || [],
        tasks: {
          total: taskData?.filter(t => t.project_id === p.id).length || 0,
          completed: taskData?.filter(t => t.project_id === p.id && t.status === 'COMPLETED').length || 0,
        }
      })));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDeptData();
    const channel = supabase.channel('dept-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => loadDeptData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => loadDeptData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, () => loadDeptData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => loadDeptData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => loadDeptData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadDeptData]);

  const chartData = useMemo(() => [
    { name: "Mon", performance: 65, attendance: 90 },
    { name: "Tue", performance: 72, attendance: 85 },
    { name: "Wed", performance: 85, attendance: 95 },
    { name: "Thu", performance: 78, attendance: 88 },
    { name: "Fri", performance: 92, attendance: 92 },
  ], []);

  return (
    <DashboardShell
      moduleKey="manager_dashboard" title="Manager Dashboard" subtitle={`Overview for ${user?.department || 'Department'}.`}>
      <div className="space-y-8">
        {/* TOP METRICS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: "Department Staff", value: stats.totalEmployees, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "Active Teams", value: stats.activeTeams, icon: LayoutGrid, color: "text-purple-500", bg: "bg-purple-500/10" },
            { label: "Daily Attendance", value: `${stats.overallAttendance}%`, icon: UserCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Current Tasks", value: stats.openTasks, icon: Target, color: "text-amber-500", bg: "bg-amber-500/10" },
          ].map((m, i) => (
            <div key={i} className="page-card p-6 border border-theme-border flex items-center gap-5 hover:border-theme-primary/30 transition-all">
              <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shadow-inner", m.bg)}>
                <m.icon className={m.color} size={28} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-theme-muted tracking-widest">{m.label}</p>
                <h3 className="text-2xl font-black text-theme-fg mt-0.5">{m.value}</h3>
              </div>
            </div>
          ))}
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-theme-surface/50 border border-theme-border w-fit">
          {[
            { id: 'overview', label: 'Overview', icon: PieChart },
            { id: 'projects', label: 'Projects', icon: Briefcase },
            { id: 'teams', label: 'Team Members', icon: Users },
            { id: 'attendance', label: 'Daily Attendance', icon: CalendarDays },
            { id: 'tasks', label: 'Tasks', icon: ClipboardList },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === tab.id 
                  ? "bg-theme-primary text-theme-surface shadow-xl shadow-theme-primary/20 scale-105" 
                  : "text-theme-muted hover:text-theme-fg hover:bg-theme-raised"
              )}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        {/* TAB CONTENT: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 page-card p-8 border border-theme-border h-[400px] flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-lg font-black text-theme-fg tracking-tight">Project Progress</h3>
                  <p className="text-xs text-theme-muted font-bold">Real-time team performance trends</p>
                </div>
                <Badge variant="purple" className="px-3 py-1">LIVE DATA</Badge>
              </div>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="perf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--theme-border), 0.1)" />
                    <XAxis dataKey="name" stroke="currentColor" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                    <YAxis stroke="currentColor" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--theme-surface)', borderRadius: '16px', border: '1px solid var(--theme-border)', fontSize: '10px', fontWeight: 'bold' }} />
                    <Area type="monotone" dataKey="performance" stroke="#8b5cf6" fillOpacity={1} fill="url(#perf)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="page-card p-8 border border-theme-border flex flex-col">
               <h3 className="text-sm font-black text-theme-fg uppercase tracking-widest mb-6">Pending Approvals</h3>
               <div className="space-y-4 flex-1">
                 {projects.filter(p => p.workflow_status === 'initialized').map(p => (
                   <div key={p.id} className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600"><Briefcase size={20}/></div>
                         <div><p className="text-xs font-black text-theme-fg">{p.name}</p><p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">New Project</p></div>
                      </div>
                      <Button variant="secondary" size="xs" onClick={() => setDelegatingProject(p)} className="rounded-lg bg-amber-500 text-white border-none hover:bg-amber-600">Review</Button>
                   </div>
                 ))}
                 {projects.filter(p => p.workflow_status === 'initialized').length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-10">
                      <CheckCircle2 size={32} className="text-theme-muted mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-theme-muted">Queue is Clear</p>
                   </div>
                 )}
               </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: PROJECTS */}
        {activeTab === 'projects' && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             {projects.map((proj) => (
                <div key={proj.id} className="page-card group p-6 border border-theme-border hover:border-theme-primary/50 transition-all flex flex-col relative overflow-hidden">
                   <div className="absolute top-0 right-0 h-24 w-24 bg-theme-primary/5 rounded-bl-[100px] -mr-8 -mt-8 transition-transform group-hover:scale-125" />
                   <div className="flex items-center justify-between mb-6 relative">
                      <div className="h-12 w-12 rounded-2xl bg-theme-primary/10 text-theme-primary flex items-center justify-center shadow-lg shadow-theme-primary/5"><Briefcase size={24} /></div>
                      <Badge variant={proj.workflow_status === 'initialized' ? "warning" : "info"} className="text-[9px] font-black tracking-widest">
                        {proj.workflow_status?.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                   </div>
                   <div className="flex-1 relative">
                      <h4 className="text-base font-black text-theme-fg mb-1">{proj.name}</h4>
                      <p className="text-[11px] text-theme-muted font-bold mb-6 line-clamp-2">{proj.description}</p>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-black text-theme-muted uppercase tracking-widest">
                           <span>Completion Rate</span>
                           <span className="text-theme-fg">{proj.progress || 0}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-theme-raised overflow-hidden">
                           <div className="h-full bg-gradient-to-r from-theme-primary to-blue-500 transition-all duration-1000" style={{ width: `${proj.progress || 0}%` }} />
                        </div>
                      </div>
                   </div>
                   <div className="mt-8 pt-6 border-t border-theme-border flex items-center justify-between gap-4">
                      <div className="flex -space-x-3">
                        {[1,2,3].map(i => <div key={i} className="h-8 w-8 rounded-full bg-theme-raised border-2 border-theme-surface flex items-center justify-center text-[10px] font-black text-theme-muted"><User size={14}/></div>)}
                      </div>
                      <Button variant="primary" size="sm" onClick={() => setDelegatingProject(proj)} className="text-[10px] font-black uppercase tracking-widest rounded-xl">Oversight</Button>
                   </div>
                </div>
             ))}
           </div>
        )}

        {/* TAB CONTENT: ATTENDANCE */}
        {activeTab === 'attendance' && (
          <div className="page-card border border-theme-border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="p-8 border-b border-theme-border flex items-center justify-between bg-theme-raised/30">
                <div><h3 className="text-lg font-black text-theme-fg tracking-tight">Real-time Presence Log</h3><p className="text-xs text-theme-muted font-bold">Tracking active workforce in your department</p></div>
                <div className="flex items-center gap-3"><Clock size={16} className="text-theme-primary" /><span className="text-sm font-black text-theme-fg uppercase">{dayjs().format("HH:mm:ss")}</span></div>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                   <thead>
                      <tr className="bg-theme-surface border-b border-theme-border">
                         <th className="px-8 py-4 text-[10px] font-black uppercase text-theme-muted tracking-widest">Employee</th>
                         <th className="px-8 py-4 text-[10px] font-black uppercase text-theme-muted tracking-widest">Designation</th>
                         <th className="px-8 py-4 text-[10px] font-black uppercase text-theme-muted tracking-widest">Check-In</th>
                         <th className="px-8 py-4 text-[10px] font-black uppercase text-theme-muted tracking-widest">Status</th>
                         <th className="px-8 py-4 text-[10px] font-black uppercase text-theme-muted tracking-widest text-right">Activity</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-theme-border">
                      {employees.map((emp) => {
                         const log = attendance.find(a => a.employee_id === emp.id);
                         return (
                            <tr key={emp.id} className="hover:bg-theme-raised/30 transition-colors">
                               <td className="px-8 py-5 flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-theme-primary/10 text-theme-primary flex items-center justify-center font-black text-xs">{emp.name.charAt(0)}</div><span className="text-sm font-bold text-theme-fg">{emp.name}</span></td>
                               <td className="px-8 py-5"><span className="text-xs font-bold text-theme-muted uppercase tracking-tight">{emp.designation || "Executive"}</span></td>
                               <td className="px-8 py-5"><span className="text-xs font-black text-theme-fg">{log?.check_in ? dayjs(`2000-01-01 ${log.check_in}`).format("hh:mm A") : "—"}</span></td>
                               <td className="px-8 py-5"><Badge variant={log?.status === 'present' ? "success" : "danger"} className="px-3">{log?.status?.toUpperCase() || "ABSENT"}</Badge></td>
                               <td className="px-8 py-5 text-right"><div className={cn("h-2 w-2 rounded-full inline-block", log?.status === 'present' ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-theme-muted")} /></td>
                            </tr>
                         )
                      })}
                   </tbody>
                </table>
             </div>
          </div>
        )}

        {/* TAB CONTENT: WORKFORCE */}
        {activeTab === 'teams' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             {teams.map((team) => (
               <div key={team.id} className="page-card p-6 border border-theme-border hover:border-theme-primary/30 transition-all flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                     <div className="h-12 w-12 rounded-2xl bg-theme-primary/10 text-theme-primary flex items-center justify-center font-black">
                        <Users size={24} />
                     </div>
                     <Badge variant="info" className="text-[9px] font-black">{team.member_count || 0} MEMBERS</Badge>
                  </div>
                  <h4 className="text-sm font-black text-theme-fg mb-1">{team.name}</h4>
                  <p className="text-[10px] text-theme-muted font-bold uppercase tracking-widest mb-6">{team.type || "Operational Unit"}</p>
                  
                  <div className="mt-auto pt-6 border-t border-theme-border flex items-center justify-between">
                     <div className="flex -space-x-2">
                        {employees.filter(e => e.team_id === team.id).slice(0, 3).map((e, idx) => (
                           <div key={idx} className="h-8 w-8 rounded-full bg-theme-raised border-2 border-theme-surface flex items-center justify-center text-[10px] font-black text-theme-muted" title={e.name}>
                              {e.name.charAt(0)}
                           </div>
                        ))}
                     </div>
                     <Button variant="secondary" size="xs" className="text-[9px] font-black tracking-widest uppercase">Inspect Team</Button>
                  </div>
               </div>
             ))}
          </div>
        )}

        {/* TAB CONTENT: OPERATIONS */}
        {activeTab === 'tasks' && (
          <div className="page-card border border-theme-border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="p-8 border-b border-theme-border flex items-center justify-between bg-theme-raised/30">
                <div><h3 className="text-lg font-black text-theme-fg tracking-tight">Department Tasks</h3><p className="text-xs text-theme-muted font-bold">Monitoring task execution across your department</p></div>
                <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" /><input type="text" placeholder="Search tasks..." className="bg-theme-surface border border-theme-border rounded-xl pl-9 pr-4 py-2 text-xs font-bold w-64 focus:outline-none focus:ring-2 focus:ring-theme-primary/20" /></div>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                   <thead>
                      <tr className="bg-theme-surface border-b border-theme-border">
                         <th className="px-8 py-4 text-[10px] font-black uppercase text-theme-muted tracking-widest">Task Detail</th>
                         <th className="px-8 py-4 text-[10px] font-black uppercase text-theme-muted tracking-widest">Project Context</th>
                         <th className="px-8 py-4 text-[10px] font-black uppercase text-theme-muted tracking-widest">Assignee</th>
                         <th className="px-8 py-4 text-[10px] font-black uppercase text-theme-muted tracking-widest">Phase</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-theme-border">
                      {tasks.map((task) => (
                        <tr key={task.id} className="hover:bg-theme-raised/30 transition-colors">
                           <td className="px-8 py-5"><div><p className="text-sm font-bold text-theme-fg">{task.title}</p><p className="text-[10px] text-theme-muted line-clamp-1">{task.description}</p></div></td>
                           <td className="px-8 py-5"><Badge variant="default" className="bg-theme-primary/5 text-theme-primary border-none lowercase font-bold">{task.projects?.name}</Badge></td>
                           <td className="px-8 py-5"><div className="flex items-center gap-2"><div className="h-6 w-6 rounded-lg bg-theme-raised flex items-center justify-center text-[10px] font-black">{task.employees?.name.charAt(0)}</div><span className="text-xs font-bold text-theme-fg">{task.employees?.name}</span></div></td>
                           <td className="px-8 py-5"><Badge variant={task.status === 'COMPLETED' ? 'success' : task.status === 'IN_PROGRESS' ? 'info' : 'warning'} className="text-[9px] font-black">{task.status?.replace(/_/g, ' ')}</Badge></td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        )}
      </div>

      {delegatingProject && (
        <DelegationModal project={delegatingProject} teams={teams} employees={employees} onClose={() => setDelegatingProject(null)} onSuccess={() => { setDelegatingProject(null); loadDeptData(); }} />
      )}
    </DashboardShell>
  );
}



