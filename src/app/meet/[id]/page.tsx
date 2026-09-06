"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import "@livekit/components-styles";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useRoomContext,
  useRemoteParticipants,
  useLocalParticipant,
} from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TalentAnalysis {
  interview_questions?: Array<{ question: string; reason?: string } | string>;
  scoring?: {
    match_score?: number;
    decision?: string;
    breakdown?: { skills?: number; experience?: number; projects?: number; education?: number };
  };
  recommendations?: { pros?: string[]; matched_skills?: string[] };
  gap_analysis?: { cons?: string[]; missing_skills?: string[] };
  resume_profile?: {
    summary?: string;
    overview?: string;
    education?: string;
    projects?: string;
    experience?: string;
    achievements?: string;
  };
}

interface ApplicationRow {
  talent_analysis?: TalentAnalysis[];
  applied_cluster_id?: string;
  applicant_name?: string;
  applicant_email?: string;
  [key: string]: unknown;
}

interface InterviewRow {
  interview_id: string;
  application_id: string;
  scheduled_at: string;
  status: string;
  interview_type: string;
  unique_access_token: string | null;
  recording_url: string | null;
  ai_analysis: Record<string, unknown> | null;
  interviewer_notes: string | null;
  applications?: ApplicationRow | null;
}

// ─── Name Entry Screen ────────────────────────────────────────────────────────

function NameEntryScreen({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState("");

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (trimmed) onJoin(trimmed);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-zinc-900 border border-white/5 rounded-2xl p-8 shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 mb-4">
            <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white tracking-tight">NexaWork</h1>
          <p className="text-zinc-500 text-sm mt-1">Hiring Platform</p>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">Join Interview</h2>
          <p className="text-zinc-400 text-sm">Enter your full name to continue</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Full Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. Sarah Ahmed"
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="w-full py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white"
          >
            Join Now
          </button>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          This session is recorded and monitored
        </p>
      </motion.div>
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-400 text-sm">Initializing secure room…</p>
      </div>
    </div>
  );
}

// ─── Error Screen ─────────────────────────────────────────────────────────────

function ErrorScreen({ message }: { message: string }) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-white font-semibold mb-2">Connection Error</h2>
        <p className="text-zinc-400 text-sm mb-6">{message}</p>
        <button onClick={() => router.back()} className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-colors">
          Go Back
        </button>
      </div>
    </div>
  );
}

// ─── Room Timer Hook ──────────────────────────────────────────────────────────

function useRoomTimer(): string {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ─── Top Bar (inside LiveKitRoom) ─────────────────────────────────────────────

function TopBar({ roomId, isAdmin, onLeave }: { roomId: string; isAdmin: boolean; onLeave: () => void }) {
  const timer = useRoomTimer();
  const remoteParticipants = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();
  const totalParticipants = remoteParticipants.length + (localParticipant ? 1 : 0);

  return (
    <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
      <div className="flex items-center gap-3 pointer-events-auto">
        <span className="text-white font-semibold text-sm truncate max-w-[180px]">{roomId}</span>
        <span className="text-zinc-400 text-xs bg-zinc-800/80 px-2 py-0.5 rounded-full border border-white/5">
          {totalParticipants} participant{totalParticipants !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          REC
        </span>
      </div>

      <div className="flex items-center gap-3 pointer-events-auto">
        {!isAdmin && (
          <span className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/15 px-2 py-1 rounded-full hidden sm:block">
            Interview in progress — you are being recorded
          </span>
        )}
        <span className="text-zinc-300 text-sm tabular-nums">{timer}</span>
        <button
          onClick={onLeave}
          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-semibold transition-colors"
        >
          Leave
        </button>
      </div>
    </div>
  );
}

// ─── Candidate Command Listener ───────────────────────────────────────────────

function CandidateCommandListener() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    const handler = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as { type?: string; command?: string };
        if (msg.type !== "admin_command" || !msg.command) return;
        switch (msg.command) {
          case "mute":       localParticipant.setMicrophoneEnabled(false); break;
          case "unmute":     localParticipant.setMicrophoneEnabled(true);  break;
          case "video_off":  localParticipant.setCameraEnabled(false);     break;
          case "video_on":   localParticipant.setCameraEnabled(true);      break;
        }
      } catch { /* ignore */ }
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  }, [room, localParticipant]);

  return null;
}

