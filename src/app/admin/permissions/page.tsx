"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Shield, Users, ChevronRight, Save, Lock,
  LayoutDashboard, UserCheck, Building2, BookOpen,
  Settings, Mail, GitBranch, IndianRupee,
  GraduationCap, TrendingUp, UserPlus, Loader2,
  LayoutTemplate, Circle, Crown, Building, Calendar,
  Check,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/components/layout/AuthProvider";
import { supabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────
type PermNode = {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
};
type PermMap = Record<string, PermNode>;

interface RoleMember {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  designation: string | null;
  employee_id: string | null;
  is_active: boolean;
  joining_date: string | null;
  team_id: string | null;
}

const ROLES = [
  { id: "admin",    name: "Admin",    description: "Full access — every panel and module." },
  { id: "hr",       name: "HR",       description: "People scope: hiring, attendance, performance, L&D, org structure." },
  { id: "accounts", name: "Accounts", description: "Finance scope: invoicing, vendors, budgets, payroll, claims." },
  { id: "dept_lead", name: "Department Lead", description: "Manage department personnel, shifts, and team structures." },
  { id: "team_lead", name: "Team Lead",       description: "Manage assigned sub-team and daily shift routines." },
  { id: "employee", name: "Employee", description: "Standard staff — self-service portal. Manager flags add team views." },
  { id: "intern",   name: "Intern",   description: "Trainee — limited self-service access." },
];

const ALL_ROLES_FOR_ASSIGN = [
  { id: "admin",    label: "Admin" },
  { id: "hr",       label: "HR" },
  { id: "accounts", label: "Accounts" },
  { id: "dept_lead", label: "Department Lead" },
  { id: "team_lead", label: "Team Lead" },
  { id: "employee", label: "Employee" },
  { id: "intern",   label: "Intern" },
];

const SECTIONS = [
  {
    section: "Organization & Dashboard",
    icon: LayoutDashboard,
    items: [
      { key: "admin_dashboard",    label: "Admin Dashboard",              desc: "/admin — main overview for admin roles" },
      { key: "hr_dashboard",       label: "HR Hub",                       desc: "/hr — landing for HR role" },
      { key: "accounts_dashboard", label: "Accounts Hub",                 desc: "/accounts — landing for Accounts role" },
      { key: "manager_dashboard",  label: "Manager Dashboard",            desc: "/manager/dashboard — department overview" },
      { key: "lead_dashboard",     label: "Team Lead Dashboard",          desc: "/team-lead/dashboard — team lead overview" },
      { key: "my_dashboard",       label: "Employee Dashboard",           desc: "/dashboard — personal home for staff" },
      { key: "projects",           label: "Projects",                     desc: "Project Kanban, tasks, delegation" },
      { key: "employees",          label: "Employees (User Management)",  desc: "Add, edit, view all staff profiles" },
      { key: "shift_management",   label: "Shift Management",             desc: "Create shifts, assign employees" },
      { key: "teams",              label: "Teams",                        desc: "Department and sub-team management" },
      { key: "org_chart",          label: "Org Chart",                    desc: "Full company hierarchy visualization" },
      { key: "manager_teams",      label: "Manager — Team View",          desc: "Team management for Department Lead" },
      { key: "manager_org_chart",  label: "Manager — Org Chart",          desc: "Org chart scoped to manager's department" },
    ],
  },
  {
    section: "Workspace",
    icon: LayoutTemplate,
    items: [
      { key: "workspace_hub",           label: "Workspace Hub Overview",  desc: "Landing page showing all docs, notes, sheets" },
      { key: "workspace_documents",     label: "Documents",               desc: "Rich-text editor, AI writing assist" },
      { key: "workspace_spreadsheets",  label: "Spreadsheets",            desc: "Excel-like grid with formula support" },
      { key: "workspace_presentations", label: "Presentations",           desc: "Slide editor for creating decks" },
      { key: "workspace_notes",         label: "Notes",                   desc: "Google Keep-style sticky notes" },
    ],
  },
  {
    section: "HR & Hiring",
    icon: UserPlus,
    items: [
      { key: "job_clusters",  label: "Job Clusters (Role Templates)",  desc: "Define role families, salary bands, skill sets" },
      { key: "recruitment",   label: "Recruitment Hub",                desc: "Hiring pipeline Kanban, applicant tracking" },
      { key: "ats_scanner",   label: "Resume Scanner (ATS)",           desc: "Gemma AI scores resumes against job requirements" },
      { key: "interviews",    label: "Interview Management",           desc: "Schedule interviews, video rooms, AI recap" },
      { key: "onboarding",    label: "Onboarding",                     desc: "Offer letter builder, approval workflow, e-sign dispatch" },
      { key: "onboarding_builder", label: "Onboarding — Form Builder",  desc: "Full-depth edit: add/edit questions, options, types & structure" },
      { key: "onboarding_manual",  label: "Onboarding — Manual Entry",   desc: "Add a candidate manually (bypasses the interview pipeline) in Start New Onboarding" },
    ],
  },
  {
    section: "Learning & Development",
    icon: GraduationCap,
    items: [
      { key: "lms_academy",        label: "Academy Manager (Admin)",          desc: "Overview, assign courses, manage learning paths" },
      { key: "lms_courses",        label: "Manage Courses",                   desc: "Create, edit, delete course content" },
      { key: "lms_certifications", label: "Certifications & Badges",          desc: "Issue and track employee certifications" },
      { key: "training_academy",   label: "Training Academy (Employee View)", desc: "Employee-facing /dashboard/academy" },
    ],
  },
  {
    section: "Operations & People",
    icon: TrendingUp,
    items: [
      { key: "attendance",      label: "Attendance Tracker",      desc: "View, manage, override attendance records" },
      { key: "kpi_kra",         label: "KPI / KRA Performance",   desc: "Score cards, auto-calculation, history" },
      { key: "payroll",            label: "Payroll Engine",            desc: "Monthly payroll, payslip generation" },
      { key: "payroll_internship", label: "Internship Stipend",        desc: "Intern roster + monthly stipend cycles + payment tracking" },
      { key: "payslips_management", label: "Payslips",                 desc: "Generate & manage employee payslip PDFs (/admin/payslips)" },
      { key: "incentives",      label: "Incentives",              desc: "Performance-based incentive management" },
      { key: "claims",          label: "Claims & Expenses",       desc: "Approve/reject employee expense claims" },
      { key: "reimbursements",  label: "Reimbursements",          desc: "Process and approve reimbursement requests" },
      { key: "priority_payout", label: "Priority Payout (Bonus)", desc: "Ad-hoc bonus payout separate from salary" },
      { key: "support_admin",   label: "Support Command Center",  desc: "Admin view — monitor all tickets across the organization" },
    ],
  },
  {
    section: "Finance",
    icon: IndianRupee,
    items: [
      { key: "invoicing",      label: "Invoicing",           desc: "Create invoices, send via email, track status" },
      { key: "vendors",        label: "Vendors & Purchases", desc: "Vendor directory, purchase orders, logs" },
      { key: "subscriptions",  label: "Subscriptions",       desc: "Software subscriptions, renewal reminders" },
      { key: "budgets",        label: "Budgets",             desc: "Department/project budgets with live tracking" },
    ],
  },
  {
    section: "Sales & CRM",
    icon: GitBranch,
    items: [
      { key: "sales_pipeline",  label: "Sales Pipeline",    desc: "Deal Kanban: Lead → Prospect → Won/Lost" },
      { key: "crm_clients",     label: "Client Directory",  desc: "Full client profiles, GST, contact info" },
    ],
  },
  {
    section: "Communications",
    icon: Mail,
    items: [
      { key: "mail_hub",       label: "Mail Hub Overview",   desc: "AI-categorised email Kanban, digest" },
      { key: "mail_inbox",     label: "Inbox",               desc: "3-panel inbox with AI summaries" },
      { key: "mail_compose",   label: "Compose Mail",        desc: "Send emails with AI tone assist" },
      { key: "mail_sent",      label: "Sent Mail",           desc: "View sent emails" },
      { key: "mail_drafts",    label: "Drafts",              desc: "Save and continue draft emails" },
      { key: "mail_files",     label: "File Share Hub",      desc: "Upload and share files via mail" },
      { key: "mail_templates", label: "Mail Templates",      desc: "Pre-built email templates with variables" },
      { key: "mail_accounts",  label: "Mail Accounts",       desc: "Mailbox provisioning, shared inbox assignment" },
      { key: "mail_config",    label: "Mail Settings (Zoho)", desc: "Zoho OAuth setup, token management" },
      { key: "messages",       label: "Team Messages",       desc: "Direct messages + group channels (real-time)" },
      { key: "meetings",       label: "Video Meetings",      desc: "Schedule and join LiveKit video rooms" },
    ],
  },
  {
    section: "My Account (Self-Service)",
    icon: UserCheck,
    items: [
      { key: "my_profile",          label: "My Profile",           desc: "Personal info, salary view, photo upload" },
      { key: "my_attendance",       label: "My Attendance",        desc: "Punch-in/out, leave applications, calendar" },
      { key: "my_performance",      label: "My Performance / KPI", desc: "Personal KPI/KRA score and history" },
      { key: "my_incentives",       label: "My Incentives",        desc: "View assigned incentive status and history" },
      { key: "my_payslips",         label: "My Payslips",          desc: "Download monthly payslip PDFs" },
      { key: "my_reimbursements",   label: "My Reimbursements",    desc: "Submit and track reimbursement requests" },
      { key: "my_priority_payout",  label: "My Priority Payout",   desc: "View ad-hoc bonus payouts" },
      { key: "my_messages",         label: "My Messages",          desc: "/dashboard/messages — employee messaging" },
      { key: "my_meetings",         label: "My Meetings",          desc: "/dashboard/meetings — employee meeting list" },
      { key: "my_calendar",         label: "My Calendar",          desc: "/dashboard/calendar — personal + dept + statutory events" },
      { key: "my_projects",         label: "My Projects",          desc: "/dashboard/projects — projects the user is assigned to" },
      { key: "my_academy",          label: "Academy",              desc: "/dashboard/academy — assigned courses and learning" },
      { key: "support_user",        label: "Support & Help",       desc: "Raise tickets to other roles, resolve assigned tickets" },
    ],
  },
  {
    section: "System (Admin Only)",
    icon: Settings,
    items: [
      { key: "analytics",           label: "Analytics & Reports",          desc: "Company-level charts, revenue trends" },
      { key: "permissions_control", label: "Permissions & Access Control", desc: "Manage role defaults + per-employee overrides" },
      { key: "workspace_monitor",   label: "Workspace Monitor",            desc: "/admin/workspace-monitor — live presence: who is working right now, status & activity feed" },
      { key: "master_log",          label: "Master Log Sheet",             desc: "/admin/master-log — immutable who-did-what audit trail across the whole workspace" },
      { key: "sessions",            label: "Sessions",                     desc: "/admin/sessions — active sessions + login history, with force sign-out" },
      { key: "security_audit",      label: "Security & Audit",             desc: "/admin/security — sensitive events: logins, credential/permission/role changes, account lifecycle" },
      { key: "audit_log",           label: "Audit Log",                    desc: "/admin/audit — system event history" },
      { key: "feature_report",      label: "Feature Status Report",        desc: "Internal completion tracker" },
      { key: "system_config",       label: "System Settings",              desc: "SMTP, company profile, feature toggles" },
    ],
  },
];

const DEFAULT_NODE: PermNode = {
  can_view: false, can_create: false, can_edit: false,
  can_delete: false, can_export: false,
};

const ACTION_COLORS: Record<keyof PermNode, string> = {
  can_view:   "",
  can_create: "bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/20",
  can_edit:   "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  can_delete: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  can_export: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

// ─── Permission badge — pill toggle ───────────────────────────
function PermBadge({
  label, field, checked, onChange,
}: {
  label: string;
  field: keyof PermNode;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "px-2 py-0.5 rounded-md border text-[10px] font-medium uppercase tracking-wide transition-colors",
        checked
          ? ACTION_COLORS[field]
          : "bg-muted/40 text-muted-foreground border-border hover:border-foreground/30"
      )}
    >
      {label}
    </button>
  );
}

