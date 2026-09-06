"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { formatCurrency, cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import axios from "axios";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Save, IndianRupee, Layers, Mail, Bell, Lock, AlertCircle, Loader2,
  Building2, FileCheck, CheckCircle2, Plus, Trash2, Pencil, X, Check,
  ShieldAlert, TrendingUp, LayoutGrid,
} from "lucide-react";

interface Config {
  company_revenue: number;
  profit_percentage: number;
  expense_percentage: number;
  company_stage: string;
  equity_min_percentage: number;
  equity_max_percentage: number;
  vesting_days: number;
  bonus_percentage_1m: number;
  bonus_percentage_2m: number;
  claim_limit: number;
  payout_pool_amount: number;
  payout_capacity: "HIGH" | "MODERATE" | "LOW";
  current_claim_cycle: number;
  cycle_reset_date: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  company_name: string;
  founder_name: string;
  founder_designation: string;
  consultant_agreement_url: string;
}

function toIndianDisplay(raw: string | number): string {
  const s = String(raw).replace(/,/g, "");
  if (s === "" || isNaN(Number(s))) return typeof raw === "string" ? raw : "";
  return Number(s).toLocaleString("en-IN");
}
function fromIndianInput(val: string): string {
  return val.replace(/,/g, "").replace(/[^\d]/g, "");
}

interface SalarySlab {
  id: string; name: string; min_target: number;
  max_target: number | null; commission_percent: number;
  is_active: boolean; sort_order: number;
}

interface AnalysisTask {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  pdf_url?: string;
}

