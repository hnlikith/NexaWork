"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { Printer, Shield, Users, Activity, Lock, Search, Download } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const ROLES = [
  { id: "sa",  name: "Super Admin", color: "text-sky-600 dark:text-sky-400" },
  { id: "acc", name: "Accounts",    color: "text-emerald-600 dark:text-emerald-400" },
  { id: "hr",  name: "HR",          color: "text-violet-600 dark:text-violet-400" },
  { id: "ld",  name: "Lead",        color: "text-amber-600 dark:text-amber-400" },
  { id: "emp", name: "Employee",    color: "text-blue-500 dark:text-blue-400" },
  { id: "sls", name: "Sales",       color: "text-rose-600 dark:text-rose-400" },
] as const;

type RoleId = typeof ROLES[number]["id"];

const INITIAL_SECTIONS: { title: string; features: { name: string; roles: Record<RoleId, boolean> }[] }[] = [
  {
    title: "M01: Employee & Team Management",
    features: [
      { name: "View organizational directory",          roles: { sa: true,  acc: true,  hr: true,  ld: true,  emp: true,  sls: true } },
      { name: "Manage team structures & departments",   roles: { sa: true,  acc: false, hr: true,  ld: false, emp: false, sls: false } },
      { name: "Interactive org chart view",             roles: { sa: true,  acc: true,  hr: true,  ld: true,  emp: true,  sls: true } },
    ],
  },
  {
    title: "M02: Attendance & Leaves",
    features: [
      { name: "Daily clock-in / clock-out logging",     roles: { sa: true, acc: true, hr: true, ld: true, emp: true,  sls: true } },
      { name: "Leave request submission",               roles: { sa: true, acc: true, hr: true, ld: true, emp: true,  sls: true } },
      { name: "Leave approval & balance mgmt",          roles: { sa: true, acc: false, hr: true, ld: true, emp: false, sls: false } },
    ],
  },
  {
    title: "M03: KPI / KRA & Performance",
    features: [
      { name: "View performance history & trends",      roles: { sa: true, acc: false, hr: true, ld: true,  emp: true,  sls: false } },
      { name: "Enter KPI / KRA scores",                 roles: { sa: true, acc: false, hr: true, ld: true,  emp: false, sls: false } },
      { name: "Set monthly team targets",               roles: { sa: true, acc: false, hr: false, ld: true, emp: false, sls: false } },
    ],
  },
  {
    title: "M04: Incentives & Payroll",
    features: [
      { name: "Run organizational payroll",             roles: { sa: true, acc: true, hr: false, ld: false, emp: false, sls: false } },
      { name: "Issue performance incentive grants",     roles: { sa: true, acc: true, hr: false, ld: false, emp: false, sls: false } },
      { name: "View individual payslips",               roles: { sa: true, acc: true, hr: true, ld: true,  emp: true,  sls: true } },
    ],
  },
  {
    title: "M05: Claims & Reimbursements",
    features: [
      { name: "Submit expense reimbursement",           roles: { sa: true, acc: true, hr: true, ld: true,  emp: true,  sls: true } },
      { name: "Claim vested incentives",                roles: { sa: true, acc: true, hr: true, ld: true,  emp: true,  sls: true } },
      { name: "Financial approval & processing",        roles: { sa: true, acc: true, hr: false, ld: false, emp: false, sls: false } },
    ],
  },
  {
    title: "M06: Invoicing & Purchases",
    features: [
      { name: "Create & dispatch client invoices",      roles: { sa: true, acc: true, hr: false, ld: false, emp: false, sls: false } },
      { name: "Vendor records & purchase orders",       roles: { sa: true, acc: true, hr: false, ld: false, emp: false, sls: false } },
    ],
  },
  {
    title: "M07: Subscription Tracker",
    features: [
      { name: "Global SaaS / utility inventory",        roles: { sa: true, acc: true, hr: false, ld: false, emp: false, sls: false } },
      { name: "Renewal alerts & cost allocation",       roles: { sa: true, acc: true, hr: false, ld: true,  emp: false, sls: false } },
    ],
  },
  {
    title: "M08: Team Budget Management",
    features: [
      { name: "Set monthly operational budgets",        roles: { sa: true, acc: true, hr: false, ld: false, emp: false, sls: false } },
      { name: "Budget vs Actuals real-time tracker",    roles: { sa: true, acc: true, hr: false, ld: true,  emp: false, sls: false } },
    ],
  },
  {
    title: "M09 & M10: CRM & Pipeline",
    features: [
      { name: "Lead acquisition & pipeline kanban",     roles: { sa: true, acc: false, hr: false, ld: false, emp: false, sls: true } },
      { name: "Client records & deal closure",          roles: { sa: true, acc: true,  hr: false, ld: false, emp: false, sls: true } },
    ],
  },
  {
    title: "M11 & M12: Internal Comms",
    features: [
      { name: "Secure organizational messaging",        roles: { sa: true, acc: true, hr: true, ld: true,  emp: true,  sls: true } },
      { name: "Schedule meetings & Google Meet sync",   roles: { sa: true, acc: true, hr: true, ld: true,  emp: true,  sls: true } },
    ],
  },
  {
    title: "M13: Mobile Extension",
    features: [
      { name: "Field clock-in / clock-out (Flutter)",   roles: { sa: true, acc: true, hr: true, ld: true,  emp: true,  sls: true } },
      { name: "Mobile push notifications (FCM)",        roles: { sa: true, acc: true, hr: true, ld: true,  emp: true,  sls: true } },
    ],
  },
  {
    title: "M14: System & Security",
    features: [
      { name: "Global archetype configuration",         roles: { sa: true, acc: false, hr: false, ld: false, emp: false, sls: false } },
      { name: "SQL schema & RLS policy mgmt",           roles: { sa: true, acc: false, hr: false, ld: false, emp: false, sls: false } },
      { name: "Financial audit logs",                   roles: { sa: true, acc: true,  hr: false, ld: false, emp: false, sls: false } },
    ],
  },
];

