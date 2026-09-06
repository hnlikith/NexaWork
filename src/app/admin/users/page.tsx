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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { useApi } from "@/hooks/useApi";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Users, UserPlus, Search, X, CreditCard, Building, UserCheck, UserX,
  ShieldCheck, FileText, Zap, CalendarDays, MoreVertical, Trash2, Edit2,
  RefreshCw, Mail, ChevronDown, ChevronRight, Check, Clock, LayoutGrid, Coffee, Loader2, LogOut, TrendingUp
} from "lucide-react";
import { useAuth } from "@/components/layout/AuthProvider";
import { usePermission } from "@/hooks/usePermission";
import { DatePicker } from "@/components/ui/date-picker";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase";
import axios from "axios";
import dayjs from "@/lib/dayjs";

interface TeamNode { 
  id: string; 
  name: string; 
  type: string; 
  parent_id: string | null;
}

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  department: string | null;
  team_id: string | null;
}

interface SalarySlab { id: string; name: string; min_target: number; max_target: number | null; commission_percent: number; }

interface User {
  id: string; name: string; email: string; employeeId: string;
  role: string; department: string; designation: string;
  matrix_role: string;
  joiningDate: string; isActive: boolean;
  shift_id: string | null;
  team_id: string | null;
  monthly_leave_quota: number;
  employment_type: string;
  salary_structure: string;
  base_salary: number;
  salary_min?: number;
  salary_max?: number;
  kpi_weight?: number;
  kra_weight?: number;
  behavioral_weight?: number;
  enable_salary_linkage?: boolean;
  zoho_email?: string | null;
  personal_email?: string | null;
  commission_enabled?: boolean;
  monthly_sales_target?: number | null;
  salary_slab_id?: string | null;
  source?: "direct" | "onboarding" | null;
}

const ROLE_BADGE: Record<string, string> = {
  employee: "bg-muted text-muted-foreground border-transparent",
  hr:       "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-transparent",
  accounts: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent",
  admin:    "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-transparent",
  intern:   "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-transparent",
  dept_lead: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-transparent",
  team_lead: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent",
};
const COMMISSION_BADGE = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent";
const ROLE_LABEL: Record<string, string> = {
  employee: "Employee",
  hr: "HR",
  accounts: "Accounts",
  admin: "Admin",
  intern: "Intern",
  dept_lead: "Department Lead",
  team_lead: "Team Lead",
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Custom Simple Dropdown — shadcn-backed wrapper ───────
// (shadcn Select forbids empty-string values, so we map "" <-> a sentinel internally)
const EMPTY_SENTINEL = "__none__";
function CustomSelect({ value, options, onChange, placeholder, icon, label }: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
  placeholder: string;
  icon?: React.ReactNode;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {icon}{label}
        </label>
      )}
      <Select
        value={value === "" ? EMPTY_SENTINEL : (value || undefined)}
        onValueChange={(v) => onChange(v === EMPTY_SENTINEL ? "" : v)}
      >
        <SelectTrigger className="w-full">
          <span className="flex items-center gap-2 min-w-0 flex-1 text-left">
            {!label && icon}
            <SelectValue placeholder={placeholder} />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_SENTINEL}>
            {placeholder}
          </SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value || EMPTY_SENTINEL} value={opt.value || EMPTY_SENTINEL}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Action Menu ─────────────────────────────────────────
