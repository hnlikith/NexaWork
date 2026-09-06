"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import { toast } from "sonner";
import dayjs from "@/lib/dayjs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Mail, Building, LayoutGrid, ShieldCheck, Clock, Coffee, Loader2, UserPlus, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/layout/AuthProvider";

// ─── types ────────────────────────────────────────────────────────────────────
interface TeamNode { id: string; name: string; type: string; parent_id: string | null; }
interface Shift { id: string; name: string; start_time: string; end_time: string; department: string | null; team_id: string | null; }
interface SalarySlab { id: string; name: string; min_target: number; max_target: number | null; commission_percent: number; }

const ROLE_LABEL: Record<string, string> = {
  employee: "Employee", hr: "HR", accounts: "Accounts", admin: "Admin",
  intern: "Intern", dept_lead: "Department Lead", team_lead: "Team Lead",
};
const EMPTY_SENTINEL = "__none__";
const VALID_ROLES = ["admin", "hr", "accounts", "employee", "intern", "dept_lead", "team_lead"];

// ─── CustomSelect — mirrors the one in users/page.tsx ────────────────────────
function CustomSelect({ value, options, onChange, placeholder, icon }: {
  value: string; options: { label: string; value: string }[];
  onChange: (v: string) => void; placeholder: string; icon?: React.ReactNode;
}) {
  return (
    <Select value={value === "" ? EMPTY_SENTINEL : (value || undefined)} onValueChange={(v) => onChange(v === EMPTY_SENTINEL ? "" : v)}>
      <SelectTrigger className="w-full">
        <span className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {icon}
          <SelectValue placeholder={placeholder} />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_SENTINEL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value || EMPTY_SENTINEL} value={o.value || EMPTY_SENTINEL}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface AddPersonnelPrefill {
  name?: string;
  email?: string;
  designation?: string;
  role?: string;
  employment_type?: string;
  salary_structure?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefill?: AddPersonnelPrefill;
  onSuccess?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function AddPersonnelDialog({ open, onOpenChange, prefill, onSuccess }: Props) {
  const { user } = useAuth();

  const emptyForm = () => ({
    name: "", email: "", role: "employee", employeeId: `NP-${Math.floor(1000 + Math.random() * 8999)}`,
    department: "", designation: "", matrix_role: "", joiningDate: new Date().toISOString(),
    shift_id: "", team_id: "", monthly_leave_quota: "1",
    employment_type: "full_time", salary_structure: "fixed_monthly", base_salary: "",
    salary_min: "", salary_max: "",
    kpi_weight: 40, kra_weight: 40, behavioral_weight: 20,
    enable_salary_linkage: false, create_zoho_mail: true,
    monthly_sales_target: "", salary_slab_id: "", linkSlab: false,
  });

  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  // Org structure
  const [orgTeams, setOrgTeams] = useState<TeamNode[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [salarySlabs, setSalarySlabs] = useState<SalarySlab[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<string[]>([]);

  // Zoho
  const [zohoConnected, setZohoConnected] = useState(false);
  const [zohoStatusLoading, setZohoStatusLoading] = useState(true);
  const [zohoDomain, setZohoDomain] = useState("your-company.com");
  const [zohoEmailPreview, setZohoEmailPreview] = useState("");
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);
  const [emailIsDuplicate, setEmailIsDuplicate] = useState(false);

  // Email validation
  const [emailCheckState, setEmailCheckState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [emailCheckMsg, setEmailCheckMsg] = useState("");
  const [emailSuggestion, setEmailSuggestion] = useState("");

  // Load org + config once on mount
  useEffect(() => {
    async function bootstrap() {
      const { data: teamsData } = await supabase.from("teams").select("id, name, type, parent_id");
      if (teamsData) {
        setOrgTeams(teamsData);
        setDepartments(teamsData.filter(t => t.type === "department").map(t => ({ id: t.id, name: t.name })));
      }
      const { data: shiftsData } = await supabase.from("shifts").select("id, name, start_time, end_time, department, team_id");
      if (shiftsData) setShifts(shiftsData);

      setZohoStatusLoading(true);
      fetch("/api/mail/auth/connect").then(r => r.json()).then(d => { setZohoConnected(d.config?.is_connected === true); }).catch(() => {}).finally(() => setZohoStatusLoading(false));
      fetch("/api/mail/config/domain").then(r => r.json()).then(d => { if (d.current_domain) setZohoDomain(d.current_domain); }).catch(() => {});
      fetch("/api/salary-slabs").then(r => r.json()).then(d => { setSalarySlabs(d.slabs || []); }).catch(() => {});
    }
    bootstrap();
  }, []);

  // Assignable roles based on current user's role
  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") { setAssignableRoles(Object.keys(ROLE_LABEL)); return; }
    fetch(`/api/permissions/assignable-roles?role=${user.role}`)
      .then(r => r.json()).then(d => { if (d.assignableRoles) setAssignableRoles(d.assignableRoles); }).catch(() => {});
  }, [user?.role]);

  // When dialog opens, reset + apply prefill
  useEffect(() => {
    if (!open) return;
    const base = emptyForm();
    if (prefill) {
      base.name = prefill.name || "";
      base.email = prefill.email || "";
      base.designation = prefill.designation || "";
      base.role = VALID_ROLES.includes(prefill.role || "") ? (prefill.role || "intern") : "intern";
      base.employment_type = prefill.employment_type || "internship";
      base.salary_structure = prefill.salary_structure || "stipend";
      if (base.employment_type === "internship") base.salary_structure = "stipend";
    }
    setForm(base);
    setEmailCheckState("idle");
    setEmailCheckMsg("");
    setEmailSuggestion("");
    setZohoEmailPreview("");
  }, [open]);

  // Live email check: DNS + system duplicate (skip for prefill — candidate email is already real)
  useEffect(() => {
    if (prefill) return; // prefill email is from a verified onboarding candidate
    const val = form.email?.trim();
    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setEmailCheckState("idle"); setEmailCheckMsg(""); setEmailSuggestion(""); return;
    }
    setEmailCheckState("checking"); setEmailSuggestion("");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?email=${encodeURIComponent(val)}`);
        const data = await res.json();
        if (!data.valid) {
          setEmailCheckState("invalid");
          setEmailCheckMsg(data.reason || "Could not verify this email.");
          setEmailSuggestion(data.suggestion || "");
          return;
        }
        const sysRes = await fetch(`/api/auth/check-email-system?email=${encodeURIComponent(val)}`);
        const sysData = await sysRes.json();
        if (sysData.exists) {
          setEmailCheckState("invalid");
          setEmailCheckMsg(sysData.message);
        } else {
          setEmailCheckState("valid"); setEmailCheckMsg("");
        }
      } catch { setEmailCheckState("idle"); }
    }, 600);
    return () => clearTimeout(t);
  }, [form.email, prefill]);

  // Zoho email preview
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
        const parts = form.name.trim().toLowerCase().split(" ");
        setZohoEmailPreview(parts.length >= 2 ? `${parts[0]}.${parts[parts.length - 1]}@${zohoDomain}` : `${parts[0]}@${zohoDomain}`);
        setEmailIsDuplicate(false);
      } finally { setEmailPreviewLoading(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [form.name, zohoConnected, zohoDomain]);

  const availableShifts = shifts.filter(s => {
    if (!s.department && !s.team_id) return true;
    if (s.team_id && s.team_id === form.team_id) return true;
    if (s.department && s.department === form.department) return true;
    return false;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.kpi_weight + form.kra_weight + form.behavioral_weight !== 100) {
      toast.error(`KPI weights must sum to 100 (currently ${form.kpi_weight + form.kra_weight + form.behavioral_weight})`);
      return;
    }
    setSubmitting(true);
    try {
      const deptNode = orgTeams.find(t => t.id === form.department);
      const isSales = form.role === "sales";
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
        enable_salary_linkage: form.enable_salary_linkage,
        commission_enabled: isSales,
        monthly_sales_target: isSales && form.monthly_sales_target ? parseFloat(form.monthly_sales_target) : null,
        salary_slab_id: isSales && form.linkSlab ? form.salary_slab_id || null : null,
        create_zoho_mail: form.create_zoho_mail,
        source: prefill ? "onboarding" : "direct",
        // From onboarding: copy the candidate's Profile Photo (looked up by email) as the DP.
        avatar_from_email: prefill?.email || undefined,
      };
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create employee");
      // The server (/api/users) owns provisioning now and re-checks the live Zoho
      // token. Surface its warning if the mailbox couldn't be created; otherwise
      // confirm success. The old redundant second call was a no-op that hid failures.
      if (json.zoho_warning) toast.warning(json.zoho_warning);
      else toast.success(`Employee profile created for ${form.name}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to create employee");
    } finally {
      setSubmitting(false);
    }
  }

  // Prefill bypasses email-check gate (candidate email already verified through signing)
  const canCreate =
    form.name?.trim().length > 0 &&
    (!!prefill || emailCheckState === "valid") &&
    (!!form.department || !!form.team_id);

  const hint = !canCreate
    ? !form.name?.trim() ? "Enter full legal name"
      : (!prefill && emailCheckState !== "valid") ? "Verify personal email first"
      : "Select at least a Department or Team"
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px] !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-6rem)] sm:max-h-[80vh]">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground flex-shrink-0">
            <UserPlus size={16} />
          </div>
          <div className="flex-1 text-left">
            <DialogTitle className="text-sm font-semibold">Add Personnel</DialogTitle>
            <DialogDescription className="text-xs">Human Capital Records System</DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} id="add-personnel-form" className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">

            {/* Full Legal Name */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">
                Full Legal Name
                {prefill && <span className="text-theme-primary font-medium">(through onboarding)</span>}
              </label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            {/* Personal Email */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">
                Personal Email
                {prefill && <span className="text-theme-primary font-medium">(from onboarding)</span>}
                {!prefill && emailCheckState === "checking" && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-theme-muted">
                    <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
                    Verifying…
                  </span>
                )}
                {!prefill && emailCheckState === "valid" && <span className="ml-auto text-[10px] font-black text-emerald-600">✓ Verified</span>}
              </label>
              <Input
                required type="email"
                value={form.email}
                readOnly={!!prefill}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={
                  !prefill && emailCheckState === "invalid" ? "border-red-400 focus:border-red-500" :
                  !prefill && emailCheckState === "valid"   ? "border-emerald-400 focus:border-emerald-500" : ""
                }
              />
              {!prefill && emailCheckState === "invalid" && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-red-500">⚠ {emailCheckMsg}</p>
                  {emailSuggestion && (
                    <button type="button" onClick={() => { setForm({ ...form, email: emailSuggestion }); setEmailSuggestion(""); }}
                      className="text-[11px] font-black text-theme-primary underline underline-offset-2">
                      Use {emailSuggestion} instead
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Dept */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Architecture node (Dept)</label>
              <CustomSelect
                icon={<Building size={14} className="text-theme-primary" />}
                placeholder="Select Department"
                value={form.department}
                onChange={(v) => setForm({ ...form, department: v, team_id: "", shift_id: "" })}
                options={departments.map(d => ({ label: d.name, value: d.id }))}
              />
            </div>

            {/* Team */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Operational Unit (Team)</label>
              <CustomSelect
                icon={<LayoutGrid size={14} className="text-theme-primary" />}
                placeholder="Global/No Team"
                value={form.team_id}
                onChange={(v) => {
                  const nextRole = v && form.role === "dept_lead" ? "employee" : form.role;
                  setForm({ ...form, team_id: v, shift_id: "", role: nextRole });
                }}
                options={form.department ? orgTeams.filter(t => t.type === "team" && t.parent_id === form.department).map(t => ({ label: t.name, value: t.id })) : []}
              />
            </div>

            {/* Designation */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Professional Designation</label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>

            {/* Matrix Role */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Matrix Role</label>
              <CustomSelect
                icon={<ShieldCheck size={14} className="text-theme-primary" />}
                placeholder="Select Role"
                value={form.role}
                onChange={(v) => {
                  if (v === "sales") setForm({ ...form, role: "sales", employment_type: "target_based", salary_structure: "fixed_monthly" });
                  else setForm({ ...form, role: v, commission_enabled: false, monthly_sales_target: "", salary_slab_id: "", linkSlab: false } as any);
                }}
                options={[
                  ...Object.entries(ROLE_LABEL)
                    .filter(([v]) => {
                      if (v === "dept_lead" && form.team_id) return false;
                      const allowed = assignableRoles.filter(r => VALID_ROLES.includes(r));
                      return (allowed.length === 0 || allowed.includes(v)) && v !== "sales";
                    })
                    .map(([v, l]) => ({ label: l, value: v })),
                  { label: "Sales", value: "sales" },
                ]}
              />
            </div>

            {/* Shift */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-theme-primary">Temporal Protocol (Shift)</label>
              <CustomSelect
                icon={<Clock size={14} className="text-theme-primary" />}
                placeholder="SELECT SHIFT..."
                value={form.shift_id}
                onChange={(v) => setForm({ ...form, shift_id: v })}
                options={availableShifts.map(s => ({
                  label: `${s.name.toUpperCase()} (${dayjs(`2000-01-01 ${s.start_time}`).format("hh:mm A")})`,
                  value: s.id,
                }))}
              />
            </div>

            {/* Leave Entitlement */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
                Leave Entitlement <span className="text-[10px] font-semibold text-emerald-500/70">(Sick Leave · Paid)</span>
              </label>
              <CustomSelect
                icon={<Coffee size={14} className="text-emerald-500" />}
                placeholder="Select Quota"
                value={form.monthly_leave_quota}
                onChange={(v) => setForm({ ...form, monthly_leave_quota: v })}
                options={["0","1","2","3","4","5"].map(v => ({ label: `${v} Day${v !== "1" ? "s" : ""} / Month`, value: v }))}
              />
            </div>

            {/* Employment Type */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">
                Employment Type
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
                    let newSalary = form.salary_structure;
                    if (v === "internship") newSalary = "stipend";
                    else if (v === "full_time") newSalary = "fixed_monthly";
                    setForm({ ...form, employment_type: v, salary_structure: newSalary });
                  }}
                  options={[
                    { label: "Full Time", value: "full_time" },
                    { label: "Part Time", value: "part_time" },
                    { label: "Internship", value: "internship" },
                  ]}
                />
              )}
            </div>

            {/* Sales Commission */}
            {form.role === "sales" && (
              <div className="sm:col-span-2 rounded-2xl border border-orange-200 bg-orange-50/40 p-5 space-y-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-600">
                  <TrendingUp size={12} /> Sales Commission Configuration
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-orange-700">Monthly Sales Target (₹)</label>
                  <Input type="number" min="0" step="100" value={form.monthly_sales_target}
                    onChange={(e) => setForm({ ...form, monthly_sales_target: e.target.value })}
                    placeholder="e.g. 100000" className="border-orange-200 bg-white focus-visible:border-orange-400" />
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl border border-orange-100 bg-white cursor-pointer"
                  onClick={() => setForm({ ...form, linkSlab: !form.linkSlab, salary_slab_id: "" })}>
                  <input type="checkbox" checked={form.linkSlab} readOnly
                    className="mt-0.5 w-4 h-4 rounded border-orange-300 accent-orange-500 cursor-pointer flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-orange-700">Link Commission Slab</p>
                    <p className="text-[10px] text-orange-500 mt-0.5">
                      When linked, commission auto-calculates from slab tiers.
                      {salarySlabs.length === 0 && " Add slabs in System Config → Salary Slabs first."}
                    </p>
                  </div>
                </div>
                {form.linkSlab && (
                  <CustomSelect placeholder="Select Commission Slab" value={form.salary_slab_id}
                    onChange={(v) => setForm({ ...form, salary_slab_id: v })}
                    options={salarySlabs.map(s => ({ label: `${s.name} (${s.commission_percent}%)`, value: s.id }))} />
                )}
              </div>
            )}

            {/* Salary Structure */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">
                Salary Structure
                {form.employment_type === "internship" && <span className="text-[10px] bg-amber-500/20 text-amber-600 px-2 py-0.5 rounded">Auto: Stipend</span>}
              </label>
              <CustomSelect placeholder="Select Structure" value={form.salary_structure}
                onChange={(v) => setForm({ ...form, salary_structure: v })}
                options={[
                  { label: "Fixed Monthly", value: "fixed_monthly" },
                  { label: "Hourly Pay", value: "hourly" },
                  { label: "Daily Pay", value: "daily" },
                  { label: "Stipend", value: "stipend" },
                ]} />
            </div>

            {/* Stipend */}
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
                <div className="sm:col-span-2 p-4 rounded-lg bg-theme-primary/10 border border-theme-primary/20">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={form.enable_salary_linkage}
                      onChange={(e) => setForm({ ...form, enable_salary_linkage: e.target.checked })}
                      className="w-4 h-4 rounded border-theme-border" />
                    <span className="text-xs font-bold text-theme-primary uppercase tracking-wide">Link Stipend to KPI/KRA Performance</span>
                  </label>
                  <p className="text-[10px] text-theme-muted mt-2 ml-7">
                    ✓ If enabled: Stipend auto-adjusts between Min-Max based on KPI/KRA scores<br />
                    ✓ If disabled: Use minimum stipend as fixed amount
                  </p>
                </div>
              </>
            )}

            {/* Fixed Monthly */}
            {form.salary_structure === "fixed_monthly" && (
              <div className="sm:col-span-2 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Monthly Base Salary (₹)</label>
                <Input type="number" required value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} placeholder="e.g., 50000" />
              </div>
            )}
            {form.salary_structure === "hourly" && (
              <div className="sm:col-span-2 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Hourly Rate (₹/hour)</label>
                <Input type="number" required step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} placeholder="e.g., 500" />
              </div>
            )}
            {form.salary_structure === "daily" && (
              <div className="sm:col-span-2 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Daily Rate (₹/day)</label>
                <Input type="number" required step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} placeholder="e.g., 2000" />
              </div>
            )}

            {/* KPI Weights */}
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

            {/* Joining Date */}
            <div className="sm:col-span-2 space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-theme-muted">Commencement Date</label>
              <DatePicker value={form.joiningDate} onChange={(d) => setForm({ ...form, joiningDate: d })} label="" />
            </div>

            {/* Zoho Mail */}
            <div className="sm:col-span-2 border-t border-theme-border pt-4 mt-2">
              <div className={`p-4 rounded-xl border transition-all ${form.create_zoho_mail ? "bg-blue-500/5 border-blue-500/20" : "bg-theme-raised border-theme-border"}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.create_zoho_mail} disabled={zohoStatusLoading}
                    onChange={(e) => setForm({ ...form, create_zoho_mail: e.target.checked })}
                    className="w-4 h-4 rounded border-theme-border accent-blue-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-theme-fg flex items-center gap-1.5">
                        <Mail size={12} className="text-blue-500" /> Auto-create Zoho Mail Account
                      </span>
                      {!zohoStatusLoading && !zohoConnected && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500">ZOHO NOT CONNECTED</span>
                      )}
                    </div>
                    {zohoConnected && form.create_zoho_mail && (
                      <div className="mt-0.5">
                        {emailPreviewLoading
                          ? <p className="text-[11px] text-theme-muted flex items-center gap-1"><span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent inline-block" /> Checking availability…</p>
                          : zohoEmailPreview
                            ? <div className="space-y-0.5">
                                <p className="text-[11px] text-blue-500 tabular-nums font-semibold">{zohoEmailPreview}</p>
                                {emailIsDuplicate && <p className="text-[10px] text-amber-500 font-semibold">⚠ Name already exists — suffix added to avoid conflict</p>}
                              </div>
                            : null}
                      </div>
                    )}
                    {!zohoStatusLoading && !zohoConnected && <p className="text-[10px] text-theme-muted mt-0.5">Zoho isn&apos;t connected — the employee will be created and you can run setup later from their profile. Reconnect in <span className="text-theme-primary">Comms → Mail Config</span>.</p>}
                  </div>
                </label>
              </div>
            </div>

          </div>
        </form>

        <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-end gap-3 border-t border-border bg-background px-6 py-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="add-personnel-form" disabled={submitting || !canCreate} title={hint}>
            {submitting && <Loader2 className="animate-spin" />}
            Create Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