function KPICard({
  label, value, icon: Icon, accent,
}: { label: string; value: string | number; icon: React.ElementType; accent: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className="h-12 w-12 rounded-md flex items-center justify-center" style={{ background: `${accent}1A`, color: accent }}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportPage() {
  const [sections, setSections] = useState(INITIAL_SECTIONS);
  const [search, setSearch] = useState("");

  const togglePermission = (sectionIndex: number, featureIndex: number, roleId: RoleId) => {
    setSections(prev => {
      const nw = [...prev];
      const nwF = [...nw[sectionIndex].features];
      const nwR = { ...nwF[featureIndex].roles };
      nwR[roleId] = !nwR[roleId];
      nwF[featureIndex] = { ...nwF[featureIndex], roles: nwR };
      nw[sectionIndex] = { ...nw[sectionIndex], features: nwF };
      return nw;
    });
  };

  const filteredSections = sections.map(s => ({
    ...s,
    features: s.features.filter(f => f.name.toLowerCase().includes(search.toLowerCase())),
  })).filter(s => s.features.length > 0);

  const totalFeatures = sections.reduce((acc, s) => acc + s.features.length, 0);
  const totalEnabled  = sections.reduce((acc, s) => acc + s.features.reduce((a, f) => a + Object.values(f.roles).filter(Boolean).length, 0), 0);
  const totalPossible = totalFeatures * ROLES.length;
  const securityScore = Math.floor(100 - ((totalEnabled / totalPossible) * 100));

  return (
    <DashboardShell
      moduleKey="feature_report"
      title="Access Control & Feature Registry"
      subtitle="Role-Based Access Control (RBAC) across operational modules."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> JSON Dump
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Auth Modules"      value={sections.length}  icon={Shield}   accent="#0ea5e9" />
          <KPICard label="Access Endpoints"  value={totalFeatures}    icon={Activity} accent="#6366f1" />
          <KPICard label="Managed Roles"     value={ROLES.length}     icon={Users}    accent="#10b981" />
          <KPICard label="System Security"   value={`${securityScore}%`} icon={Lock}  accent="#f59e0b" />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search privileges…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 max-w-md"
          />
        </div>

        <div className="space-y-4">
          {filteredSections.map((section, sIdx) => (
            <Card key={section.title}>
              <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider">{section.title}</h3>
                <Badge variant="outline">{section.features.length} policies</Badge>
              </div>

              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b">
                      <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-1/3">Functional Resource</th>
                      {ROLES.map(role => (
                        <th key={role.id} className="px-3 py-3 text-center border-l">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={cn("text-xs font-semibold uppercase tracking-wide", role.color)}>{role.id}</span>
                            <span className="text-[10px] text-muted-foreground hidden lg:inline">{role.name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.features.map((feature, fIdx) => (
                      <tr key={feature.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <span className="text-sm">{feature.name}</span>
                        </td>
                        {ROLES.map(role => {
                          const isActive = feature.roles[role.id];
                          return (
                            <td key={role.id} className="px-3 py-3 text-center border-l">
                              <div className="flex justify-center">
                                <Switch
                                  checked={isActive}
                                  onCheckedChange={() => togglePermission(sections.indexOf(sections[sIdx]), fIdx, role.id)}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          {filteredSections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
              <Search className="h-8 w-8 opacity-40" />
              <p className="text-sm">No policies match your search.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
