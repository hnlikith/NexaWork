"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Users,
  Search,
  Building2,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  UserX,
  Briefcase,
  Mail,
  Calendar,
  Coffee
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useToast } from "@/components/ui/ToastLegacy";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/BadgeLegacy";
import { useAuth } from "@/components/layout/AuthProvider";
import { supabase } from "@/lib/supabase";

const ROLE_LABEL: Record<string, string> = {
  employee:  "EMPLOYEE",
  team_lead: "TEAM LEAD",
  dept_lead: "DEPARTMENT LEAD",
  admin:     "ADMIN",
  intern:    "INTERN",
};

const ROLE_BADGE: Record<string, "default" | "info" | "success" | "purple" | "warning" | "danger"> = {
  employee:  "default",
  team_lead: "success",
  dept_lead: "purple",
  admin:     "purple",
  intern:    "info",
};

export default function ManagerTeamsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "inactive">("all");
  
  const [teamsData, setTeamsData] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [activeDept, setActiveDept] = useState<any>(null);

  async function fetchData() {
    if (!user) return;
    try {
      setLoading(true);
      
      // Use axios for teams to avoid fetch cache, and explicit no-store for employees
      const [teamsRes, empsRes] = await Promise.all([
        axios.get('/api/teams'),
        fetch('/api/employees', { cache: 'no-store', headers: { 'Pragma': 'no-cache' } }).then(r => r.json())
      ]);
      
      const allTeams = teamsRes.data.teams || [];
      const allEmpsRaw = empsRes.employees || [];
      
      // Map database fields to frontend fields
      const allEmps = allEmpsRaw.map((e: any) => ({
        ...e,
        employeeId: e.employee_id || e.employeeId,
        joiningDate: e.joining_date || e.joiningDate,
        isActive: e.is_active ?? e.isActive ?? true
      }));

      // Identify department
      let dept = allTeams.find((t: any) => t.type === 'department' && t.lead_id === user.id);
      if (!dept && user.department) {
        dept = allTeams.find((t: any) => t.type === 'department' && t.name.toLowerCase() === user.department.toLowerCase());
      }
      
      if (dept) {
        setActiveDept(dept);
        const filteredTeams = allTeams.filter((t: any) => 
          t.id === dept.id || t.parent_id === dept.id
        );
        setTeamsData(filteredTeams);
        
        // Filter employees belonging to this department
        const deptEmps = allEmps.filter((e: any) => 
          e.department?.toLowerCase() === dept.name.toLowerCase()
        );
        setEmployees(deptEmps);
      } else {
        const leadTeams = allTeams.filter((t: any) => t.lead_id === user.id);
        if (leadTeams.length > 0) {
           setTeamsData(leadTeams);
           const firstDept = leadTeams.find((t: any) => t.type === 'department');
           if (firstDept) setActiveDept(firstDept);
           
           // Also load employees for lead teams if not in a department
           const teamIds = leadTeams.map((t: any) => t.id);
           const teamEmps = allEmps.filter((e: any) => teamIds.includes(e.team_id));
           setEmployees(teamEmps);
        }
      }
    } catch (e: any) {
      console.error("Fetch Fault:", e);
      showToast("Failed to synchronize workforce data.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('teams-employees-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const nameMatch = emp.name ? emp.name.toLowerCase().includes(search.toLowerCase()) : false;
      const emailMatch = emp.email ? emp.email.toLowerCase().includes(search.toLowerCase()) : false;
      const idMatch = emp.employeeId ? emp.employeeId.toLowerCase().includes(search.toLowerCase()) : false;
      const matchSearch = nameMatch || emailMatch || idMatch;
      
      const isActive = emp.isActive;
      const matchTab = activeTab === "all" || 
                       (activeTab === "active" && isActive) || 
                       (activeTab === "inactive" && !isActive);
                       
      return matchSearch && matchTab;
    });
  }, [employees, search, activeTab]);

  const stats = useMemo(() => {
    const activeCount = employees.filter(e => e.isActive).length;
    return {
      total: employees.length,
      active: activeCount,
      inactive: employees.length - activeCount,
      units: teamsData.filter(t => t.type === 'team').length
    };
  }, [employees, teamsData]);

  const getInitials = (name: string) => {
    if (!name) return "??";
    return name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <DashboardShell
      moduleKey="manager_teams"
      title="Workforce Architecture"
      subtitle={activeDept ? `Comprehensive personnel management for the ${activeDept.name} Division.` : "Department personnel and organizational hierarchy overview."}
    >
      <div className="space-y-6">
        {!activeDept && !loading && (
           <div className="rounded-2xl border-2 border-dashed border-theme-border bg-theme-raised/5 p-8 text-center">
              <ShieldCheck size={40} className="mx-auto text-theme-muted opacity-20 mb-3" />
              <h3 className="text-sm font-bold text-theme-fg uppercase tracking-widest">No Department Linked</h3>
              <p className="text-xs text-theme-muted mt-1">Your profile is not currently mapped to an active department.</p>
           </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total Personnel", value: stats.total, icon: Users, color: "text-theme-fg", bg: "bg-theme-raised" },
            { label: "Active Nodes", value: stats.active, icon: UserCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Inactive", value: stats.inactive, icon: UserX, color: "text-rose-500", bg: "bg-rose-500/10" },
            { label: "Operational Units", value: stats.units, icon: Building2, color: "text-sky-500", bg: "bg-sky-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="page-card flex items-center gap-3 border border-theme-border/50">
              <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
                <Icon size={16} className={color} />
              </div>
              <div>
                <p className="text-[11px] text-theme-muted font-bold uppercase tracking-wider">{label}</p>
                <p className={cn("text-xl font-black leading-tight", color)}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Workforce Table Container */}
        <div className="page-card p-0 shadow-xl border-theme-border/50 overflow-hidden bg-theme-surface">
          {/* Table Toolbar */}
          <div className="flex flex-col gap-4 border-b border-theme-border/50 px-8 py-6 sm:flex-row sm:items-center sm:justify-between bg-theme-raised/5">
            <div className="flex rounded-2xl border border-theme-border bg-theme-raised p-1 gap-1">
              {(["all", "active", "inactive"] as const).map((id) => (
                <button 
                  key={id} 
                  onClick={() => setActiveTab(id)}
                  className={cn("rounded-lg px-4 py-1.5 text-xs font-black uppercase tracking-wider transition-all",
                    activeTab === id ? "bg-theme-surface text-theme-fg shadow-sm" : "text-theme-muted hover:text-theme-fg"
                  )}
                >
                  {id === "all" ? "All Records" : id.charAt(0).toUpperCase() + id.slice(1)}
                  <span className="ml-2 opacity-40">
                    ({id === "all" ? stats.total : id === "active" ? stats.active : stats.inactive})
                  </span>
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-theme-muted" size={14} />
              <input 
                type="text" 
                placeholder="Search by name, email, or ID..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-72 rounded-xl border border-theme-border bg-theme-page pl-10 pr-4 text-xs font-semibold text-theme-fg outline-none focus:border-theme-primary transition-all shadow-sm" 
              />
            </div>
          </div>

          {loading ? (
            <div className="py-32 text-center flex flex-col items-center gap-4">
               <div className="h-8 w-8 animate-spin rounded-full border-4 border-theme-primary border-t-transparent" />
               <p className="text-[10px] font-black uppercase tracking-[0.2em] text-theme-muted animate-pulse">Syncing Personnel Data...</p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-theme-page/50 text-[10px] font-black text-theme-muted uppercase tracking-[0.1em] border-b border-theme-border/30">
                    <th className="px-8 py-4">Personnel</th>
                    <th className="px-8 py-4">Corporate ID</th>
                    <th className="px-8 py-4">Org Entity / Hierarchy</th>
                    <th className="px-8 py-4">Commencement</th>
                    <th className="px-8 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border/20">
                  {filteredEmployees.map((emp) => {
                    const isActive = emp.isActive;
                    const team = teamsData.find(t => t.id === emp.team_id);
                    
                    return (
                      <tr key={emp.id} className="group hover:bg-theme-raised/30 transition-all duration-300">
                        {/* Column 1: Personnel */}
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-theme-primary text-theme-surface text-[11px] font-black shadow-lg shadow-theme-primary/10">
                              {getInitials(emp.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-theme-fg truncate group-hover:text-theme-primary transition-colors tracking-tight">{emp.name || "Unknown Name"}</p>
                              <div className="flex items-center gap-1.5 text-[11px] text-theme-muted font-medium">
                                <Mail size={10} className="opacity-50" />
                                {emp.email || "—"}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Corporate ID */}
                        <td className="px-8 py-4 text-xs font-bold text-theme-muted">
                           {emp.employeeId || 'TBA'}
                        </td>

                        {/* Column 3: Hierarchy */}
                        <td className="px-8 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-theme-fg uppercase tracking-tight">{emp.department || "General Nodes"}</span>
                            {team && (
                               <span className="text-[10px] text-theme-muted font-bold flex items-center gap-1">
                                  <ChevronRight size={10} className="text-theme-primary/50" />
                                  {team.name}
                               </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                             <Badge variant="purple" className="text-[10px] px-2 py-0.5 font-black uppercase tracking-widest shadow-sm">
                               {emp.matrix_role || "No Matrix Role"}
                             </Badge>
                             <span className="flex items-center gap-1 text-[9px] font-black text-theme-muted px-2 py-0.5 border border-theme-border/50 rounded-lg bg-theme-page">
                                <Coffee size={10} /> {emp.monthly_leave_quota || 0} L/M
                             </span>
                          </div>
                        </td>

                        {/* Column 4: Commencement */}
                        <td className="px-8 py-4 text-xs font-semibold text-theme-fg">
                           {emp.joiningDate ? formatDate(emp.joiningDate) : "—"}
                        </td>

                        {/* Column 5: Status */}
                        <td className="px-8 py-4 text-center">
                           <span className={cn(
                             "inline-flex rounded-md px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest transition-all",
                             isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-theme-raised text-theme-muted opacity-40"
                           )}>
                             {isActive ? "Active" : "Inactive"}
                           </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
