"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/layout/AuthProvider";
import axios from "axios";
import { toast } from "sonner";
import { formatCurrency, getYearRange, cn } from "@/lib/utils";
import {
  calculateCompanyScore,
  calculateFinalIncentive,
  getCompanyMultiplier,
  getEmployeeMultiplier,
} from "@/lib/incentiveMath";
import {
  Award, TrendingUp, IndianRupee, RefreshCw, Save, Activity, CheckCircle2, Lock, Gift, Loader2,
} from "lucide-react";

interface User { id: string; _id?: string; name: string; employeeId: string; department: string; }
interface Incentive {
  _id: string;
  amount: number;
  base_amount: number;
  fixed_amount?: number;
  variable_amount?: number;
  employee_score?: number;
  employee_multiplier?: number;
  company_score?: number;
  company_multiplier?: number;
  status: string;
  month: number;
  year: number;
  createdAt?: string;
  employee: { name: string; employeeId: string };
}
interface ConfigState {
  revenue_achievement_percentage: number;
  collections_percentage: number;
  delivery_health_percentage: number;
}
interface KpiScore { final_score: number; }

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i).toLocaleString("en-IN", { month: "long" }),
}));

function monthLabel(m: number, y: number) {
  return new Date(y, m - 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
}

function initials(name?: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function incentiveStatusBadge(status: string) {
  if (status === "paid")      return <Badge className="bg-purple-500 hover:bg-purple-500/90 text-white capitalize">{status}</Badge>;
  if (status === "claimable") return <Badge className="bg-sky-500 hover:bg-sky-500/90 text-white capitalize">{status}</Badge>;
  if (status === "locked")    return <Badge variant="secondary" className="capitalize"><Lock size={10} /> {status}</Badge>;
  return <Badge variant="secondary" className="capitalize">{status}</Badge>;
}

export default function AdminIncentivesPage() {
  const { user } = useAuth();

  const [users, setUsers]           = useState<User[]>([]);
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [submitting, setSubmitting]     = useState(false);
  const [vestingLoading, setVestingLoading] = useState(false);
  const [savingPerformance, setSavingPerformance] = useState(false);
  const [employeeScore, setEmployeeScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [config, setConfig] = useState<ConfigState>({
    revenue_achievement_percentage: 84,
    collections_percentage: 87,
    delivery_health_percentage: 75,
  });
  const [form, setForm] = useState({
    fixed_amount: "",
    variable_amount: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    notes: "",
  });

  useEffect(() => {
    axios.get("/api/users?limit=100").then((res) => { if (res.data.users?.length) setUsers(res.data.users); }).catch(() => {});
    axios.get("/api/config").then((res) => {
      const cfg = res.data.config ?? {};
      setConfig({
        revenue_achievement_percentage: cfg.revenue_achievement_percentage ?? 84,
        collections_percentage: cfg.collections_percentage ?? 87,
        delivery_health_percentage: cfg.delivery_health_percentage ?? 75,
      });
    }).catch(() => {});
  }, []);

  async function loadIncentives(empId?: string) {
    setLoading(true);
    try {
      const url = empId ? `/api/incentives?employeeId=${empId}` : "/api/incentives";
      const res = await axios.get(url);
      setIncentives(res.data.incentives || []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedUser) { loadIncentives(); return; }
    loadIncentives(selectedUser);
    axios.get(`/api/kpi?employeeId=${selectedUser}`)
      .then((res) => { const s = (res.data.scores ?? []) as KpiScore[]; setEmployeeScore(s[0]?.final_score ?? null); })
      .catch(() => setEmployeeScore(null));
  }, [selectedUser]);

  async function handleAward(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    const fixedAmount    = parseFloat(form.fixed_amount    || "0");
    const variableAmount = parseFloat(form.variable_amount || "0");
    if (fixedAmount + variableAmount <= 0) {
      toast.warning("Enter a fixed or variable amount");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post("/api/incentives", { employee: selectedUser, fixed_amount: fixedAmount, variable_amount: variableAmount, month: form.month, year: form.year, notes: form.notes });
      setForm({ fixed_amount: "", variable_amount: "", month: new Date().getMonth() + 1, year: new Date().getFullYear(), notes: "" });
      await loadIncentives(selectedUser);
      toast.success("Incentive granted");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to grant incentive");
    } finally {
      setSubmitting(false);
    }
  }

  async function processVesting() {
    setVestingLoading(true);
    try {
      await axios.post("/api/incentives", { action: "process_vesting" });
      if (selectedUser) await loadIncentives(selectedUser); else await loadIncentives();
      toast.success("Vesting processed");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Vesting failed");
    } finally {
      setVestingLoading(false);
    }
  }

  async function saveCompanyPerformance() {
    setSavingPerformance(true);
    try {
      await axios.patch("/api/config", config);
      toast.success("Company performance saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to save");
    } finally {
      setSavingPerformance(false);
    }
  }

  const fixedAmount    = parseFloat(form.fixed_amount    || "0") || 0;
  const variableAmount = parseFloat(form.variable_amount || "0") || 0;
  const companyScore   = calculateCompanyScore(config.revenue_achievement_percentage, config.collections_percentage, config.delivery_health_percentage);
  const companyMultiplier  = getCompanyMultiplier(companyScore);
  const employeeMultiplier = getEmployeeMultiplier(employeeScore);
  const totalAmount = calculateFinalIncentive(fixedAmount, variableAmount, employeeMultiplier, companyMultiplier);

  const canEditConfig = user?.role === "admin";

  const filtered = statusFilter === "all" ? incentives : incentives.filter((i) => i.status === statusFilter);
  const totalAmt    = incentives.reduce((s, i) => s + i.amount, 0);
  const claimable   = incentives.filter((i) => i.status === "claimable").length;
  const paid        = incentives.filter((i) => i.status === "paid").length;

  const stats = [
    { label: "Total Grants",  value: String(incentives.length),     icon: Award,        tone: "text-foreground",   bg: "bg-muted" },
    { label: "Total Amount",  value: formatCurrency(totalAmt),       icon: IndianRupee,  tone: "text-emerald-600",  bg: "bg-emerald-500/10" },
    { label: "Claimable",     value: String(claimable),              icon: Gift,         tone: "text-sky-600",      bg: "bg-sky-500/10" },
    { label: "Paid",          value: String(paid),                   icon: CheckCircle2, tone: "text-purple-600",   bg: "bg-purple-500/10" },
  ];

  const scoreColor = companyScore >= 80 ? "text-emerald-600" : companyScore >= 60 ? "text-amber-600" : "text-rose-500";
  const scoreBg    = companyScore >= 80 ? "bg-emerald-500/10" : companyScore >= 60 ? "bg-amber-500/10" : "bg-rose-500/10";

  return (
    <DashboardShell
      moduleKey="incentives"
      title="Incentives"
      subtitle="Manage employee incentive grants and company performance parameters."
      actions={
        <div className="flex items-center gap-2">
          {canEditConfig && (
            <Button variant="outline" size="sm" disabled={savingPerformance} onClick={saveCompanyPerformance}>
              {savingPerformance ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Config
            </Button>
          )}
          <Button size="sm" disabled={vestingLoading} onClick={processVesting}>
            {vestingLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Process Vesting
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, tone, bg }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", bg)}>
                  <Icon size={15} className={tone} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={cn("text-xl font-semibold tabular-nums leading-tight", tone)}>{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Company performance */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-1.5">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg mb-1", scoreBg)}>
                <Activity size={17} className={scoreColor} />
              </div>
              <p className="text-xs text-muted-foreground">Company Score</p>
              <p className={cn("text-3xl font-bold tabular-nums leading-tight", scoreColor)}>{Math.round(companyScore)}%</p>
              <Badge variant="outline" className={cn("text-xs", scoreColor)}>{companyMultiplier.toFixed(1)}× multiplier</Badge>
            </CardContent>
          </Card>

          {[
            { key: "revenue_achievement_percentage", label: "Revenue Achievement", barColor: "bg-sky-500",    textColor: "text-sky-600",     bg: "bg-sky-500/10",     icon: TrendingUp },
            { key: "collections_percentage",         label: "Collections",         barColor: "bg-emerald-500",textColor: "text-emerald-600", bg: "bg-emerald-500/10", icon: IndianRupee },
            { key: "delivery_health_percentage",     label: "Delivery Health",     barColor: "bg-purple-500", textColor: "text-purple-600",  bg: "bg-purple-500/10",  icon: Activity },
          ].map((item) => {
            const val = config[item.key as keyof ConfigState];
            const Icon = item.icon;
            return (
              <Card key={item.key}>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("flex h-7 w-7 items-center justify-center rounded-md", item.bg)}>
                        <Icon size={13} className={item.textColor} />
                      </div>
                      <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                    </div>
                    <span className={cn("text-lg font-semibold tabular-nums", item.textColor)}>{val}%</span>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full transition-all duration-500", item.barColor)} style={{ width: `${Math.min(100, val)}%` }} />
                  </div>

                  {canEditConfig ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button" variant="outline" size="icon" className="h-8 w-8"
                        onClick={() => setConfig({ ...config, [item.key]: Math.max(0, val - 1) })}
                      >−</Button>
                      <Input
                        type="number" min={0} max={120}
                        value={val}
                        onChange={(e) => setConfig({ ...config, [item.key]: Math.max(0, Math.min(120, parseInt(e.target.value) || 0)) })}
                        className="h-8 text-center font-semibold"
                      />
                      <Button
                        type="button" variant="outline" size="icon" className="h-8 w-8"
                        onClick={() => setConfig({ ...config, [item.key]: Math.min(120, val + 1) })}
                      >+</Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Read-only — super admin can edit</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Award form + history */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Award size={15} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Award Incentive</span>
                </div>
                <form onSubmit={handleAward} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Employee</Label>
                    <Select value={selectedUser || undefined} onValueChange={setSelectedUser}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select employee…" /></SelectTrigger>
                      <SelectContent>
                        {users.map((u) => <SelectItem key={u.id || u._id} value={u.id || u._id || ""}>{u.name} — {u.employeeId}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {employeeScore !== null && (
                      <p className="text-xs text-muted-foreground">
                        KPI Score: <span className={cn("font-semibold", employeeScore >= 80 ? "text-emerald-600" : employeeScore >= 60 ? "text-amber-600" : "text-rose-500")}>{employeeScore}%</span>
                        <span className="ml-2">→ {employeeMultiplier.toFixed(1)}× multiplier</span>
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Month</Label>
                      <Select value={String(form.month)} onValueChange={(v) => setForm({ ...form, month: parseInt(v) })}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Year</Label>
                      <Select value={String(form.year)} onValueChange={(v) => setForm({ ...form, year: parseInt(v) })}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {getYearRange().map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fixed Amount (₹)</Label>
                      <Input
                        type="number" min="0" placeholder="0" value={form.fixed_amount}
                        onChange={(e) => setForm({ ...form, fixed_amount: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Variable Base (₹)</Label>
                      <Input
                        type="number" min="0" placeholder="0" value={form.variable_amount}
                        onChange={(e) => setForm({ ...form, variable_amount: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Preview</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Employee multiplier</span>
                      <span className="font-medium text-foreground tabular-nums">{employeeMultiplier.toFixed(1)}×</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Company multiplier</span>
                      <span className="font-medium text-foreground tabular-nums">{companyMultiplier.toFixed(1)}×</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Final payout</span>
                      <span className="text-base font-semibold text-emerald-600 tabular-nums">{formatCurrency(totalAmount)}</span>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting || !selectedUser}>
                    {submitting && <Loader2 size={13} className="animate-spin" />}
                    Award Incentive
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* History table */}
          <div className="lg:col-span-3">
            <Card className="p-0 overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">
                    Grant History
                    {selectedUser && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        — {users.find((u) => (u.id || u._id) === selectedUser)?.name}
                      </span>
                    )}
                  </span>
                </div>
                <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                  <TabsList>
                    <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                    <TabsTrigger value="claimable" className="text-xs">Claimable</TabsTrigger>
                    <TabsTrigger value="paid" className="text-xs">Paid</TabsTrigger>
                    <TabsTrigger value="locked" className="text-xs">Locked</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Fixed</TableHead>
                      <TableHead>Variable</TableHead>
                      <TableHead>Final</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 6 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                          No incentive records found
                        </TableCell>
                      </TableRow>
                    ) : filtered.map((inc) => (
                      <TableRow key={inc._id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-[10px] font-semibold">{initials(inc.employee.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-foreground">{inc.employee.name}</p>
                              <p className="text-xs text-muted-foreground">{inc.employee.employeeId}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{monthLabel(inc.month, inc.year)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{formatCurrency(inc.fixed_amount ?? 0)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{formatCurrency(inc.variable_amount ?? 0)}</TableCell>
                        <TableCell className="font-semibold text-emerald-600 tabular-nums">{formatCurrency(inc.amount)}</TableCell>
                        <TableCell className="text-right">{incentiveStatusBadge(inc.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
                <span className="text-xs text-muted-foreground">{filtered.length} grant{filtered.length !== 1 ? "s" : ""}</span>
                <span className="text-xs text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{formatCurrency(filtered.reduce((s, i) => s + i.amount, 0))}</span>
                </span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
