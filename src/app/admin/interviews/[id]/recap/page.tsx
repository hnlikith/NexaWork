"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Play,
  FileText,
  Brain,
  ChevronLeft,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  BrainCircuit,
  Zap,
  PhoneOff,
  Users
} from "lucide-react";
import Link from "next/link";

export default function InterviewRecapPage() {
  const { id } = useParams();
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInterview = async () => {
      const { data, error } = await supabase
        .from("interviews")
        .select("*, applications(*, talent_analysis(*))")
        .eq("interview_id", id)
        .single();

      if (data) setInterview(data);
      setLoading(false);
    };
    fetchInterview();
  }, [id]);

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-zinc-500">Loading Recap...</div>;
  if (!interview) return <div className="h-screen bg-black flex items-center justify-center text-zinc-500">Recap not found.</div>;

  const analysis = interview.applications?.talent_analysis?.[0] || {};
  const app = interview.applications || {};

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/recruitment" className="h-10 w-10 bg-zinc-900 rounded-xl flex items-center justify-center hover:bg-zinc-800 transition-all">
              <ChevronLeft size={20} />
            </Link>
            <div>
              <h1 className="text-2xl font-black">Interview Recap</h1>
              <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest">{app.applicant_name} • {app.applied_cluster_id}</p>
            </div>
          </div>
          <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Completed</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main: Video & Analysis */}
          <div className="lg:col-span-2 space-y-8">

            {/* Video Player */}
            <div className="aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-white/5 relative group">
              {interview.recording_url ? (
                <>
                  <video
                    src={interview.recording_url}
                    controls
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a 
                      href={interview.recording_url} 
                      download={`Interview_${interview.interview_id}.webm`}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-black text-[10px] font-black uppercase rounded-xl shadow-xl shadow-emerald-500/20"
                    >
                      <Zap size={14} fill="currentColor" /> Download Recording
                    </a>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                    <Play size={32} />
                  </div>
                  <p className="text-zinc-500 font-bold text-sm">Recording is being processed...</p>
                </div>
              )}
            </div>

            {/* AI Insights Card */}
            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-8 space-y-6">
              <div className="flex items-center gap-3">
                <Brain className="text-emerald-500" size={24} />
                <h2 className="text-xl font-bold">AI Analysis</h2>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-zinc-900 border border-white/5 rounded-2xl text-center">
                  <p className="text-zinc-500 text-[10px] font-black uppercase mb-1">Match Score</p>
                  <p className="text-2xl font-black text-emerald-500">{analysis.scoring?.match_score || 0}%</p>
                </div>
                <div className="p-4 bg-zinc-900 border border-white/5 rounded-2xl text-center">
                  <p className="text-zinc-500 text-[10px] font-black uppercase mb-1">Technical</p>
                  <p className="text-2xl font-black text-white">{analysis.scoring?.technical_fit || 0}/100</p>
                </div>
                <div className="p-4 bg-zinc-900 border border-white/5 rounded-2xl text-center">
                  <p className="text-zinc-500 text-[10px] font-black uppercase mb-1">Experience</p>
                  <p className="text-2xl font-black text-white">{analysis.scoring?.experience_score || 0}/100</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-zinc-300">Key Takeaways</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                    <p className="text-[10px] text-emerald-500 font-black uppercase mb-2">Strengths</p>
                    <ul className="space-y-2">
                      {(analysis.resume_profile?.key_strengths || []).slice(0, 3).map((s: string, i: number) => (
                        <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
                    <p className="text-[10px] text-rose-500 font-black uppercase mb-2">Weaknesses / Gaps</p>
                    <ul className="space-y-2">
                      {(analysis.gap_analysis?.cons || []).slice(0, 3).map((w: string, i: number) => (
                        <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                          <XCircle size={12} className="text-rose-500 shrink-0 mt-0.5" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar: Meta & History */}
          <div className="space-y-8">
            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-500">Session Details</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Clock size={16} className="text-zinc-500" />
                  <div>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase">Conducted On</p>
                    <p className="text-sm text-zinc-300">{new Date(interview.scheduled_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ShieldCheck size={16} className="text-emerald-500" />
                  <div>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase">Security Status</p>
                    <p className="text-sm text-emerald-500">Encrypted & Scoped</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-500">Interview Transcript</h3>
              <div className="p-4 bg-zinc-950 rounded-2xl border border-white/5 h-64 flex items-center justify-center italic text-xs text-zinc-600 text-center">
                Transcript generation is currently being finalized in Phase 4...
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