// ─── Score bar helper ─────────────────────────────────────────────────────────

function ScoreBar({ value, color = "bg-violet-500" }: { value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs font-semibold text-white tabular-nums w-8 text-right">{value}%</span>
    </div>
  );
}

// ─── Admin Interviewer Panel ──────────────────────────────────────────────────

type PanelTab = "report" | "questions" | "controls" | "notes";

function InterviewerPanel({
  interviewId,
  interview,
  onEnd,
}: {
  interviewId: string;
  interview: InterviewRow | null;
  onEnd: () => void;
}) {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();

  const [activeTab, setActiveTab] = useState<PanelTab>("report");
  const [notes, setNotes] = useState(interview?.interviewer_notes ?? "");
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [ending, setEnding] = useState(false);

  // Pull analysis data
  const app = interview?.applications;
  const ta: TalentAnalysis = app?.talent_analysis?.[0] ?? {};
  const scoring = ta.scoring ?? {};
  const breakdown = scoring.breakdown ?? {};
  const matchScore = scoring.match_score ?? 0;
  const decision = scoring.decision ?? "—";
  const pros: string[] = ta.recommendations?.pros ?? [];
  const matchedSkills: string[] = (ta.recommendations?.matched_skills ?? []).filter((s) => s.toLowerCase() !== "none");
  const cons: string[] = ta.gap_analysis?.cons ?? [];
  const missingSkills: string[] = (ta.gap_analysis?.missing_skills ?? []).filter((s) => s.toLowerCase() !== "none");
  const profile = ta.resume_profile ?? {};
  const rawQuestions = ta.interview_questions ?? [];
  const questions = rawQuestions.map((q) => (typeof q === "string" ? { question: q, reason: "" } : q));

  const candidateName = app?.applicant_name ?? "Candidate";
  const jobRole = app?.applied_cluster_id ?? "Role not specified";
  const candidateEmail = app?.applicant_email ?? "";
  const isConnected = remoteParticipants.length > 0;

  const sendCommand = useCallback(
    (command: "mute" | "unmute" | "video_on" | "video_off") => {
      const data = new TextEncoder().encode(JSON.stringify({ type: "admin_command", command }));
      room.localParticipant.publishData(data, { reliable: true });
    },
    [room]
  );

  const saveNotes = useCallback(async () => {
    await supabase.from("interviews").update({ interviewer_notes: notes }).eq("interview_id", interviewId);
  }, [interviewId, notes]);

  const fetchAiSuggestion = useCallback(async () => {
    setLoadingSuggestion(true);
    setAiSuggestion(null);
    try {
      const res = await fetch("/api/admin/recruitment/process-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "suggest_question", candidate_context: notes || candidateName, job_role: jobRole }),
      });
      const json = await res.json() as Record<string, unknown>;
      setAiSuggestion(
        (json.suggestion as string | undefined) ??
        (json.question as string | undefined) ??
        "No suggestion returned."
      );
    } catch {
      setAiSuggestion("Failed to get AI suggestion.");
    } finally {
      setLoadingSuggestion(false);
    }
  }, [notes, candidateName, jobRole]);

  const handleEnd = useCallback(async () => {
    setEnding(true);
    await supabase.from("interviews").update({ status: "completed" }).eq("interview_id", interviewId);
    onEnd();
  }, [interviewId, onEnd]);

  const decisionColor =
    decision === "Accepted" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    : decision === "Rejected" ? "text-red-400 bg-red-500/10 border-red-500/20"
    : "text-amber-400 bg-amber-500/10 border-amber-500/20";

  const scoreColor =
    matchScore >= 80 ? "text-emerald-400"
    : matchScore >= 50 ? "text-amber-400"
    : "text-red-400";

  const TABS: { id: PanelTab; label: string }[] = [
    { id: "report",    label: "Audit Report" },
    { id: "questions", label: "Questions"    },
    { id: "controls",  label: "Controls"     },
    { id: "notes",     label: "Notes"        },
  ];

  return (
    <div className="h-full flex flex-col bg-zinc-900 border-l border-white/5 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-white font-semibold text-sm truncate max-w-[180px]">{candidateName}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${decisionColor}`}>
            {decision}
          </span>
        </div>
        <p className="text-zinc-500 text-xs truncate">{jobRole}</p>
        {candidateEmail && <p className="text-zinc-600 text-[10px] truncate">{candidateEmail}</p>}

        {/* Live status pill */}
        <div className="flex items-center gap-1.5 mt-2">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`} />
          <span className={`text-[10px] font-medium ${isConnected ? "text-emerald-400" : "text-zinc-500"}`}>
            {isConnected ? "Candidate Connected" : "Waiting for candidate…"}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === t.id
                ? "text-violet-400 border-violet-500 bg-violet-500/5"
                : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── AUDIT REPORT TAB ── */}
        {activeTab === "report" && (
          <div className="p-4 space-y-5">
            {/* Match Score */}
            <div className="bg-zinc-800/60 border border-white/5 rounded-xl p-4 text-center">
              <p className={`text-4xl font-black tabular-nums ${scoreColor}`}>{matchScore}%</p>
              <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1">AI Match Score</p>
              <div className="mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-700"
                  style={{ width: `${matchScore}%` }}
                />
              </div>
            </div>

            {/* Breakdown */}
            {Object.keys(breakdown).length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Score Breakdown</p>
                {[
                  { label: "Technical Skills", value: breakdown.skills ?? 0,      color: "bg-indigo-500" },
                  { label: "Experience",        value: breakdown.experience ?? 0,  color: "bg-blue-500"   },
                  { label: "Projects",          value: breakdown.projects ?? 0,    color: "bg-emerald-500"},
                  { label: "Education",         value: breakdown.education ?? 0,   color: "bg-amber-500"  },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                      <span>{item.label}</span>
                      <span>{item.value}%</span>
                    </div>
                    <ScoreBar value={item.value} color={item.color} />
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            {profile.summary && (
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Executive Summary</p>
                <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-800/50 border border-white/5 p-3 rounded-lg italic">
                  &ldquo;{profile.summary}&rdquo;
                </p>
              </div>
            )}

            {/* Pros / Cons */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 space-y-1.5">
                <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Strengths</p>
                {pros.length > 0 ? pros.map((p, i) => (
                  <p key={i} className="text-[10px] text-zinc-300 leading-snug">• {p}</p>
                )) : <p className="text-[10px] text-zinc-600 italic">None listed</p>}
              </div>
              <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 space-y-1.5">
                <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-1">Gaps</p>
                {cons.length > 0 ? cons.map((c, i) => (
                  <p key={i} className="text-[10px] text-zinc-300 leading-snug">• {c}</p>
                )) : <p className="text-[10px] text-zinc-600 italic">None listed</p>}
              </div>
            </div>

            {/* Skills */}
            {(matchedSkills.length > 0 || missingSkills.length > 0) && (
              <div className="space-y-3">
                {matchedSkills.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Matched Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {matchedSkills.map((s) => (
                        <span key={s} className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-tight bg-violet-500/10 text-violet-300 border border-violet-500/20 rounded-md">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {missingSkills.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Missing Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {missingSkills.map((s) => (
                        <span key={s} className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-tight bg-red-500/10 text-red-400 border border-red-500/20 rounded-md">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Deep Dive Profile */}
            {[
              { label: "Professional Overview", value: profile.overview },
              { label: "Education",             value: profile.education },
              { label: "Projects & Portfolio",  value: profile.projects },
              { label: "Work Experience",       value: profile.experience },
              { label: "Achievements",          value: profile.achievements },
            ].filter((item) => item.value).map((item) => (
              <div key={item.label}>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{item.label}</p>
                <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-3">
                  <p className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── QUESTIONS TAB ── */}
        {activeTab === "questions" && (
          <div className="p-4 space-y-4">
            {/* AI Follow-up generator */}
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">AI Follow-up</p>
              <button
                onClick={fetchAiSuggestion}
                disabled={loadingSuggestion}
                className="w-full py-2 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/20 text-violet-300 text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loadingSuggestion && <span className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin" />}
                {loadingSuggestion ? "Generating…" : "Suggest Follow-up Question"}
              </button>
              <AnimatePresence>
                {aiSuggestion && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 p-3 rounded-lg bg-zinc-800 border border-violet-500/10 text-xs text-zinc-300 leading-relaxed italic">
                      &ldquo;{aiSuggestion}&rdquo;
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Pre-generated questions */}
            {questions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">AI-Generated Interview Questions</p>
                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <div key={i} className="bg-zinc-800/60 border border-white/5 rounded-xl p-3 space-y-2">
                      <div className="flex gap-2">
                        <span className="text-[9px] font-black text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-0.5 flex-shrink-0 h-fit mt-0.5">
                          Q{i + 1}
                        </span>
                        <p className="text-xs text-white font-medium leading-snug">{q.question}</p>
                      </div>
                      {q.reason && (
                        <p className="text-[10px] text-zinc-500 leading-snug pl-7 italic">
                          {q.reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {questions.length === 0 && !loadingSuggestion && (
              <div className="py-12 text-center">
                <p className="text-zinc-600 text-sm">No pre-generated questions available.</p>
                <p className="text-zinc-700 text-xs mt-1">Use the button above to generate one.</p>
              </div>
            )}
          </div>
        )}

        {/* ── CONTROLS TAB ── */}
        {activeTab === "controls" && (
          <div className="p-4 space-y-5">
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Candidate Controls</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { cmd: "mute"      as const, label: "Mute Mic",   icon: "🔇" },
                  { cmd: "unmute"    as const, label: "Unmute Mic", icon: "🎙️" },
                  { cmd: "video_off" as const, label: "Video Off",  icon: "📷" },
                  { cmd: "video_on"  as const, label: "Video On",   icon: "🎥" },
                ].map(({ cmd, label, icon }) => (
                  <button
                    key={cmd}
                    onClick={() => sendCommand(cmd)}
                    className="py-3 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-white/5 transition-colors flex flex-col items-center gap-1.5"
                  >
                    <span className="text-lg">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 text-center mt-3">
                Commands are sent directly to the candidate's device
              </p>
            </div>

            {/* Participants */}
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Participants</p>
              <div className="space-y-2">
                {remoteParticipants.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic">No remote participants yet</p>
                ) : remoteParticipants.map((p) => (
                  <div key={p.identity} className="flex items-center gap-2 bg-zinc-800/60 border border-white/5 rounded-lg px-3 py-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                    <span className="text-xs text-zinc-300 truncate">{p.name || p.identity}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── NOTES TAB ── */}
        {activeTab === "notes" && (
          <div className="p-4">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Interviewer Notes</p>
            <p className="text-[10px] text-zinc-600 mb-3">Auto-saved when you click away</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Record your observations, impressions, follow-up actions…"
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-3 text-xs text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/10 transition-colors"
              style={{ minHeight: "calc(100vh - 340px)" }}
            />
          </div>
        )}
      </div>

      {/* End Session */}
      <div className="p-4 border-t border-white/5 flex-shrink-0">
        <button
          onClick={handleEnd}
          disabled={ending}
          className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {ending && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {ending ? "Ending Session…" : "End & Submit"}
        </button>
      </div>
    </div>
  );
}

// ─── Room Content (child of LiveKitRoom — safe to use all hooks) ──────────────

function RoomContent({
  roomId,
  isAdmin,
  interviewId,
  interview,
  onLeave,
  onEnd,
}: {
  roomId: string;
  isAdmin: boolean;
  interviewId: string;
  interview: InterviewRow | null;
  onLeave: () => void;
  onEnd: () => void;
}) {
  const [showPanel, setShowPanel] = useState(true);

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden relative">
      <TopBar roomId={roomId} isAdmin={isAdmin} onLeave={onLeave} />

      {/* Video Area */}
      <div className="flex-1 relative flex flex-col min-w-0">
        <VideoConference className="flex-1" />
        <RoomAudioRenderer />
        {!isAdmin && <CandidateCommandListener />}
      </div>

      {/* Admin Panel */}
      {isAdmin && (
        <>
          <button
            onClick={() => setShowPanel((v) => !v)}
            aria-label="Toggle admin panel"
            className="absolute z-40 top-1/2 -translate-y-1/2 w-6 h-12 bg-zinc-800 border border-white/5 rounded-l-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
            style={{ right: showPanel ? "320px" : "0" }}
          >
            <svg
              className={`w-3 h-3 transition-transform duration-200 ${showPanel ? "" : "rotate-180"}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <AnimatePresence initial={false}>
            {showPanel && (
              <motion.div
                key="admin-panel"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="flex-shrink-0 h-full overflow-hidden"
              >
                <div style={{ width: 320 }} className="h-full">
                  <InterviewerPanel interviewId={interviewId} interview={interview} onEnd={onEnd} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

// ─── Main Page Component (does NOT use any LiveKit hooks) ─────────────────────

export default function MeetingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawId = Array.isArray(params.id) ? params.id[0] : (params.id as string) ?? "";
  const interviewId = rawId;
  const isAdmin = searchParams.get("role") === "admin";

  // Always start on name screen for candidates; admins go straight to loading
  const [stage, setStage] = useState<"name" | "loading" | "room" | "error">(
    isAdmin ? "loading" : "name"
  );
  const [token, setToken] = useState<string>("");
  const [wsUrl, setWsUrl] = useState<string>(process.env.NEXT_PUBLIC_LIVEKIT_URL || "");
  const [errorMsg, setErrorMsg] = useState("");
  const [interview, setInterview] = useState<InterviewRow | null>(null);

  const fetchInterview = useCallback(async () => {
    const { data } = await supabase
      .from("interviews")
      .select(`
        *,
        applications (
          *,
          talent_analysis (*)
        )
      `)
      .eq("interview_id", interviewId)
      .single();
    if (data) setInterview(data as InterviewRow);
  }, [interviewId]);

  const fetchToken = useCallback(
    async (name: string) => {
      setStage("loading");
      try {
        await fetchInterview();
        const res = await fetch(
          `/api/livekit?room=${encodeURIComponent(interviewId)}&username=${encodeURIComponent(name)}`
        );
        if (!res.ok) throw new Error(`Token fetch failed: ${res.statusText}`);
        const json = (await res.json()) as { token?: string; wsUrl?: string; error?: string };
        if (json.error) throw new Error(json.error);
        if (!json.token) throw new Error("No token returned from server");
        setToken(json.token);
        if (json.wsUrl) setWsUrl(json.wsUrl);
        setStage("room");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Unknown error occurred");
        setStage("error");
      }
    },
    [interviewId, fetchInterview]
  );

  useEffect(() => {
    if (isAdmin) {
      // Try to get the logged-in user's name from Supabase auth
      supabase.auth.getUser().then(({ data }) => {
        const user = data?.user;
        const baseName =
          user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          user?.email?.split("@")[0] ||
          "HR";
        const displayName = `${baseName} (Interviewer)`;
        fetchToken(displayName);
      }).catch(() => fetchToken("HR Interviewer"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLeave = () => router.push(isAdmin ? "/admin/interviews" : "/");
  const handleEnd = () => router.push("/admin/interviews");

  if (stage === "name") return <NameEntryScreen onJoin={fetchToken} />;
  if (stage === "loading") return <LoadingScreen />;
  if (stage === "error") return <ErrorScreen message={errorMsg} />;
  if (!token) return <LoadingScreen />;

  return (
    <LiveKitRoom
      token={token}
      serverUrl={wsUrl}
      connect={true}
      audio={true}
      video={true}
      onDisconnected={handleLeave}
      className="h-screen bg-zinc-950"
    >
      <RoomContent
        roomId={interviewId}
        isAdmin={isAdmin}
        interviewId={interviewId}
        interview={interview}
        onLeave={handleLeave}
        onEnd={handleEnd}
      />
    </LiveKitRoom>
  );
}
