/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { useChannels, useMessaging, usePresence, Channel, Message } from "@/hooks/useMessaging";
import { useAuth } from "@/components/layout/AuthProvider";
import { supabase } from "@/lib/supabase";
import {
  Search, Send, Hash, Megaphone, Globe, Paperclip, X,
  ChevronDown, ChevronRight, Loader2, Trash2
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";

// ─── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ name, online, size = "md" }: { name: string; online?: boolean; size?: "sm" | "md" }) {
  const initials = name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  const dim = size === "sm" ? "w-7 h-7 text-[9px]" : "w-9 h-9 text-xs";
  return (
    <div className="relative flex-shrink-0">
      <div className={`${dim} rounded-xl bg-theme-primary/10 text-theme-primary font-black flex items-center justify-center`}>
        {initials}
      </div>
      {online !== undefined && (
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-theme-surface ${online ? "bg-emerald-500" : "bg-theme-subtle"}`} />
      )}
    </div>
  );
}

// ─── Channel icon ─────────────────────────────────────────────────────────────
function ChanIcon({ type, active }: { type: string; active: boolean }) {
  const Icon = type === "announcement" ? Megaphone : type === "global" ? Globe : Hash;
  return (
    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${active ? "bg-theme-primary text-white" : "bg-theme-subtle text-theme-muted"}`}>
      <Icon size={15} />
    </div>
  );
}

// ─── ChannelGroup ─────────────────────────────────────────────────────────────
function ChannelGroup({
  label, channels, activeId, onSelect
}: { label: string; channels: Channel[]; activeId: string | null; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  if (!channels.length) return null;
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 px-2 mb-2 w-full text-left group">
        {open ? <ChevronDown size={11} className="text-theme-muted" /> : <ChevronRight size={11} className="text-theme-muted" />}
        <span className="text-[9px] font-black text-theme-muted uppercase tracking-[0.25em] group-hover:text-theme-fg transition-colors">{label}</span>
      </button>
      {open && (
        <div className="space-y-0.5">
          {channels.map(ch => {
            const active = ch.id === activeId;
            return (
              <button
                key={ch.id}
                onClick={() => onSelect(ch.id)}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all ${active ? "bg-theme-primary/10 border border-theme-primary/20" : "hover:bg-theme-subtle/50 border border-transparent"}`}
              >
                <ChanIcon type={ch.type} active={active} />
                <div className="flex-1 text-left overflow-hidden">
                  <p className={`text-[11px] font-black uppercase tracking-wider truncate ${active ? "text-theme-primary" : "text-theme-fg"}`}>{ch.name}</p>
                </div>
                {(ch.unread_count ?? 0) > 0 && (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center px-1">
                    {ch.unread_count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MessageItem ──────────────────────────────────────────────────────────────
function MessageItem({ msg, isOwn, onDelete }: { msg: Message; isOwn: boolean; onDelete: (id: string) => void }) {
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} group`}>
      <div className={`flex gap-3 max-w-[70%] ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
        {!isOwn && <Avatar name={msg.sender_name} size="sm" />}
        <div className="space-y-1">
          {!isOwn && (
            <p className="text-[9px] font-black text-theme-muted uppercase tracking-wider ml-1">{msg.sender_name}</p>
          )}
          <div className={`relative px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${isOwn ? "bg-theme-primary text-white rounded-tr-none" : "bg-theme-card border border-theme-border text-theme-fg rounded-tl-none"}`}>
            {msg.content && <p>{msg.content}</p>}
            {msg.file_url && (
              <a href={msg.file_url} target="_blank" rel="noreferrer" className={`flex items-center gap-2 mt-1 text-xs underline ${isOwn ? "text-white/80" : "text-theme-primary"}`}>
                <Paperclip size={12} /> {msg.file_name || "attachment"}
              </a>
            )}
            {isOwn && (
              <button
                onClick={() => onDelete(msg.id)}
                className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-rose-500 text-white hidden group-hover:flex items-center justify-center shadow"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
          <p className={`text-[8px] font-black text-theme-muted uppercase tracking-widest ${isOwn ? "text-right mr-1" : "ml-1"}`}>{time}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmployeeMessagesPage() {
  const { user } = useAuth();
  const { channels, loading: chLoading } = useChannels(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { messages, loading: msgLoading, sendMessage, deleteMessage } = useMessaging(activeId);
  const { onlineUsers } = usePresence(activeId);
  const [input, setInput] = useState("");
  const [fileUploading, setFileUploading] = useState(false);
  const [members, setMembers] = useState<Array<{ id: string; name: string; designation?: string }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-select first channel
  useEffect(() => {
    if (!activeId && channels.length) setActiveId(channels[0].id);
  }, [channels, activeId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load channel members
  useEffect(() => {
    if (!activeId) return;
    supabase
      .from("channel_members")
      .select("employee_id, employees(id, name, designation)")
      .eq("channel_id", activeId)
      .then(({ data }) => {
        if (data) setMembers(data.map((r: any) => ({ id: r.employees.id, name: r.employees.name, designation: r.employees.designation })));
      });
  }, [activeId]);

  const activeChannel = channels.find(c => c.id === activeId) ?? null;
  const onlineIds = new Set(onlineUsers.map(u => u.id));

  const filtered = search
    ? channels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : channels;

  const globalChannels  = filtered.filter(c => c.category === "global");
  const teamChannels    = filtered.filter(c => c.category === "team");
  const deptChannels    = filtered.filter(c => c.category === "department");
  const projectChannels = filtered.filter(c => c.category === "project");
  const otherChannels   = filtered.filter(c => c.category === "other");

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    await sendMessage(text);
  }, [input, sendMessage]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    setFileUploading(true);
    const path = `${activeId}/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from("attachments").upload(path, file);
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);
      await sendMessage("", publicUrl, { name: file.name, type: file.type, size: file.size });
    }
    setFileUploading(false);
    e.target.value = "";
  }, [activeId, sendMessage]);

  return (
    <DashboardShell
      moduleKey="my_messages" title="Messages" subtitle="Team channels and real-time communication">
      <div className="flex h-[calc(100vh-140px)] min-h-[600px] gap-4">
        {/* Sidebar */}
        <div className="w-72 flex flex-col bg-theme-surface border border-theme-border rounded-2xl overflow-hidden">
          {/* Search */}
          <div className="p-4 border-b border-theme-border">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search channels..."
                className="w-full bg-theme-bg border border-theme-border rounded-xl pl-9 pr-3 py-2 text-xs text-theme-fg placeholder:text-theme-muted outline-none focus:border-theme-primary/50 transition-all"
              />
            </div>
          </div>

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {chLoading ? (
              <div className="flex items-center justify-center h-20 text-theme-muted">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : (
              <>
                <ChannelGroup label="Global"      channels={globalChannels}  activeId={activeId} onSelect={setActiveId} />
                <ChannelGroup label="Teams"       channels={teamChannels}    activeId={activeId} onSelect={setActiveId} />
                <ChannelGroup label="Departments" channels={deptChannels}    activeId={activeId} onSelect={setActiveId} />
                <ChannelGroup label="Projects"    channels={projectChannels} activeId={activeId} onSelect={setActiveId} />
                {otherChannels.length > 0 && <ChannelGroup label="Other" channels={otherChannels} activeId={activeId} onSelect={setActiveId} />}
              </>
            )}
          </div>

          {/* User strip */}
          {user && (
            <div className="p-4 border-t border-theme-border flex items-center gap-3">
              <Avatar name={user.name || "Me"} online={true} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-theme-fg uppercase tracking-wider truncate">{user.name}</p>
                <p className="text-[9px] text-theme-muted">Online</p>
              </div>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-theme-surface border border-theme-border rounded-2xl overflow-hidden">
          {activeChannel ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border bg-theme-card">
                <div className="flex items-center gap-3">
                  <ChanIcon type={activeChannel.type} active={true} />
                  <div>
                    <h3 className="text-sm font-black text-theme-fg uppercase tracking-wider">{activeChannel.name}</h3>
                    {activeChannel.description && (
                      <p className="text-[10px] text-theme-muted">{activeChannel.description}</p>
                    )}
                  </div>
                </div>
                <span className="text-[9px] text-theme-muted font-bold">{members.length} members · {onlineUsers.length} online</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-theme-bg/30">
                {msgLoading ? (
                  <div className="flex items-center justify-center h-full text-theme-muted">
                    <Loader2 size={24} className="animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-theme-muted gap-3">
                    <Hash size={40} strokeWidth={1} />
                    <p className="text-sm font-bold">No messages yet</p>
                    <p className="text-xs">Be the first to say something in #{activeChannel.name}</p>
                  </div>
                ) : (
                  messages.map(msg => (
                    <MessageItem
                      key={msg.id}
                      msg={msg}
                      isOwn={msg.sender_id === user?.id}
                      onDelete={deleteMessage}
                    />
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-theme-border bg-theme-card">
                <div className="flex items-center gap-3 bg-theme-bg border border-theme-border rounded-2xl px-3 py-2 focus-within:border-theme-primary/50 transition-all">
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={handleFile}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={fileUploading}
                    className="p-2 text-theme-muted hover:text-theme-primary transition-colors"
                  >
                    {fileUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                  </button>
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder={`Message #${activeChannel.name}`}
                    className="flex-1 bg-transparent outline-none text-sm text-theme-fg placeholder:text-theme-muted py-1"
                  />
                  {input && (
                    <button onClick={() => setInput("")} className="p-1 text-theme-muted hover:text-theme-fg">
                      <X size={14} />
                    </button>
                  )}
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="p-2 rounded-xl bg-theme-primary text-white disabled:opacity-40 hover:bg-theme-primary/90 transition-all"
                  >
                    <Send size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-theme-muted gap-4">
              <Hash size={48} strokeWidth={1} />
              <p className="text-base font-bold">Select a channel to start messaging</p>
            </div>
          )}
        </div>

        {/* Members panel */}
        {activeChannel && members.length > 0 && (
          <div className="w-56 bg-theme-surface border border-theme-border rounded-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-theme-border">
              <p className="text-[9px] font-black text-theme-muted uppercase tracking-[0.25em]">Members — {members.length}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {/* Online */}
              {members.filter(m => onlineIds.has(m.id)).length > 0 && (
                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-wider px-2 mb-1">Online</p>
              )}
              {members.filter(m => onlineIds.has(m.id)).map(m => (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-theme-subtle/50 transition-colors">
                  <Avatar name={m.name} online={true} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-theme-fg truncate">{m.name}</p>
                    {m.designation && <p className="text-[8px] text-theme-muted truncate">{m.designation}</p>}
                  </div>
                </div>
              ))}
              {/* Offline */}
              {members.filter(m => !onlineIds.has(m.id)).length > 0 && (
                <p className="text-[8px] font-black text-theme-muted uppercase tracking-wider px-2 mt-3 mb-1">Offline</p>
              )}
              {members.filter(m => !onlineIds.has(m.id)).map(m => (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-theme-subtle/50 transition-colors opacity-60">
                  <Avatar name={m.name} online={false} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-theme-fg truncate">{m.name}</p>
                    {m.designation && <p className="text-[8px] text-theme-muted truncate">{m.designation}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
