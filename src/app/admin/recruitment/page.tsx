"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import {
  Users, Search, Briefcase, Mail, Phone,
  CheckCircle2, XCircle, Clock,
  Zap, Plus,
  BrainCircuit, Star,
  Loader2, Sparkles, ShieldCheck, AlertCircle, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Candidate {
  id: string;
  application_id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: "pending" | "processing" | "completed" | "failed";
  decision: "pending" | "accepted" | "rejected";
  score: number;
  appliedDate: string;
  cluster_id: string;
  analysis?: {
    summary: string;
    education_match: string;
    pros: string[];
    cons: string[];
    questions: string[];
  };
}

const defaultJobForm = {
  company: "NexaWork",
  job_title_variants: "",
  mandatory_skills: {},
  preferred_skills: {},
  domain_knowledge: {},
  experience_requirements: {},
  match_weights: { resume: 40, skills: 30, experience: 30 },
  gemma_keywords: "",
};

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function decisionVariant(decision: Candidate["decision"]) {
  if (decision === "accepted") return "bg-emerald-500 hover:bg-emerald-500/90 text-white";
  if (decision === "rejected") return "bg-rose-500 hover:bg-rose-500/90 text-white";
  return "";
}

export default function RecruitmentHubPage() {
  const { permissions } = useAuth();
  const canCreate = permissions?.recruitment?.can_create ?? false;

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [postJobOpen, setPostJobOpen] = useState(false);
  const [jobForm, setJobForm] = useState(defaultJobForm);
  const [savingJob, setSavingJob] = useState(false);

  useEffect(() => {
    fetchCandidates();
    const channel = supabase
      .channel("recruitment-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, fetchCandidates)
      .on("postgres_changes", { event: "*", schema: "public", table: "talent_analysis" }, fetchCandidates)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchCandidates() {
    try {
      const { data, error } = await supabase
        .from("applications")
        .select(`*, talent_analysis(scoring, resume_profile, recommendations, gap_analysis, interview_questions)`)
        .order("created_at", { ascending: false });
      if (error) throw error;

      setCandidates((data || []).map((app: any) => ({
        id: app.id.toString(),
        application_id: app.application_id,
        name: app.applicant_name,
        email: app.applicant_email,
        phone: app.applicant_phone,
        role: app.applied_cluster_id.replace(/-/g, " "),
        status: app.processing_status,
        decision: app.decision,
        score: app.talent_analysis?.[0]?.scoring?.match_score || 0,
        appliedDate: new Date(app.created_at).toLocaleDateString(),
        cluster_id: app.applied_cluster_id,
        analysis: app.talent_analysis?.[0] ? {
          summary: app.talent_analysis[0].resume_profile?.summary || "",
          education_match: app.talent_analysis[0].resume_profile?.education_match || "",
          pros: app.talent_analysis[0].recommendations?.pros || [],
          cons: app.talent_analysis[0].gap_analysis?.cons || [],
          questions: app.talent_analysis[0].interview_questions || [],
        } : undefined,
      })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(id: string, decision: Candidate["decision"]) {
    try {
      const { error } = await supabase.from("applications").update({ decision }).eq("id", id);
      if (error) throw error;

      toast.success(`Decision updated to ${decision}`);

      if (decision === 'accepted') {
        const candidate = candidates.find(c => c.id === id);
        if (candidate) {
          toast.info("Initializing automated onboarding…");
          const res = await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: candidate.name,
              email: candidate.email,
              role: 'employee',
              department: 'General',
              joining_date: new Date().toISOString(),
            }),
          });
          if (res.ok) {
            toast.success("Employee record created and synced.");
          } else {
            const errJson = await res.json();
            toast.warning(`Sync warning: ${errJson.error || 'Check Admin panel'}`);
          }
        }
      }

      fetchCandidates();
      setSelected(prev => prev?.id === id ? { ...prev, decision } : prev);
    } catch {
      toast.error("Failed to update decision");
    }
  }

  async function handlePostJob(e: React.FormEvent) {
    e.preventDefault();
    setSavingJob(true);
    try {
      const payload = {
        ...jobForm,
        job_title_variants: jobForm.job_title_variants.split(",").map(s => s.trim()).filter(Boolean),
        gemma_keywords: jobForm.gemma_keywords.split(",").map(s => s.trim()).filter(Boolean),
      };
      const { error } = await supabase.from("job_clusters").insert(payload);
      if (error) throw error;
      toast.success("Job posted successfully");
      setPostJobOpen(false);
      setJobForm(defaultJobForm);
    } catch (err: any) {
      toast.error(err.message || "Failed to post job");
    } finally {
      setSavingJob(false);
    }
  }

  async function triggerScan(appId: string) {
    try {
      await supabase.from("applications").update({ processing_status: "pending" }).eq("application_id", appId);
      toast.info("Scan triggered");
    } catch {
      toast.error("Failed to trigger scan");
    }
  }

  const filtered = candidates.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.role.toLowerCase().includes(search.toLowerCase())
  );

  const avgScore = candidates.length > 0
    ? Math.round(candidates.reduce((a, b) => a + b.score, 0) / candidates.length)
    : 0;

  const stats = [
    { label: "Total pipeline", value: candidates.length, icon: Users, color: "text-sky-500" },
    { label: "Avg match score", value: `${avgScore}%`, icon: Star, color: "text-amber-500" },
    { label: "Pending scan", value: candidates.filter(c => c.status === 'pending').length, icon: Clock, color: "text-zinc-500" },
    { label: "Hired today", value: candidates.filter(c => c.decision === 'accepted').length, icon: CheckCircle2, color: "text-emerald-500" },
  ];

  return (
    <DashboardShell
      moduleKey="recruitment"
      title="Recruitment Hub"
      subtitle="Candidate pipeline and hiring decisions"
      actions={
        canCreate ? (
          <Button onClick={() => { setJobForm(defaultJobForm); setPostJobOpen(true); }} size="sm">
            <Plus size={13} /> Post New Job
          </Button>
        ) : null
      }
    >
      <div className="space-y-5">
        {/* Summary stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        <div className="grid lg:grid-cols-12 gap-6">
          {/* List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input
                type="text"
                placeholder="Filter candidates…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {loading ? (
                [...Array(5)].map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center rounded-xl border border-dashed border-border bg-card">
                  <Users size={28} className="text-muted-foreground opacity-40" />
                  <p className="text-sm font-medium text-foreground">No candidates</p>
                  <p className="text-xs text-muted-foreground">Applications will appear here.</p>
                </div>
              ) : (
                filtered.map((c) => (
                  <Card
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={cn(
                      "p-0 cursor-pointer transition-colors hover:border-primary/40",
                      selected?.id === c.id && "border-primary ring-1 ring-primary/20 bg-primary/5"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-[10px] font-semibold">{initials(c.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                            <p className="text-xs text-muted-foreground capitalize truncate">{c.role}</p>
                          </div>
                        </div>
                        <Badge
                          variant={c.decision === "pending" ? "secondary" : "default"}
                          className={cn("capitalize flex-shrink-0", decisionVariant(c.decision))}
                        >
                          {c.decision}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Progress value={c.score} className="h-1.5 flex-1" />
                          <span className="text-xs font-semibold text-foreground tabular-nums">{c.score}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground flex-shrink-0">{c.appliedDate}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Detail */}
          <div className="lg:col-span-8">
            {selected ? (
              <Card className="min-h-[600px] flex flex-col p-0 overflow-hidden">
                <div className="p-6 border-b border-border bg-muted/30">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="flex gap-4">
                      <Avatar className="h-14 w-14 rounded-xl">
                        <AvatarFallback className="rounded-xl text-lg font-semibold text-primary">{initials(selected.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <h2 className="text-xl font-bold text-foreground">{selected.name}</h2>
                        <p className="text-sm text-muted-foreground capitalize flex items-center gap-1.5 mt-0.5">
                          <Briefcase size={13} /> {selected.role}
                        </p>
                        <div className="flex flex-wrap gap-3 mt-2">
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail size={11} /> {selected.email}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone size={11} /> {selected.phone}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant={selected.decision === "accepted" ? "default" : "outline"}
                        className={selected.decision === "accepted" ? "bg-emerald-500 hover:bg-emerald-500/90" : ""}
                        onClick={() => handleDecision(selected.id, 'accepted')}
                      >
                        <CheckCircle2 size={14} /> Hire
                      </Button>
                      <Button
                        size="sm"
                        variant={selected.decision === "rejected" ? "destructive" : "outline"}
                        onClick={() => handleDecision(selected.id, 'rejected')}
                      >
                        <XCircle size={14} /> Reject
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  {selected.analysis ? (
                    <>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <BrainCircuit className="text-primary" size={18} />
                          <h3 className="text-sm font-semibold text-foreground">AI Profile Summary</h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed bg-muted/40 p-4 rounded-lg border border-border">
                          {selected.analysis.summary}
                        </p>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-emerald-600 flex items-center gap-2">
                            <Sparkles size={13} /> Key Strengths
                          </p>
                          <div className="space-y-2">
                            {selected.analysis.pros.map((p, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-foreground bg-emerald-500/5 p-2.5 rounded-md border border-emerald-500/20">
                                <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                                <span>{p}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-rose-600 flex items-center gap-2">
                            <Zap size={13} /> Gap Analysis
                          </p>
                          <div className="space-y-2">
                            {selected.analysis.cons.map((c, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-foreground bg-rose-500/5 p-2.5 rounded-md border border-rose-500/20">
                                <AlertCircle size={13} className="text-rose-500 mt-0.5 shrink-0" />
                                <span>{c}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="text-sky-500" size={18} />
                          <h3 className="text-sm font-semibold text-foreground">Recommended Interview Questions</h3>
                        </div>
                        <div className="grid gap-3">
                          {selected.analysis.questions.map((q: any, i: number) => (
                            <div key={i} className="p-4 rounded-lg bg-muted/40 border border-border">
                              <p className="text-sm font-medium text-foreground mb-1">Q{i + 1}: {q.question || q}</p>
                              {q.reason && <p className="text-xs text-muted-foreground italic">Focus: {q.reason}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                      {selected.status === 'processing' || selected.status === 'pending' ? (
                        <>
                          <Loader2 className="h-10 w-10 animate-spin text-primary" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">Neural Analysis in Progress</p>
                            <p className="text-xs text-muted-foreground mt-1">Gemma-4 engine is auditing the resume…</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center border border-border">
                            <BrainCircuit size={30} className="text-muted-foreground" />
                          </div>
                          <div className="space-y-3">
                            <p className="text-sm font-semibold text-foreground">No Analysis Ready</p>
                            <Button size="sm" onClick={() => triggerScan(selected.application_id)}>
                              Trigger Audit Scan
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="min-h-[600px] flex flex-col items-center justify-center text-center p-10">
                <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mb-6 border border-border">
                  <Users size={40} className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Select a candidate</h3>
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                  Choose a candidate from the pipeline to view AI analysis and make hiring decisions.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Post Job Dialog */}
      <Dialog open={postJobOpen} onOpenChange={setPostJobOpen}>
        <DialogContent className="sm:max-w-2xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-6rem)] sm:max-h-[80vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
              <Briefcase size={16} />
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">Post New Job Opportunity</DialogTitle>
              <DialogDescription className="text-xs">Define a hiring cluster for AI candidate matching</DialogDescription>
            </div>
          </DialogHeader>

          <form id="post-job-form" onSubmit={handlePostJob} className="min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Company</Label>
                <Input
                  required
                  value={jobForm.company}
                  onChange={e => setJobForm({ ...jobForm, company: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Job title / variants (comma-separated)</Label>
                <Input
                  required
                  placeholder="Software Engineer, Backend Developer…"
                  value={jobForm.job_title_variants}
                  onChange={e => setJobForm({ ...jobForm, job_title_variants: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Gemma keywords (comma-separated)</Label>
              <Textarea
                required
                placeholder="Python, React, AWS, Distributed Systems…"
                value={jobForm.gemma_keywords}
                onChange={e => setJobForm({ ...jobForm, gemma_keywords: e.target.value })}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 flex gap-3">
              <Zap size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Once posted, the Gemma-4 engine automatically scans incoming resumes against these keywords and title variants using the defined match weights.
              </p>
            </div>
          </form>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setPostJobOpen(false)}>Cancel</Button>
            <Button type="submit" form="post-job-form" size="sm" disabled={savingJob}>
              {savingJob ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Publish Cluster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
