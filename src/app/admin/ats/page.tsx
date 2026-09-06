"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useRef } from "react";
import {
  Upload, Terminal as TerminalIcon, Search, Zap, CheckCircle2, AlertCircle,
  Scan, FileText, User, ChevronRight, Microscope, Loader2, X, BrainCircuit,
  Radar, Trash2, RefreshCw
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Log Terminal ────────────────────────────────────────────────────────── */
function LogTerminal({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden tabular-nums text-[11px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <TerminalIcon size={12} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Analysis Stream</span>
        </div>
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500/40" />
          <span className="h-2 w-2 rounded-full bg-amber-500/40" />
        </div>
      </div>
      <div ref={ref} className="flex-1 p-3 overflow-y-auto space-y-1 font-mono">
        {logs.length === 0 ? (
          <span className="text-muted-foreground/50 italic">Awaiting scan…</span>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground/40 flex-shrink-0 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={cn(
                log.includes("SUCCESS") ? "text-emerald-500" :
                log.includes("ERROR") ? "text-rose-500" :
                "text-foreground/70",
              )}>
                {log}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const getTimestamp = () => {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'short' });
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `[${day} ${date} ${time}]`;
};

/* ─── Realtime Logic ─────────────────────────────────────────────────────── */
function useRecruitmentRealtime(onUpdate: () => void, onLog: (msg: string | string[]) => void) {
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        async (payload: any) => {
          onUpdate();
          if (payload.new && payload.new.processing_status === 'completed') {
            onLog(`${getTimestamp()} [SYSTEM] Syncing final intelligence for ${payload.new.applicant_name}...`);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'talent_analysis' },
        async (payload: any) => {
          onUpdate();
          if (payload.new) {
            const { data: app } = await supabase.from('applications').select('applicant_name, applied_cluster_id').eq('application_id', payload.new.application_id).single();

            const metrics = payload.new.resume_profile?.metrics || {};
            const score = payload.new.scoring?.match_score || 0;
            const source = payload.new.application_id.startsWith("CAR-") ? "Career Portal" : "Manual Upload";
            const ts = getTimestamp();

            const box = [
              `${ts} ------------------------------------------------`,
              `${ts} [AUDIT_SUCCESS]`,
              `${ts} CANDIDATE : ${app?.applicant_name || 'Unknown'}`,
              `${ts} ROLE      : ${app?.applied_cluster_id || 'Unknown'}`,
              `${ts} SOURCE    : ${source}`,
              `${ts} AI MODEL  : ${metrics.model || 'gemma4:e4b'}`,
              `${ts} METRICS   : Tokens: ${metrics.prompt_tokens + metrics.completion_tokens || 0} | Score: ${score}%`,
              `${ts} ------------------------------------------------`
            ];
            onLog(box);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onUpdate, onLog]);
}

/* ─── Score Badge ─────────────────────────────────────────────────────────── */
function ScoreBadge({ score }: { score: number }) {
  return (
    <div className="flex flex-col items-end">
      <span className={cn(
        "text-2xl font-bold tabular-nums leading-none",
        score >= 80 ? "text-emerald-500"
          : score >= 50 ? "text-amber-500"
            : score > 0 ? "text-rose-500"
              : "text-muted-foreground",
      )}>
        {score}%
      </span>
      <span className="text-[10px] text-muted-foreground mt-1">Match Score</span>
    </div>
  );
}

/* ─── Candidate Card ──────────────────────────────────────────────────────── */
function CandidateCard({
  candidate,
  onSelect,
  onDelete,
  onRescan,
  onCancelStuck,
  onDecision,
  onViewResume
}: {
  candidate: any;
  onSelect: (c: any) => void;
  onDelete: (id: string) => void;
  onRescan: (id: string) => void;
  onCancelStuck: (id: string) => void;
  onDecision: (id: string, decision: 'accepted' | 'rejected') => void;
  onViewResume: (path: string) => void;
}) {
  const analysisArr = candidate.talent_analysis;
  const analysis = Array.isArray(analysisArr) ? analysisArr[0] : analysisArr;

  const score = analysis?.scoring?.match_score || 0;
  const isComplete = candidate.processing_status === "completed";
  const isScanning = candidate.processing_status === "pending" || candidate.processing_status === "processing";
  const progressValue = candidate.processing_progress || (candidate.processing_status === 'pending' ? 10 : 0);
  const progressStep = candidate.processing_step || (candidate.processing_status === 'pending' ? 'In Queue' : 'Processing...');

  return (
    <Card className="group p-4 transition-shadow hover:shadow-sm relative overflow-hidden">
      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 bg-background/95 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center"
          >
            <div className="relative mb-3 flex-shrink-0">
              <div className="h-10 w-10 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
              <Scan size={14} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary animate-pulse" />
            </div>

            <div className="w-full max-w-[120px] space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-medium text-primary">
                <span>AI Scan</span>
                <span>{progressValue}%</span>
              </div>
              <Progress value={progressValue} className="h-1" />
            </div>

            <p className="text-xs font-semibold text-primary mt-3">Processing</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-none">{progressStep}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 h-7 text-xs text-rose-500 border-rose-500/30 hover:bg-rose-500 hover:text-white"
              onClick={(e) => { e.stopPropagation(); onCancelStuck(candidate.application_id); }}
            >
              <X size={10} /> Cancel
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0">
          <User size={18} className="text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">{candidate.applicant_name}</p>
              <p className="text-xs text-muted-foreground truncate">{candidate.applicant_email}</p>
            </div>
            <div className="flex-shrink-0">
              {isComplete && score === 0 ? (
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <Loader2 size={12} className="animate-spin text-muted-foreground" />
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1">Syncing score</span>
                </div>
              ) : (
                <ScoreBadge score={score} />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge variant="outline" className="text-[10px] text-primary border-primary/20 bg-primary/10">
              {candidate.applied_cluster_id}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                candidate.application_id.startsWith("CAR-")
                  ? "text-purple-500 border-purple-500/20 bg-purple-500/10"
                  : "text-blue-500 border-blue-500/20 bg-blue-500/10",
              )}
            >
              {candidate.application_id.startsWith("CAR-") ? "Career Path" : "Manual"}
            </Badge>
            <Badge
              variant={isComplete ? "outline" : "secondary"}
              className={cn("text-[10px]", isComplete && "text-emerald-500 border-emerald-500/20 bg-emerald-500/10")}
            >
              {isComplete ? "Verified" : "Pending"}
            </Badge>

            {candidate.decision !== 'pending' && (
              <Badge className={cn("text-[10px] capitalize", candidate.decision === 'accepted' ? "bg-emerald-500 hover:bg-emerald-500/90" : "bg-rose-500 hover:bg-rose-500/90", "text-white")}>
                {candidate.decision}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <span className="text-xs text-muted-foreground tabular-nums">ID: {candidate.application_id.substring(0, 8)}</span>
        <div className="flex items-center gap-1">
          {isComplete && candidate.processing_status === 'completed' && (
            <div className="flex items-center gap-1 border-r border-border pr-1 mr-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500 hover:text-white disabled:opacity-40"
                onClick={() => onDecision(candidate.application_id, 'accepted')}
                disabled={candidate.decision !== 'pending'}
                title={candidate.decision !== 'pending' ? "Decision already made" : "Accept & Send Selection Mail"}
              >
                <CheckCircle2 size={12} /> Accept
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs text-rose-600 border-rose-500/30 hover:bg-rose-500 hover:text-white disabled:opacity-40"
                onClick={() => onDecision(candidate.application_id, 'rejected')}
                disabled={candidate.decision !== 'pending'}
                title={candidate.decision !== 'pending' ? "Decision already made" : "Reject & Send Rejection Mail"}
              >
                <X size={12} /> Reject
              </Button>
            </div>
          )}

          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-indigo-500" onClick={() => onRescan(candidate.application_id)} title="Rescan resume">
            <RefreshCw size={14} />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-500" onClick={() => onDelete(candidate.application_id)} title="Delete candidate">
            <Trash2 size={14} />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => onViewResume(candidate.resume_file_path)} title="View resume">
            <FileText size={14} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs ml-1"
            onClick={() => onSelect(candidate)}
            disabled={!isComplete}
          >
            Full Analysis <ChevronRight size={12} />
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ─── Analysis Drawer ─────────────────────────────────────────────────────── */
function AnalysisDrawer({
  candidateId,
  allCandidates,
  onClose,
  onViewResume
}: {
  candidateId: string | null;
  allCandidates: any[];
  onClose: () => void;
  onViewResume: (path: string) => void;
}) {
  const candidate = allCandidates.find(c => c.application_id === candidateId);

  const analysisArr = candidate?.talent_analysis;
  const analysis = Array.isArray(analysisArr) ? analysisArr[0] : analysisArr;

  const score = analysis?.scoring?.match_score || 0;
  const breakdown = analysis?.scoring?.breakdown || {};

  const pros: string[] = analysis?.recommendations?.pros || [];
  const cons: string[] = analysis?.gap_analysis?.cons || [];
  const matchedSkills: string[] = (analysis?.recommendations?.matched_skills || []).filter((s: string) => s.toLowerCase() !== 'none');
  const missingSkills: string[] = (analysis?.gap_analysis?.missing_skills || []).filter((s: string) => s.toLowerCase() !== 'none');
  const questions: any[] = analysis?.interview_questions || [];
  const profile = analysis?.resume_profile || {};

  const summary = profile.summary || analysis?.gemma_raw_response?.summary || "No summary provided";
  const overview = profile.overview || summary;
  const education = profile.education || profile.education_match || "Education audit data pending.";
  const projects = profile.projects || "Project deep-dive pending.";
  const experience = profile.experience || "Experience tenure audit pending.";
  const achievements = profile.achievements || "Achievement quantification pending.";

  if (!candidate) return null;

  return (
    <Sheet open={!!candidateId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0">
        <SheetHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-6 py-4">
          <div>
            <SheetTitle className="text-base">Intelligence Audit Report</SheetTitle>
            <SheetDescription className="text-xs">Gemma-4 Cognitive Output</SheetDescription>
          </div>
          <Button
            type="button"
            size="sm"
            className="mr-8"
            onClick={() => onViewResume(candidate.resume_file_path)}
          >
            <FileText size={12} /> View Resume
          </Button>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="mx-6 mt-3 grid grid-cols-4">
            <TabsTrigger value="overview" className="text-xs gap-1.5"><Radar size={12} /> Overview</TabsTrigger>
            <TabsTrigger value="skills" className="text-xs gap-1.5"><BrainCircuit size={12} /> Skills</TabsTrigger>
            <TabsTrigger value="details" className="text-xs gap-1.5"><FileText size={12} /> Deep Dive</TabsTrigger>
            <TabsTrigger value="questions" className="text-xs gap-1.5"><Zap size={12} /> Interview</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="overview" className="space-y-6 mt-0">
              <Card>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="h-16 w-16 rounded-xl bg-muted border border-border flex items-center justify-center flex-shrink-0">
                    <User size={32} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xl text-foreground">{candidate.applicant_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{candidate.applicant_email}</p>
                    <div className="flex items-center gap-3 mt-3">
                      <ScoreBadge score={score} />
                      <Badge variant="outline" className="text-primary border-primary/20 bg-primary/10 capitalize">
                        {analysis?.scoring?.decision || "Pending"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground">Strategic Match Reliability</p>
                  {[
                    { label: "Technical Skills", value: breakdown.skills || 0, color: "bg-indigo-500", weight: "40%" },
                    { label: "Experience", value: breakdown.experience || 0, color: "bg-blue-500", weight: "30%" },
                    { label: "Projects", value: breakdown.projects || 0, color: "bg-emerald-500", weight: "20%" },
                    { label: "Education", value: breakdown.education || 0, color: "bg-amber-500", weight: "10%" },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">{item.label} <span className="text-[10px] text-muted-foreground">({item.weight})</span></span>
                        <span className="text-muted-foreground tabular-nums">{item.value}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${item.value}%` }}
                          className={cn("h-full rounded-full", item.color)}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Executive Summary</p>
                <p className="text-sm text-foreground leading-relaxed bg-muted/40 p-4 rounded-lg border border-border italic">
                  &ldquo;{summary}&rdquo;
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-emerald-600 flex items-center gap-2"><CheckCircle2 size={12} /> Strengths</p>
                  {pros.length > 0 ? pros.map((p, i) => (
                    <p key={i} className="text-xs text-foreground leading-snug">• {p}</p>
                  )) : <p className="text-xs text-muted-foreground italic">No specific strengths listed.</p>}
                </div>
                <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-rose-600 flex items-center gap-2"><AlertCircle size={12} /> Gaps</p>
                  {cons.length > 0 ? cons.map((c, i) => (
                    <p key={i} className="text-xs text-foreground leading-snug">• {c}</p>
                  )) : <p className="text-xs text-muted-foreground italic">No significant gaps identified.</p>}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="skills" className="space-y-6 mt-0">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500" /> Matched Skills</p>
                <div className="flex flex-wrap gap-2">
                  {matchedSkills.length > 0 ? matchedSkills.map(s => (
                    <Badge key={s} variant="outline" className="text-emerald-600 border-emerald-500/20 bg-emerald-500/10">{s}</Badge>
                  )) : <p className="text-xs text-muted-foreground italic">No specific skill matches identified.</p>}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground flex items-center gap-2"><AlertCircle size={12} className="text-rose-500" /> Missing Critical Skills</p>
                <div className="flex flex-wrap gap-2">
                  {missingSkills.length > 0 ? missingSkills.map(s => (
                    <Badge key={s} variant="outline" className="text-rose-600 border-rose-500/20 bg-rose-500/10">{s}</Badge>
                  )) : <p className="text-xs text-muted-foreground italic">No critical skill gaps found.</p>}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-6 mt-0">
              {[
                { label: "Professional Overview", value: overview, icon: User },
                { label: "Education & Academy", value: education, icon: Microscope },
                { label: "Projects & Portfolio", value: projects, icon: Zap },
                { label: "Work Experience", value: experience, icon: FileText },
                { label: "Impact & Achievements", value: achievements, icon: Radar },
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-2"><item.icon size={12} /> {item.label}</p>
                  <div className="p-4 bg-muted/40 border border-border rounded-lg">
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                      {item.value || "No detailed data extracted for this section."}
                    </p>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="questions" className="space-y-4 mt-0">
              <p className="text-xs font-semibold text-primary flex items-center gap-2">
                <BrainCircuit size={14} /> AI-Generated Interview Questions
              </p>
              <p className="text-xs text-muted-foreground bg-primary/5 p-3 rounded-lg border border-primary/10">
                These questions are tailored by Gemma to probe weaknesses and verify complex claims in this resume.
              </p>
              <div className="space-y-4">
                {questions.length > 0 ? questions.map((q: any, i: number) => (
                  <Card key={i} className="group transition-colors hover:border-primary/30">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-primary">Tricky Question {i + 1}</span>
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <Zap size={10} />
                        </div>
                      </div>
                      <p className="text-sm font-medium text-foreground leading-snug">{q.question}</p>
                      <Separator />
                      <p className="text-xs text-muted-foreground italic">
                        <span className="font-semibold text-foreground not-italic mr-2">Audit Rationale:</span> {q.reason}
                      </p>
                    </CardContent>
                  </Card>
                )) : candidate?.processing_status === "completed" ? (
                  <div className="py-20 text-center space-y-3">
                    <BrainCircuit size={32} className="mx-auto text-muted-foreground opacity-30" />
                    <p className="text-xs text-muted-foreground">No interview questions were generated.</p>
                    <p className="text-[10px] text-muted-foreground/60">Use the Rescan button to regenerate a full analysis.</p>
                  </div>
                ) : (
                  <div className="py-20 text-center space-y-3">
                    <Loader2 size={32} className="mx-auto text-muted-foreground animate-spin" />
                    <p className="text-xs text-muted-foreground">Generating intelligence questions…</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Resume Preview Overlay ──────────────────────────────────────────────── */
function ResumePreview({ path, onClose }: { path: string | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (path) {
      const { data } = supabase.storage.from("resumes").getPublicUrl(path);
      setUrl(data.publicUrl);
    }
  }, [path]);

  return (
    <Dialog open={!!path} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-5xl h-[85vh] !grid-rows-[auto_1fr] !grid p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-sm">Resume Document Preview</DialogTitle>
        </DialogHeader>
        {url && <iframe src={url} className="w-full h-full" />}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
export default function ATSScannerPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobClusters, setJobClusters] = useState<any[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelScan = () => {
    abortRef.current?.abort();
  };

  useRecruitmentRealtime(
    fetchApplications,
    (msg) => {
      if (Array.isArray(msg)) {
        setLogs(prev => [...prev, ...msg]);
      } else {
        setLogs(prev => [...prev, msg]);
      }
    }
  );

  async function fetchRecentLogs() {
    try {
      const { data } = await supabase
        .from("talent_analysis")
        .select(`*, applications(applicant_name)`)
        .order("created_at", { ascending: false })
        .limit(5);

      if (data) {
        const history = data.map(item => {
          const metrics = item.resume_profile?.metrics || {};
          return `${getTimestamp()} [HISTORY] ${item.applications?.applicant_name}: ${item.scoring?.match_score}% Match | Tokens: ${metrics.prompt_tokens + metrics.completion_tokens || 'N/A'}`;
        });
        setLogs(history.reverse());
      }
    } catch (err) {}
  }

  useEffect(() => {
    fetchJobClusters();
    fetchApplications();
    fetchRecentLogs();
  }, []);

  async function fetchJobClusters() {
    try {
      const { data, error } = await supabase.from("job_clusters").select("*").eq("active", true);
      if (error) throw error;
      setJobClusters(data || []);
    } catch (err) {
      console.error(err);
    }
  }

  const handleDecision = async (id: string, decision: 'accepted' | 'rejected') => {
    try {
      toast.info(`${decision.toUpperCase()} — processing automation…`);

      const res = await fetch("/api/admin/recruitment/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: id, decision })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      toast.success(`Candidate ${decision}. Email sent!`);
      fetchApplications();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCluster) return;
    e.target.value = "";

    setScanning(true);
    setProgress(0);
    setLogs([]);

    const generatedAppId = `MAN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      setLogs(prev => [...prev,
        "INIT: Initializing ATS engine…",
        `INGEST: Reading file: ${file.name}…`,
        "OCR: Extracting resume text…",
      ]);
      setProgress(20);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("clusterId", selectedCluster);
      formData.append("appId", generatedAppId);

      setLogs(prev => [...prev, "UPLOAD: Transferring to secure storage…"]);
      setProgress(40);

      await fetchApplications();

      setLogs(prev => [...prev, "NLP: Gemma 4 running cognitive audit…"]);
      setProgress(60);

      const res = await fetch("/api/admin/ats/upload", {
        method: "POST",
        body: formData,
        signal: abort.signal,
      });

      setProgress(85);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload and AI processing failed");

      setLogs(prev => [
        ...prev,
        "SCORE: Match reliability computed.",
        `TEXT: ${data.rawTextLength || 0} chars extracted from resume.`,
        "SUCCESS: Full 360° resume analysis complete.",
        "DATA: Synchronizing intelligence reports…",
      ]);
      setProgress(100);

      await fetchApplications();
      setSelectedId(generatedAppId);
      toast.success("Intelligence report generated");
    } catch (err: any) {
      if (err.name === "AbortError") {
        setLogs(prev => [...prev, "CANCELLED: Scan aborted by user."]);
        toast.info("Scan cancelled");
        await supabase.from("applications").delete().eq("application_id", generatedAppId);
        await fetchApplications();
      } else {
        setLogs(prev => [...prev, "ERROR: " + err.message]);
        toast.error(err.message);
        await supabase.from("applications").delete().eq("application_id", generatedAppId);
      }
    } finally {
      abortRef.current = null;
      setScanning(false);
      setTimeout(() => setProgress(0), 1500);
    }
  };

  async function fetchApplications() {
    try {
      const { data, error } = await supabase
        .from("applications")
        .select(`*, talent_analysis(scoring, resume_profile, recommendations, gap_analysis, interview_questions)`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      setCandidates(data || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function startScan() {
    setScanning(true);
    setProgress(0);
    setLogs([]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      setLogs(prev => [...prev, "INIT: Initializing ATS engine…", "INGEST: Scanning for pending candidates…"]);
      setProgress(10);

      const { data: pending } = await supabase
        .from("applications")
        .select("application_id, applicant_name, raw_resume_text")
        .in("processing_status", ["pending", "failed"])
        .not("raw_resume_text", "eq", "");

      if (!pending || pending.length === 0) {
        setLogs(prev => [...prev, "INFO: No pending candidates with resume text found.", "SUCCESS: Queue is clear."]);
        setProgress(100);
        toast.info("No pending candidates to process");
        return;
      }

      setLogs(prev => [...prev, `QUEUE: ${pending.length} candidate(s) queued for AI processing…`]);

      for (let i = 0; i < pending.length; i++) {
        if (abort.signal.aborted) break;

        const app = pending[i];
        const pct = Math.round(((i + 1) / pending.length) * 90) + 10;
        setProgress(pct);
        setLogs(prev => [...prev, `NLP [${i + 1}/${pending.length}]: Processing ${app.applicant_name}…`]);

        const res = await fetch("/api/admin/recruitment/process-application", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: app.application_id }),
          signal: abort.signal,
        });
        const data = await res.json();

        if (!res.ok) {
          setLogs(prev => [...prev, `ERROR [${app.applicant_name}]: ${data.error || "AI failed"}`]);
        } else {
          const score = data.analysis?.scoring?.match_score || 0;
          setLogs(prev => [...prev, `SUCCESS [${app.applicant_name}]: Score ${score}% — analysis stored.`]);
        }
      }

      if (abort.signal.aborted) {
        setLogs(prev => [...prev, "CANCELLED: Batch scan aborted by user."]);
        toast.info("Scan cancelled");
      } else {
        setProgress(100);
        setLogs(prev => [...prev, "DATA: Synchronizing intelligence reports…"]);
        toast.success(`Batch scan complete — ${pending.length} candidate(s) processed`);
      }

      await fetchApplications();
    } catch (err: any) {
      if (err.name === "AbortError") {
        setLogs(prev => [...prev, "CANCELLED: Scan aborted by user."]);
        toast.info("Scan cancelled");
        await fetchApplications();
      } else {
        setLogs(prev => [...prev, "ERROR: " + err.message]);
        toast.error(err.message);
      }
    } finally {
      abortRef.current = null;
      setScanning(false);
      setTimeout(() => setProgress(0), 1500);
    }
  }

  const handleCancelStuck = async (appId: string) => {
    try {
      await supabase.from("applications").update({ processing_status: "failed" }).eq("application_id", appId);
      await fetchApplications();
      toast.info("Scan cancelled — hit Rescan to retry");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (appId: string) => {
    if (!confirm("Are you sure you want to delete this candidate?")) return;
    try {
      const { error } = await supabase.from("applications").delete().eq("application_id", appId);
      if (error) throw error;
      toast.success("Candidate deleted");
      fetchApplications();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRescan = async (appId: string) => {
    try {
      toast.info("Re-analysis initiated…");

      await supabase.from("talent_analysis").delete().eq("application_id", appId);
      await supabase.from("applications").update({ processing_status: "pending" }).eq("application_id", appId);
      await fetchApplications();

      const res = await fetch("/api/admin/recruitment/process-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: appId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI rescan failed");

      await fetchApplications();
      setSelectedId(appId);
      toast.success("Re-analysis complete");
    } catch (err: any) {
      toast.error(err.message);
      await supabase.from("applications").update({ processing_status: "failed" }).eq("application_id", appId);
      await fetchApplications();
    }
  };

  const filtered = candidates.filter(c =>
    c.applicant_name.toLowerCase().includes(search.toLowerCase()) ||
    c.applicant_email.toLowerCase().includes(search.toLowerCase()) ||
    c.applied_cluster_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardShell
      moduleKey="ats_scanner"
      title="ATS Scanner"
      subtitle="Resume ingestion and candidate scoring"
      actions={
        <div className="flex items-center gap-2">
          {scanning && (
            <Button variant="outline" size="sm" className="text-rose-500 border-rose-500/30 hover:bg-rose-500 hover:text-white" onClick={cancelScan}>
              <X size={13} /> Cancel
            </Button>
          )}
          <Button size="sm" onClick={startScan} disabled={scanning}>
            {scanning ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} fill="currentColor" />}
            {scanning ? "Scanning…" : "Start Batch Scan"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Status bar */}
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Scan size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">ATS Engine Online</p>
                <p className="text-xs text-muted-foreground">{candidates.length} candidates loaded · real-time sync active</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-500">Live</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: upload + terminal */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Cluster selection */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <Label className="text-xs">Target Job Cluster</Label>
                <Select value={selectedCluster || undefined} onValueChange={setSelectedCluster}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select a job cluster…" /></SelectTrigger>
                  <SelectContent>
                    {jobClusters.map(c => (
                      <SelectItem key={c.cluster_id} value={c.cluster_id}>
                        {c.job_title_variants?.[0] || c.cluster_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Upload zone */}
            <div className={cn(
              "relative bg-card border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-4 text-center transition-colors group overflow-hidden",
              selectedCluster ? "border-border hover:border-primary/40 hover:bg-muted/50 cursor-pointer" : "border-border/50 opacity-50 cursor-not-allowed"
            )}>
              <div className={cn(
                "h-14 w-14 rounded-xl border flex items-center justify-center transition-colors",
                selectedCluster ? "bg-muted border-border group-hover:border-primary/30 group-hover:bg-primary/5" : "bg-muted/50 border-border/50"
              )}>
                <Upload size={24} className={cn("transition-colors", selectedCluster ? "text-muted-foreground group-hover:text-primary" : "text-muted-foreground/50")} />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">
                  {selectedCluster ? "Drop resumes here" : "Select a cluster first"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOCX · max 10MB each</p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={!selectedCluster} className="relative z-10">
                Browse Files
              </Button>
              {selectedCluster && (
                <input
                  type="file"
                  accept=".pdf,.docx"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  onChange={handleUpload}
                />
              )}
            </div>

            {/* Progress */}
            {scanning && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-foreground">Scan progress</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">{Math.round(progress)}%</span>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 text-rose-500 border-rose-500/30 hover:bg-rose-500 hover:text-white" onClick={cancelScan}>
                        <X size={10} /> Stop
                      </Button>
                    </div>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </CardContent>
              </Card>
            )}

            {/* Terminal */}
            <div className="h-80">
              <LogTerminal logs={logs} />
            </div>
          </div>

          {/* Right: candidate list */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search candidates…"
                  className="pl-9"
                />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-22rem)]">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center rounded-xl border border-dashed border-border bg-card">
                  <Microscope size={32} className="text-muted-foreground opacity-40" />
                  <p className="text-sm font-semibold text-foreground">No candidates found</p>
                  <p className="text-xs text-muted-foreground">Run a batch scan or adjust your search.</p>
                </div>
              ) : (
                filtered.map((c) => (
                  <CandidateCard
                    key={c.application_id}
                    candidate={c}
                    onSelect={(cand) => setSelectedId(cand.application_id)}
                    onDelete={handleDelete}
                    onRescan={handleRescan}
                    onCancelStuck={handleCancelStuck}
                    onDecision={handleDecision}
                    onViewResume={(path) => setResumePath(path)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Analysis drawer */}
      <AnalysisDrawer
        candidateId={selectedId}
        allCandidates={candidates}
        onClose={() => setSelectedId(null)}
        onViewResume={(path) => setResumePath(path)}
      />

      {/* Resume Preview */}
      <ResumePreview path={resumePath} onClose={() => setResumePath(null)} />
    </DashboardShell>
  );
}
