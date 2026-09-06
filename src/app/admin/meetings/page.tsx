/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMeetings, Meeting } from "@/hooks/useMeetings";
import { useAuth } from "@/components/layout/AuthProvider";
import { useNotifications } from "@/components/layout/NotificationProvider";
import { supabase } from "@/lib/supabase";
import {
  Video, Mic, Plus, Calendar, Clock, Users,
  X, Loader2, Play, Square, Globe, Search
} from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";

function StatusBadge({ status }: { status: Meeting["status"] }) {
  const map = {
    scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    ended:     "bg-theme-subtle/10 text-theme-muted border-theme-border",
    cancelled: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-wider ${map[status]}`}>
      {status === "active" ? "● Live" : status}
    </span>
  );
}

function MeetingCard({ meeting, onJoin, onEnd, isHost }: {
  meeting: Meeting; onJoin: () => void; onEnd: () => void; isHost: boolean;
}) {
  const when = meeting.scheduled_at
    ? isToday(new Date(meeting.scheduled_at))
      ? `Today ${format(new Date(meeting.scheduled_at), "h:mm a")}`
      : isTomorrow(new Date(meeting.scheduled_at))
      ? `Tomorrow ${format(new Date(meeting.scheduled_at), "h:mm a")}`
      : format(new Date(meeting.scheduled_at), "MMM d, h:mm a")
    : "Instant";
  const Icon = meeting.type === "audio" ? Mic : Video;

  return (
    <div className="bg-theme-card border border-theme-border rounded-2xl p-5 flex items-center gap-4 hover:border-theme-primary/30 transition-all group">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${meeting.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-theme-primary/10 text-theme-primary"}`}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-black text-theme-fg truncate">{meeting.title}</h3>
          <StatusBadge status={meeting.status} />
        </div>
        <div className="flex items-center gap-4 text-[10px] text-theme-muted">
          <span className="flex items-center gap-1"><Clock size={10} />{when}</span>
          <span className="flex items-center gap-1"><Users size={10} />{meeting.meeting_participants?.length || 0} invited</span>
          {meeting.host && <span className="flex items-center gap-1"><Globe size={10} />Host: {meeting.host.name}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {meeting.status !== "ended" && meeting.status !== "cancelled" && (
          <button onClick={onJoin}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-theme-primary text-white text-xs font-black hover:bg-theme-primary/90 transition-all">
            <Play size={12} /> Join
          </button>
        )}
        {isHost && meeting.status === "active" && (
          <button onClick={onEnd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-black hover:bg-rose-600 transition-all">
            <Square size={12} /> End
          </button>
        )}
      </div>
    </div>
  );
}

function ScheduleModal({ onClose, onScheduled }: { onClose: () => void; onScheduled: () => void }) {
  const { user } = useAuth();
  const { scheduleMeeting } = useMeetings();
  const [employees, setEmployees] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [form, setForm] = useState({
    title: "", description: "", scheduled_at: "",
    type: "video" as "video" | "audio",
    channel_id: "", participant_ids: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("employees").select("id,name,department").eq("is_active", true).then(({ data }) => setEmployees(data || []));
    supabase.from("channels").select("id,name,category").order("name").then(({ data }) => setChannels(data || []));
  }, []);

  const toggleParticipant = (id: string) => {
    setForm(f => ({
      ...f,
      participant_ids: f.participant_ids.includes(id)
        ? f.participant_ids.filter(p => p !== id)
        : [...f.participant_ids, id],
    }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await scheduleMeeting(form);
    setSaving(false);
    onScheduled();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-theme-surface border border-theme-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-theme-border">
          <h2 className="text-sm font-black text-theme-fg uppercase tracking-wider">Schedule Meeting</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-theme-subtle text-theme-muted"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-black text-theme-muted uppercase tracking-wider mb-1.5 block">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Q2 Review, Sprint Planning..."
              className="w-full bg-theme-bg border border-theme-border rounded-xl px-4 py-2.5 text-sm text-theme-fg outline-none focus:border-theme-primary/50" />
          </div>
          <div>
            <label className="text-[10px] font-black text-theme-muted uppercase tracking-wider mb-1.5 block">Type</label>
            <div className="flex gap-2">
              {(["video", "audio"] as const).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-black transition-all ${form.type === t ? "bg-theme-primary/10 border-theme-primary/30 text-theme-primary" : "border-theme-border text-theme-muted"}`}>
                  {t === "video" ? <Video size={14} /> : <Mic size={14} />}
                  {t === "video" ? "Video" : "Audio"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-theme-muted uppercase tracking-wider mb-1.5 block">Date & Time</label>
            <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
              className="w-full bg-theme-bg border border-theme-border rounded-xl px-4 py-2.5 text-sm text-theme-fg outline-none focus:border-theme-primary/50" />
          </div>
          <div>
            <label className="text-[10px] font-black text-theme-muted uppercase tracking-wider mb-1.5 block">Notify Channel (optional)</label>
            <Select value={form.channel_id || "none"} onValueChange={(v) => setForm(f => ({ ...f, channel_id: v === "none" ? "" : v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {channels.map(c => <SelectItem key={c.id} value={c.id}>#{c.name} ({c.category})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-black text-theme-muted uppercase tracking-wider mb-1.5 block">Invite Participants</label>
            <div className="max-h-44 overflow-y-auto space-y-0.5 border border-theme-border rounded-xl p-2">
              {employees.filter(e => e.id !== user?.id).map(e => (
                <label key={e.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-theme-subtle/50 cursor-pointer">
                  <input type="checkbox" checked={form.participant_ids.includes(e.id)} onChange={() => toggleParticipant(e.id)} className="rounded" />
                  <span className="text-xs text-theme-fg">{e.name}</span>
                  <span className="text-[9px] text-theme-muted ml-auto">{e.department}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-theme-muted uppercase tracking-wider mb-1.5 block">Notes (optional)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} placeholder="Agenda..."
              className="w-full bg-theme-bg border border-theme-border rounded-xl px-4 py-2.5 text-sm text-theme-fg outline-none focus:border-theme-primary/50 resize-none" />
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-theme-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-theme-border text-sm font-bold text-theme-muted hover:bg-theme-subtle transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !form.title.trim()}
            className="flex-1 py-2.5 rounded-xl bg-theme-primary text-white text-sm font-black disabled:opacity-40 hover:bg-theme-primary/90 transition-all flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminMeetingsPage() {
  const { user } = useAuth();
  const { meetings, loading, scheduleMeeting, endMeeting, refetch } = useMeetings();
  const { setActiveCall, activeCall } = useNotifications();
  const [showSchedule, setShowSchedule] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"upcoming" | "active" | "past">("upcoming");

  const handleInstantCall = async (type: "video" | "audio") => {
    if (!user) return;
    const result = await scheduleMeeting({
      title: `${type === "video" ? "Video" : "Audio"} Call — ${format(new Date(), "MMM d h:mm a")}`,
      type,
    });
    if (result) setActiveCall({ roomName: result.room_name, title: result.title, type });
  };

  const filtered = meetings.filter(m => {
    const matchSearch = m.title.toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "active" ? m.status === "active"
      : tab === "past" ? (m.status === "ended" || m.status === "cancelled")
      : (m.status === "scheduled" || m.status === "active");
    return matchSearch && matchTab;
  });



  return (
    <DashboardShell
      moduleKey="meetings"
      title="Meetings"
      subtitle="Schedule, join, and manage video and audio calls"
      actions={
        <div className="flex items-center gap-3">
          <button onClick={() => handleInstantCall("audio")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border text-xs font-black text-theme-muted hover:border-theme-primary/30 hover:text-theme-primary transition-all">
            <Mic size={14} /> Audio Call
          </button>
          <button onClick={() => handleInstantCall("video")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border text-xs font-black text-theme-muted hover:border-theme-primary/30 hover:text-theme-primary transition-all">
            <Video size={14} /> Video Call
          </button>
          <button onClick={() => setShowSchedule(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-theme-primary text-white text-xs font-black hover:bg-theme-primary/90 transition-all">
            <Plus size={14} /> Schedule
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search meetings..."
              className="w-full bg-theme-card border border-theme-border rounded-xl pl-9 pr-4 py-2 text-sm text-theme-fg outline-none focus:border-theme-primary/50" />
          </div>
          <div className="flex bg-theme-card border border-theme-border rounded-xl p-1">
            {(["upcoming", "active", "past"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${tab === t ? "bg-theme-primary text-white" : "text-theme-muted hover:text-theme-fg"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-theme-muted" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-theme-muted">
            <Calendar size={48} strokeWidth={1} />
            <p className="font-bold">No {tab} meetings</p>
            <button onClick={() => setShowSchedule(true)} className="text-sm text-theme-primary hover:underline">Schedule one</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(m => (
              <MeetingCard key={m.id} meeting={m} isHost={m.host_id === user?.id}
                onJoin={() => setActiveCall({ roomName: m.room_name, title: m.title, type: m.type })}
                onEnd={() => endMeeting(m.id)} />
            ))}
          </div>
        )}
      </div>
      {showSchedule && <ScheduleModal onClose={() => setShowSchedule(false)} onScheduled={refetch} />}
    </DashboardShell>
  );
}
