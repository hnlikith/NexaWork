"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Loader2, RotateCcw,
  ShieldCheck, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

// Reuse the same SECTIONS shape as the admin Permissions page. Keep this list
// short here — the canonical list lives in src/app/admin/permissions/page.tsx.
// For maintainability we fetch the list from /api/permissions/modules in the
// future; for now we mirror the keys statically here.
const SECTIONS: { title: string; items: { key: string; label: string }[] }[] = [
  {
    title: "Organization & Dashboard",
    items: [
      { key: "admin_dashboard",    label: "Admin Dashboard" },
      { key: "hr_dashboard",       label: "HR Hub" },
      { key: "accounts_dashboard", label: "Accounts Hub" },
      { key: "my_dashboard",       label: "Employee Dashboard" },
      { key: "projects",           label: "Projects" },
      { key: "employees",          label: "Employees" },
      { key: "shift_management",   label: "Shift Management" },
      { key: "teams",              label: "Teams" },
      { key: "org_chart",          label: "Org Chart" },
    ],
  },
  {
    title: "HR & Hiring",
    items: [
      { key: "job_clusters", label: "Job Clusters" },
      { key: "recruitment",  label: "Recruitment Hub" },
      { key: "ats_scanner",  label: "Resume Scanner (ATS)" },
      { key: "interviews",   label: "Interview Management" },
    ],
  },
  {
    title: "Operations",
    items: [
      { key: "attendance",      label: "Attendance" },
      { key: "kpi_kra",         label: "KPI / KRA" },
      { key: "payroll",         label: "Payroll" },
      { key: "incentives",      label: "Incentives" },
      { key: "claims",          label: "Claims" },
      { key: "reimbursements",  label: "Reimbursements" },
      { key: "priority_payout", label: "Priority Payout" },
    ],
  },
  {
    title: "Finance",
    items: [
      { key: "invoicing",     label: "Invoicing" },
      { key: "vendors",       label: "Vendors & Purchases" },
      { key: "subscriptions", label: "Subscriptions" },
      { key: "budgets",       label: "Budgets" },
    ],
  },
  {
    title: "CRM",
    items: [
      { key: "sales_pipeline", label: "Sales Pipeline" },
      { key: "crm_clients",    label: "Client Directory" },
    ],
  },
  {
    title: "Communications",
    items: [
      { key: "mail_hub",       label: "Mail Hub" },
      { key: "messages",       label: "Team Messages" },
      { key: "meetings",       label: "Video Meetings" },
      { key: "mail_accounts",  label: "Mail Accounts" },
    ],
  },
  {
    title: "L&D",
    items: [
      { key: "lms_academy",        label: "Academy Manager" },
      { key: "lms_courses",        label: "Manage Courses" },
      { key: "lms_certifications", label: "Certifications" },
    ],
  },
  {
    title: "System",
    items: [
      { key: "analytics",           label: "Analytics" },
      { key: "permissions_control", label: "Permissions" },
      { key: "audit_log",           label: "Audit Log" },
      { key: "system_config",       label: "System Settings" },
    ],
  },
];

type TriState = "inherit" | "allow" | "deny";

type EmployeeData = {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string | null;
  department: string | null;
  is_dept_lead: boolean;
  is_team_lead: boolean;
};

type RolePerm = {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
};

type Override = {
  can_view: boolean | null;
  can_create: boolean | null;
  can_edit: boolean | null;
  can_delete: boolean | null;
  can_export: boolean | null;
  reason: string | null;
};

const FIELDS: Array<keyof RolePerm> = ["can_view", "can_create", "can_edit", "can_delete", "can_export"];
const FIELD_LABELS: Record<keyof RolePerm, string> = {
  can_view: "View", can_create: "Create", can_edit: "Edit", can_delete: "Delete", can_export: "Export",
};

function deriveTriState(roleValue: boolean | undefined, overrideValue: boolean | null | undefined): TriState {
  if (overrideValue === null || overrideValue === undefined) return "inherit";
  if (overrideValue === true) return "allow";
  return "deny";
}

function triToBool(t: TriState): boolean | null {
  if (t === "inherit") return null;
  return t === "allow";
}

