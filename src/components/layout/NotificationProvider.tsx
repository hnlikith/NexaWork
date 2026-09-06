"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { startRingtone, stopRingtone, playMessagePing, playCallAccepted, playCallEnded } from "@/lib/sounds";
import { Video, Mic, PhoneOff, Phone, MessageSquare, X, Bell } from "lucide-react";
import dynamic from "next/dynamic";
const CallRoom = dynamic(() => import("@/components/meetings/CallRoom").then(mod => mod.CallRoom), {
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center bg-zinc-900 text-white">Loading Meeting...</div>
});

interface IncomingCall {
  meetingId: string;
  roomName: string;
  title: string;
  callerName: string;
  type: "video" | "audio";
}

interface Toast {
  id: string;
  type: "message" | "meeting" | "info";
  title: string;
  body: string;
  channelId?: string;
}

interface NotificationCtx {
  toasts: Toast[];
  activeCall: { roomName: string; title: string; type: "video" | "audio" | "screen" } | null;
  setActiveCall: (call: { roomName: string; title: string; type: "video" | "audio" | "screen" } | null) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<NotificationCtx | null>(null);
export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications must be inside NotificationProvider");
  return ctx;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCallState] = useState<{ roomName: string; title: string; type: "video" | "audio" | "screen" } | null>(null);
  const lastMsgAt = useRef<string>(new Date().toISOString());

  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev.slice(-4), { ...t, id }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const setActiveCall = useCallback((call: typeof activeCall) => {
    if (call) playCallAccepted();
    else if (activeCall) playCallEnded();
    setActiveCallState(call);
  }, [activeCall]);

  // Listen for new messages in channels user is member of
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("global-message-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_id === user.id) return; // Don't notify own messages
        if (msg.created_at < lastMsgAt.current) return;
        lastMsgAt.current = msg.created_at;
        playMessagePing();
        addToast({ type: "message", title: msg.sender_name, body: msg.content || "Sent an attachment", channelId: msg.channel_id });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_notifications" }, (payload) => {
        const notif = payload.new as any;
        if (notif.user_id !== user.id) return; // Only notify the recipient
        playMessagePing();
        addToast({ type: "info", title: notif.title, body: notif.message });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, addToast]);

  // Listen for new meetings where user is participant
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("global-meeting-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "meetings" }, async (payload) => {
        const meeting = payload.new as any;
        if (meeting.host_id === user.id) return;

        // Check if user is a participant
        const { data } = await supabase
          .from("meeting_participants")
          .select("id")
          .eq("meeting_id", meeting.id)
          .eq("employee_id", user.id)
          .single();

        if (!data) return;

        // Fetch host name
        const { data: host } = await supabase
          .from("employees")
          .select("name")
          .eq("id", meeting.host_id)
          .single();

        // Incoming call notification
        startRingtone();
        setIncomingCall({
          meetingId: meeting.id,
          roomName: meeting.room_name,
          title: meeting.title,
          callerName: host?.name || "Someone",
          type: meeting.type,
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meetings" }, (payload) => {
        const meeting = payload.new as any;
        // If the meeting we're being called for ended/cancelled
        if (incomingCall?.meetingId === meeting.id && (meeting.status === "ended" || meeting.status === "cancelled")) {
          stopRingtone();
          setIncomingCall(null);
          playCallEnded();
          addToast({ type: "info", title: "Call ended", body: "The caller hung up." });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, incomingCall, addToast]);

  const acceptCall = useCallback(() => {
    if (!incomingCall) return;
    stopRingtone();
    setActiveCall({ roomName: incomingCall.roomName, title: incomingCall.title, type: incomingCall.type });
    setIncomingCall(null);
  }, [incomingCall, setActiveCall]);

  const declineCall = useCallback(() => {
    stopRingtone();
    setIncomingCall(null);
    playCallEnded();
  }, []);

  return (
    <Ctx.Provider value={{ toasts, activeCall, setActiveCall, dismissToast }}>
      {children}

      {/* ── Incoming Call Modal ────────────────────────────────────────────── */}
      {incomingCall && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-theme-surface border border-theme-border rounded-xl p-8 w-80 flex flex-col items-center gap-6 shadow-2xl animate-in fade-in zoom-in duration-300">
            {/* Animated ring */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-28 h-28 rounded-full bg-theme-primary/20 animate-ping" />
              <div className="absolute w-24 h-24 rounded-full bg-theme-primary/10 animate-ping" style={{ animationDelay: "0.3s" }} />
              <div className="w-20 h-20 rounded-full bg-theme-primary/20 border-2 border-theme-primary/50 flex items-center justify-center">
                <span className="text-3xl font-black text-theme-fg">{incomingCall.callerName.slice(0, 2).toUpperCase()}</span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-xs text-theme-muted uppercase tracking-widest mb-1">
                {incomingCall.type === "video" ? "Incoming Video Call" : "Incoming Audio Call"}
              </p>
              <h3 className="text-xl font-black text-theme-fg">{incomingCall.callerName}</h3>
              <p className="text-sm text-theme-muted mt-1">{incomingCall.title}</p>
            </div>

            <div className="flex items-center gap-6">
              <button onClick={declineCall}
                className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center transition-all group-hover:scale-110 shadow-lg shadow-rose-500/30">
                  <PhoneOff size={22} className="text-white" />
                </div>
                <span className="text-[10px] text-theme-muted">Decline</span>
              </button>
              <button onClick={acceptCall}
                className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center transition-all group-hover:scale-110 shadow-lg shadow-emerald-500/30">
                  <Phone size={22} className="text-white" />
                </div>
                <span className="text-[10px] text-theme-muted">Accept</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Global Active Call Overlay ─────────────────────────────────────── */}
      {activeCall && (
        <div className="fixed inset-0 z-[150] bg-theme-surface flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border bg-theme-bg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-theme-primary/20 flex items-center justify-center text-theme-primary">
                {activeCall.type === "video" ? <Video size={16} /> : <Mic size={16} />}
              </div>
              <div>
                <p className="text-sm font-black text-theme-fg">{activeCall.title}</p>
                <p className="text-[10px] text-theme-muted tabular-nums">{activeCall.roomName}</p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
            </span>
          </div>
          <div className="flex-1">
            <CallRoom
              roomName={activeCall.roomName}
              displayName={user?.name || "User"}
              type={activeCall.type}
              onLeave={() => setActiveCall(null)}
            />
          </div>
        </div>
      )}

      {/* ── Toast Notifications ────────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className="pointer-events-auto flex items-start gap-3 bg-theme-surface border border-theme-border rounded-xl px-4 py-3 shadow-2xl w-80 animate-in slide-in-from-right-4 fade-in duration-300">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${t.type === "message" ? "bg-theme-primary/10 text-theme-primary" : t.type === "meeting" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
              {t.type === "message" ? <MessageSquare size={15} /> : t.type === "meeting" ? <Video size={15} /> : <Bell size={15} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-theme-fg truncate">{t.title}</p>
              <p className="text-[10px] text-theme-muted truncate">{t.body}</p>
            </div>
            <button onClick={() => dismissToast(t.id)} className="text-theme-muted hover:text-theme-fg transition-colors flex-shrink-0">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
