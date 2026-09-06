"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileSignature, Plus, Settings, Search, Loader2, Trash2,
  Clock, CheckCircle2, Send, PenTool, Users, ChevronRight, UserPlus, Briefcase,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CandidateAvatar } from "@/components/onboarding/CandidateAvatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { STATUS_META, type OnboardingStatus } from "@/lib/onboarding/types";
import { OnboardingSettingsPanel } from "@/components/onboarding/SettingsPanel";

interface PacketRow {
  id: string;
  application_id: string | null;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  status: OnboardingStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  creator?: { name?: string; email?: string } | null;
}

// Hover card showing the full status history (with timestamps) for a packet row.
function StatusHistory({ p }: { p: PacketRow }) {
  const stages = [
    { label: "Created", at: p.created_at },
    { label: "Submitted", at: p.submitted_at },
    { label: "Approved", at: p.approved_at },
    { label: "Sent", at: p.sent_at },
    { label: "Viewed", at: p.viewed_at },
    { label: "Signed", at: p.signed_at },
    { label: "Completed", at: p.status === "completed" ? p.updated_at : null },
  ];
  return (
    <div className="text-left">
      <p className="text-[10px] font-bold uppercase tracking-wide text-background/60 mb-2">Status history</p>
      <div className="space-y-1.5">
        {stages.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-4">
            <span className={cn("flex items-center gap-1.5 text-[11px]", s.at ? "text-background font-medium" : "text-background/40")}>
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", s.at ? "bg-emerald-400" : "bg-background/30")} />
              {s.label}
            </span>
            <span className="text-[10px] text-background/60 tabular-nums">{s.at ? new Date(s.at).toLocaleString() : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface EligibleCandidate {
  key: string;
  source: "interview" | "converted";
  application_id?: string;
  name: string;
  email: string;
  phone?: string | null;
  badge: string;
}

interface ClaimedRow {
  application_id: string | null;
  candidate_email: string;
  status: string;
  creator?: { name?: string; employee_id?: string } | null;
}


const FILTERS: { key: string; label: string; match: (s: OnboardingStatus) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "draft", label: "Drafts", match: (s) => s === "draft" || s === "changes_requested" },
  { key: "pending", label: "Pending", match: (s) => s === "pending_approval" },
  { key: "sent", label: "Sent / Viewed", match: (s) => s === "approved" || s === "sent" || s === "viewed" },
  { key: "signed", label: "Signed", match: (s) => s === "signed" || s === "completed" },
];

export default function OnboardingHubPage() {
  const { user, permissions } = useAuth();
  const router = useRouter();
  const canCreate = permissions?.onboarding?.can_create ?? false;
  const isAdmin = user?.role === "admin";
  // Manual Entry is admin-only by default; admins can grant it to a role in /admin/permissions.
  const canManual = isAdmin || (permissions?.onboarding_manual?.can_view ?? false);

  const [packets, setPackets] = useState<PacketRow[]>([]);
  const [claimed, setClaimed] = useState<ClaimedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);

  // New-onboarding picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"interview" | "manual">("interview");
  const [eligible, setEligible] = useState<EligibleCandidate[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  // Manual entry form
  const emptyManual = { candidate_name: "", candidate_email: "", candidate_phone: "", candidate_address: "" };
  const [manual, setManual] = useState(emptyManual);
  const [creatingManual, setCreatingManual] = useState(false);

  // Workspace-wide: candidates that already have an onboarding packet — keyed by
  // application id + email, mapped to who claimed them. Drives picker disabling
  // for EVERY role (not just the current user's own packets).
  const claimedIndex = useMemo(() => {
    const byApp = new Map<string, ClaimedRow["creator"]>();
    const byEmail = new Map<string, ClaimedRow["creator"]>();
    for (const c of claimed) {
      if (c.application_id) byApp.set(c.application_id, c.creator);
      if (c.candidate_email) byEmail.set(c.candidate_email.toLowerCase(), c.creator);
    }
    return { byApp, byEmail };
  }, [claimed]);

  const fetchPackets = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding");
      if (res.ok) {
        const json = await res.json();
        setPackets(json.packets ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const fetchClaimed = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/claimed");
      if (res.ok) {
        const json = await res.json();
        setClaimed(json.claimed ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPackets();
    fetchClaimed();
    const channel = supabase
      .channel("onboarding-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "onboarding_packets" }, () => { fetchPackets(); fetchClaimed(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPackets, fetchClaimed]);

  async function openPicker() {
    setPickerOpen(true);
    setPickerMode("interview");
    setManual(emptyManual);
    setPickerLoading(true);
    // Prefetch the onboarding detail page bundle so navigation is instant once we have the ID.
    if (packets.length > 0) router.prefetch(`/admin/onboarding/${packets[0].id}`);
    try {
      const [appsRes, convRes] = await Promise.all([
        supabase
          .from("applications")
          .select("application_id, applicant_name, applicant_email, applied_cluster_id")
          .eq("decision", "accepted")
          .order("created_at", { ascending: false }),
        supabase
          .from("candidate_document_requests")
          .select("id, candidate_name, candidate_email, candidate_phone, converted_to_onboard")
          .eq("converted_to_onboard", true)
          .order("created_at", { ascending: false }),
      ]);
      const apps: EligibleCandidate[] = (appsRes.data ?? []).map((a: any) => ({
        key: a.application_id,
        source: "interview",
        application_id: a.application_id,
        name: a.applicant_name,
        email: a.applicant_email,
        phone: null,
        badge: (a.applied_cluster_id || "").replace(/-/g, " ").toLowerCase() || "interview",
      }));
      const seen = new Set(apps.map((a) => (a.email || "").toLowerCase()));
      const converted: EligibleCandidate[] = (convRes.data ?? [])
        .filter((r: any) => !seen.has((r.candidate_email || "").toLowerCase()))
        .map((r: any) => ({
          key: "req:" + r.id,
          source: "converted",
          name: r.candidate_name,
          email: r.candidate_email,
          phone: r.candidate_phone ?? null,
          badge: "documents ✓",
        }));
      setEligible([...converted, ...apps]);
    } catch {
      toast.error("Failed to load candidates");
    } finally {
      setPickerLoading(false);
    }
  }

  async function startManual() {
    if (!manual.candidate_name.trim()) return toast.error("Candidate name is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual.candidate_email.trim())) return toast.error("A valid candidate email is required");
    setCreatingManual(true);
    setPickerOpen(false); // close immediately
    const tid = toast.loading(`Creating onboarding for ${manual.candidate_name.trim()}…`);
    try {
      const res = await fetch("/api/onboarding/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manual),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.dismiss(tid);
      router.push(`/admin/onboarding/${json.id}`);
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e.message || "Failed to create onboarding");
      setPickerOpen(true); // re-open on error
    } finally {
      setCreatingManual(false);
    }
  }

  async function startOnboarding(c: EligibleCandidate) {
    setCreatingFor(c.key);
    setPickerOpen(false); // close immediately — no waiting on the modal
    const tid = toast.loading(`Creating onboarding for ${c.name}…`);
    try {
      const res =
        c.source === "interview" && c.application_id
          ? await fetch("/api/onboarding/push", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ application_id: c.application_id }),
            })
          : await fetch("/api/onboarding/manual", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                candidate_name: c.name,
                candidate_email: c.email,
                candidate_phone: c.phone || "",
                candidate_address: "",
              }),
            });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.dismiss(tid);
      router.push(`/admin/onboarding/${json.id}`);
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e.message || "Failed to start onboarding");
      setPickerOpen(true); // re-open so user can retry
    } finally {
      setCreatingFor(null);
    }
  }

  async function deletePacket(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this onboarding draft?")) return;
    try {
      const res = await fetch(`/api/onboarding/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success("Deleted");
      fetchPackets();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  }

  const filtered = packets.filter((p) => {
    const f = FILTERS.find((x) => x.key === filter)!;
    if (!f.match(p.status)) return false;
    const q = search.toLowerCase();
    return !q || p.candidate_name.toLowerCase().includes(q) || p.candidate_email.toLowerCase().includes(q);
  });

  const stats = [
    { label: "In progress", value: packets.filter((p) => ["draft", "changes_requested"].includes(p.status)).length, icon: PenTool, color: "text-zinc-500" },
    { label: "Pending approval", value: packets.filter((p) => p.status === "pending_approval").length, icon: Clock, color: "text-amber-500" },
    { label: "Sent", value: packets.filter((p) => ["approved", "sent", "viewed"].includes(p.status)).length, icon: Send, color: "text-violet-500" },
    { label: "Signed", value: packets.filter((p) => ["signed", "completed"].includes(p.status)).length, icon: CheckCircle2, color: "text-emerald-500" },
  ];

  return (
    <DashboardShell
      moduleKey="onboarding"
      title="Onboarding"
      subtitle="Offer letter builder, approval workflow & e-signature dispatch"
      actions={
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant={showSettings ? "default" : "outline"}
              size="sm"
              onClick={() => setShowSettings((v) => !v)}
            >
              <Settings size={13} /> Settings
            </Button>
          )}
          {canCreate && !showSettings && (
            <Button size="sm" onClick={openPicker}>
              <Plus size={13} /> New Onboarding
            </Button>
          )}
        </div>
      }
    >
      {showSettings ? (
        <OnboardingSettingsPanel onBack={() => setShowSettings(false)} />
      ) : (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loading
              ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)
              : stats.map((s, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={cn("p-2 rounded-lg bg-muted", s.color)}>
                        <s.icon size={18} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-lg font-bold text-foreground tabular-nums">{s.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
          </div>

          {/* Filters + search */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    filter === f.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input
                placeholder="Search candidates…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[68px] rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-center rounded-xl border border-dashed border-border bg-card">
              <FileSignature size={30} className="text-muted-foreground opacity-40" />
              <p className="text-sm font-medium text-foreground">No onboarding records</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Start an onboarding for an accepted candidate, or push one from the Interviews page.
              </p>
              {canCreate && (
                <Button size="sm" variant="outline" className="mt-2" onClick={openPicker}>
                  <Plus size={13} /> New Onboarding
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const meta = STATUS_META[p.status];
                return (
                  <Card
                    key={p.id}
                    onClick={() => router.push(`/admin/onboarding/${p.id}`)}
                    className="p-0 cursor-pointer transition-colors hover:border-primary/40"
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <CandidateAvatar
                        email={p.candidate_email}
                        name={p.candidate_name}
                        className="h-9 w-9"
                        fallbackClassName="text-[11px] font-semibold"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{p.candidate_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.candidate_email}</p>
                      </div>
                      <div className="hidden md:block text-right">
                        <p className="text-[11px] text-muted-foreground">Created by</p>
                        <p className="text-xs font-medium text-foreground truncate max-w-[140px]">{p.creator?.name ?? "—"}</p>
                      </div>
                      <div className="hidden sm:block text-right min-w-[88px]">
                        <p className="text-[11px] text-muted-foreground">Updated</p>
                        <p className="text-xs font-medium text-foreground">{new Date(p.updated_at).toLocaleDateString()}</p>
                      </div>
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="shrink-0 cursor-help" onClick={(e) => e.stopPropagation()}>
                              <Badge variant="secondary" className={cn("text-[10px] font-medium border", meta.className)}>
                                {meta.label}
                              </Badge>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" align="end" className="w-60 flex-col items-stretch gap-0 p-3">
                            <StatusHistory p={p} />
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {["draft", "changes_requested"].includes(p.status) && (
                        <button
                          onClick={(e) => deletePacket(p.id, e)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                          title="Delete draft"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* New onboarding — From Interview (pipeline) or Manual entry */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature size={18} className="text-primary" /> Start New Onboarding
            </DialogTitle>
            <DialogDescription>
              {canManual
                ? "Pick an accepted candidate from the interview pipeline, or enter a candidate manually."
                : "Pick an accepted candidate from the interview pipeline."}
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle — Manual Entry only when permitted */}
          {canManual && (
            <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-1">
              <button
                onClick={() => setPickerMode("interview")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
                  pickerMode === "interview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Briefcase size={14} /> From Interview
              </button>
              <button
                onClick={() => setPickerMode("manual")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
                  pickerMode === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <UserPlus size={14} /> Manual Entry
              </button>
            </div>
          )}

          {pickerMode === "interview" || !canManual ? (
            <div className="max-h-[400px] overflow-y-auto -mx-1 px-1 space-y-2">
              {pickerLoading ? (
                [...Array(4)].map((_, i) => <Skeleton key={i} className="h-[60px] rounded-lg" />)
              ) : eligible.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No accepted candidates in the workspace pipeline yet.
                  <br />
                  <span className="text-xs">Use <strong>Manual Entry</strong> for candidates interviewed on other platforms.</span>
                </div>
              ) : (
                eligible.map((c) => {
                  const already =
                    (!!c.application_id && claimedIndex.byApp.has(c.application_id)) ||
                    claimedIndex.byEmail.has(c.email.toLowerCase());
                  const claimer =
                    (c.application_id ? claimedIndex.byApp.get(c.application_id) : undefined) ||
                    claimedIndex.byEmail.get(c.email.toLowerCase());
                  return (
                    <button
                      key={c.key}
                      disabled={!!creatingFor || already}
                      onClick={() => startOnboarding(c)}
                      title={already ? "Already in onboarding" : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors disabled:opacity-60",
                        already ? "cursor-not-allowed" : "hover:border-primary/40"
                      )}
                    >
                      <CandidateAvatar
                        email={c.email}
                        name={c.name}
                        className="h-8 w-8"
                        fallbackClassName="text-[10px] font-semibold"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                        {already && (
                          <p className="text-[10px] text-emerald-600 truncate">
                            Onboarded by {claimer?.name || "a team member"}{claimer?.employee_id ? ` · ${claimer.employee_id}` : ""}
                          </p>
                        )}
                      </div>
                      {creatingFor === c.key ? (
                        <Loader2 size={15} className="animate-spin text-primary" />
                      ) : already ? (
                        <Badge variant="secondary" className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <CheckCircle2 size={10} /> Added
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {c.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Full Name <span className="text-rose-500">*</span></Label>
                  <Input
                    value={manual.candidate_name}
                    onChange={(e) => setManual({ ...manual, candidate_name: e.target.value })}
                    placeholder="e.g. Aditya Sharma"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Email <span className="text-rose-500">*</span></Label>
                  <Input
                    type="email"
                    value={manual.candidate_email}
                    onChange={(e) => setManual({ ...manual, candidate_email: e.target.value })}
                    placeholder="candidate@example.com"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    value={manual.candidate_phone}
                    onChange={(e) => setManual({ ...manual, candidate_phone: e.target.value })}
                    placeholder="Optional"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <Input
                    value={manual.candidate_address}
                    onChange={(e) => setManual({ ...manual, candidate_address: e.target.value })}
                    placeholder="Optional"
                    className="text-sm"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                For candidates interviewed outside this workspace. You can refine all details in the builder before submitting.
              </p>
              <Button className="w-full" onClick={startManual} disabled={creatingManual}>
                {creatingManual ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create Onboarding
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
