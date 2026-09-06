"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useRef } from "react";
import {
  X, Sparkles, Loader2, CheckCircle2, Circle, ClipboardList,
  Users, Lightbulb, Target, FileText, ChevronDown, ChevronUp,
  Send, BookOpen, AlertCircle, TrendingUp, Clock, Download,
  Edit3, Check, Plus, Trash2,
} from "lucide-react";
import { useMeetingMinutes, ActionItem } from "@/hooks/useMeetingMinutes";
import { Meeting } from "@/hooks/useMeetings";
import { format, differenceInMinutes } from "date-fns";

// ── Helpers ─────────────────────────────────────────────────────────────────

function SentimentBadge({ value }: { value?: string }) {
  if (!value) return null;
  const map: Record<string, string> = {
    positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    neutral:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
    negative: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-wider ${map[value] || ""}`}>
      {value}
    </span>
  );
}

function EffectivenessBadge({ value }: { value?: string }) {
  if (!value) return null;
  const map: Record<string, string> = {
    high:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low:    "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-wider ${map[value] || ""}`}>
      <TrendingUp size={9} /> {value} effectiveness
    </span>
  );
}

function Section({ icon: Icon, title, children, defaultOpen = true }: {
  icon: React.ElementType; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-theme-card border border-theme-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-theme-subtle/30 transition-colors">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-theme-primary" />
          <span className="text-xs font-black text-theme-fg uppercase tracking-wider">{title}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-theme-muted" /> : <ChevronDown size={14} className="text-theme-muted" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Main Modal ───────────────────────────────────────────────────────────────

interface Props {
  meeting: Meeting;
  currentUserId: string;
  onClose: () => void;
  isAdmin?: boolean;
}

export function MeetingMinutesModal({ meeting, currentUserId, onClose, isAdmin = false }: Props) {
  const { minutes, loading, analyzing, saving, analyze, save, toggleActionItem, publish } =
    useMeetingMinutes(meeting.id);

  const [tab, setTab] = useState<"minutes" | "transcript">("minutes");
  const [transcript, setTranscript] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [newDecision, setNewDecision] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newAction, setNewAction] = useState({ task: "", assignee_name: "", due_date: "" });

  const participants = meeting.meeting_participants?.map(p => (p as any).employees?.name || "").filter(Boolean) || [];
  const durationMins = meeting.started_at && meeting.ended_at
    ? differenceInMinutes(new Date(meeting.ended_at), new Date(meeting.started_at))
    : undefined;

  const handleAnalyze = async () => {
    const text = transcript.trim() || minutes?.transcript || "";
    if (!text) return;
    await analyze({
      transcript: text,
      meeting_title: meeting.title,
      participants,
      duration_minutes: durationMins,
      meeting_id: meeting.id,
      created_by: currentUserId,
    });
    setTab("minutes");
  };

  const handleSaveSummary = async () => {
    if (!minutes) return;
    await save({ meeting_id: meeting.id, created_by: currentUserId, summary: summaryDraft });
    setEditingSummary(false);
  };

  const addDecision = async () => {
    if (!newDecision.trim() || !minutes) return;
    await save({ meeting_id: meeting.id, created_by: currentUserId, decisions: [...(minutes.decisions || []), newDecision.trim()] });
    setNewDecision("");
  };

  const removeDecision = async (i: number) => {
    if (!minutes) return;
    await save({ meeting_id: meeting.id, created_by: currentUserId, decisions: minutes.decisions.filter((_, idx) => idx !== i) });
  };

  const addTopic = async () => {
    if (!newTopic.trim() || !minutes) return;
    await save({ meeting_id: meeting.id, created_by: currentUserId, key_topics: [...(minutes.key_topics || []), newTopic.trim()] });
    setNewTopic("");
  };

  const addActionItem = async () => {
    if (!newAction.task.trim() || !minutes) return;
    const item: ActionItem = { task: newAction.task, assignee_name: newAction.assignee_name || "Unassigned", due_date: newAction.due_date || null, done: false };
    await save({ meeting_id: meeting.id, created_by: currentUserId, action_items: [...(minutes.action_items || []), item] });
    setNewAction({ task: "", assignee_name: "", due_date: "" });
  };

  const removeActionItem = async (i: number) => {
    if (!minutes) return;
    await save({ meeting_id: meeting.id, created_by: currentUserId, action_items: minutes.action_items.filter((_, idx) => idx !== i) });
  };

  const handleCreateEmpty = async () => {
    await save({ meeting_id: meeting.id, created_by: currentUserId, status: "draft" });
  };

  const handleExport = () => {
    if (!minutes) return;
    const lines = [
      `# Meeting Minutes — ${meeting.title}`,
      `Date: ${meeting.scheduled_at ? format(new Date(meeting.scheduled_at), "MMMM d, yyyy h:mm a") : "Instant call"}`,
      `Duration: ${durationMins ? `${durationMins} minutes` : "—"}`,
      `Participants: ${participants.join(", ") || "—"}`,
      `Status: ${minutes.status.toUpperCase()}`,
      "",
      "## Summary",
      minutes.summary || "—",
      "",
      "## Key Topics",
      ...(minutes.key_topics || []).map(t => `- ${t}`),
      "",
      "## Decisions Made",
      ...(minutes.decisions || []).map(d => `- ${d}`),
      "",
      "## Action Items",
      ...(minutes.action_items || []).map(a =>
        `- [${a.done ? "x" : " "}] ${a.task} — ${a.assignee_name}${a.due_date ? ` (Due: ${a.due_date})` : ""}`
      ),
      "",
      minutes.transcript ? "## Transcript\n" + minutes.transcript : "",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MoM_${meeting.title.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-theme-surface border border-theme-border rounded-2xl w-full max-w-3xl h-[90vh] flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-theme-border flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList size={16} className="text-theme-primary flex-shrink-0" />
              <h2 className="text-sm font-black text-theme-fg truncate">Meeting Minutes</h2>
              {minutes?.status === "published" && (
                <span className="px-2 py-0.5 rounded-lg border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-black uppercase tracking-wider flex-shrink-0">
                  Published
                </span>
              )}
              {minutes?.status === "draft" && (
                <span className="px-2 py-0.5 rounded-lg border bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px] font-black uppercase tracking-wider flex-shrink-0">
                  Draft
                </span>
              )}
            </div>
            <p className="text-xs text-theme-muted truncate">{meeting.title}</p>
            <div className="flex items-center gap-3 mt-1">
              {minutes && <SentimentBadge value={minutes.sentiment} />}
              {minutes && <EffectivenessBadge value={minutes.meeting_effectiveness} />}
              {minutes?.follow_up_required && (
                <span className="flex items-center gap-1 text-[9px] font-black text-amber-400 uppercase tracking-wider">
                  <AlertCircle size={9} /> Follow-up required
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            {minutes && (
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-theme-border text-[10px] font-black text-theme-muted hover:border-theme-primary/30 hover:text-theme-primary transition-all">
                <Download size={11} /> Export
              </button>
            )}
            {isAdmin && minutes?.status === "draft" && (
              <button onClick={publish} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[10px] font-black hover:bg-emerald-600 transition-all disabled:opacity-40">
                <Send size={11} /> Publish
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-theme-subtle text-theme-muted transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Meeting meta strip ── */}
        <div className="flex items-center gap-4 px-6 py-2 bg-theme-bg/50 border-b border-theme-border text-[10px] text-theme-muted flex-shrink-0">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {meeting.scheduled_at ? format(new Date(meeting.scheduled_at), "MMM d, yyyy h:mm a") : "Instant"}
          </span>
          {durationMins && <span className="flex items-center gap-1"><Clock size={10} />{durationMins} min</span>}
          <span className="flex items-center gap-1">
            <Users size={10} /> {participants.length} participants
            {participants.length > 0 && `: ${participants.slice(0, 3).join(", ")}${participants.length > 3 ? ` +${participants.length - 3}` : ""}`}
          </span>
        </div>

        {/* ── Tabs ── */}
        {isAdmin && (
          <div className="flex border-b border-theme-border flex-shrink-0">
            {(["minutes", "transcript"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-6 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${tab === t ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme-fg"}`}>
                {t === "minutes" ? "Minutes" : "Transcript / Analyze"}
              </button>
            ))}
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ─ TRANSCRIPT TAB ─ */}
          {tab === "transcript" && isAdmin && (
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-theme-muted uppercase tracking-wider mb-2 block">
                  Paste meeting transcript or recording text
                </label>
                <textarea
                  value={transcript || minutes?.transcript || ""}
                  onChange={e => setTranscript(e.target.value)}
                  placeholder="Paste the full transcript here. You can paste from Zoom, Google Meet recordings, or type meeting notes. The AI will analyze and extract key information automatically..."
                  rows={16}
                  className="w-full bg-theme-bg border border-theme-border rounded-xl px-4 py-3 text-sm text-theme-fg outline-none focus:border-theme-primary/50 resize-none tabular-nums leading-relaxed placeholder:font-sans"
                />
              </div>
              <button
                onClick={handleAnalyze}
                disabled={analyzing || (!transcript.trim() && !minutes?.transcript)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-theme-primary text-white text-sm font-black disabled:opacity-40 hover:bg-theme-primary/90 transition-all">
                {analyzing
                  ? <><Loader2 size={16} className="animate-spin" /> Analyzing with AI…</>
                  : <><Sparkles size={16} /> Analyze &amp; Generate Minutes</>
                }
              </button>
              {analyzing && (
                <p className="text-center text-xs text-theme-muted animate-pulse">
                  Claude is reading the transcript and extracting insights…
                </p>
              )}
            </div>
          )}

          {/* ─ MINUTES TAB ─ */}
          {tab === "minutes" && (
            <div className="p-6 space-y-4">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-theme-muted" /></div>
              ) : !minutes ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-theme-muted">
                  <ClipboardList size={48} strokeWidth={1} />
                  <p className="font-bold text-sm">No minutes yet</p>
                  {isAdmin ? (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-xs text-center max-w-xs">
                        Paste the meeting transcript in the &quot;Transcript / Analyze&quot; tab and let AI generate the full minutes automatically.
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setTab("transcript")}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-theme-primary text-white text-xs font-black hover:bg-theme-primary/90 transition-all">
                          <Sparkles size={12} /> Analyze Transcript
                        </button>
                        <button onClick={handleCreateEmpty}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-theme-border text-xs font-black text-theme-muted hover:border-theme-primary/30 hover:text-theme-primary transition-all">
                          <Edit3 size={12} /> Start Blank
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs">The meeting host hasn&apos;t published minutes yet.</p>
                  )}
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <Section icon={BookOpen} title="Executive Summary">
                    {editingSummary && isAdmin ? (
                      <div className="space-y-2">
                        <textarea value={summaryDraft} onChange={e => setSummaryDraft(e.target.value)}
                          rows={4} className="w-full bg-theme-bg border border-theme-border rounded-xl px-3 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary/50 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={handleSaveSummary} disabled={saving}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-theme-primary text-white text-xs font-black disabled:opacity-40">
                            {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
                          </button>
                          <button onClick={() => setEditingSummary(false)} className="px-3 py-1.5 rounded-lg border border-theme-border text-xs text-theme-muted">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="group relative">
                        <p className="text-sm text-theme-fg leading-relaxed">
                          {minutes.summary || <span className="text-theme-muted italic">No summary yet.</span>}
                        </p>
                        {isAdmin && (
                          <button onClick={() => { setEditingSummary(true); setSummaryDraft(minutes.summary || ""); }}
                            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-1 rounded text-theme-muted hover:text-theme-primary transition-all">
                            <Edit3 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </Section>

                  {/* Key Topics */}
                  <Section icon={Lightbulb} title="Key Topics Discussed">
                    <div className="space-y-1.5">
                      {(minutes.key_topics || []).map((topic, i) => (
                        <div key={i} className="flex items-start gap-2 group">
                          <span className="w-1.5 h-1.5 rounded-full bg-theme-primary mt-1.5 flex-shrink-0" />
                          <span className="text-sm text-theme-fg flex-1">{topic}</span>
                          {isAdmin && (
                            <button onClick={() => save({ meeting_id: minutes.meeting_id, created_by: currentUserId, key_topics: minutes.key_topics.filter((_, idx) => idx !== i) })}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-theme-muted hover:text-rose-400 transition-all">
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      ))}
                      {isAdmin && (
                        <div className="flex gap-2 mt-2">
                          <input value={newTopic} onChange={e => setNewTopic(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addTopic()}
                            placeholder="Add topic…"
                            className="flex-1 bg-theme-bg border border-theme-border rounded-lg px-3 py-1.5 text-xs text-theme-fg outline-none focus:border-theme-primary/50" />
                          <button onClick={addTopic} className="p-1.5 rounded-lg bg-theme-primary/10 text-theme-primary hover:bg-theme-primary/20 transition-colors">
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </Section>

                  {/* Decisions */}
                  <Section icon={Target} title="Decisions Made">
                    <div className="space-y-1.5">
                      {(minutes.decisions || []).length === 0 && (
                        <p className="text-xs text-theme-muted italic">No decisions recorded.</p>
                      )}
                      {(minutes.decisions || []).map((d, i) => (
                        <div key={i} className="flex items-start gap-2 group">
                          <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-theme-fg flex-1">{d}</span>
                          {isAdmin && (
                            <button onClick={() => removeDecision(i)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-theme-muted hover:text-rose-400 transition-all">
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      ))}
                      {isAdmin && (
                        <div className="flex gap-2 mt-2">
                          <input value={newDecision} onChange={e => setNewDecision(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addDecision()}
                            placeholder="Add decision…"
                            className="flex-1 bg-theme-bg border border-theme-border rounded-lg px-3 py-1.5 text-xs text-theme-fg outline-none focus:border-theme-primary/50" />
                          <button onClick={addDecision} className="p-1.5 rounded-lg bg-theme-primary/10 text-theme-primary hover:bg-theme-primary/20 transition-colors">
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </Section>

                  {/* Action Items */}
                  <Section icon={ClipboardList} title={`Action Items (${(minutes.action_items || []).filter(a => !a.done).length} open)`}>
                    <div className="space-y-2">
                      {(minutes.action_items || []).length === 0 && (
                        <p className="text-xs text-theme-muted italic">No action items.</p>
                      )}
                      {(minutes.action_items || []).map((item, i) => (
                        <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border transition-all group ${item.done ? "border-theme-border/50 bg-theme-bg/30 opacity-60" : "border-theme-border bg-theme-bg hover:border-theme-primary/20"}`}>
                          <button onClick={() => toggleActionItem(i)} className="flex-shrink-0 mt-0.5">
                            {item.done
                              ? <CheckCircle2 size={16} className="text-emerald-400" />
                              : <Circle size={16} className="text-theme-muted hover:text-theme-primary transition-colors" />
                            }
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${item.done ? "line-through text-theme-muted" : "text-theme-fg"}`}>
                              {item.task}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-theme-muted flex items-center gap-1">
                                <Users size={9} /> {item.assignee_name}
                              </span>
                              {item.due_date && (
                                <span className="text-[10px] text-theme-muted flex items-center gap-1">
                                  <Clock size={9} /> {item.due_date}
                                </span>
                              )}
                            </div>
                          </div>
                          {isAdmin && (
                            <button onClick={() => removeActionItem(i)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-theme-muted hover:text-rose-400 transition-all flex-shrink-0">
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Add action item */}
                      {isAdmin && (
                        <div className="mt-3 p-3 rounded-xl border border-dashed border-theme-border space-y-2">
                          <p className="text-[10px] font-black text-theme-muted uppercase tracking-wider">Add Action Item</p>
                          <input value={newAction.task} onChange={e => setNewAction(a => ({ ...a, task: e.target.value }))}
                            placeholder="Task description…"
                            className="w-full bg-theme-bg border border-theme-border rounded-lg px-3 py-1.5 text-xs text-theme-fg outline-none focus:border-theme-primary/50" />
                          <div className="flex gap-2">
                            <input value={newAction.assignee_name} onChange={e => setNewAction(a => ({ ...a, assignee_name: e.target.value }))}
                              placeholder="Assignee name…"
                              className="flex-1 bg-theme-bg border border-theme-border rounded-lg px-3 py-1.5 text-xs text-theme-fg outline-none focus:border-theme-primary/50" />
                            <input type="date" value={newAction.due_date} onChange={e => setNewAction(a => ({ ...a, due_date: e.target.value }))}
                              className="flex-1 bg-theme-bg border border-theme-border rounded-lg px-3 py-1.5 text-xs text-theme-fg outline-none focus:border-theme-primary/50" />
                            <button onClick={addActionItem}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-theme-primary text-white text-xs font-black hover:bg-theme-primary/90 transition-all">
                              <Plus size={10} /> Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Section>

                  {/* Transcript preview (read-only collapsed) */}
                  {minutes.transcript && (
                    <Section icon={FileText} title="Transcript" defaultOpen={false}>
                      <pre className="text-xs text-theme-muted whitespace-pre-wrap leading-relaxed tabular-nums max-h-64 overflow-y-auto">
                        {minutes.transcript}
                      </pre>
                    </Section>
                  )}

                  {/* Footer meta */}
                  {minutes.analyzed_at && (
                    <p className="text-center text-[10px] text-theme-muted">
                      AI analysis by {minutes.analysis_model} · {format(new Date(minutes.analyzed_at), "MMM d, yyyy h:mm a")}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
