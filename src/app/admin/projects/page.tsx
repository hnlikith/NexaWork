"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useRef } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MultiSelect as ShadcnMultiSelect } from "@/components/ui/multi-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { formatDate, cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import {
  Folder, Plus, Search, X, Building2, Zap, Target, ArrowRightLeft,
  CheckCircle2, Clock, CalendarDays, TrendingUp, MoreVertical, Edit2,
  Trash2, SearchCode, ShieldCheck, Tag, LayoutGrid, Building, User, ChevronDown,
  FileText, Activity, Users, Check, Columns, Database, IndianRupee, AlertCircle, ChevronRight,
  BookOpen, Table2, Presentation, StickyNote, ExternalLink, FolderOpen,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import axios from "axios";
import dayjs from "@/lib/dayjs";
import { useAuth } from "@/components/layout/AuthProvider";
import { usePermission } from "@/hooks/usePermission";
import { DelegationModal } from "@/components/projects/DelegationModal";

type ProjectPhase = "SCOPING" | "IMPLEMENTATION" | "REVIEW" | "COMPLETED";

interface Client {
  id: string;
  name: string;
  lead_name: string;
}

interface Team {
  id: string;
  name: string;
  type?: string;
  parent_id?: string | null;
  head_id?: string | null;
  lead_id?: string | null;
  member_count?: number;
}

interface BudgetData {
  id: string;
  budget_number: string;
  name: string;
  total_amount: number;
  actual_spent: number;
  purchase_spent: number;
  sub_spent: number;
  status: string;
}

interface Budget {
  id: string;
  budget_number: string;
  name: string;
  total_amount: number;
  actual_spent: number;
  status: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  budget: number;
  budget_id: string | null;
  clientId: string;
  teamIds: string[];
  phase: ProjectPhase;
  issued_date: string;
  dueDate: string;
  is_active: boolean;
  progress?: number;
  client?: Client;
  teams?: Team[];
  budget_data?: BudgetData | null;
  department_id?: string | null;
  manager_id?: string | null;
  workflow_status?: string;
}

interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  assigned_to: string | null;
  assignee_ids: string[];
  due_date: string | null;
  assigned_to_employee?: { id: string; name: string; employee_id: string };
  assignees?: { id: string; name: string; employee_id: string }[];
  submission_url?: string | null;
  submission_notes?: string | null;
  review_feedback?: string | null;
}

interface TaskComment {
  id: string;
  task_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface Employee {
  id: string;
  name: string;
  employee_id: string;
  role: string;
  department: string;
  team_id?: string;
  is_dept_lead?: boolean;
  is_team_lead?: boolean;
}

const PHASE_CONFIG: Record<ProjectPhase, { label: string; bg: string; text: string; border: string; icon: any; variant: any }> = {
  SCOPING:        { label: "Scoping",        bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20",  icon: Target,       variant: "warning" },
  IMPLEMENTATION: { label: "In Progress",    bg: "bg-sky-500/10",    text: "text-sky-400",    border: "border-sky-500/20",    icon: Zap,          variant: "info"    },
  REVIEW:         { label: "Review",         bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20", icon: ArrowRightLeft,variant: "purple"  },
  COMPLETED:      { label: "Completed",      bg: "bg-emerald-500/10",text: "text-emerald-400",border: "border-emerald-500/20",icon: CheckCircle2,  variant: "success" },
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

const TASK_STATUS_CONFIG = {
  TODO: { label: "To Do", bg: "bg-slate-500/10 text-slate-400 border border-slate-500/20" },
  IN_PROGRESS: { label: "In Progress", bg: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  REVIEW: { label: "Review", bg: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  COMPLETED: { label: "Done", bg: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
};

const PRIORITY_CONFIG = {
  Low: "text-slate-400",
  Medium: "text-blue-500",
  High: "text-amber-500",
  Critical: "text-rose-500",
};

// ── Card Context Menu ────────────────────────────────────
function CardMenu({ project, onRefresh, onEdit, setDeleteConfirm, onOversight, canEdit, canDelete }: {
  project: Project;
  onRefresh: () => void;
  onEdit: () => void;
  setDeleteConfirm: (p: Project) => void;
  onOversight: (p: Project) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function toggleStatus() {
    setActing(true); setOpen(false);
    try {
      await axios.patch(`/api/projects/${project.id}`, { is_active: !project.is_active });
      toast.success(`Project is now ${!project.is_active ? "Active" : "Archived"}`);
      onRefresh();
    } catch { toast.error("Status change failed."); } finally { setActing(false); }
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} disabled={acting}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-colors">
        <MoreVertical size={13} />
      </button>
      {open && (
        <div className="absolute z-[9999] right-0 top-8 w-48 rounded-xl border border-theme-border bg-theme-surface shadow-2xl p-1.5 animate-in zoom-in-95 duration-150">
          {canEdit && (
            <button onClick={() => { onEdit(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-theme-fg hover:bg-theme-raised transition-all">
              <Edit2 size={12} className="text-amber-500" /> Edit
            </button>
          )}
          <button onClick={toggleStatus}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-theme-fg hover:bg-theme-raised transition-all">
            <Clock size={12} className="text-sky-500" /> {project.is_active ? "Archive" : "Activate"}
          </button>
          <button onClick={() => { onOversight(project); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-theme-fg hover:bg-theme-raised transition-all">
            <ShieldCheck size={12} className="text-emerald-500" /> Tracking Matrix
          </button>
          {canDelete && (
            <>
              <div className="my-1 h-px bg-theme-border/50" />
              <button onClick={() => { setDeleteConfirm(project); setOpen(false); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-all">
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── 3-Dot Context Menu (kept for backward compat) ─────────────────────────────
function RowMenu({ project, onRefresh, onEdit, isLast, setDeleteConfirm, onOversight }: {
  project: Project;
  onRefresh: () => void;
  onEdit: () => void;
  isLast?: boolean;
  setDeleteConfirm: (p: Project) => void;
  onOversight: (p: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function toggleStatus() {
     setActing(true);
     setOpen(false);
     try {
       await axios.patch(`/api/projects/${project.id}`, { is_active: !project.is_active });
       toast.success(`Project is now ${!project.is_active ? "Active" : "Archived"}`);
       onRefresh();
     } catch (e: any) {
       toast.error("Status transition failed.");
     } finally {
       setActing(false);
     }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} disabled={acting} className="p-1.5 rounded-lg text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-colors">
        <MoreVertical size={14} />
      </button>

      {open && (
        <div className={cn("absolute z-[1000] w-52 rounded-2xl border border-theme-border bg-theme-surface shadow-2xl p-1.5 animate-in zoom-in-95 duration-150", 
          "right-full mr-2", isLast ? "bottom-0" : "top-0"
        )}>
          <button onClick={() => { onEdit(); setOpen(false); }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-theme-fg hover:bg-theme-raised transition-all group">
            <Edit2 size={13} className="text-amber-500" /> Edit Project
          </button>
          <button onClick={toggleStatus}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-theme-fg hover:bg-theme-raised transition-all group">
            <Clock size={13} className="text-sky-500" /> {project.is_active ? "Archive Project" : "Activate Project"}
          </button>
          <button onClick={() => { onOversight(project); setOpen(false); }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-theme-fg hover:bg-theme-raised transition-all group">
            <ShieldCheck size={13} className="text-emerald-500" /> Tracking Matrix
          </button>
          <div className="my-1.5 h-px bg-theme-border/50" />
          <button onClick={() => { setDeleteConfirm(project); setOpen(false); }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-black text-rose-500 hover:bg-rose-500/10 transition-all">
            <Trash2 size={13} /> Terminate Record
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Projects Page ──────────────────────────────────
export default function AdminProjectsPage() {
  const { request } = useApi();
  const { canCreate, canEdit, canDelete } = usePermission("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "archived">("all");
  const [deleteConfirm, setDeleteConfirm] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [oversightProject, setOversightProject] = useState<Project | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const { user } = useAuth();
  const [delegationProject, setDelegationProject] = useState<Project | null>(null);
  
  const [form, setForm] = useState({
    name: "", description: "", budget: "",
    client_id: "", phase: "SCOPING",
    issued_date: dayjs().format("YYYY-MM-DD"),
    due_date: "",
    team_ids: [] as string[],
    budget_id: "",
    department_id: "",
    manager_id: "",
  });

  async function loadData(q?: string) {
    setLoading(true);
    try {
      const url = `/api/projects?${q ? `search=${q}` : ""}`;
      const res = await request<{ projects: Project[]; total: number }>({ url });
      setProjects(res.projects ?? []);
      setTotal(res.total ?? 0);
    } finally {
      setLoading(false);
    }
  }
  async function loadMeta() {
    try {
      const [cRes, tRes, eRes, bRes] = await Promise.allSettled([
        axios.get("/api/config/clients"),
        supabase.from("teams").select("id, name, type, parent_id"),
        supabase.from("employees").select("id, name, employee_id, role, department, team_id").eq("is_active", true),
        supabase.from("budgets").select("id, budget_number, name, total_amount, actual_spent, status").eq("status", "active").order("name"),
      ]);
      
      if (cRes.status === 'fulfilled') setClients(cRes.value.data.clients || []);
      if (tRes.status === 'fulfilled') setTeams(tRes.value.data || []);
      if (eRes.status === 'fulfilled') setEmployees(eRes.value.data || []);
      if (bRes.status === 'fulfilled') setBudgets(bRes.value.data || []);
    } catch (err) {
      console.warn("Metadata load partial failure:", err);
    }
  }

  useEffect(() => {
    loadData().catch(err => console.error("Initial load failed:", err));
    loadMeta();

    // REAL-TIME SYNC
    const channel = supabase
      .channel("projects-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        loadData(search); // Refresh on any project change
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "project_teams" }, () => {
        loadData(search); // Refresh on team assignment change
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { 
      if (e.key === "Escape") {
        setShowForm(false);
        setDeleteConfirm(null);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  function handleAdd() {
    setEditingId(null);
    setForm({
      name: "", description: "", budget: "",
      client_id: "", phase: "SCOPING",
      issued_date: dayjs().format("YYYY-MM-DD"),
      due_date: dayjs().add(3, "month").format("YYYY-MM-DD"),
      team_ids: [], budget_id: "",
      department_id: "",
      manager_id: "",
    });
    setShowForm(true);
  }

  function handleEdit(p: Project) {
    setEditingId(p.id);
    setForm({
      name: p.name, description: p.description,
      budget: String(p.budget), client_id: p.clientId,
      phase: p.phase, issued_date: p.issued_date || "",
      due_date: p.dueDate, team_ids: p.teamIds || [],
      budget_id: p.budget_id || "",
      department_id: p.department_id || "",
      manager_id: p.manager_id || "",
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await axios.patch(`/api/projects/${editingId}`, form);
        toast.success("Project matrix updated successfully.");
      } else {
        await axios.post("/api/projects", form);
        toast.success(`Project "${form.name}" initialized in records.`);
      }
      setShowForm(false);
      loadData(search || undefined);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setSubmitting(true);
    try {
      await axios.delete(`/api/projects/${deleteConfirm.id}`);
      toast.success(`Project unit "${deleteConfirm.name}" has been decommissioned.`);
      setDeleteConfirm(null);
      loadData(search || undefined);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const filteredProjects = projects.filter((p) => {
    if (activeTab === "active")   return p.is_active === true;
    if (activeTab === "archived") return p.is_active === false;
    return true;
  });

  const activeCount   = projects.filter((p) => p.is_active).length;
  const archivedCount = projects.filter((p) => !p.is_active).length;
  const totalBudget   = projects.reduce((acc, p) => acc + (p.budget || 0), 0);
  
  // Filter managers based on department
  const filteredManagers = employees.filter(emp => {
    const isManagerRole = emp.role === 'admin' || emp.is_dept_lead || emp.is_team_lead;
    if (!isManagerRole) return false;
    
    if (!form.department_id) return true;
    
    const dept = teams.find(t => t.id === form.department_id);
    if (!dept) return true;

    // Check by direct team_id link or case-insensitive department name
    return emp.team_id === form.department_id || 
           emp.department?.toLowerCase() === dept.name?.toLowerCase();
  });

  // ── phase colour helpers ────────────────────────────────────────
  const PHASE_GRADIENT: Record<ProjectPhase, string> = {
    SCOPING:        "from-amber-400 to-orange-500",
    IMPLEMENTATION: "from-sky-400 to-blue-500",
    REVIEW:         "from-violet-400 to-purple-600",
    COMPLETED:      "from-emerald-400 to-teal-600",
  };
  const PROJECT_EMOJIS = ["📁","💼","🚀","⚡","🎯","🔧","📊","💡","🏗️","🎨"];

  return (
    <DashboardShell
      moduleKey="projects"
      title="Projects"
      subtitle="Track and deliver client work across your teams."
      actions={
        canCreate ? (
          <Button onClick={handleAdd} size="sm">
            <Plus /> New Project
          </Button>
        ) : null
      }
    >
      <div className="space-y-5">
      {/* ── STAT CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Projects", value: total || projects.length, icon: Folder,     color: "text-theme-primary", bg: "bg-theme-primary/10" },
          { label: "Active",         value: activeCount,              icon: Zap,         color: "text-emerald-500",   bg: "bg-emerald-500/10"  },
          { label: "Archived",       value: archivedCount,            icon: Clock,       color: "text-rose-500",      bg: "bg-rose-500/10"     },
          { label: "Total Budget",   value: formatCurrency(totalBudget).split('.')[0], icon: TrendingUp, color: "text-sky-500", bg: "bg-sky-500/10" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="page-card !p-4 flex items-center gap-3">
            <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", bg)}>
              <Icon size={16} className={color} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted leading-none mb-1">{label}</p>
              <p className={cn("text-lg font-black leading-none", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "active" | "archived")}>
          <TabsList>
            <TabsTrigger value="all" className="gap-2 data-[state=active]:font-semibold">
              All
              <span className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                activeTab === "all" ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"
              )}>{projects.length}</span>
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-2 data-[state=active]:font-semibold">
              Active
              <span className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                activeTab === "active" ? "bg-emerald-500 text-white" : "bg-muted-foreground/15 text-muted-foreground"
              )}>{activeCount}</span>
            </TabsTrigger>
            <TabsTrigger value="archived" className="gap-2 data-[state=active]:font-semibold">
              Archived
              <span className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                activeTab === "archived" ? "bg-amber-500 text-white" : "bg-muted-foreground/15 text-muted-foreground"
              )}>{archivedCount}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <Input
            type="text"
            placeholder="Search projects by name, client, phase…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); loadData(e.target.value); }}
            className="w-full sm:w-80 pl-9"
          />
        </div>
      </div>

      {/* ── CARD GRID ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Skeleton className="h-5 w-16 rounded-md" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted mb-4">
            <Folder size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">No projects found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? "Try a different search term" : "Create your first project to get started"}
          </p>
          {canCreate && !search && (
            <Button onClick={handleAdd} size="sm" className="mt-4">
              <Plus /> New Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((p, idx) => {
            const phase = PHASE_CONFIG[p.phase];
            const PhaseIcon = phase.icon;
            const grad = PHASE_GRADIENT[p.phase];
            const emoji = PROJECT_EMOJIS[idx % PROJECT_EMOJIS.length];
            const budgetPct = p.budget_data && p.budget_data.total_amount > 0
              ? Math.min((p.budget_data.actual_spent / p.budget_data.total_amount) * 100, 100)
              : 0;

            return (
              <div
                key={p.id}
                className="group relative flex flex-col rounded-xl border border-theme-border bg-theme-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                onClick={() => setSelectedProject(p)}
              >
                {/* card header */}
                <div className="flex items-center justify-between px-3.5 py-3 border-b border-theme-border">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg", phase.bg)}>
                      <PhaseIcon size={14} className={phase.text} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-theme-fg leading-tight line-clamp-1">{p.name}</h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Building2 size={10} className="text-theme-muted flex-shrink-0" />
                        <span className="text-[11px] text-theme-muted truncate max-w-[130px]">{p.client?.name || "No client"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <CardMenu
                      project={p}
                      onRefresh={() => loadData(search || undefined)}
                      onEdit={() => handleEdit(p)}
                      onOversight={() => setOversightProject(p)}
                      setDeleteConfirm={setDeleteConfirm}
                      canEdit={canEdit}
                      canDelete={canDelete}
                    />
                  </div>
                </div>

                {/* body */}
                <div className="flex flex-1 flex-col gap-2.5 px-3.5 py-3">
                  {/* phase + archived badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border", phase.bg, phase.text, phase.border)}>
                      <PhaseIcon size={8} /> {phase.label}
                    </span>
                    {!p.is_active && (
                      <span className="inline-flex items-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 text-[10px] font-semibold">
                        Archived
                      </span>
                    )}
                  </div>

                  {p.description && (
                    <p className="text-[11px] text-theme-muted line-clamp-2 leading-relaxed">{p.description}</p>
                  )}

                  {/* due date */}
                  <div className="flex items-center gap-1 text-[11px] text-theme-muted">
                    <CalendarDays size={10} className="flex-shrink-0" />
                    <span>Due {formatDate(p.dueDate)}</span>
                  </div>

                  {/* budget */}
                  {p.budget > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-theme-muted">Budget</span>
                        <span className="text-[11px] font-semibold text-theme-fg">{formatCurrency(p.budget).split('.')[0]}</span>
                      </div>
                      {p.budget_data && (
                        <>
                          <div className="h-1 w-full rounded-full bg-theme-raised overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", budgetPct >= 100 ? "bg-rose-500" : budgetPct >= 80 ? "bg-amber-500" : "bg-emerald-500")}
                              style={{ width: `${budgetPct}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-theme-muted">{budgetPct.toFixed(0)}% utilized</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* teams */}
                  {p.teams && p.teams.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.teams.slice(0, 3).map(t => (
                        <span key={t.id} className="rounded-full bg-theme-raised px-2 py-0.5 text-[10px] font-medium text-theme-muted border border-theme-border">
                          {t.name}
                        </span>
                      ))}
                      {p.teams.length > 3 && (
                        <span className="rounded-full bg-theme-raised px-2 py-0.5 text-[10px] font-medium text-theme-muted border border-theme-border">
                          +{p.teams.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* footer */}
                <div className="flex items-center gap-2 border-t border-theme-border px-3.5 py-2.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedProject(p); }}
                    className="flex-1 rounded-lg bg-theme-primary/10 border border-theme-primary/20 px-3 py-1.5 text-xs font-semibold text-theme-primary hover:bg-theme-primary hover:text-white transition-all text-center"
                  >
                    Open Board
                  </button>
                  {(user?.role === 'admin' || user?.is_dept_lead) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDelegationProject(p); }}
                      className="flex-1 rounded-lg border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-all text-center"
                    >
                      Delegate
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>{/* end flex flex-col gap-5 */}

      {/* ── NEW / EDIT PROJECT DIALOG ─────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[860px] !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-6rem)] sm:max-h-[80vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
              {editingId ? <Edit2 size={16} /> : <Plus size={16} />}
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">{editingId ? "Edit project" : "New project"}</DialogTitle>
              <DialogDescription className="text-xs">
                {editingId ? "Update project details" : "Add a project to your workspace"}
              </DialogDescription>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit} id="new-project-form" className="min-h-0 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Project name</Label>
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Website Redesign Q3" />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="What is this project about?"
                    className="resize-y min-h-[100px]" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Budget (₹)</Label>
                  <Input type="number" required value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })}
                    placeholder="0" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Phase</Label>
                  <Select value={form.phase || undefined} onValueChange={(v) => setForm({ ...form, phase: v as ProjectPhase })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select phase…" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PHASE_CONFIG).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Start date</Label>
                  <DatePicker value={form.issued_date} onChange={(d) => setForm({ ...form, issued_date: d })} label="" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Due date</Label>
                  <DatePicker value={form.due_date} onChange={(d) => setForm({ ...form, due_date: d })} label="" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Client</Label>
                  <Select value={form.client_id || undefined} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select client…" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Department</Label>
                  <Select value={form.department_id || undefined} onValueChange={(v) => setForm({ ...form, department_id: v, manager_id: "" })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select department…" /></SelectTrigger>
                    <SelectContent>
                      {teams.filter(t => t.type === 'department').map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Project manager</Label>
                  <Select value={form.manager_id || undefined} onValueChange={(v) => setForm({ ...form, manager_id: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Assign a manager…" /></SelectTrigger>
                    <SelectContent>
                      {filteredManagers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Teams</Label>
                  <ShadcnMultiSelect
                    placeholder="Assign teams…"
                    value={form.team_ids}
                    onChange={(v) => setForm({ ...form, team_ids: v })}
                    options={teams.filter(t => t.type === 'team' && (!form.department_id || t.parent_id === form.department_id)).map(t => ({ label: t.name, value: t.id }))}
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs">
                    <IndianRupee size={12} className="text-emerald-500" /> Link to budget (optional)
                  </Label>
                  <Select
                    value={form.budget_id || "none"}
                    onValueChange={(v) => setForm({ ...form, budget_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="— No budget linked —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— No budget linked —</SelectItem>
                      {budgets.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.budget_number}) · ₹{(b.total_amount / 1000).toFixed(0)}K
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.budget_id && (() => {
                    const b = budgets.find(x => x.id === form.budget_id);
                    if (!b) return null;
                    const pct = b.total_amount > 0 ? Math.min((b.actual_spent / b.total_amount) * 100, 100) : 0;
                    const isOver = b.actual_spent > b.total_amount;
                    return (
                      <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5 mt-2">
                        <div className="flex items-center justify-between text-[10px] font-semibold">
                          <span className="text-muted-foreground">Current utilisation</span>
                          <span className={isOver ? "text-red-500" : "text-emerald-600"}>{isOver ? "OVER BUDGET" : `${pct.toFixed(0)}%`}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-background overflow-hidden">
                          <div className={cn("h-full rounded-full", isOver ? "bg-red-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>Spent: ₹{(b.actual_spent / 1000).toFixed(1)}K</span>
                          <span>Total: ₹{(b.total_amount / 1000).toFixed(1)}K</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
          </form>
          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-end gap-3 border-t border-border bg-background px-6 py-5">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" form="new-project-form" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {editingId ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM ──────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-x-0 top-6 z-[9000] flex justify-center px-4 animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-center gap-5 rounded-2xl border border-theme-border bg-theme-surface px-6 py-4 shadow-2xl min-w-[380px]">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
              <Trash2 size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-theme-fg">Delete <span className="text-rose-500">"{deleteConfirm.name}"</span>?</p>
              <p className="text-xs text-theme-muted mt-0.5">This action cannot be undone.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setDeleteConfirm(null)} disabled={submitting} variant="outline" size="sm">Cancel</Button>
              <Button onClick={handleDelete} disabled={submitting} variant="destructive" size="sm">
                {submitting && <Loader2 className="animate-spin" />}
                {submitting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELEGATION MODAL ─────────────────────────────────── */}
      {delegationProject && (
        <DelegationModal
          project={delegationProject}
          teams={teams}
          employees={employees}
          onClose={() => setDelegationProject(null)}
          onSuccess={() => { setDelegationProject(null); loadData(search || undefined); }}
        />
      )}

      {/* ── TASKS DRAWER ─────────────────────────────────────── */}
      <ProjectTasksDrawer
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
        employees={employees}
      />

      {/* ── OVERSIGHT MODAL ──────────────────────────────────── */}
      {oversightProject && (
        <OversightModal
          project={oversightProject}
          onClose={() => setOversightProject(null)}
          teams={teams}
        />
      )}
    </DashboardShell>
  );
}

// ── Assignee Multi-Select ─────────────────────────────────────────────────────
function AssigneeMultiSelect({ value, employees, onChange }: {
  value: string[];
  employees: Employee[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  };

  const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
  const selected = employees.filter(e => value.includes(e.id));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full min-h-[34px] rounded-lg border border-theme-border bg-theme-raised px-2 py-1.5 text-left flex items-center gap-1.5 flex-wrap hover:border-theme-primary/50 focus:border-theme-primary transition-all"
      >
        {selected.length === 0 ? (
          <span className="text-xs text-theme-muted">Unassigned</span>
        ) : (
          <div className="flex items-center gap-1 flex-wrap">
            {selected.map(e => (
              <span key={e.id} className="flex items-center gap-1 bg-theme-primary/10 text-theme-primary border border-theme-primary/20 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                {getInitials(e.name)}
                <span className="hidden sm:inline">{e.name.split(' ')[0]}</span>
                <button type="button" onClick={(ev) => { ev.stopPropagation(); toggle(e.id); }} className="ml-0.5 hover:text-rose-400 transition-colors">
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        )}
        <ChevronDown size={12} className={cn("ml-auto flex-shrink-0 text-theme-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[9999] rounded-lg border border-theme-border bg-theme-surface shadow-xl overflow-hidden animate-in zoom-in-95 duration-150">
          <div className="p-2 border-b border-theme-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-muted" size={12} />
              <Input
                autoFocus
                placeholder="Search employees…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {filtered.length > 0 ? filtered.map(e => (
              <button
                key={e.id}
                type="button"
                onClick={() => toggle(e.id)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-theme-raised transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border",
                    value.includes(e.id) ? "bg-theme-primary/10 text-theme-primary border-theme-primary/20" : "bg-theme-raised text-theme-muted border-theme-border"
                  )}>
                    {getInitials(e.name)}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-theme-fg">{e.name}</p>
                    <p className="text-[10px] text-theme-muted">{e.role}</p>
                  </div>
                </div>
                {value.includes(e.id) && <Check size={12} className="text-theme-primary flex-shrink-0" />}
              </button>
            )) : (
              <div className="px-3 py-5 text-center text-xs text-theme-muted">No employees found</div>
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-theme-border px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] text-theme-muted">{selected.length} selected</span>
              <button type="button" onClick={() => onChange([])} className="text-[10px] text-rose-400 hover:text-rose-500 font-semibold transition-colors">Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Project Board ─────────────────────────────────────────────────────────────

const DEFAULT_COLUMNS = [
  { id: 'TODO',        label: 'To Do',       dot: 'bg-slate-400',   text: 'text-slate-400'   },
  { id: 'IN_PROGRESS', label: 'In Progress',  dot: 'bg-sky-500',     text: 'text-sky-400'     },
  { id: 'REVIEW',      label: 'Review',       dot: 'bg-amber-500',   text: 'text-amber-400'   },
  { id: 'COMPLETED',   label: 'Done',         dot: 'bg-emerald-500', text: 'text-emerald-400' },
];

const PRIORITY_BADGE: Record<string, string> = {
  Low:      'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  Medium:   'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  High:     'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  Critical: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
};

const CUSTOM_COLUMN_COLORS = [
  { dot: 'bg-violet-500', text: 'text-violet-400' },
  { dot: 'bg-pink-500',   text: 'text-pink-400'   },
  { dot: 'bg-orange-500', text: 'text-orange-400' },
  { dot: 'bg-teal-500',   text: 'text-teal-400'   },
  { dot: 'bg-indigo-500', text: 'text-indigo-400' },
];

function ProjectTasksDrawer({ project, onClose, employees }: {
  project: Project | null;
  onClose: () => void;
  employees: Employee[];
}) {
  const { user } = useAuth();
  const [view, setView] = useState<'board' | 'table' | 'list' | 'workspace'>('board');

  // ── workspace items ───────────────────────────────────────────────────────────
  const [wsItems, setWsItems] = useState<{ docs: any[]; sheets: any[]; presentations: any[]; notes: any[] }>({ docs: [], sheets: [], presentations: [], notes: [] });
  const [wsLoading, setWsLoading] = useState(false);
  const [wsCreating, setWsCreating] = useState<string | null>(null);

  const fetchWsItems = async () => {
    if (!project) return;
    setWsLoading(true);
    try {
      const [docsRes, sheetsRes, presRes, notesRes] = await Promise.allSettled([
        fetch(`/api/workspace/documents?projectId=${project.id}`).then(r => r.json()),
        fetch(`/api/workspace/spreadsheets?projectId=${project.id}`).then(r => r.json()),
        fetch(`/api/workspace/presentations?projectId=${project.id}`).then(r => r.json()),
        fetch(`/api/workspace/notes?projectId=${project.id}`).then(r => r.json()),
      ]);
      setWsItems({
        docs:          docsRes.status === 'fulfilled' ? (docsRes.value.documents || []) : [],
        sheets:        sheetsRes.status === 'fulfilled' ? (sheetsRes.value.spreadsheets || []) : [],
        presentations: presRes.status === 'fulfilled' ? (presRes.value.presentations || []) : [],
        notes:         notesRes.status === 'fulfilled' ? (notesRes.value.notes || []) : [],
      });
    } finally {
      setWsLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'workspace' && project) fetchWsItems();
  }, [view, project?.id]);

  const createWsItem = async (type: 'document' | 'spreadsheet' | 'presentation' | 'note') => {
    if (!project || !user) return;
    setWsCreating(type);
    try {
      const endpoints: Record<string, string> = {
        document: '/api/workspace/documents',
        spreadsheet: '/api/workspace/spreadsheets',
        presentation: '/api/workspace/presentations',
        note: '/api/workspace/notes',
      };
      const titles: Record<string, string> = {
        document: 'Untitled Document',
        spreadsheet: 'Untitled Spreadsheet',
        presentation: 'Untitled Presentation',
        note: 'Untitled Note',
      };
      const res = await fetch(endpoints[type], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titles[type], owner_id: user.id, project_id: project.id }),
      });
      const data = await res.json();
      const created = data.document || data.spreadsheet || data.presentation || data.note;
      if (created) {
        const urlMap: Record<string, string> = {
          document: `/admin/workspace/documents/${created.id}`,
          spreadsheet: `/admin/workspace/spreadsheets/${created.id}`,
          presentation: `/admin/workspace/presentations/${created.id}`,
          note: `/admin/workspace/notes`,
        };
        toast.success(`${titles[type]} created`);
        await fetchWsItems();
        if (type !== 'note') window.open(urlMap[type], '_blank');
      }
    } catch {
      toast.error('Failed to create item');
    } finally {
      setWsCreating(null);
    }
  };

  // Only show employees who belong to teams assigned to this project
  const projectEmployees = project?.teamIds?.length
    ? employees.filter(e => project.teamIds.includes(e.team_id || ''))
    : employees;

  // ── tasks ────────────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(false);

  // ── columns ─────────────────────────────────────────────────────────────────
  const [customCols, setCustomCols] = useState<{ id: string; label: string; dot: string; text: string }[]>([]);
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState('');

  // ── inline task add ──────────────────────────────────────────────────────────
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const blankTask = (status = 'TODO'): Partial<ProjectTask> => ({
    title: '', description: '', status, priority: 'Medium', assigned_to: null,
    assignee_ids: [], due_date: dayjs().add(7, 'day').format('YYYY-MM-DD'),
  });
  const [newTask, setNewTask] = useState<Partial<ProjectTask>>(blankTask());

  // ── task detail + comments ───────────────────────────────────────────────────
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [detailDraft, setDetailDraft] = useState<Partial<ProjectTask>>({});
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const allColumns = [...DEFAULT_COLUMNS, ...customCols];

  // ── load columns from localStorage ───────────────────────────────────────────
  useEffect(() => {
    if (!project) return;
    try {
      const stored = localStorage.getItem(`board-cols-${project.id}`);
      if (stored) setCustomCols(JSON.parse(stored));
    } catch {}
  }, [project?.id]);

  // ── data fetching ─────────────────────────────────────────────────────────────
  const fetchTasks = async () => {
    if (!project) return;
    setLoading(true);
    try {
      const res = await axios.get(`/api/projects/${project.id}/tasks`);
      const fetched: ProjectTask[] = res.data.tasks || [];
      setTasks(fetched);
      // Keep selected task in sync
      setSelectedTask(prev => prev ? (fetched.find(t => t.id === prev.id) || null) : null);
    } catch {
      toast.error("Failed to load board.");
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (taskId: string) => {
    try {
      const res = await axios.get(`/api/projects/${project!.id}/tasks/${taskId}/comments`);
      setComments(res.data.comments || []);
    } catch {}
  };

  useEffect(() => {
    if (project) {
      fetchTasks();
      const channel = supabase
        .channel(`project-tasks-${project.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, fetchTasks)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments' }, () => {
          if (selectedTask) fetchComments(selectedTask.id);
        })
        // Refresh project (budget bar) when budgets table updates
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'budgets',
          filter: project.budget_id ? `id=eq.${project.budget_id}` : undefined as any,
        }, () => {
          // Trigger parent reload so budget_data refreshes
          supabase.from("budgets")
            .select("id, budget_number, name, total_amount, actual_spent, purchase_spent, sub_spent, status")
            .eq("id", project.budget_id!)
            .single()
            .then(({ data }) => {
              if (data) project.budget_data = data;
            });
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    } else {
      setTasks([]); setSelectedTask(null); setAddingToColumn(null);
    }
  }, [project?.id]);

  // When selected task changes, load comments
  useEffect(() => {
    if (selectedTask) {
      setDetailDraft({ title: selectedTask.title, description: selectedTask.description, status: selectedTask.status, priority: selectedTask.priority, assigned_to: selectedTask.assigned_to, assignee_ids: selectedTask.assignee_ids || [], due_date: selectedTask.due_date });
      fetchComments(selectedTask.id);
    } else {
      setComments([]);
    }
  }, [selectedTask?.id]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  // ── task CRUD ─────────────────────────────────────────────────────────────────
  const handleCreateTask = async () => {
    if (!newTask.title?.trim() || !project) return;
    try {
      await axios.post(`/api/projects/${project.id}/tasks`, newTask);
      setNewTask(blankTask());
      setAddingToColumn(null);
      fetchTasks();
    } catch {
      toast.error("Failed to create task.");
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<ProjectTask>) => {
    if (!project) return;
    try {
      await axios.patch(`/api/projects/${project.id}/tasks/${taskId}`, updates);
      fetchTasks();
    } catch {
      toast.error("Sync failed.");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!project) return;
    try {
      if (selectedTask?.id === taskId) setSelectedTask(null);
      await axios.delete(`/api/projects/${project.id}/tasks/${taskId}`);
      fetchTasks();
    } catch {
      toast.error("Delete failed.");
    }
  };

  // ── detail panel save (on blur) ───────────────────────────────────────────────
  const saveDetail = async (field: keyof ProjectTask, value: string | null) => {
    if (!selectedTask) return;
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, [field]: value } : t));
    await handleUpdateTask(selectedTask.id, { [field]: value });
  };

  // ── comments ──────────────────────────────────────────────────────────────────
  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedTask || !project) return;
    const content = newComment.trim();
    setNewComment('');
    try {
      await axios.post(`/api/projects/${project.id}/tasks/${selectedTask.id}/comments`, {
        author_name: user?.name || 'Team Member',
        content,
      });
      fetchComments(selectedTask.id);
    } catch {
      toast.error("Failed to post comment.");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!selectedTask || !project) return;
    try {
      await axios.delete(`/api/projects/${project.id}/tasks/${selectedTask.id}/comments`, {
        data: { commentId },
      });
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {}
  };

  // ── drag and drop ─────────────────────────────────────────────────────────────
  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    if (destination.droppableId !== source.droppableId) {
      setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, status: destination.droppableId } : t));
      if (selectedTask?.id === draggableId) setDetailDraft(d => ({ ...d, status: destination.droppableId }));
      await handleUpdateTask(draggableId, { status: destination.droppableId });
    }
  };

  // ── custom columns ────────────────────────────────────────────────────────────
  const handleAddColumn = () => {
    if (!newColName.trim() || !project) return;
    const colorIdx = customCols.length % CUSTOM_COLUMN_COLORS.length;
    const colId = newColName.trim().toUpperCase().replace(/\s+/g, '_');
    const newCol = { id: colId, label: newColName.trim(), ...CUSTOM_COLUMN_COLORS[colorIdx] };
    const updated = [...customCols, newCol];
    setCustomCols(updated);
    localStorage.setItem(`board-cols-${project.id}`, JSON.stringify(updated));
    setNewColName('');
    setAddingCol(false);
  };

  const handleDeleteColumn = (colId: string) => {
    if (!project) return;
    const updated = customCols.filter(c => c.id !== colId);
    setCustomCols(updated);
    localStorage.setItem(`board-cols-${project.id}`, JSON.stringify(updated));
  };

  if (!project) return null;

  return (
    <div className="fixed inset-0 z-[6000] bg-theme-page flex flex-col animate-in fade-in duration-200">

      {/* ── Snappy top loading bar ── */}
      {loading && (
        <div className="absolute top-0 left-0 right-0 z-10 h-0.5 bg-theme-border overflow-hidden">
          <div className="h-full bg-theme-primary animate-[loading-bar_1.2s_ease-in-out_infinite]" />
        </div>
      )}

      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-3 bg-theme-surface border-b border-theme-border flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-theme-primary/10 flex items-center justify-center flex-shrink-0">
            <Folder size={14} className="text-theme-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-theme-fg tracking-tight truncate">{project.name}</h2>
            <div className="flex items-center gap-0.5">
              <p className="text-[10px] text-theme-muted font-medium">{project.client?.name || 'Internal Project'}</p>
            </div>
          </div>

          <div className="h-4 w-px bg-theme-border mx-2" />

          {/* View Switcher */}
          <div className="flex bg-theme-raised rounded-lg p-0.5">
            {[
              { id: 'board',     icon: Columns,       label: 'Board'     },
              { id: 'table',     icon: Database,      label: 'Table'     },
              { id: 'list',      icon: LayoutGrid,    label: 'List'      },
              { id: 'workspace', icon: FolderOpen,    label: 'Workspace' },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id as any)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-tight transition-all",
                  view === v.id ? "bg-theme-surface text-theme-fg shadow-sm" : "text-theme-muted hover:text-theme-fg"
                )}
              >
                <v.icon size={11} />
                {v.label}
              </button>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-4 ml-6 border-l border-theme-border pl-6">
            {[
              { label: 'Total',    val: tasks.length,                                                                                            color: 'text-theme-muted' },
              { label: 'Active',   val: tasks.filter(t => t.status !== 'COMPLETED').length,                                                      color: 'text-sky-500'  },
              { label: 'Done',     val: tasks.filter(t => t.status === 'COMPLETED').length,                                                      color: 'text-emerald-500' },
              { label: 'Overdue',  val: tasks.filter(t => t.due_date && dayjs(t.due_date).isBefore(dayjs()) && t.status !== 'COMPLETED').length, color: 'text-rose-500' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={cn("text-base font-black leading-none", s.color)}>{s.val}</p>
                <p className="text-[8px] font-black uppercase tracking-widest text-theme-muted mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Live Budget Bar ── */}
          {project.budget_data && (() => {
            const b = project.budget_data!;
            const spent  = b.actual_spent || 0;
            const isOver = spent > b.total_amount;
            const pct    = b.total_amount > 0 ? Math.min((spent / b.total_amount) * 100, 100) : 0;
            const rem    = b.total_amount - spent;
            const barColor = isOver ? "bg-rose-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-500";
            const valColor = isOver ? "text-rose-400" : pct >= 85 ? "text-amber-400" : "text-emerald-400";
            return (
              <div className="hidden lg:flex flex-col justify-center gap-1 ml-4 border-l border-theme-border pl-4 min-w-[200px]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-theme-muted truncate max-w-[120px]">{b.name}</span>
                  <div className="flex items-center gap-1">
                    {isOver && <AlertCircle size={11} className="text-rose-500" />}
                    <span className={cn("text-[10px] font-bold", valColor)}>
                      {isOver ? "Over budget" : `${pct.toFixed(0)}% used`}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-theme-raised overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-700 ease-out", barColor)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-theme-muted">₹{(spent / 1000).toFixed(1)}K spent</span>
                  <span className={cn("text-[10px] font-medium", isOver ? "text-rose-400" : "text-theme-muted")}>
                    {isOver ? `₹${(Math.abs(rem) / 1000).toFixed(1)}K over` : `₹${(rem / 1000).toFixed(1)}K left`}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setAddingCol(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-raised border border-theme-border text-theme-muted text-xs font-semibold rounded-lg hover:bg-theme-subtle hover:text-theme-fg transition-all"
          >
            <Plus size={12} /> Add Column
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-all"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── View Area + Detail Panel ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Dynamic View Content */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-5 scroll-smooth">
          {loading ? (
            <div className="flex gap-4 h-full min-w-max pb-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="flex-shrink-0 w-[272px] flex flex-col gap-2">
                  <div className="h-9 rounded-lg bg-theme-card border border-theme-border animate-pulse" />
                  <div className="flex flex-col gap-2 flex-1 min-h-[120px] rounded-xl p-1.5">
                    {[1,2,3].map(j => (
                      <div key={j} className="h-20 rounded-xl bg-theme-card border border-theme-border animate-pulse" style={{ animationDelay: `${j * 80}ms` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : view === 'board' ? (
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="flex gap-4 h-full min-w-max pb-4">

                {allColumns.map((col) => {
                  const colTasks = tasks.filter(t => t.status === col.id);
                  const isCustom = !DEFAULT_COLUMNS.find(d => d.id === col.id);
                  return (
                    <div key={col.id} className="flex-shrink-0 w-[272px] flex flex-col gap-2">

                      {/* Column header */}
                      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-theme-card border border-theme-border group/colhead">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", col.dot)} />
                          <span className="text-xs font-semibold text-theme-fg">{col.label}</span>
                          <span className="text-[10px] font-semibold text-theme-muted bg-theme-raised border border-theme-border rounded-full px-1.5 py-0.5">{colTasks.length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {isCustom && (
                            <button
                              onClick={() => handleDeleteColumn(col.id)}
                              className="opacity-0 group-hover/colhead:opacity-100 p-1 hover:bg-rose-500/10 hover:text-rose-500 rounded text-theme-muted transition-all"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                          <button
                            onClick={() => { setAddingToColumn(col.id); setNewTask(blankTask(col.id)); }}
                            className="p-1 hover:bg-theme-raised rounded text-theme-muted hover:text-theme-fg transition-all"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Cards */}
                      <Droppable droppableId={col.id}>
                        {(provided, snapshot) => (
                          <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className={cn(
                              "flex flex-col gap-2 flex-1 min-h-[120px] rounded-xl p-1.5 transition-colors border border-transparent",
                              snapshot.isDraggingOver ? "bg-theme-raised border-theme-border" : ""
                            )}
                          >
                            {colTasks.map((task, idx) => (
                              <Draggable key={task.id} draggableId={task.id} index={idx}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    onClick={() => setSelectedTask(task)}
                                    className={cn(
                                      "group bg-theme-card border border-theme-border rounded-xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer",
                                      snapshot.isDragging && "shadow-2xl ring-2 ring-theme-primary/20 rotate-[1deg]",
                                      selectedTask?.id === task.id && "ring-2 ring-theme-primary/30"
                                    )}
                                  >
                                    <div className="flex items-start gap-2">
                                      <p className="text-[13px] font-semibold text-theme-fg leading-snug flex-1 line-clamp-2">{task.title}</p>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/10 hover:text-rose-500 rounded transition-all text-theme-muted flex-shrink-0 -mt-0.5 -mr-0.5"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                    {task.description && (
                                      <p className="text-[11px] text-theme-muted mt-1 line-clamp-1">{task.description}</p>
                                    )}
                                    <div className="mt-2.5 flex items-center justify-between gap-2">
                                      <span className={cn("px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tight", PRIORITY_BADGE[task.priority] || 'bg-slate-500/10 text-slate-400 border border-slate-500/20')}>
                                        {task.priority}
                                      </span>
                                      {(task.assignees && task.assignees.length > 0) ? (
                                        <div className="flex -space-x-1.5">
                                          {task.assignees.slice(0, 3).map((a) => (
                                            <div key={a.id} title={a.name} className="w-5 h-5 rounded-full bg-theme-primary/10 border border-theme-border flex items-center justify-center text-[8px] font-bold text-theme-primary ring-1 ring-theme-surface">
                                              {getInitials(a.name)}
                                            </div>
                                          ))}
                                          {task.assignees.length > 3 && (
                                            <div className="w-5 h-5 rounded-full bg-theme-raised border border-theme-border flex items-center justify-center text-[8px] font-bold text-theme-muted ring-1 ring-theme-surface">
                                              +{task.assignees.length - 3}
                                            </div>
                                          )}
                                        </div>
                                      ) : task.assigned_to_employee ? (
                                        <div className="w-5 h-5 rounded-full bg-theme-raised border border-theme-border flex items-center justify-center text-[8px] font-black text-theme-muted">
                                          {getInitials(task.assigned_to_employee.name)}
                                        </div>
                                      ) : null}
                                    </div>
                                    {task.due_date && (
                                      <div className={cn(
                                        "mt-1.5 flex items-center gap-1 text-[9px] font-semibold",
                                        dayjs(task.due_date).isBefore(dayjs()) && task.status !== 'COMPLETED' ? "text-rose-500" : "text-theme-muted"
                                      )}>
                                        <CalendarDays size={9} />
                                        {dayjs(task.due_date).format('DD MMM')}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}

                            {/* Add task button */}
                              <button
                                onClick={() => { setAddingToColumn(col.id); setNewTask(blankTask(col.id)); setSelectedTask(null); }}
                                className="flex items-center gap-1.5 px-2 py-1.5 text-theme-muted hover:bg-theme-raised rounded-lg transition-all text-[11px] font-semibold w-full mt-0.5"
                              >
                                <Plus size={13} /> New task
                              </button>
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}

                {/* Add Column ghost */}
                <div className="flex-shrink-0 w-[272px]">
                  {addingCol ? (
                    <div className="border-2 border-theme-primary/40 rounded-xl p-4 bg-theme-card shadow-xl animate-in fade-in slide-in-from-right-4 duration-200">
                      <p className="text-[9px] font-black text-theme-muted uppercase tracking-widest mb-2">New Column</p>
                      <input
                        autoFocus
                        placeholder="Column name…"
                        value={newColName}
                        onChange={(e) => setNewColName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') { setAddingCol(false); setNewColName(''); } }}
                        className="w-full text-sm font-bold text-theme-fg bg-transparent border-b-2 border-theme-border focus:border-theme-primary outline-none pb-2 mb-4 transition-all placeholder:text-theme-muted"
                      />
                      <div className="flex items-center gap-2">
                        <button onClick={handleAddColumn} className="bg-theme-primary text-white text-[10px] font-black uppercase px-4 py-2 rounded-lg flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all">
                          <Check size={11} /> Add
                        </button>
                        <button onClick={() => { setAddingCol(false); setNewColName(''); }} className="text-theme-muted text-[10px] font-black uppercase hover:text-theme-fg transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingCol(true)}
                      className="w-full h-10 flex items-center justify-center gap-2 border-2 border-dashed border-theme-border rounded-xl text-[11px] font-bold text-theme-muted hover:border-theme-primary/30 hover:text-theme-fg transition-all"
                    >
                      <Plus size={13} /> Add Column
                    </button>
                  )}
                </div>

              </div>
            </DragDropContext>
          ) : view === 'table' ? (
            <div className="bg-theme-card rounded-xl border border-theme-border overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-theme-border bg-theme-raised/50 px-2">
                    <th className="px-5 py-4 text-[10px] font-black text-theme-muted uppercase tracking-widest border-r border-theme-border">Task Identity</th>
                    <th className="px-5 py-4 text-[10px] font-black text-theme-muted uppercase tracking-widest border-r border-theme-border">Status</th>
                    <th className="px-5 py-4 text-[10px] font-black text-theme-muted uppercase tracking-widest border-r border-theme-border">Priority</th>
                    <th className="px-5 py-4 text-[10px] font-black text-theme-muted uppercase tracking-widest border-r border-theme-border">Milestone</th>
                    <th className="px-5 py-4 text-[10px] font-black text-theme-muted uppercase tracking-widest">Assignee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border">
                  {tasks.map(task => (
                    <tr
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={cn(
                        "group hover:bg-theme-raised/30 cursor-pointer transition-all transition-duration-200",
                        selectedTask?.id === task.id && "bg-theme-primary/5"
                      )}
                    >
                      <td className="px-5 py-3 border-r border-theme-border">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 size={12} className={cn("mt-0.5", task.status === 'COMPLETED' ? "text-emerald-500" : "text-theme-muted")} />
                          <span className="text-[13px] font-bold text-theme-fg">{task.title}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 border-r border-theme-border uppercase">
                        <span className={cn("text-[9px] font-black", allColumns.find(c => c.id === task.status)?.text)}>{allColumns.find(c => c.id === task.status)?.label}</span>
                      </td>
                      <td className="px-5 py-3 border-r border-theme-border">
                         <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight", PRIORITY_BADGE[task.priority])}>
                            {task.priority}
                         </span>
                      </td>
                      <td className="px-5 py-3 border-r border-theme-border">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-theme-muted">
                          {task.due_date ? dayjs(task.due_date).format('DD MMM YYYY') : '--'}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {task.assigned_to_employee ? (
                          <div className="flex items-center gap-2">
                             <div className="w-5 h-5 rounded-full bg-theme-raised border border-theme-border flex items-center justify-center text-[8px] font-black text-theme-muted uppercase">
                                {getInitials(task.assigned_to_employee.name)}
                             </div>
                             <span className="text-[11px] font-bold text-theme-fg">{task.assigned_to_employee.name}</span>
                          </div>
                        ) : <span className="text-[11px] text-theme-muted font-medium italic">Unassigned</span>}
                      </td>
                    </tr>
                  ))}
                  {/* Inline Ghost Row */}
                  <tr
                    onClick={() => { setView('board'); setAddingToColumn('TODO'); }}
                    className="group hover:bg-theme-raised/50 transition-all cursor-pointer border-t border-dashed border-theme-border"
                  >
                    <td colSpan={5} className="px-5 py-4">
                      <div className="flex items-center gap-2 text-[10px] font-black text-theme-muted uppercase tracking-widest group-hover:text-theme-fg transition-all">
                        <Plus size={14} /> Add New Operational Row
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : view === 'workspace' ? (
            <div className="pb-6 space-y-6">
              {wsLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl bg-theme-card border border-theme-border animate-pulse" />)}
                </div>
              ) : (
                <>
                  {/* Quick-create row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {([
                      { type: 'document',     icon: BookOpen,       label: 'New Doc',          color: 'text-blue-400',    bg: 'bg-blue-500/10' },
                      { type: 'spreadsheet',  icon: Table2,         label: 'New Sheet',        color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                      { type: 'presentation', icon: Presentation,   label: 'New Presentation', color: 'text-amber-400',   bg: 'bg-amber-500/10' },
                      { type: 'note',         icon: StickyNote,     label: 'New Note',         color: 'text-purple-400',  bg: 'bg-purple-500/10' },
                    ] as const).map(btn => (
                      <button
                        key={btn.type}
                        onClick={() => createWsItem(btn.type)}
                        disabled={wsCreating === btn.type}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-theme-border bg-theme-card hover:bg-theme-raised hover:border-theme-strong transition-all group disabled:opacity-50"
                      >
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0", btn.bg)}>
                          <btn.icon size={15} className={btn.color} />
                        </div>
                        <span className="text-xs font-semibold text-theme-muted group-hover:text-theme-fg transition-colors">{btn.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Docs */}
                  {wsItems.docs.length > 0 && (
                    <div className="space-y-2">
                      <p className="section-label px-1 flex items-center gap-2"><BookOpen size={11} /> Documents · {wsItems.docs.length}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {wsItems.docs.map((doc: any) => (
                          <a key={doc.id} href={`/admin/workspace/documents/${doc.id}`} target="_blank" rel="noreferrer"
                            className="flex items-center gap-3 p-3.5 rounded-xl bg-theme-card border border-theme-border hover:border-theme-strong hover:shadow-sm transition-all group">
                            <span className="text-xl flex-shrink-0">{doc.icon || '📄'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-theme-fg truncate group-hover:text-theme-primary transition-colors">{doc.title}</p>
                              <p className="text-[10px] text-theme-muted">{doc.owner?.name || '—'}</p>
                            </div>
                            <ExternalLink size={12} className="text-theme-muted opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Spreadsheets */}
                  {wsItems.sheets.length > 0 && (
                    <div className="space-y-2">
                      <p className="section-label px-1 flex items-center gap-2"><Table2 size={11} /> Spreadsheets · {wsItems.sheets.length}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {wsItems.sheets.map((s: any) => (
                          <a key={s.id} href={`/admin/workspace/spreadsheets/${s.id}`} target="_blank" rel="noreferrer"
                            className="flex items-center gap-3 p-3.5 rounded-xl bg-theme-card border border-theme-border hover:border-theme-strong hover:shadow-sm transition-all group">
                            <span className="text-xl flex-shrink-0">📊</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-theme-fg truncate group-hover:text-theme-primary transition-colors">{s.title}</p>
                              <p className="text-[10px] text-theme-muted">{s.owner?.name || '—'}</p>
                            </div>
                            <ExternalLink size={12} className="text-theme-muted opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Presentations */}
                  {wsItems.presentations.length > 0 && (
                    <div className="space-y-2">
                      <p className="section-label px-1 flex items-center gap-2"><Presentation size={11} /> Presentations · {wsItems.presentations.length}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {wsItems.presentations.map((p: any) => (
                          <a key={p.id} href={`/admin/workspace/presentations/${p.id}`} target="_blank" rel="noreferrer"
                            className="flex items-center gap-3 p-3.5 rounded-xl bg-theme-card border border-theme-border hover:border-theme-strong hover:shadow-sm transition-all group">
                            <span className="text-xl flex-shrink-0">📑</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-theme-fg truncate group-hover:text-theme-primary transition-colors">{p.title}</p>
                              <p className="text-[10px] text-theme-muted">{p.owner?.name || '—'}</p>
                            </div>
                            <ExternalLink size={12} className="text-theme-muted opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {wsItems.notes.length > 0 && (
                    <div className="space-y-2">
                      <p className="section-label px-1 flex items-center gap-2"><StickyNote size={11} /> Notes · {wsItems.notes.length}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {wsItems.notes.map((n: any) => (
                          <div key={n.id}
                            className="flex items-start gap-3 p-3.5 rounded-xl border border-theme-border hover:border-theme-strong hover:shadow-sm transition-all"
                            style={{ backgroundColor: n.color && n.color !== '#ffffff' ? n.color + '18' : undefined }}>
                            <StickyNote size={15} className="text-purple-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-theme-fg truncate">{n.title}</p>
                              <p className="text-[10px] text-theme-muted">{n.owner?.name || '—'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {wsItems.docs.length === 0 && wsItems.sheets.length === 0 && wsItems.presentations.length === 0 && wsItems.notes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-theme-raised border border-theme-border flex items-center justify-center">
                        <FolderOpen size={20} className="text-theme-muted" />
                      </div>
                      <p className="text-sm font-semibold text-theme-fg">No workspace items yet</p>
                      <p className="text-xs text-theme-muted">Create a doc, sheet, presentation or note above to link it to this project.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-8 pb-20">
              {allColumns.map(col => {
                const colTasks = tasks.filter(t => t.status === col.id);
                if (colTasks.length === 0) return null;
                return (
                  <div key={col.id} className="space-y-4">
                    <div className="flex items-center gap-2 px-2">
                       <div className={cn("w-2 h-2 rounded-full", col.dot)} />
                       <h3 className={cn("text-xs font-black uppercase tracking-widest", col.text)}>{col.label}</h3>
                       <span className="text-[10px] font-bold text-theme-muted">{colTasks.length} Units</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {colTasks.map(task => (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className="bg-theme-card border border-theme-border p-4 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col gap-2 group"
                        >
                          <div className="flex justify-between items-start">
                             <h4 className="text-[13px] font-black text-theme-fg leading-tight group-hover:text-theme-primary transition-colors">{task.title}</h4>
                             <span className={cn("px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tight", PRIORITY_BADGE[task.priority])}>
                                {task.priority}
                             </span>
                          </div>
                          {task.description && <p className="text-[11px] text-theme-muted line-clamp-2">{task.description}</p>}
                          <div className="flex items-center justify-between mt-auto pt-2 border-t border-theme-border">
                             <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-theme-muted">
                                <CalendarDays size={10} /> {task.due_date ? dayjs(task.due_date).format('MMM DD') : 'TBD'}
                             </div>
                             {task.assigned_to_employee && (
                               <div className="flex -space-x-1">
                                  <div className="w-5 h-5 rounded-full bg-theme-raised border border-theme-border flex items-center justify-center text-[8px] font-black text-theme-muted shadow-sm" title={task.assigned_to_employee.name}>
                                    {getInitials(task.assigned_to_employee.name)}
                                  </div>
                               </div>
                             )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── New Task Panel ──────────────────────────────────────────────────── */}
        {addingToColumn && !selectedTask && (
          <div className="w-[460px] flex-shrink-0 bg-theme-surface border-l border-theme-border flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-theme-border">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-theme-primary/10">
                  <Plus size={13} className="text-theme-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-theme-fg">New Task</p>
                  <p className="text-[10px] text-theme-muted">{allColumns.find(c => c.id === addingToColumn)?.label}</p>
                </div>
              </div>
              <button onClick={() => { setAddingToColumn(null); setNewTask(blankTask()); }} className="p-1 hover:bg-theme-raised rounded text-theme-muted hover:text-theme-fg transition-all">
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Title */}
              <div className="px-5 pt-5 pb-4 border-b border-theme-border">
                <textarea
                  autoFocus
                  rows={2}
                  placeholder="Task title…"
                  value={newTask.title || ''}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreateTask(); } }}
                  className="w-full text-lg font-semibold text-theme-fg outline-none resize-none bg-transparent placeholder:text-theme-muted leading-snug"
                />
              </div>

              {/* Properties */}
              <div className="px-5 py-4 space-y-3 border-b border-theme-border">
                {[
                  {
                    label: 'Status',
                    content: (
                      <Select value={newTask.status || 'TODO'} onValueChange={(v) => setNewTask({ ...newTask, status: v })}>
                        <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {allColumns.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )
                  },
                  {
                    label: 'Priority',
                    content: (
                      <Select value={newTask.priority || 'Medium'} onValueChange={(v) => setNewTask({ ...newTask, priority: v as any })}>
                        <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['Low', 'Medium', 'High', 'Critical'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )
                  },
                  {
                    label: 'Assignees',
                    content: (
                      <AssigneeMultiSelect
                        value={newTask.assignee_ids || []}
                        employees={projectEmployees}
                        onChange={(ids) => setNewTask({ ...newTask, assignee_ids: ids, assigned_to: ids[0] || null })}
                      />
                    )
                  },
                  {
                    label: 'Due Date',
                    content: (
                      <Input type="date" value={newTask.due_date || ''} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value || null })}
                        className="h-8 text-xs" />
                    )
                  },
                ].map(({ label, content }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted w-20 flex-shrink-0">{label}</span>
                    <div className="flex-1">{content}</div>
                  </div>
                ))}
              </div>

              {/* Description */}
              <div className="px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-2">Description</p>
                <Textarea
                  rows={4}
                  placeholder="Add a description…"
                  value={newTask.description || ''}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="resize-none text-xs"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-theme-border px-5 py-3 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => { setAddingToColumn(null); setNewTask(blankTask()); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateTask}>
                <Check /> Create Task
              </Button>
            </div>
          </div>
        )}

        {/* ── Task Detail Panel ──────────────────────────────────────────────── */}
        {selectedTask && (
          <div className="w-[460px] flex-shrink-0 bg-theme-surface border-l border-theme-border flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">

            {/* Detail header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-theme-border">
              <span className="text-[9px] font-black uppercase tracking-widest text-theme-muted">Task Detail</span>
              <button onClick={() => setSelectedTask(null)} className="p-1 hover:bg-theme-raised rounded text-theme-muted hover:text-theme-fg transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* Title */}
              <div className="px-5 pt-5 pb-4 border-b border-theme-border">
                <textarea
                  value={detailDraft.title || ''}
                  onChange={(e) => setDetailDraft(d => ({ ...d, title: e.target.value }))}
                  onBlur={() => { if (detailDraft.title !== selectedTask.title) saveDetail('title', detailDraft.title || ''); }}
                  rows={2}
                  className="w-full text-lg font-black text-theme-fg outline-none resize-none bg-transparent placeholder:text-theme-muted leading-snug"
                  placeholder="Task title…"
                />
              </div>

              {/* Properties */}
              <div className="px-5 py-4 space-y-3 border-b border-theme-border">
                {[
                  {
                    label: 'Status',
                    content: (
                      <Select
                        value={detailDraft.status || 'TODO'}
                        onValueChange={(v) => { setDetailDraft(d => ({ ...d, status: v })); saveDetail('status', v); }}
                      >
                        <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {allColumns.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )
                  },
                  {
                    label: 'Priority',
                    content: (
                      <Select
                        value={detailDraft.priority || 'Medium'}
                        onValueChange={(v) => { setDetailDraft(d => ({ ...d, priority: v as any })); saveDetail('priority', v); }}
                      >
                        <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['Low', 'Medium', 'High', 'Critical'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )
                  },
                  {
                    label: 'Assignees',
                    content: (
                      <AssigneeMultiSelect
                        value={detailDraft.assignee_ids || []}
                        employees={projectEmployees}
                        onChange={(ids) => {
                          setDetailDraft(d => ({ ...d, assignee_ids: ids, assigned_to: ids[0] || null }));
                          handleUpdateTask(selectedTask!.id, { assignee_ids: ids });
                        }}
                      />
                    )
                  },
                  {
                    label: 'Due Date',
                    content: (
                      <Input
                        type="date"
                        value={detailDraft.due_date || ''}
                        onChange={(e) => { setDetailDraft(d => ({ ...d, due_date: e.target.value || null })); saveDetail('due_date', e.target.value || null); }}
                        className="h-8 text-xs"
                      />
                    )
                  },
                ].map(({ label, content }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-wider text-theme-muted w-20 flex-shrink-0">{label}</span>
                    <div className="flex-1">{content}</div>
                  </div>
                ))}
              </div>

              {/* Description */}
              <div className="px-5 py-4 border-b border-theme-border">
                <p className="text-[9px] font-black uppercase tracking-widest text-theme-muted mb-2">Description</p>
                <textarea
                  value={detailDraft.description || ''}
                  onChange={(e) => setDetailDraft(d => ({ ...d, description: e.target.value }))}
                  onBlur={() => { if (detailDraft.description !== selectedTask.description) saveDetail('description', detailDraft.description || null); }}
                  rows={3}
                  placeholder="Add a description…"
                  className="w-full text-[13px] text-theme-fg outline-none resize-none bg-transparent placeholder:text-theme-muted leading-relaxed"
                />
              </div>

              {/* Comments */}
              <div className="px-5 py-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-theme-muted mb-3">
                  Comments <span className="text-theme-fg">{comments.length > 0 ? `· ${comments.length}` : ''}</span>
                </p>
                {comments.length === 0 ? (
                  <p className="text-[11px] text-theme-muted italic">No comments yet. Be the first to add one.</p>
                ) : (
                  <div className="space-y-3">
                    {comments.map((c) => (
                      <div key={c.id} className="group flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-theme-primary flex items-center justify-center text-[8px] font-black text-white flex-shrink-0 mt-0.5">
                          {c.author_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-black text-theme-fg">{c.author_name}</span>
                            <span className="text-[9px] text-theme-muted">{dayjs(c.created_at).format('DD MMM, HH:mm')}</span>
                          </div>
                          <p className="text-[12px] text-theme-fg leading-relaxed">{c.content}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteComment(c.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/10 hover:text-rose-500 rounded transition-all text-theme-muted flex-shrink-0"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                    <div ref={commentsEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Comment input */}
            <div className="px-5 py-3 border-t border-theme-border bg-theme-surface flex-shrink-0">
              <div className="flex items-center gap-2 bg-theme-raised rounded-xl px-3 py-2 border border-theme-border">
                <div className="w-5 h-5 rounded-full bg-theme-primary flex items-center justify-center text-[7px] font-black text-white flex-shrink-0">
                  {(user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                  placeholder="Add a comment… (Enter to send)"
                  className="flex-1 bg-transparent text-[12px] text-theme-fg outline-none placeholder:text-theme-muted"
                />
                {newComment.trim() && (
                  <button onClick={handleAddComment} className="p-1 bg-theme-primary text-white rounded-lg hover:opacity-80 transition-all flex-shrink-0">
                    <Check size={11} />
                  </button>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ── Tracking Matrix Modal ──────────────────────────────────
import { OversightMatrix } from "@/components/projects/OversightMatrix";

// ... later in the file ...

function OversightModal({ project, onClose, teams }: { project: Project; onClose: () => void; teams: Team[] }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-theme-surface shadow-2xl border border-theme-border flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-theme-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-theme-fg">Project Health</h3>
              <p className="text-xs text-theme-muted flex items-center gap-1">
                {project.name} <ChevronRight size={11} /> 4-layer tracking
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-theme-muted border border-theme-border rounded-md px-2 py-0.5">ESC</span>
            <button onClick={onClose} className="rounded-lg p-1.5 text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-all">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
          {/* Tier cards */}
          <OversightMatrix project={project} />

          {/* How it works */}
          <div className="rounded-2xl border border-theme-border bg-theme-raised/40 p-4 space-y-2.5">
            <p className="text-xs font-semibold text-theme-muted">How tracking works</p>
            <div className="flex items-start gap-2">
              <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-theme-primary" />
              <p className="text-xs text-theme-fg">Progress flows through 4 levels: Admin → Manager → Team Lead → Employee</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
              <p className="text-xs text-theme-fg">Status updates in real time as tasks move through each level.</p>
            </div>
          </div>

          {/* Project summary */}
          <div className="rounded-2xl border border-theme-border bg-theme-primary/5 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-theme-fg">Project Summary</p>
              <p className="text-xs text-theme-muted mt-0.5">Overall progress and current status</p>
            </div>
            <div className="flex items-center gap-5 flex-shrink-0">
              <div className="text-center">
                <p className="text-2xl font-bold text-theme-fg">{project.progress ?? 0}%</p>
                <p className="text-[10px] text-theme-muted">Progress</p>
              </div>
              <div className="h-10 w-px bg-theme-border" />
              <div className="text-center">
                <p className={cn("text-lg font-bold", project.is_active ? "text-emerald-500" : "text-rose-500")}>
                  {project.is_active ? "Active" : "Stopped"}
                </p>
                <p className="text-[10px] text-theme-muted">Status</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex justify-end border-t border-theme-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