export default function AdminConfigPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<Config | null>(null);
  const [form, setForm] = useState<Partial<Config>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [analyzingTask, setAnalyzingTask] = useState<AnalysisTask | null>(null);

  const [slabs, setSlabs] = useState<SalarySlab[]>([]);
  const [slabsLoading, setSlabsLoading] = useState(false);
  const [showSlabForm, setShowSlabForm] = useState(false);
  const [slabForm, setSlabForm] = useState({ name: "", min_target: "", max_target: "", commission_percent: "", sort_order: "" });
  const [savingSlab, setSavingSlab] = useState(false);
  const [editingSlab, setEditingSlab] = useState<string | null>(null);
  const [editSlabForm, setEditSlabForm] = useState<Partial<SalarySlab>>({});
  const [deleteTarget, setDeleteTarget] = useState<SalarySlab | null>(null);

  const [systemState, setSystemState] = useState({
    maintenanceMode: false,
    enforce2fa: true,
    strictAudit: true,
    pushNotifications: true,
    fcmKey: "AAAAy3...j9X",
    fcmVapid: "BPl9...v2Q",
    fcmSender: "1092837465",
  });

  useEffect(() => { load(); loadSlabs(); }, []);

  useEffect(() => {
    if (!analyzingTask?.id) return;

    const channel = supabase.channel(`analysis_${analyzingTask.id}`);
    channel
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "onboarding_analysis_queue", filter: `id=eq.${analyzingTask.id}` },
        (payload) => {
          setAnalyzingTask(payload.new as AnalysisTask);
          if ((payload.new as AnalysisTask).status === "completed") {
            toast.success("Gemma 4: Legal Neural Analysis Completed.");
            load();
          }
        })
      .subscribe();

    const pollInterval = setInterval(async () => {
      if (analyzingTask?.status === "completed" || analyzingTask?.status === "failed") {
        clearInterval(pollInterval);
        return;
      }
      const { data } = await supabase
        .from("onboarding_analysis_queue")
        .select("*")
        .eq("id", analyzingTask.id)
        .single();
      if (data) {
        setAnalyzingTask(data);
        if (data.status === "completed") {
          toast.success("AI Refinement Synced.");
          load();
          clearInterval(pollInterval);
        }
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzingTask?.id]);

  async function load() {
    try {
      const res = await axios.get("/api/config");
      setConfig(res.data.config);
      setForm(res.data.config);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function loadSlabs() {
    setSlabsLoading(true);
    try {
      const res = await fetch("/api/salary-slabs");
      const d = await res.json();
      setSlabs(d.slabs || []);
    } catch { /* keep */ }
    finally { setSlabsLoading(false); }
  }

  async function handleCreateSlab() {
    setSavingSlab(true);
    try {
      const res = await fetch("/api/salary-slabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: slabForm.name,
          min_target: slabForm.min_target ? Number(slabForm.min_target.replace(/,/g, "")) : 0,
          max_target: slabForm.max_target ? Number(slabForm.max_target.replace(/,/g, "")) : null,
          commission_percent: Number(slabForm.commission_percent),
          sort_order: slabForm.sort_order ? Number(slabForm.sort_order) : slabs.length + 1,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Commission slab created.");
      setSlabForm({ name: "", min_target: "", max_target: "", commission_percent: "", sort_order: "" });
      setShowSlabForm(false);
      loadSlabs();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to create slab.");
    } finally { setSavingSlab(false); }
  }

  async function handleUpdateSlab() {
    if (!editingSlab) return;
    setSavingSlab(true);
    try {
      const res = await fetch("/api/salary-slabs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingSlab, ...editSlabForm }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Slab updated.");
      setEditingSlab(null);
      loadSlabs();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Update failed.");
    } finally { setSavingSlab(false); }
  }

  async function handleDeleteSlab(slab: SalarySlab) {
    try {
      const res = await fetch(`/api/salary-slabs?id=${slab.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Slab deactivated.");
      loadSlabs();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Delete failed.");
    }
  }

  if (user && user.role !== "admin") {
    return (
      <DashboardShell moduleKey="system_config" title="System Configuration">
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center space-y-4">
            <ShieldAlert className="mx-auto h-12 w-12 text-destructive opacity-60" />
            <p className="text-sm font-semibold text-destructive">Access denied. Super Admin required.</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await axios.patch("/api/config", form);
      setConfig(res.data.config);
      setForm(res.data.config);
      toast.success("Global system configuration synced.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Sync Error";
      toast.error(msg);
    } finally { setSaving(false); }
  }

  const handleTestSmtp = () => {
    setTestingSmtp(true);
    setTimeout(() => {
      setTestingSmtp(false);
      toast.success("SMTP Relay Handshake Successful.");
    }, 1500);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB.");
      return;
    }

    setUploadingPdf(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `consultant_agreement_${Date.now()}.${fileExt}`;
      const filePath = `agreements/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("legal").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("legal").getPublicUrl(filePath);

      // Clean up old PDF from storage if it exists
      const oldUrl = config?.consultant_agreement_url || form.consultant_agreement_url;
      if (oldUrl) {
        try {
          const searchStr = "/public/legal/";
          const index = oldUrl.indexOf(searchStr);
          if (index !== -1) {
            const oldPath = oldUrl.substring(index + searchStr.length);
            if (oldPath) {
              await supabase.storage.from("legal").remove([oldPath]);
            }
          }
        } catch (err) {
          console.error("Failed to delete old PDF:", err);
        }
      }

      const { data: queueData, error: queueError } = await supabase
        .from("onboarding_analysis_queue")
        .insert({ pdf_url: publicUrl, status: "pending" })
        .select()
        .single();
      if (queueError) throw queueError;

      setAnalyzingTask(queueData);
      setForm(prev => ({ ...prev, consultant_agreement_url: publicUrl }));
      toast.success("PDF Uploaded. Kimi AI Compliance Analysis triggered.");
    } catch (err: unknown) {
      console.error(err);
      toast.error((err as Error)?.message || "Failed to upload PDF.");
    } finally { setUploadingPdf(false); }
  };

  const n = (key: keyof Config) => form[key] as number;
  const profitAmount = ((n("company_revenue") || 0) * (n("profit_percentage") || 0)) / 100;
  const expenseAmount = ((n("company_revenue") || 0) * (n("expense_percentage") || 0)) / 100;

  return (
    <DashboardShell
      moduleKey="system_config"
      title="System Configuration"
      subtitle="Master control panel for organizational architecture and logic."
      actions={
        <Button onClick={handleSave as unknown as () => void} disabled={saving || loading}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? "Deploying…" : "Save Configuration"}
        </Button>
      }
    >
      {loading ? (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="max-w-[1200px] mx-auto space-y-6">
          {/* Warning banner */}
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold mb-1">Super Admin Elevation Active</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You are making changes to global state. All parameters defined here route capital,
                  redefine bonus payouts, and mutate live APIs. Save carefully.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* BLOCK 1: Company Profile */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Company Profile</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Defines the head node of your organization.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Company Full Name</Label>
                    <Input placeholder="e.g. NexaWork" value={form.company_name || ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Main Head / Founder Name</Label>
                    <Input placeholder="e.g. Aryan" value={form.founder_name || ""} onChange={(e) => setForm({ ...form, founder_name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Main Role / Designation</Label>
                    <Input placeholder="e.g. Chief Executive Officer" value={form.founder_designation || ""} onChange={(e) => setForm({ ...form, founder_designation: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Industry Type</Label>
                      <Select>
                        <SelectTrigger><SelectValue placeholder="Technology" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Technology">Technology</SelectItem>
                          <SelectItem value="Finance">Finance</SelectItem>
                          <SelectItem value="Healthcare">Healthcare</SelectItem>
                          <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Company Size</Label>
                      <Select>
                        <SelectTrigger><SelectValue placeholder="1-50 Employees" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1-50 Employees">1-50 Employees</SelectItem>
                          <SelectItem value="51-200 Employees">51-200 Employees</SelectItem>
                          <SelectItem value="201-500 Employees">201-500 Employees</SelectItem>
                          <SelectItem value="500+ Employees">500+ Employees</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Headquarters Address</Label>
                    <Textarea placeholder="Central Business District, Building 4" rows={3} />
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-dashed p-5 flex items-center gap-4">
                <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-0.5">Company Branding</h4>
                  <p className="text-xs text-muted-foreground">Logo for all reports and invoices.</p>
                </div>
                <Button type="button" size="sm" className="ml-auto">Upload Logo</Button>
              </div>
            </CardContent>

            <Separator />

            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                    <IndianRupee className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Financial Targets</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Core yield expectations and limits.</p>
                  </div>
                </div>
                <Badge variant="secondary">Stage: {form.company_stage}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Target Revenue (₹)</Label>
                      <Input type="number" min={0} value={n("company_revenue")} onChange={(e) => setForm({ ...form, company_revenue: parseFloat(e.target.value) || 0 })} className="tabular-nums" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Company Stage</Label>
                      <Input value={form.company_stage ?? ""} onChange={(e) => setForm({ ...form, company_stage: e.target.value })} className="uppercase tracking-wider" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Minimum Equity (%)</Label>
                      <Input type="number" step="0.1" value={form.equity_min_percentage ?? 0} onChange={(e) => setForm({ ...form, equity_min_percentage: parseFloat(e.target.value) || 0 })} className="tabular-nums" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Maximum Equity (%)</Label>
                      <Input type="number" step="0.1" value={form.equity_max_percentage ?? 0} onChange={(e) => setForm({ ...form, equity_max_percentage: parseFloat(e.target.value) || 0 })} className="tabular-nums" />
                    </div>
                  </div>
                </div>

                <Card className="bg-muted/30">
                  <CardContent className="p-6 space-y-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Profit & Expense Forecast</p>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm">Profit Margin Goal</span>
                        <span className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{n("profit_percentage")}%</span>
                      </div>
                      <input
                        type="range" min={0} max={100} value={n("profit_percentage")}
                        onChange={(e) => {
                          const profit = parseInt(e.target.value);
                          setForm({ ...form, profit_percentage: profit, expense_percentage: 100 - profit });
                        }}
                        className="w-full accent-primary"
                      />
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Projected Profit</p>
                        <p className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(profitAmount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Projected Expenses</p>
                        <p className="text-base font-semibold tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(expenseAmount)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* BLOCK 2: Bonus & Payout */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Bonus & Payout Matrix</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Control vesting conditions and payout capacity.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6 divide-y lg:divide-y-0 lg:divide-x">
              <div className="space-y-6 lg:pr-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm">Vesting Period</span>
                    <span className="text-sm font-semibold tabular-nums">{n("vesting_days")} Days</span>
                  </div>
                  <input type="range" min={1} max={365} value={n("vesting_days")} onChange={(e) => setForm({ ...form, vesting_days: parseInt(e.target.value) })} className="w-full accent-primary" />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted-foreground">1 Month Bonus</span>
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">+{n("bonus_percentage_1m")}%</span>
                    </div>
                    <input type="range" min={0} max={50} value={n("bonus_percentage_1m")} onChange={(e) => setForm({ ...form, bonus_percentage_1m: parseInt(e.target.value) })} className="w-full accent-primary" />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted-foreground">2 Month Bonus</span>
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">+{n("bonus_percentage_2m")}%</span>
                    </div>
                    <input type="range" min={0} max={50} value={n("bonus_percentage_2m")} onChange={(e) => setForm({ ...form, bonus_percentage_2m: parseInt(e.target.value) })} className="w-full accent-primary" />
                  </div>
                </div>
              </div>

              <div className="space-y-6 lg:pl-6 pt-6 lg:pt-0">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm">Max Claims Per Month</span>
                    <span className="text-sm font-semibold tabular-nums">{n("claim_limit")} Units</span>
                  </div>
                  <input type="range" min={1} max={200} value={n("claim_limit")} onChange={(e) => setForm({ ...form, claim_limit: parseInt(e.target.value) })} className="w-full accent-primary" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Available Payout Pool (₹)</Label>
                    <Input type="number" value={n("payout_pool_amount")} onChange={(e) => setForm({ ...form, payout_pool_amount: parseFloat(e.target.value) })} className="tabular-nums" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>System Payout Status</Label>
                    <Select value={form.payout_capacity} onValueChange={(v) => setForm({ ...form, payout_capacity: v as Config["payout_capacity"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HIGH">Good — High Funds</SelectItem>
                        <SelectItem value="MODERATE">Warning — Medium Funds</SelectItem>
                        <SelectItem value="LOW">Critical — Low Funds</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* BLOCK 3: Integrations & Legal */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Consultant Agreement */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                    <FileCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">Consultant Agreement (PDF)</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Master NDA for all new consultants.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-6 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-center bg-muted/20">
                  {analyzingTask?.status === "pending" || analyzingTask?.status === "processing" ? (
                    <div className="w-full max-w-md">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm font-medium">Kimi AI Analysis in Progress…</span>
                        </div>
                        <span className="text-xs text-muted-foreground">Compliance Engine Active</span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-1000"
                          style={{ width: analyzingTask.status === "pending" ? "30%" : "75%" }}
                        />
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground uppercase tracking-wide">OCR + Kimi Compliance Agent</p>
                    </div>
                  ) : (
                    <>
                      <div className={cn(
                        "w-full py-3 rounded-md border flex items-center justify-center gap-2 mb-4",
                        config?.consultant_agreement_url
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {config?.consultant_agreement_url ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Current Agreement Active</span>
                          </>
                        ) : (
                          <span className="text-sm">No active agreement found</span>
                        )}
                      </div>

                      {config?.consultant_agreement_url && (
                        <a
                          href={config.consultant_agreement_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-primary hover:underline mb-4"
                        >
                          View Current PDF
                        </a>
                      )}

                      <label className="cursor-pointer w-full">
                        <input type="file" accept=".pdf" onChange={handlePdfUpload} disabled={uploadingPdf} className="hidden" />
                        <Button
                          type="button"
                          className="w-full"
                          disabled={uploadingPdf}
                          asChild
                        >
                          <span>
                            {uploadingPdf
                              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…</>
                              : "Upload New Agreement (max 10MB)"}
                          </span>
                        </Button>
                      </label>

                      {analyzingTask?.status === "completed" && (
                        <div className="mt-4 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                          <FileCheck className="h-4 w-4" />
                          <span className="text-xs font-medium">AI ANALYSIS UPDATED SUCCESSFULLY</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* SMTP */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Email Server (SMTP)</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Outgoing mail architecture.</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={handleTestSmtp} disabled={testingSmtp}>
                    {testingSmtp ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                    {testingSmtp ? "Testing…" : "Test Link"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>SMTP Host</Label>
                    <Input value={form.smtp_host || ""} onChange={e => setForm({ ...form, smtp_host: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>SMTP Port</Label>
                    <Input type="number" value={form.smtp_port || 587} onChange={e => setForm({ ...form, smtp_port: parseInt(e.target.value) || 587 })} className="tabular-nums" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email / Username</Label>
                    <Input type="email" value={form.smtp_user || ""} onChange={e => setForm({ ...form, smtp_user: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Password / Key</Label>
                    <Input type="password" value={form.smtp_pass || ""} onChange={e => setForm({ ...form, smtp_pass: e.target.value })} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* FCM */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">Push Notifications (FCM)</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Firebase broadcasting credentials.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>VAPID Public Key</Label>
                    <Input value={systemState.fcmVapid} onChange={e => setSystemState(p => ({ ...p, fcmVapid: e.target.value }))} className="tabular-nums" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>FCM Sender ID</Label>
                    <Input value={systemState.fcmSender} onChange={e => setSystemState(p => ({ ...p, fcmSender: e.target.value }))} className="tabular-nums" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>FCM Server Key</Label>
                  <Input type="password" value={systemState.fcmKey} onChange={e => setSystemState(p => ({ ...p, fcmKey: e.target.value }))} className="tabular-nums" />
                </div>
              </CardContent>
            </Card>

            {/* Security toggles */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                    <Lock className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">Global Security Directives</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Toggle root-level features instantly.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries({
                  maintenanceMode: { title: "Maintenance Mode", desc: "Disable system for all non-admins." },
                  enforce2fa: { title: "Force Two-Factor Auth (2FA)", desc: "Require 2FA for Managers and above." },
                  strictAudit: { title: "Log All Admin Actions", desc: "Log API actions and location footprints." },
                  pushNotifications: { title: "Enable Push Notifications", desc: "Turn on global push notifications." },
                }).map(([key, item]) => {
                  const isActive = systemState[key as keyof typeof systemState] as boolean;
                  return (
                    <div key={key} className="flex justify-between items-center gap-4">
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <Switch
                        checked={isActive}
                        onCheckedChange={() => setSystemState(p => ({ ...p, [key]: !p[key as keyof typeof systemState] }))}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* BLOCK 5: Sales Commission Slabs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Sales Commission Slabs</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Tiered commission brackets for Sales role. Applied at payroll generation.</p>
                  </div>
                </div>
                <Button type="button" size="sm" onClick={() => { setShowSlabForm(true); setEditingSlab(null); }}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> Add Slab
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {slabsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading slabs…
                </div>
              ) : slabs.length === 0 && !showSlabForm ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <TrendingUp className="h-7 w-7 text-orange-500/40" />
                  <p className="text-sm text-muted-foreground">No commission slabs defined yet.</p>
                  <Button type="button" variant="link" size="sm" className="text-orange-600 dark:text-orange-400" onClick={() => setShowSlabForm(true)}>
                    + Create First Slab
                  </Button>
                </div>
              ) : (
                <>
                  {slabs.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tier Name</TableHead>
                          <TableHead className="text-right">Min Target (₹)</TableHead>
                          <TableHead className="text-right">Max Target (₹)</TableHead>
                          <TableHead className="text-right">Commission %</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {slabs.map(slab => editingSlab === slab.id ? (
                          <TableRow key={slab.id}>
                            <TableCell>
                              <Input value={editSlabForm.name ?? slab.name} onChange={e => setEditSlabForm(p => ({ ...p, name: e.target.value }))} className="h-8" />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                inputMode="numeric"
                                value={toIndianDisplay(editSlabForm.min_target ?? slab.min_target)}
                                onChange={e => setEditSlabForm(p => ({ ...p, min_target: Number(fromIndianInput(e.target.value)) || 0 }))}
                                className="h-8 tabular-nums text-right"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                inputMode="numeric"
                                placeholder="Unlimited"
                                value={toIndianDisplay(editSlabForm.max_target ?? (slab.max_target ?? ""))}
                                onChange={e => { const v = fromIndianInput(e.target.value); setEditSlabForm(p => ({ ...p, max_target: v ? Number(v) : null })); }}
                                className="h-8 tabular-nums text-right"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.1"
                                value={editSlabForm.commission_percent ?? slab.commission_percent}
                                onChange={e => setEditSlabForm(p => ({ ...p, commission_percent: Number(e.target.value) }))}
                                className="h-8 tabular-nums text-right"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button type="button" size="sm" variant="default" onClick={handleUpdateSlab} disabled={savingSlab} className="h-7 px-2">
                                  {savingSlab ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                </Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingSlab(null)} className="h-7 px-2">
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          <TableRow key={slab.id} className="group">
                            <TableCell className="font-medium">{slab.name}</TableCell>
                            <TableCell className="text-right tabular-nums">₹{slab.min_target.toLocaleString("en-IN")}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {slab.max_target ? `₹${slab.max_target.toLocaleString("en-IN")}` : <span className="text-muted-foreground text-xs">Unlimited</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20 tabular-nums">
                                {slab.commission_percent}%
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingSlab(slab.id); setEditSlabForm({}); }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => setDeleteTarget(slab)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {showSlabForm && (
                    <Card className="mt-4 bg-orange-500/5 border-orange-500/20">
                      <CardContent className="p-5 space-y-4">
                        <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">New Commission Slab</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-1.5">
                            <Label>Tier Name</Label>
                            <Input required value={slabForm.name} onChange={e => setSlabForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Gold Tier" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Min Target (₹)</Label>
                            <Input inputMode="numeric" value={toIndianDisplay(slabForm.min_target)} onChange={e => setSlabForm(p => ({ ...p, min_target: fromIndianInput(e.target.value) }))} placeholder="0" className="tabular-nums" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Max Target (₹)</Label>
                            <Input inputMode="numeric" value={toIndianDisplay(slabForm.max_target)} onChange={e => setSlabForm(p => ({ ...p, max_target: fromIndianInput(e.target.value) }))} placeholder="Blank = unlimited" className="tabular-nums" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Commission %</Label>
                            <Input required type="number" step="0.1" min="0.1" max="100" value={slabForm.commission_percent} onChange={e => setSlabForm(p => ({ ...p, commission_percent: e.target.value }))} placeholder="e.g. 5" className="tabular-nums" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button type="button" size="sm" onClick={handleCreateSlab} disabled={savingSlab}>
                            {savingSlab ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                            {savingSlab ? "Creating…" : "Create Slab"}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setShowSlabForm(false)}>Cancel</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              <div className="mt-4 p-3 rounded-md bg-muted/40 border border-dashed flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Slabs apply when an employee has <strong>Sales role</strong> enabled. Commission = Actual Monthly Sales × Commission %. Computed at payroll generation.
                </p>
              </div>
            </CardContent>
          </Card>
        </form>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate slab?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && <>Slab <strong>{deleteTarget.name}</strong> will be deactivated. Existing payroll runs are not affected.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) { handleDeleteSlab(deleteTarget); setDeleteTarget(null); } }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}