export default function EmployeePermissionsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const employeeId = params?.id as string;

  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [rolePerms, setRolePerms] = useState<Record<string, RolePerm>>({});
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [reasonByKey, setReasonByKey] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      // Employee
      const { data: emp, error: empErr } = await supabase
        .from("employees")
        .select("id, name, email, role, designation, department")
        .eq("id", employeeId)
        .single();
      if (empErr || !emp) throw empErr ?? new Error("Employee not found");
      setEmployee({
        ...emp,
        is_dept_lead: (emp as any).is_dept_lead || false,
        is_team_lead: (emp as any).is_team_lead || false,
      } as EmployeeData);

      // Role defaults
      const roleRes = await fetch(`/api/permissions?role=${emp.role}`);
      const { permissions } = await roleRes.json();
      setRolePerms(permissions ?? {});

      // Overrides
      const ovRes = await fetch(`/api/permissions/employee?employee_id=${employeeId}`);
      const { overrides: ovs } = await ovRes.json();
      setOverrides(ovs ?? {});
      const reasons: Record<string, string> = {};
      for (const [k, v] of Object.entries(ovs ?? {})) reasons[k] = (v as Override).reason ?? "";
      setReasonByKey(reasons);
    } catch (err) {
      console.error(err);
      toast.error("Could not load permissions.");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  function setFieldTri(moduleKey: string, field: keyof RolePerm, value: TriState) {
    setOverrides(prev => {
      const cur = prev[moduleKey] ?? {
        can_view: null, can_create: null, can_edit: null, can_delete: null, can_export: null, reason: null,
      };
      const next: Override = { ...cur, [field]: triToBool(value) };
      // If all fields are null and no reason, remove the override entirely (clean).
      const allNull = next.can_view === null && next.can_create === null && next.can_edit === null && next.can_delete === null && next.can_export === null;
      if (allNull && !reasonByKey[moduleKey]) {
        const { [moduleKey]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [moduleKey]: next };
    });
  }

  function resetModule(moduleKey: string) {
    setOverrides(prev => {
      const { [moduleKey]: _omit, ...rest } = prev;
      return rest;
    });
    setReasonByKey(prev => ({ ...prev, [moduleKey]: "" }));
  }

  function setReason(moduleKey: string, value: string) {
    setReasonByKey(prev => ({ ...prev, [moduleKey]: value }));
  }

  async function handleSave() {
    if (!employeeId) return;
    setSaving(true);
    try {
      // Build payload — include only modules with at least one non-null field or a reason.
      const payload: Record<string, Override> = {};
      for (const [key, ov] of Object.entries(overrides)) {
        const hasOverride = ov.can_view !== null || ov.can_create !== null || ov.can_edit !== null || ov.can_delete !== null || ov.can_export !== null;
        if (hasOverride) {
          payload[key] = { ...ov, reason: reasonByKey[key] || null };
        }
      }
      // Also mark cleared modules (those that have an active override row in DB but no fields any longer).
      // The server treats an entry with all nulls as "delete this row".
      // We achieve this by sending nulls for any key the admin reset.
      // For simplicity here, we just send the current set; the API DELETEs rows missing from payload.

      const res = await fetch("/api/permissions/employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          overrides: payload,
          updatedBy: currentUser?.id,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      toast.success("Per-employee overrides saved. Sidebar will refresh for this user on next sync.");
      load();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const overrideCount = useMemo(() => Object.keys(overrides).filter(k => {
    const o = overrides[k];
    return o.can_view !== null || o.can_create !== null || o.can_edit !== null || o.can_delete !== null || o.can_export !== null;
  }).length, [overrides]);

  const filteredSections = useMemo(() => {
    if (!search.trim()) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.map(s => ({
      ...s,
      items: s.items.filter(i => i.label.toLowerCase().includes(q) || i.key.toLowerCase().includes(q)),
    })).filter(s => s.items.length > 0);
  }, [search]);

  if (loading || !employee) {
    return (
      <DashboardShell moduleKey="permissions_control" title="Per-Employee Permissions">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      moduleKey="permissions_control"
      title={`Permissions — ${employee.name}`}
      subtitle="Per-employee overrides on top of role defaults. Allow grants access; Deny revokes it; Default follows the role default."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/users">
              <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to Employees
            </Link>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            Save Overrides
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Header summary */}
        <Card>
          <CardContent className="p-5 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-md bg-primary/10 text-primary flex items-center justify-center font-semibold">
                {employee.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-base font-semibold">{employee.name}</p>
                <p className="text-xs text-muted-foreground">
                  {employee.email} · {employee.designation ?? "—"} · {employee.department ?? "—"}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="capitalize">{employee.role}</Badge>
                  {employee.is_dept_lead && <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">Dept Lead</Badge>}
                  {employee.is_team_lead && <Badge variant="outline" className="bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/20">Team Lead</Badge>}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Active overrides</p>
              <p className="text-2xl font-semibold tabular-nums">{overrideCount}</p>
            </div>
          </CardContent>
        </Card>
 
        {/* Info banner */}
        <div className="rounded-md border bg-muted/30 p-4 flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">How overrides work:</strong> Each module has 5 actions
            (View, Create, Edit, Delete, Export). For each action you can choose <strong>Allow</strong>{" "}
            (grant regardless of role), <strong>Deny</strong> (revoke regardless of role), or{" "}
            <strong>Default</strong> (use the role default). Default is the most common; only override
            when this person needs an exception.
          </div>
        </div>
 
        {/* Search */}
        <Input
          placeholder="Search modules…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
 
        {/* Sections */}
        <div className="space-y-4">
          {filteredSections.map(section => (
            <Card key={section.title}>
              <CardHeader className="border-b bg-muted/30 py-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {section.items.map((item, idx) => {
                  const rolePerm = rolePerms[item.key];
                  const ov = overrides[item.key];
                  const hasAnyOverride = ov && (ov.can_view !== null || ov.can_create !== null || ov.can_edit !== null || ov.can_delete !== null || ov.can_export !== null);
 
                  return (
                    <div
                      key={item.key}
                      className={cn(
                        "px-5 py-4 border-b last:border-0",
                        hasAnyOverride && "bg-primary/[0.03]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{item.label}</p>
                            <span className="text-xs text-muted-foreground font-mono">{item.key}</span>
                            {hasAnyOverride && (
                              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                                Overridden
                              </Badge>
                            )}
                          </div>
                          {!rolePerm && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Role default not seeded — Default means denied
                            </p>
                          )}
                        </div>
                        {hasAnyOverride && (
                          <Button variant="ghost" size="sm" onClick={() => resetModule(item.key)} className="h-7 text-xs">
                            <RotateCcw className="mr-1 h-3 w-3" /> Reset
                          </Button>
                        )}
                      </div>
 
                      {/* 5 action tri-states */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {FIELDS.map(field => {
                          const tri = deriveTriState(rolePerm?.[field], ov?.[field]);
                          const roleAllowed = !!rolePerm?.[field];
                          return (
                            <div key={field} className="rounded-md border p-2.5">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                                {FIELD_LABELS[field]}
                              </p>
                              <div className="flex items-center gap-1">
                                {(["inherit","allow","deny"] as TriState[]).map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() => setFieldTri(item.key, field, opt)}
                                    className={cn(
                                      "flex-1 px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wide border transition-colors",
                                      tri === opt
                                        ? opt === "allow"
                                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                          : opt === "deny"
                                            ? "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
                                            : "bg-muted text-foreground border-border"
                                        : "bg-background text-muted-foreground border-border hover:border-foreground/30",
                                    )}
                                  >
                                    {opt === "inherit" ? "default" : opt}
                                  </button>
                                ))}
                              </div>
                              <p className="text-[9px] text-muted-foreground mt-1">
                                Role default: <span className={roleAllowed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                                  {roleAllowed ? "Yes" : "No"}
                                </span>
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {/* Optional reason */}
                      {hasAnyOverride && (
                        <div className="mt-3">
                          <Input
                            placeholder="Reason (optional) — visible in audit log"
                            value={reasonByKey[item.key] ?? ""}
                            onChange={(e) => setReason(item.key, e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