// ─── Module row ──────────────────────────────────────────────
function ModuleRow({
  item, node, onToggle,
}: {
  item: { key: string; label: string; desc: string };
  node: PermNode;
  onToggle: (key: string, field: keyof PermNode) => void;
}) {
  return (
    <div 
      onClick={() => onToggle(item.key, "can_view")}
      className={cn(
        "flex items-center justify-between px-5 py-3 border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer select-none",
        !node.can_view && "opacity-60"
      )}
    >
      <div className="min-w-0 flex-1 mr-4">
        <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.desc}</p>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Switch checked={node.can_view} onCheckedChange={() => onToggle(item.key, "can_view")} />
          <span className={cn(
            "text-[10px] font-medium w-12",
            node.can_view ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          )}>
            {node.can_view ? "VISIBLE" : "HIDDEN"}
          </span>
        </div>

        <div 
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex items-center gap-1.5 transition-opacity",
            node.can_view ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <PermBadge label="Create" field="can_create" checked={node.can_create} onChange={() => onToggle(item.key, "can_create")} />
          <PermBadge label="Edit"   field="can_edit"   checked={node.can_edit}   onChange={() => onToggle(item.key, "can_edit")} />
          <PermBadge label="Delete" field="can_delete" checked={node.can_delete} onChange={() => onToggle(item.key, "can_delete")} />
          <PermBadge label="Export" field="can_export" checked={node.can_export} onChange={() => onToggle(item.key, "can_export")} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function PermissionsPage() {
  const { user, refreshPermissions } = useAuth();

  const [activeRole, setActiveRole]           = useState("admin");
  const [activeTab, setActiveTab]             = useState<"modules" | "assign" | "members">("modules");
  const [permissions, setPermissions]         = useState<PermMap>({});
  const [assignableRoles, setAssignableRoles] = useState<string[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(SECTIONS.map((s) => s.section))
  );

  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [roleMembers, setRoleMembers] = useState<RoleMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const fetchRoleCounts = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("employees").select("role");
      if (error) throw error;
      if (!data) return;
      const counts: Record<string, number> = {};
      for (const row of data) counts[row.role] = (counts[row.role] ?? 0) + 1;
      setRoleCounts(counts);
    } catch (err) {
      console.error("[fetchRoleCounts]", err);
    }
  }, []);

  const fetchRoleMembers = useCallback(async (role: string) => {
    setMembersLoading(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, email, role, department, designation, employee_id, is_active, joining_date, team_id")
        .eq("role", role)
        .order("name");
      if (error) throw error;
      setRoleMembers((data as RoleMember[]) ?? []);
    } catch (err) {
      console.error("[fetchRoleMembers]", err);
      toast.error("Failed to fetch role members.");
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoleCounts();
    const ch = supabase
      .channel("permissions_employees_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        fetchRoleCounts();
        setActiveTab((tab) => {
          if (tab === "members") fetchRoleMembers(activeRole);
          return tab;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchRoleCounts, fetchRoleMembers, activeRole]);

  useEffect(() => {
    if (activeTab === "members") fetchRoleMembers(activeRole);
  }, [activeRole, activeTab, fetchRoleMembers]);

  const broadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    const ch = supabase.channel("permissions_sync");
    ch.subscribe();
    broadcastRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, []);

  const loadRole = useCallback(async (role: string) => {
    setLoading(true);
    try {
      const [permRes, assignRes] = await Promise.all([
        fetch(`/api/permissions?role=${role}`),
        fetch(`/api/permissions/assignable-roles?role=${role}`),
      ]);
      const permData   = await permRes.json();
      const assignData = await assignRes.json();
      setPermissions(permData.permissions ?? {});
      setAssignableRoles(assignData.assignableRoles ?? []);
    } catch {
      toast.error("Could not load permissions. Check DB connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRole(activeRole); }, [activeRole, loadRole]);

  function togglePerm(key: string, field: keyof PermNode) {
    if (activeRole === "admin" && field !== "can_view") {
      toast.info("Admin always has full action access. Only visibility can be toggled.");
      return;
    }
    setPermissions((prev) => {
      const node = prev[key] ?? { ...DEFAULT_NODE };
      const updated = { ...node, [field]: !node[field] };
      if (field === "can_view" && !updated.can_view) {
        updated.can_create = false;
        updated.can_edit   = false;
        updated.can_delete = false;
        updated.can_export = false;
      }
      return { ...prev, [key]: updated };
    });
  }

  function toggleAssignable(roleId: string) {
    setAssignableRoles((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  }

  function toggleSection(section: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const [permRes, assignRes] = await Promise.all([
        fetch("/api/permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: activeRole, permissions, updatedBy: user?.id }),
        }),
        fetch("/api/permissions/assignable-roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: activeRole, assignableRoles }),
        }),
      ]);

      if (!permRes.ok || !assignRes.ok) throw new Error("Save failed");

      await broadcastRef.current?.send({
        type: "broadcast",
        event: "permissions_updated",
        payload: { role: activeRole },
      });

      if (activeRole === user?.role) await refreshPermissions();

      const roleName = ROLES.find((r) => r.id === activeRole)?.name;
      toast.success(`Permissions saved for ${roleName}. Sidebar updated instantly for all active sessions.`);
    } catch {
      toast.error("Failed to save permissions. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const isSuperAdmin = activeRole === "admin";
  const activeRoleInfo = ROLES.find((r) => r.id === activeRole)!;

  const visibleCount = useMemo(
    () => Object.values(permissions).filter((p) => p.can_view).length,
    [permissions],
  );
  const totalModules = useMemo(
    () => SECTIONS.reduce((sum, s) => sum + s.items.length, 0),
    [],
  );

  return (
    <DashboardShell
      moduleKey="permissions_control"
      title="Security & Permissions"
      subtitle="Manage role-based access control and module visibility across the organization."
      actions={
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Permissions
        </Button>
      }
    >
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: role list */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">User Roles</h3>
            <Badge variant="secondary" className="ml-auto">{ROLES.length}</Badge>
          </div>

          {ROLES.map((role) => {
            const isActive = activeRole === role.id;
            return (
              <Card
                key={role.id}
                onClick={() => setActiveRole(role.id)}
                className={cn(
                  "cursor-pointer transition-all overflow-hidden",
                  isActive ? "border-primary shadow-sm" : "hover:border-foreground/30",
                )}
              >
                {isActive && <div className="h-1 w-full bg-primary" />}
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className={cn(
                      "h-8 w-8 rounded-md flex items-center justify-center",
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}>
                      <Users className="h-4 w-4" />
                    </div>
                    <Badge variant={isActive ? "default" : "secondary"}>
                      {roleCounts[role.id] ?? 0} members
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold">{role.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {role.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Right: panel */}
        <Card className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <Lock className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Managing: {activeRoleInfo.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{activeRoleInfo.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {!isSuperAdmin ? (
                  <div className="text-right tabular-nums">
                    <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{visibleCount}</span>
                    <span className="text-xs text-muted-foreground"> / {totalModules} visible</span>
                  </div>
                ) : (
                  <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20">
                    Admin — Full Access
                  </Badge>
                )}
              </div>
            </div>

            {isSuperAdmin && (
              <div className="mt-4 flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-md px-4 py-2.5">
                <Shield className="h-4 w-4 text-primary flex-shrink-0" />
                <p className="text-xs text-primary font-medium">
                  Managing the <strong>Admin</strong> profile. Changes here only affect sidebar visibility.
                </p>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="mt-4">
              <TabsList>
                <TabsTrigger value="modules">Module Visibility & Actions</TabsTrigger>
                <TabsTrigger value="assign">Role Assignment Rights</TabsTrigger>
                <TabsTrigger value="members">Members ({roleCounts[activeRole] ?? 0})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading permissions…</span>
            </div>
          ) : (
            <>
              {activeTab === "modules" && (
                <div className="flex-1 overflow-y-auto">
                  {/* Legend */}
                  <div className="flex items-center gap-4 px-5 py-3 bg-muted/30 border-b">
                    <span className="text-xs text-muted-foreground">Tap pills to toggle</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      {(["can_create","can_edit","can_delete","can_export"] as const).map((f) => (
                        <Badge key={f} variant="outline" className={cn("text-[10px]", ACTION_COLORS[f])}>
                          {f.replace("can_", "")}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {SECTIONS.map(({ section, icon: SectionIcon, items }) => {
                    const expanded = expandedSections.has(section);
                    const visibleInSection = isSuperAdmin
                      ? items.length
                      : items.filter((i) => permissions[i.key]?.can_view).length;

                    return (
                      <div key={section}>
                        <button
                          className="w-full flex items-center justify-between px-5 py-3 bg-muted/40 hover:bg-muted/60 transition-colors border-b"
                          onClick={() => toggleSection(section)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-7 w-7 rounded-md bg-background flex items-center justify-center">
                              <SectionIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <span className="text-xs font-semibold uppercase tracking-wide">{section}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                visibleInSection === items.length
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                  : visibleInSection === 0
                                    ? ""
                                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
                              )}
                            >
                              {visibleInSection}/{items.length} visible
                            </Badge>
                            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                          </div>
                        </button>

                        {expanded && items.map((item) => {
                          const isTargetDashboard = item.key === "manager_dashboard" || item.key === "my_dashboard";
                          const defaultForAdmin = isTargetDashboard
                            ? DEFAULT_NODE
                            : { can_view: true, can_create: true, can_edit: true, can_delete: true, can_export: true };
                          const node = permissions[item.key] ?? (isSuperAdmin ? defaultForAdmin : DEFAULT_NODE);
                          return <ModuleRow key={item.key} item={item} node={node} onToggle={togglePerm} />;
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "assign" && (
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="max-w-xl">
                    <h4 className="text-sm font-semibold mb-1">
                      Who can <span className="text-primary">{activeRoleInfo.name}</span> assign when adding employees?
                    </h4>
                    <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                      When someone with this role adds a new employee, the Role dropdown will only show
                      the roles ticked below. This prevents HR from accidentally creating admin-level accounts.
                    </p>

                    <div className="space-y-2">
                      {ALL_ROLES_FOR_ASSIGN.map((r) => {
                        const isChecked = assignableRoles.includes(r.id);
                        const isSelf    = r.id === activeRole;
                        const visualOn  = isChecked || isSuperAdmin;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => !isSuperAdmin && toggleAssignable(r.id)}
                            disabled={isSuperAdmin}
                            className={cn(
                              "w-full flex items-center gap-4 p-4 rounded-md border text-left transition-colors",
                              visualOn ? "bg-primary/5 border-primary/40" : "hover:border-foreground/30",
                              isSuperAdmin && "cursor-default opacity-80",
                            )}
                          >
                            <div className={cn(
                              "h-5 w-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors",
                              visualOn ? "bg-primary border-primary" : "border-border",
                            )}>
                              {visualOn && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{r.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {isSelf ? "Assign someone with the same role as you" : `Create employees with ${r.label} role`}
                              </p>
                            </div>
                            {isSuperAdmin && <Badge variant="secondary" className="text-[10px]">Always</Badge>}
                          </button>
                        );
                      })}
                    </div>

                    {!isSuperAdmin && (
                      <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-md">
                        <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                          <strong>How this works:</strong> When an HR manager opens Add Employee,
                          the Role dropdown will only show roles you enable above.
                          Super Admin always sees all roles regardless of this setting.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "members" && (
                <div className="flex-1 overflow-y-auto">
                  {membersLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">Loading members…</span>
                    </div>
                  ) : roleMembers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                      <Users className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">No members with this role yet</p>
                      <p className="text-xs">Assign the <strong>{activeRoleInfo.name}</strong> role to employees to see them here.</p>
                    </div>
                  ) : (
                    <div className="p-5 space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            {roleMembers.length} {activeRoleInfo.name}{roleMembers.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                            {roleMembers.filter(m => m.is_active).length} Active
                          </span>
                          <span className="flex items-center gap-1">
                            <Circle className="h-2 w-2 fill-muted-foreground text-muted-foreground" />
                            {roleMembers.filter(m => !m.is_active).length} Inactive
                          </span>
                        </div>
                      </div>

                      <Separator />

                      {roleMembers.map((member) => (
                        <div
                          key={member.id}
                          className={cn(
                            "flex items-start gap-4 p-4 rounded-md border transition-colors",
                            member.is_active
                              ? "hover:border-foreground/30"
                              : "bg-muted/30 opacity-60",
                          )}
                        >
                          <div className="relative flex-shrink-0">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback>{initials(member.name)}</AvatarFallback>
                            </Avatar>
                            <span className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                              member.is_active ? "bg-emerald-500" : "bg-muted-foreground",
                            )} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">{member.name}</p>
                              {member.employee_id && (
                                <Badge variant="outline" className="text-[10px]">{member.employee_id}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{member.email}</p>

                            <div className="flex items-center flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                              {member.department && (
                                <span className="flex items-center gap-1">
                                  <Building className="h-3 w-3" /> {member.department}
                                </span>
                              )}
                              {member.designation && (
                                <span className="flex items-center gap-1">
                                  <Crown className="h-3 w-3" /> {member.designation}
                                </span>
                              )}
                              {member.joining_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Joined {new Date(member.joining_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                </span>
                              )}
                            </div>
                          </div>

                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              member.is_active
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : "",
                            )}
                          >
                            {member.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!isSuperAdmin && activeTab !== "members" && (
            <div className="border-t px-5 py-3 flex items-center justify-between bg-background">
              <p className="text-xs text-muted-foreground">
                Sidebar updates instantly for all active sessions on Save.
              </p>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}