function RowMenu({ user, onRefresh, onEdit, setDeleteConfirm, canEdit, canDelete, zohoConnected, zohoDomain }: {
  user: User;
  onRefresh: () => void;
  onEdit: () => void;
  setDeleteConfirm: (u: User) => void;
  canEdit: boolean;
  canDelete: boolean;
  zohoConnected: boolean;
  zohoDomain: string;
}) {
  const [showCustomMail, setShowCustomMail] = useState(false);
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [acting, setActing] = useState(false);
  const [provisioningMail, setProvisioningMail] = useState(false);

  async function createZohoMail() {
    setProvisioningMail(true);
    try {
      const res = await fetch("/api/mail/accounts/create-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: user.id, name: user.name, domain: zohoDomain }),
      });
      const data = await res.json();
      if (res.ok && data.email_address) {
        if (data.already_exists) {
          toast.info(`Mail already exists: ${data.email_address}`);
        } else {
          toast.success(`Zoho Mail created: ${data.email_address}`);
        }
      } else {
        toast.error(data.error || "Failed to create Zoho Mail.");
      }
    } catch {
      toast.error("Failed to create Zoho Mail. Check connection.");
    } finally {
      setProvisioningMail(false);
    }
  }

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowCustomMail(false); }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  const isActing = acting || provisioningMail;

  async function doAction(action: string, extra?: Record<string, string>) {
    setActing(true);
    try {
      const res = await axios.post(`/api/users/${user.id}`, { action, ...extra });
      (res.data.warning ? toast.warning : toast.success)(res.data.message || res.data.warning || "Done");
      onRefresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message);
    } finally {
      setActing(false);
    }
  }

  async function startOffboarding() {
    if (!confirm(`Start 7-day offboarding for ${user.name}? They will lose access after 7 days.`)) return;
    setActing(true);
    try {
      const res = await fetch(`/api/employees/${user.id}/offboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Admin initiated offboarding" }),
      });
      const data = await res.json();
      (res.ok ? toast.success : toast.error)(data.message || "Offboarding started.");
      if (res.ok) onRefresh();
    } catch { toast.error("Failed to start offboarding."); }
    finally { setActing(false); }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 ml-auto"
            disabled={isActing}
            aria-label="Open actions menu"
          >
            {isActing
              ? <Loader2 size={14} className="animate-spin" />
              : <MoreVertical size={14} />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Account
          </DropdownMenuLabel>
          {canEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Edit2 className="text-muted-foreground" />
              Edit Employee
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <a href={`/admin/users/${user.id}/permissions`}>
              <ShieldCheck className="text-muted-foreground" />
              Manage Permissions
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => doAction("resend_credentials")}>
            <RefreshCw className="text-muted-foreground" />
            Resend Login Info
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowCustomMail(true)}>
            <Mail className="text-muted-foreground" />
            Send Custom Mail
          </DropdownMenuItem>

          {zohoConnected && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Mailbox
              </DropdownMenuLabel>
              {user.zoho_email ? (
                <DropdownMenuItem disabled className="opacity-100 cursor-default">
                  <Zap className="text-emerald-500" />
                  <span className="truncate">{user.zoho_email}</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={createZohoMail} disabled={provisioningMail}>
                  {provisioningMail
                    ? <Loader2 className="animate-spin text-muted-foreground" />
                    : <Zap className="text-muted-foreground" />}
                  Create Zoho Mail
                </DropdownMenuItem>
              )}
            </>
          )}

          {canDelete && (
            <>
              <DropdownMenuSeparator />
              {user.isActive && (
                <DropdownMenuItem onClick={startOffboarding} className="text-orange-600 dark:text-orange-400 focus:text-orange-600 dark:focus:text-orange-400">
                  <LogOut />
                  Begin Offboarding
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setDeleteConfirm(user)} className="text-destructive focus:text-destructive">
                <Trash2 />
                Delete Account
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCustomMail} onOpenChange={setShowCustomMail}>
        <DialogContent className="sm:max-w-md text-left">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Message: {user.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <Input value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} placeholder="Enter subject..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea value={mailBody} onChange={(e) => setMailBody(e.target.value)} rows={4} placeholder="Type message..." className="resize-none" />
            </div>
          </div>
          <DialogFooter className="!flex-row !justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCustomMail(false)}>Cancel</Button>
            <Button size="sm" onClick={() => {
              doAction("send_custom", { subject: mailSubject, message: mailBody });
              setShowCustomMail(false);
            }}>Send Mail</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Dashboard ───────────────────────────────────────
export default function AdminUsersPage() {
  const { request } = useApi();
  const { user, loading: authLoading } = useAuth();
  const { canCreate, canEdit, canDelete, canExport } = usePermission("employees");
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "inactive">("all");
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);
  const [orgTeams, setOrgTeams] = useState<TeamNode[]>([]);
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [form, setForm] = useState({
    name: "", email: "", role: "employee",
    employeeId: "", department: "", designation: "", matrix_role: "", joiningDate: "",
    shift_id: "", team_id: "", monthly_leave_quota: "1",
    employment_type: "full_time", salary_structure: "fixed_monthly", base_salary: "",
    salary_min: "", salary_max: "",
    kpi_weight: 40, kra_weight: 40, behavioral_weight: 20,
    enable_salary_linkage: false,
    create_zoho_mail: true,
    monthly_sales_target: "",
    salary_slab_id: "",
    linkSlab: false,
  });
  const [zohoConnected, setZohoConnected] = useState(false);
  const [zohoStatusLoading, setZohoStatusLoading] = useState(true);
  const [zohoDomain, setZohoDomain] = useState("your-company.com");
  const [zohoEmailPreview, setZohoEmailPreview] = useState("");
  const [assignableRoles, setAssignableRoles] = useState<string[]>([]);
  const [salarySlabs, setSalarySlabs] = useState<SalarySlab[]>([]);
  // "Add from onboarding" — pick a signed/completed candidate to auto-fill
  const [fromOnboarding, setFromOnboarding] = useState(false);
  const [obCandidates, setObCandidates] = useState<{ id: string; name: string; email: string; phone: string; address: string; role: string }[]>([]);

  async function load(q?: string) {
    setLoading(true);
    try {
      const url = `/api/users?_t=${Date.now()}${q ? `&search=${encodeURIComponent(q)}` : ""}`;
      const res = await request<{ users: User[]; total: number }>({ url });
      setUsers(res.users ?? []);
      setTotal(res.total ?? 0);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrg() {
    const { data: teamsData } = await supabase.from("teams").select("id, name, type, parent_id");
    if (teamsData) {
      setOrgTeams(teamsData);
      setDepartments(teamsData.filter(t => t.type === 'department').map(t => ({ id: t.id, name: t.name })));
    }
    
    const { data: shiftsData } = await supabase.from("shifts").select("id, name, start_time, end_time, department, team_id");
    if (shiftsData) setShifts(shiftsData);
  }

  useEffect(() => {
    if (!authLoading && user) {
      load();
      loadOrg();
      // Check if Zoho Mail is connected
      setZohoStatusLoading(true);
      fetch("/api/mail/auth/connect").then(r => r.json()).then(d => {
        setZohoConnected(d.config?.is_connected === true);
      }).catch(() => {}).finally(() => setZohoStatusLoading(false));
      // Fetch active provisioning domain
      fetch("/api/mail/config/domain").then(r => r.json()).then(d => {
        if (d.current_domain) setZohoDomain(d.current_domain);
      }).catch(() => {});
      // Load salary slabs for Sales commission dropdown
      fetch("/api/salary-slabs").then(r => r.json()).then(d => {
        setSalarySlabs(d.slabs || []);
      }).catch(() => {});
      // Fetch which roles this user is allowed to assign
      if (user.role === "admin") {
        setAssignableRoles(Object.keys(ROLE_LABEL));
      } else {
        fetch(`/api/permissions/assignable-roles?role=${user.role}`)
          .then(r => r.json())
          .then(d => { if (d.assignableRoles) setAssignableRoles(d.assignableRoles); })
          .catch(() => {});
      }
    }
  }, [authLoading, user]);

  // ── Real-time status sync: listen to is_active changes on the employees table ──
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("admin_users_status_sync")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "employees" },
        (payload) => {
          const updated = payload.new;
          // Only apply partial update if we care about status-related changes
          if (
            "is_active" in updated ||
            "deactivated_by" in updated ||
            "deactivated_at" in updated
          ) {
            setUsers((prevUsers) =>
              prevUsers.map((u) => {
                if (u.id === updated.id) {
                  return {
                    ...u,
                    isActive: updated.is_active,
                    is_active: updated.is_active,
                    deactivated_by: updated.deactivated_by ?? null,
                    deactivated_at: updated.deactivated_at ?? null,
                  } as any;
                }
                return u;
              })
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Personal email live validation: DNS check + system duplicate check
  const [emailCheckState, setEmailCheckState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [emailCheckMsg, setEmailCheckMsg] = useState("");
  const [emailSuggestion, setEmailSuggestion] = useState("");
  useEffect(() => {
    if (editingId) return; // don't re-validate when editing
    const val = form.email?.trim();
    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setEmailCheckState("idle"); setEmailCheckMsg(""); setEmailSuggestion(""); return;
    }
    setEmailCheckState("checking"); setEmailSuggestion("");
    const t = setTimeout(async () => {
      try {
        // 1. DNS MX check
        const res = await fetch(`/api/auth/verify-email?email=${encodeURIComponent(val)}`);
        const data = await res.json();
        if (!data.valid) {
          setEmailCheckState("invalid");
          setEmailCheckMsg(data.reason || "Could not verify this email.");
          setEmailSuggestion(data.suggestion || "");
          return;
        }
        // 2. System-wide duplicate check (employees + onboarding + candidates)
        const sysRes = await fetch(`/api/auth/check-email-system?email=${encodeURIComponent(val)}`);
        const sysData = await sysRes.json();
        if (sysData.exists) {
          setEmailCheckState("invalid");
          setEmailCheckMsg(sysData.message);
        } else {
          setEmailCheckState("valid");
          setEmailCheckMsg("Email domain verified");
        }
      } catch {
        setEmailCheckState("idle");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [form.email, editingId]);

  // Update Zoho email preview when name changes — checks DB for duplicates
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);
  const [emailIsDuplicate, setEmailIsDuplicate] = useState(false);
  useEffect(() => {
    if (!form.name || !zohoConnected) { setZohoEmailPreview(""); return; }
    setEmailPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/preview-email?name=${encodeURIComponent(form.name)}`);
        const data = await res.json();
        setZohoEmailPreview(data.email || "");
        setEmailIsDuplicate(!!data.isDuplicate);
      } catch {
        // fallback: compute locally
        const parts = form.name.trim().toLowerCase().split(" ");
        setZohoEmailPreview(parts.length >= 2
          ? `${parts[0]}.${parts[parts.length - 1]}@${zohoDomain}`
          : `${parts[0]}@${zohoDomain}`);
        setEmailIsDuplicate(false);
      } finally {
        setEmailPreviewLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [form.name, zohoConnected, zohoDomain]);

  // Re-fetch assignable roles if admin updates permissions while this user is active
  useEffect(() => {
    if (!user?.role || user.role === "admin") return;
    const ch = supabase
      .channel("permissions_sync")
      .on("broadcast", { event: "permissions_updated" }, (payload) => {
        if (payload.payload?.role === user.role) {
          fetch(`/api/permissions/assignable-roles?role=${user.role}`)
            .then(r => r.json())
            .then(d => { if (d.assignableRoles) setAssignableRoles(d.assignableRoles); })
            .catch(() => {});
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.role]);

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

  useEffect(() => {
    if (showForm && !editingId && !form.employeeId) {
      setForm(f => ({ ...f, employeeId: `NP-${Math.floor(1000 + Math.random() * 8999)}` }));
    }
  }, [showForm, editingId]);

  async function loadOnboardingCandidates() {
    try {
      const res = await fetch("/api/onboarding/signed");
      if (res.ok) { const j = await res.json(); setObCandidates(j.candidates ?? []); }
    } catch { /* ignore */ }
  }

  function handleAdd() {
    setEditingId(null);
    setFromOnboarding(false);
    loadOnboardingCandidates();
    setForm({
      name: "", email: "", role: "employee", employeeId: "",
      department: "", designation: "", matrix_role: "", shift_id: "", team_id: "",
      monthly_leave_quota: "1", employment_type: "full_time",
      salary_structure: "fixed_monthly", base_salary: "",
      salary_min: "", salary_max: "",
      joiningDate: new Date().toISOString(),
      kpi_weight: 40, kra_weight: 40, behavioral_weight: 20,
      enable_salary_linkage: false,
      create_zoho_mail: true,
      monthly_sales_target: "",
      salary_slab_id: "",
      linkSlab: false,
    });
    setShowForm(true);
  }

  function handleEdit(user: User) {
    setEditingId(user.id);
    const deptNode = orgTeams.find(t => t.name === user.department && t.type === 'department');
    setForm({
      name: user.name,
      email: user.personal_email || user.email,
      role: user.commission_enabled ? "sales" : user.role,
      employeeId: user.employeeId,
      department: deptNode ? deptNode.id : user.department,
      designation: user.designation,
      matrix_role: (user as any).matrix_role || "",
      joiningDate: user.joiningDate,
      shift_id: user.shift_id || "",
      team_id: user.team_id || "",
      monthly_leave_quota: String(user.monthly_leave_quota || "1"),
      employment_type: user.employment_type || "full_time",
      salary_structure: user.salary_structure || "fixed_monthly",
      base_salary: String(user.base_salary || ""),
      salary_min: String(user.salary_min || ""),
      salary_max: String(user.salary_max || ""),
      kpi_weight: user.kpi_weight || 40,
      kra_weight: user.kra_weight || 40,
      behavioral_weight: user.behavioral_weight || 20,
      enable_salary_linkage: user.enable_salary_linkage || false,
      create_zoho_mail: false,
      monthly_sales_target: String(user.monthly_sales_target || ""),
      salary_slab_id: user.salary_slab_id || "",
      linkSlab: !!(user.salary_slab_id),
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const deptNode = orgTeams.find(t => t.id === form.department);

      // Validate KPI weights sum to 100
      const totalWeight = form.kpi_weight + form.kra_weight + form.behavioral_weight;
      if (totalWeight !== 100) {
        toast.error(`KPI weights must sum to 100 (currently ${totalWeight})`);
        setSubmitting(false);
        return;
      }

      const isSales = form.role === "sales";
      const VALID_ROLES = ["admin", "hr", "accounts", "employee", "intern", "dept_lead", "team_lead"];
      const safeRole = isSales ? "employee" : (VALID_ROLES.includes(form.role) ? form.role : "employee");
      const matrixRoleLabel = isSales ? "Sales" : (ROLE_LABEL[form.role] || form.role);

      const payload = {
        ...form,
        role: safeRole,
        matrix_role: matrixRoleLabel,
        department: deptNode ? deptNode.name : form.department,
        shift_id: form.shift_id || null,
        team_id: form.team_id || null,
        monthly_leave_quota: parseFloat(form.monthly_leave_quota),
        employment_type: isSales ? "target_based" : form.employment_type,
        base_salary: form.base_salary ? parseFloat(form.base_salary) : 0,
        salary_min: form.salary_min ? parseFloat(form.salary_min) : null,
        salary_max: form.salary_max ? parseFloat(form.salary_max) : null,
        kpi_weight: form.kpi_weight,
        kra_weight: form.kra_weight,
        behavioral_weight: form.behavioral_weight,
        enable_salary_linkage: form.enable_salary_linkage,
        commission_enabled: isSales,
        monthly_sales_target: isSales && form.monthly_sales_target ? parseFloat(form.monthly_sales_target) : null,
        salary_slab_id: isSales && form.linkSlab ? form.salary_slab_id || null : null,
        create_zoho_mail: form.create_zoho_mail,
      };

      if (editingId) {
        await axios.patch(`/api/users/${editingId}`, payload);
        toast.success("Employee protocol re-indexed successfully.");
      } else {
        const newEmployee = await request<{ id?: string; zoho_warning?: string }>({ url: "/api/users", method: "POST", data: payload });

        // The server (/api/users) owns Zoho provisioning and re-checks the live
        // token. Surface its warning if the mailbox couldn't be created; otherwise
        // confirm success. No redundant second call — it was a no-op that hid failures.
        if (newEmployee?.zoho_warning) {
          toast.warning(newEmployee.zoho_warning);
        } else {
          toast.success(`Secure onboarding initialized for ${form.email}`);
        }
      }
      setShowForm(false);
      await load();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message;
      if (msg.includes("updated_at") || msg.includes("500")) {
        toast.error("Configuration Error: Database triggers are misconfigured. Please run the SQL patch in your Supabase dashboard.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setSubmitting(true);
    try {
      await axios.delete(`/api/users/${deleteConfirm.id}`);
      toast.success(`Account for "${deleteConfirm.name}" has been decommissioned.`);
      setDeleteConfirm(null);
      await load();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message;
      
      // Plain English linkage detection
      if (errorMsg.includes("attendance_logs")) {
        toast.error("Cannot Delete: Employee has Attendance records. You must clear their logs first.");
      } else if (errorMsg.includes("project_members")) {
        toast.error("Cannot Delete: Employee is still assigned to a Project. Remove them from the project team first.");
      } else if (errorMsg.includes("projects_team_lead_id_fkey")) {
        toast.error("Cannot Delete: Employee is a Project Lead. Assign a new Lead to their projects first.");
      } else if (errorMsg.includes("updated_at") || errorMsg.includes("42703")) {
        toast.error("System Error: Database script mismatch. Please verify the SQL patch was run in Supabase.");
      } else {
        toast.error("Security Block: " + errorMsg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(userId: string, current: boolean) {
    // Block self-deactivation
    if (userId === user?.id && current) {
      toast.error("You cannot deactivate your own account.", { duration: 5000 });
      return;
    }

    // Client-side pre-check for quick feedback:
    if (!current) {
      const targetUser = users.find(u => u.id === userId);
      if (
        targetUser && 
        (targetUser as any).deactivated_by && 
        (targetUser as any).deactivated_by !== user?.id && 
        user?.role !== "admin"
      ) {
        const dec = (targetUser as any).deactivator || { name: "another administrator", role: "admin", employee_id: "System" };
        const roleLabel = ROLE_LABEL[dec.role] || dec.role || "Admin";
        toast.error(
          `Reactivation Denied: Suspended by ${dec.name} (${roleLabel}, ID: ${dec.employee_id || "System"}). Only they or a Super Admin are authorized to reactivate this account.`,
          { duration: 8000 }
        );
        return;
      }
    }

    setTogglingStatusId(userId);

    try {
      await axios.patch(`/api/users/${userId}`, { 
        isActive: !current,
        deactivatedBy: user?.id
      });

      // Optimistically update local state immediately
      setUsers((prevUsers) =>
        prevUsers.map((u) => {
          if (u.id === userId) {
            return {
              ...u,
              isActive: !current,
              is_active: !current,
              deactivated_by: !current ? null : user?.id,
              deactivated_at: !current ? null : new Date().toISOString(),
              deactivator: !current ? null : {
                name: user?.name,
                email: user?.email,
                employee_id: user?.employee_id,
                role: user?.role
              }
            } as any;
          }
          return u;
        })
      );

      toast.success(`Account is now ${!current ? "Active" : "Inactive"}`);
      await load();
    } catch (e: any) {
      if (e.response?.status === 403 && e.response?.data?.error === "UNAUTHORIZED_REACTIVATION") {
        const dec = e.response.data.deactivator;
        const roleLabel = ROLE_LABEL[dec.role] || dec.role || "Admin";
        toast.error(
          `Reactivation Denied: Suspended by ${dec.name} (${roleLabel}, ID: ${dec.employee_id || "System"}). Only they are authorized to reactivate this account.`,
          { duration: 8000 }
        );
      } else {
        toast.error(e.response?.data?.error || "Error updating status.");
      }
    } finally {
      setTogglingStatusId(null);
    }
  }

  const filteredUsers = users.filter((u) => {
    const act = u.isActive ?? (u as any).is_active;
    if (activeTab === "active")   return act === true;
    if (activeTab === "inactive") return act === false;
    return true;
  });

  const activeCount   = users.filter((u) => u.isActive === true || (u as any).is_active === true).length;
  const inactiveCount = users.filter((u) => u.isActive === false || (u as any).is_active === false).length;

  // Filter shifts based on selected department/team
  const selectedDeptNode = orgTeams.find(t => t.id === form.department);
  const availableShifts = shifts.filter(s => {
    if (!s.department && !s.team_id) return true; // Global shift
    if (s.team_id && s.team_id === form.team_id) return true; // Team match
    if (s.department && selectedDeptNode && s.department === selectedDeptNode.name && !s.team_id) return true; // Dept match
    return false;
  });

  return (
    <DashboardShell
      moduleKey="employees"
      title="Employees"
      subtitle="Architect your workforce and manage enterprise system access."
      actions={
        canCreate ? (
          <Button variant="default" size="sm" onClick={handleAdd}>
            <UserPlus size={14} className="mr-1.5" /> Add Employee
          </Button>
        ) : null
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total Staff",   value: total || users.length, icon: Users,     color: "text-theme-fg",    bg: "bg-theme-raised" },
            { label: "Active Now",    value: activeCount,           icon: UserCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Inactive",      value: inactiveCount,         icon: UserX,     color: "text-rose-500",    bg: "bg-rose-500/10" },
            { label: "Global Roles",   value: new Set(users.map((u) => u.role)).size, icon: ShieldCheck, color: "text-sky-500", bg: "bg-sky-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="page-card flex items-center gap-3">
              <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
                <Icon size={16} className={color} />
              </div>
              <div>
                <p className="text-xs text-theme-muted">{label}</p>
                <p className={cn("text-xl font-bold leading-tight", color)}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        <Card className="overflow-hidden p-0 gap-0">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "active" | "inactive")}>
              <TabsList>
                <TabsTrigger value="all" className="gap-2 data-[state=active]:font-semibold">
                  All
                  <span className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                    activeTab === "all" ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"
                  )}>{users.length}</span>
                </TabsTrigger>
                <TabsTrigger value="active" className="gap-2 data-[state=active]:font-semibold">
                  Active
                  <span className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                    activeTab === "active" ? "bg-emerald-500 text-white" : "bg-muted-foreground/15 text-muted-foreground"
                  )}>{activeCount}</span>
                </TabsTrigger>
                <TabsTrigger value="inactive" className="gap-2 data-[state=active]:font-semibold">
                  Inactive
                  <span className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                    activeTab === "inactive" ? "bg-rose-500 text-white" : "bg-muted-foreground/15 text-muted-foreground"
                  )}>{inactiveCount}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input
                type="text"
                placeholder="Search personnel..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); load(e.target.value); }}
                className="w-full sm:w-72 pl-9"
              />
            </div>
          </div>

          {/* Table */}
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">Personnel</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Department / Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-2.5 w-44" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-28 mb-2" />
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableCell>
                      <TableCell className="pr-4 text-right"><Skeleton className="h-7 w-7 ml-auto rounded-md" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Users size={20} className="text-muted-foreground/60" />
                        <span>No employees found</span>
                        {search && <span className="text-xs">Try a different search term</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => {
                    const isActive = u.isActive ?? (u as any).is_active;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              {(u as any).avatar_url && <AvatarImage src={(u as any).avatar_url} alt="" />}
                              <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-semibold">
                                {getInitials(u.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-muted-foreground">{u.employeeId}</span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs">
                              <span className="font-medium text-foreground">{u.department || "Unassigned"}</span>
                              {u.team_id && (
                                <>
                                  <ChevronRight size={10} className="text-muted-foreground" />
                                  <span className="text-muted-foreground">
                                    {orgTeams.find(t => t.id === u.team_id)?.name || "—"}
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className={cn("text-[10px] px-1.5 py-0", u.commission_enabled ? COMMISSION_BADGE : (ROLE_BADGE[u.role] ?? ROLE_BADGE.employee))}>
                                {u.commission_enabled ? ROLE_LABEL["sales"] : (ROLE_LABEL[u.role] ?? u.role)}
                              </Badge>
                              {u.commission_enabled && u.monthly_sales_target && (
                                <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 font-normal">
                                  <TrendingUp size={9} /> ₹{Number(u.monthly_sales_target).toLocaleString("en-IN")}
                                </Badge>
                              )}
                              <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
                                <Coffee size={9} /> {u.monthly_leave_quota} L/M
                              </Badge>
                              {(u as any).source === "onboarding" ? (
                                <Badge className="gap-1 text-[10px] px-1.5 py-0 bg-violet-500/15 text-violet-700 dark:text-violet-400 border-transparent font-medium">
                                  <FileText size={8} /> Via Onboarding
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
                                  <UserPlus size={8} /> Direct Add
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-foreground">{formatDate(u.joiningDate)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {u.id === user?.id ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center cursor-not-allowed">
                                  <Badge
                                    variant={isActive ? "default" : "secondary"}
                                    className={cn(
                                      "opacity-50 pointer-events-none",
                                      isActive && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent",
                                    )}
                                  >
                                    {isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-[200px] text-center">
                                You cannot deactivate your own account
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <button
                              onClick={() => toggleActive(u.id, isActive)}
                              disabled={togglingStatusId !== null}
                              className="inline-flex items-center disabled:opacity-80 disabled:cursor-not-allowed"
                              aria-label="Toggle active state"
                            >
                              <Badge
                                variant={isActive ? "default" : "secondary"}
                                className={cn(
                                  "cursor-pointer transition-colors flex items-center gap-1",
                                  isActive && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent hover:bg-emerald-500/25",
                                  !isActive && "hover:bg-muted-foreground/20"
                                )}
                              >
                                {togglingStatusId === u.id && <Loader2 size={10} className="animate-spin" />}
                                {isActive ? "Active" : "Inactive"}
                              </Badge>
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <RowMenu user={u} onRefresh={() => load(search || undefined)} onEdit={() => handleEdit(u)} setDeleteConfirm={setDeleteConfirm} canEdit={canEdit} canDelete={canDelete} zohoConnected={zohoConnected} zohoDomain={zohoDomain} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>

          {/* Footer / pagination spot */}
          {!loading && filteredUsers.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span>Showing <span className="font-medium text-foreground">{filteredUsers.length}</span> of {users.length} employees</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[860px] !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-6rem)] sm:max-h-[80vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground flex-shrink-0">
              {editingId ? <Edit2 size={16} /> : <UserPlus size={16} />}
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">{editingId ? "Edit Personnel" : "Add Personnel"}</DialogTitle>
              <DialogDescription className="text-xs">Human Capital Records System</DialogDescription>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit} id="employee-form" className="min-h-0 overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">
                      Full Legal Name
                      {fromOnboarding && <span className="text-theme-primary font-medium">(through onboarding)</span>}
                      {!editingId && (
                        <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-theme-muted cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-3 w-3 accent-current"
                            checked={fromOnboarding}
                            onChange={(e) => { setFromOnboarding(e.target.checked); if (e.target.checked) loadOnboardingCandidates(); }}
                          />
                          From onboarding
                        </span>
                      )}
                    </label>
                    {fromOnboarding && !editingId ? (
                      <Select
                        value={obCandidates.find((c) => c.email === form.email && c.name === form.name)?.id || ""}
                        onValueChange={(id) => {
                          const c = obCandidates.find((x) => x.id === id);
                          if (c) setForm((f) => ({ ...f, name: c.name, email: c.email, designation: c.role || f.designation }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={obCandidates.length ? "Select a signed candidate…" : "No signed onboardings yet"} />
                        </SelectTrigger>
                        <SelectContent>
                          {obCandidates.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name} — {c.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">
                      Personal Email
                      {fromOnboarding && !editingId && obCandidates.some((c) => c.email === form.email && c.name === form.name) && (
                        <span className="text-theme-primary font-medium">(from onboarding)</span>
                      )}
                      {emailCheckState === "checking" && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-theme-muted">
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
                          Verifying…
                        </span>
                      )}
                      {emailCheckState === "valid" && (
                        <span className="ml-auto text-[10px] font-black text-emerald-600">✓ Verified</span>
                      )}
                    </label>
                    <Input
                      required
                      type="email"
                      value={form.email}
                      disabled={!!editingId}
                      readOnly={fromOnboarding && !editingId && obCandidates.some((c) => c.email === form.email && c.name === form.name)}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={
                        emailCheckState === "invalid" ? "border-red-400 focus:border-red-500" :
                        emailCheckState === "valid"   ? "border-emerald-400 focus:border-emerald-500" : ""
                      }
                    />
                    {emailCheckState === "invalid" && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-red-500 flex items-center gap-1">
                          ⚠ {emailCheckMsg}
                        </p>
                        {emailSuggestion && (
                          <button
                            type="button"
                            onClick={() => { setForm({ ...form, email: emailSuggestion }); setEmailSuggestion(""); }}
                            className="text-[11px] font-black text-theme-primary underline underline-offset-2"
                          >
                            Use {emailSuggestion} instead
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {editingId && (
                    <div className="space-y-2 sm:col-span-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Professional Email (Generated by Zoho)</label>
                      <Input disabled value={users.find(u => u.id === editingId)?.zoho_email || users.find(u => u.id === editingId)?.email || ""} className="bg-theme-raised/50" />
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Architecture node (Dept)</label>
                    <CustomSelect 
                      icon={<Building size={14} className="text-theme-primary" />}
                      placeholder="Select Department"
                      value={form.department} 
                      onChange={(v) => {
                         setForm({...form, department: v, team_id: "", shift_id: ""});
                      }} 
                      options={departments.map(d => ({ label: d.name, value: d.id }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Operational Unit (Team)</label>
                    <CustomSelect 
                      icon={<LayoutGrid size={14} className="text-theme-primary" />}
                      placeholder="Global/No Team"
                      value={form.team_id} 
                      onChange={(v) => {
                         const nextRole = v && form.role === "dept_lead" ? "employee" : form.role;
                         setForm({...form, team_id: v, shift_id: "", role: nextRole});
                      }} 
                      options={form.department ? orgTeams.filter(t => t.type === 'team' && t.parent_id === form.department).map(t => ({ label: t.name, value: t.id })) : []}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Professional Designation</label>
                    <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Matrix Role</label>
                    <CustomSelect
                      icon={<ShieldCheck size={14} className="text-theme-primary" />}
                      placeholder="Select Role"
                      value={form.role}
                      onChange={(v) => {
                        if (v === "sales") {
                          setForm({ ...form, role: "sales", employment_type: "target_based", salary_structure: "fixed_monthly" });
                        } else {
                          setForm({ ...form, role: v, commission_enabled: false, monthly_sales_target: "", salary_slab_id: "", linkSlab: false } as any);
                        }
                      }}
                      options={[
                        ...Object.entries(ROLE_LABEL)
                          .filter(([v]) => {
                            // Hide dept_lead if a team is selected
                            if (v === "dept_lead" && form.team_id) {
                              return false;
                            }
                            const validRoles = ["admin", "hr", "accounts", "employee", "intern", "dept_lead", "team_lead"];
                            const allowed = assignableRoles.filter(r => validRoles.includes(r));
                            return (allowed.length === 0 || allowed.includes(v)) && v !== "sales";
                          })
                          .map(([v, l]) => ({ label: l, value: v })),
                        { label: "Sales", value: "sales" },
                      ]}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-theme-primary">Temporal Protocol (Shift)</label>
                    <CustomSelect 
                      icon={<Clock size={14} className="text-theme-primary" />}
                      placeholder="SELECT SHIFT..."
                      value={form.shift_id} 
                      onChange={(v) => setForm({...form, shift_id: v})} 
                      options={availableShifts.map(s => ({ 
                        label: `${s.name.toUpperCase()} (${dayjs(`2000-01-01 ${s.start_time}`).format("hh:mm A")})`, 
                        value: s.id 
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-emerald-600">Leave Entitlement <span className="text-[10px] font-semibold text-emerald-500/70">(Sick Leave · Paid)</span></label>
                    <CustomSelect 
                      icon={<Coffee size={14} className="text-emerald-500" />}
                      placeholder="Select Quota"
                      value={form.monthly_leave_quota} 
                      onChange={(v) => setForm({...form, monthly_leave_quota: v})} 
                      options={[
                        { label: "0 Days / Month", value: "0" },
                        { label: "1 Day / Month", value: "1" },
                        { label: "2 Days / Month", value: "2" },
                        { label: "3 Days / Month", value: "3" },
                        { label: "4 Days / Month", value: "4" },
                        { label: "5 Days / Month", value: "5" },
                      ]}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Employment Type
                      {form.role === "sales" && <span className="text-[10px] bg-orange-500/20 text-orange-600 px-2 py-0.5 rounded font-black">Auto: Target Based</span>}
                    </label>
                    {form.role === "sales" ? (
                      <div className="flex h-[46px] w-full items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50/50 px-4 text-sm font-bold text-orange-600 cursor-not-allowed">
                        <TrendingUp size={14} className="text-orange-500" /> Target Based
                      </div>
                    ) : (
                      <CustomSelect
                        placeholder="Select Type"
                        value={form.employment_type}
                        onChange={(v) => {
                          let newSalaryStructure = form.salary_structure;
                          if (v === "internship") newSalaryStructure = "stipend";
                          else if (v === "full_time") newSalaryStructure = "fixed_monthly";
                          setForm({ ...form, employment_type: v, salary_structure: newSalaryStructure });
                        }}
                        options={[
                          { label: "Full Time",   value: "full_time" },
                          { label: "Part Time",   value: "part_time" },
                          { label: "Internship",  value: "internship" },
                        ]}
                      />
                    )}
                  </div>

                  {/* Sales Commission Configuration — shown only when Sales role selected */}
                  {form.role === "sales" && (
                    <div className="sm:col-span-2 rounded-2xl border border-orange-200 bg-orange-50/40 p-5 space-y-4">
                      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-600">
                        <TrendingUp size={12} /> Sales Commission Configuration
                      </p>

                      {/* Monthly Sales Target */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-orange-700">Monthly Sales Target (₹)</label>
                        <Input
                          type="number" min="0" step="100"
                          value={form.monthly_sales_target}
                          onChange={(e) => setForm({ ...form, monthly_sales_target: e.target.value })}
                          placeholder="e.g. 100000"
                          className="border-orange-200 bg-white focus-visible:border-orange-400"
                        />
                        <p className="text-[10px] text-orange-600/70">Target monthly sales amount assigned to this employee.</p>
                      </div>

                      {/* Link Commission Slab checkbox */}
                      <div className="flex items-start gap-3 p-3 rounded-xl border border-orange-100 bg-white cursor-pointer" onClick={() => setForm({ ...form, linkSlab: !form.linkSlab, salary_slab_id: "" })}>
                        <input
                          type="checkbox"
                          id="link-slab-cb"
                          checked={form.linkSlab}
                          readOnly
                          className="mt-0.5 w-4 h-4 rounded border-orange-300 accent-orange-500 cursor-pointer flex-shrink-0"
                        />
                        <div>
                          <p className="text-xs font-bold text-orange-700">Link Commission Slab</p>
                          <p className="text-[10px] text-orange-500 mt-0.5">
                            When linked, commission auto-calculates from slab tiers.
                            {salarySlabs.length === 0 && " Add slabs in System Config → Salary Slabs first."}
                          </p>
                        </div>
                      </div>

                      {/* Slab selector — only when checkbox is ticked */}
                      {form.linkSlab && (
                        <div className="space-y-3">
                          <CustomSelect
                            placeholder="Select Commission Slab"
                            value={form.salary_slab_id}
                            onChange={(v) => setForm({ ...form, salary_slab_id: v })}
                            options={salarySlabs.map(s => ({
                              label: `${s.name} (${s.commission_percent}%)`,
                              value: s.id,
                            }))}
                          />
                          {form.salary_slab_id && form.monthly_sales_target && (() => {
                            const slab = salarySlabs.find(s => s.id === form.salary_slab_id);
                            if (!slab) return null;
                            const est = (parseFloat(form.monthly_sales_target) * slab.commission_percent) / 100;
                            return (
                              <div className="flex items-center gap-3 rounded-xl bg-white border border-orange-100 px-4 py-3">
                                <TrendingUp size={14} className="text-orange-500" />
                                <span className="text-[11px] font-bold text-orange-700">
                                  Est. Commission at 100% target: <span className="text-orange-600 font-black">₹{est.toLocaleString("en-IN")}</span>
                                  <span className="text-orange-400 font-normal ml-2">({slab.commission_percent}% of ₹{parseFloat(form.monthly_sales_target).toLocaleString("en-IN")})</span>
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Salary Structure
                      {form.employment_type === "internship" && <span className="text-[10px] bg-amber-500/20 text-amber-600 px-2 py-0.5 rounded">Auto: Stipend</span>}
                    </label>
                    <CustomSelect
                      placeholder="Select Structure"
                      value={form.salary_structure}
                      onChange={(v) => setForm({...form, salary_structure: v})}
                      options={[
                        { label: "Fixed Monthly", value: "fixed_monthly" },
                        { label: "Hourly Pay", value: "hourly" },
                        { label: "Daily Pay", value: "daily" },
                        { label: "Stipend", value: "stipend" },
                      ]}
                    />
                  </div>

                  {/* STIPEND ONLY - Show Min/Max */}
                  {form.salary_structure === "stipend" && (
                    <>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Minimum Stipend (₹)</label>
                        <Input type="number" required value={form.salary_min || ""} onChange={(e) => setForm({ ...form, salary_min: e.target.value })} placeholder="e.g., 10000" />
                        <p className="text-[10px] text-theme-muted">Base amount when KPI linkage is disabled</p>
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Maximum Stipend (₹)</label>
                        <Input type="number" required value={form.salary_max || ""} onChange={(e) => setForm({ ...form, salary_max: e.target.value })} placeholder="e.g., 15000" />
                        <p className="text-[10px] text-theme-muted">Maximum range (performance-based when linked to KPI)</p>
                      </div>

                      {/* Enable Salary Linkage to KPI/KRA - ONLY for Stipend */}
                      <div className="sm:col-span-2 p-4 rounded-lg bg-theme-primary/10 border border-theme-primary/20">
                        <label className="flex items-center gap-3">
                          <input type="checkbox" checked={form.enable_salary_linkage}
                            onChange={(e) => setForm({ ...form, enable_salary_linkage: e.target.checked })}
                            className="w-4 h-4 rounded border-theme-border"
                          />
                          <span className="text-xs font-bold text-theme-primary uppercase tracking-wide">
                            Link Stipend to KPI/KRA Performance
                          </span>
                        </label>
                        <p className="text-[10px] text-theme-muted mt-2 ml-7">
                          ✓ If enabled: Stipend auto-adjusts between Min-Max based on KPI/KRA scores<br/>
                          ✓ If disabled: Use minimum stipend as fixed amount
                        </p>
                      </div>
                    </>
                  )}

                  {/* FIXED MONTHLY - Show single base salary */}
                  {form.salary_structure === "fixed_monthly" && (
                    <div className="sm:col-span-2 space-y-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Monthly Base Salary (₹)</label>
                      <Input type="number" required value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} placeholder="e.g., 50000" />
                      <p className="text-[10px] text-theme-muted">Fixed monthly salary amount</p>
                    </div>
                  )}

                  {/* HOURLY - Show single hourly rate */}
                  {form.salary_structure === "hourly" && (
                    <div className="sm:col-span-2 space-y-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Hourly Rate (₹/hour)</label>
                      <Input type="number" required step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} placeholder="e.g., 500" />
                      <p className="text-[10px] text-theme-muted">Rate per hour (Salary = Rate × Hours Worked)</p>
                    </div>
                  )}

                  {/* DAILY - Show single daily rate */}
                  {form.salary_structure === "daily" && (
                    <div className="sm:col-span-2 space-y-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Daily Rate (₹/day)</label>
                      <Input type="number" required step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} placeholder="e.g., 2000" />
                      <p className="text-[10px] text-theme-muted">Rate per day (Salary = Rate × Days Worked)</p>
                    </div>
                  )}

                  {/* KPI & KRA Weights */}
                  <div className="sm:col-span-2 border-t border-theme-border pt-4 mt-4">
                    <p className="text-xs font-bold text-theme-primary uppercase tracking-widest mb-4">Performance Linkage Settings</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-blue-500">KPI Weight (%)</label>
                        <Input type="number" min="0" max="100" step="1" value={form.kpi_weight ?? 40}
                          onChange={(e) => setForm({ ...form, kpi_weight: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-emerald-600">KRA Weight (%)</label>
                        <Input type="number" min="0" max="100" step="1" value={form.kra_weight ?? 40}
                          onChange={(e) => setForm({ ...form, kra_weight: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-amber-600">Behavioral Weight (%)</label>
                        <Input type="number" min="0" max="100" step="1" value={form.behavioral_weight ?? 20}
                          onChange={(e) => setForm({ ...form, behavioral_weight: parseFloat(e.target.value) || 0 })} />
                      </div>
                    </div>
                    <p className="text-[10px] text-theme-muted mt-2">⚠️ Weights must sum to 100%</p>
                  </div>

                  <div className="sm:col-span-2 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Commencement Date</label>
                    <DatePicker value={form.joiningDate} onChange={(d) => setForm({ ...form, joiningDate: d })} label="" />
                  </div>

                  {/* Zoho Mail Auto-Provisioning — only for new employees */}
                  {!editingId && (
                    <div className="sm:col-span-2 border-t border-theme-border pt-4 mt-2">
                      <div className={`p-4 rounded-xl border transition-all ${form.create_zoho_mail ? "bg-blue-500/5 border-blue-500/20" : "bg-theme-raised border-theme-border"}`}>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.create_zoho_mail}
                            disabled={zohoStatusLoading}
                            onChange={(e) => setForm({ ...form, create_zoho_mail: e.target.checked })}
                            className="w-4 h-4 rounded border-theme-border accent-blue-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-theme-fg flex items-center gap-1.5">
                                <Mail size={12} className="text-blue-500" />
                                Auto-create Zoho Mail Account
                              </span>
                              {!zohoStatusLoading && !zohoConnected && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
                                  ZOHO NOT CONNECTED
                                </span>
                              )}
                            </div>
                            {zohoConnected && form.create_zoho_mail && (
                              <div className="mt-0.5">
                                {emailPreviewLoading ? (
                                  <p className="text-[11px] text-theme-muted flex items-center gap-1">
                                    <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent inline-block" />
                                    Checking availability…
                                  </p>
                                ) : zohoEmailPreview ? (
                                  <div className="space-y-0.5">
                                    <p className="text-[11px] text-blue-500 tabular-nums font-semibold">{zohoEmailPreview}</p>
                                    {emailIsDuplicate && (
                                      <p className="text-[10px] text-amber-500 font-semibold">
                                        ⚠ Name already exists — suffix added to avoid conflict
                                      </p>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            )}
                            {!zohoStatusLoading && !zohoConnected && (
                              <p className="text-[10px] text-theme-muted mt-0.5">
                                Zoho isn&apos;t connected — the employee will be created and you can run setup later from their profile. Reconnect in <span className="text-theme-primary">Comms → Mail Config</span>.
                              </p>
                            )}
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

          </form>
          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-end gap-3 border-t border-border bg-background px-6 py-5">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            {(() => {
              const canCreate = !editingId
                ? (
                    form.name?.trim().length > 0 &&
                    emailCheckState === "valid" &&
                    (!!form.department || !!form.team_id)
                  )
                : true;
              const hint = !editingId && !canCreate
                ? !form.name?.trim() ? "Enter full legal name"
                  : emailCheckState !== "valid" ? "Verify personal email first"
                  : "Select at least a Department or Team"
                : undefined;
              return (
                <Button
                  type="submit"
                  form="employee-form"
                  disabled={submitting || !canCreate}
                  title={hint}
                >
                  {submitting && <Loader2 className="animate-spin" />}
                  {editingId ? "Save Changes" : "Create Profile"}
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION TOAST (PILL DESIGN) */}
      {deleteConfirm && (
        <div className="fixed inset-x-0 top-8 z-[9000] flex justify-center px-4 animate-in slide-in-from-top-8 duration-300">
           <div className="flex items-center gap-6 bg-theme-surface px-6 py-4 shadow-xl rounded-2xl border border-theme-border min-w-[400px]">
              <div className="flex items-center gap-4">
                 <div className="h-10 w-10 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-xl">
                    <Trash2 size={20} />
                 </div>
                 <div className="flex flex-col">
                    <p className="text-sm font-semibold text-theme-fg tracking-tight">Delete <span className="text-rose-500 font-bold">"{deleteConfirm.name}"</span>?</p>
                    <p className="text-xs text-theme-muted mt-0.5">This action cannot be undone.</p>
                 </div>
              </div>
              
              <div className="flex items-center gap-3 ml-auto">
                 <Button onClick={() => setDeleteConfirm(null)} disabled={submitting} variant="outline" size="sm" className="px-4">
                   Cancel
                 </Button>
                 <Button onClick={handleDelete} disabled={submitting} variant="destructive" size="sm" className="px-5">
                   {submitting && <Loader2 className="animate-spin" />}
                   {submitting ? "Deleting..." : "Delete"}
                 </Button>
              </div>
           </div>
        </div>
      )}
    </DashboardShell>
  );
}
