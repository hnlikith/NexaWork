"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useRef } from "react";
import {
  Hash, Megaphone, Globe, Plus, Search, Bell, Send, Users,
  ChevronDown, MessageSquare, Download, Mic, Video,
  FileIcon, Circle, Trash2, RefreshCw, ChevronLeft, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { useChannels, useMessaging, usePresence, type Channel, type Message } from "@/hooks/useMessaging";
import { useAuth, getDashboardForRole, type Role } from "@/components/layout/AuthProvider";
import { usePermission } from "@/hooks/usePermission";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/components/layout/NotificationProvider";
import { supabase } from "@/lib/supabase";

// ─── helpers ──────────────────────────────────────────────────────────────────
const dayLabel = (d: Date) =>
  isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMMM d, yyyy");

const channelIcon = (type: Channel["type"], size = 15) => {
  if (type === "announcement") return <Megaphone size={size} />;
  if (type === "global")       return <Globe size={size} />;
  return <Hash size={size} />;
};

function Avatar({ name, size = "md", online }: { name: string; size?: "sm" | "md" | "lg"; online?: boolean }) {
  const dim = size === "sm" ? "w-7 h-7 text-[9px]" : size === "lg" ? "w-11 h-11 text-sm" : "w-9 h-9 text-[11px]";
  return (
    <div className="relative flex-shrink-0">
      <div className={cn("rounded-xl bg-theme-primary flex items-center justify-center text-white font-black shadow-sm", dim)}>
        {name?.slice(0, 2).toUpperCase() || "?"}
      </div>
      {online !== undefined && (
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-theme-surface",
          online ? "bg-emerald-500" : "bg-theme-muted/40"
        )} />
      )}
    </div>
  );
}

// ─── message item ─────────────────────────────────────────────────────────────
function MessageItem({
  msg, isFirst, isOwn, onDelete, canDelete,
}: {
  msg: Message; isFirst: boolean; isOwn: boolean; onDelete: () => void; canDelete: boolean;
}) {
  const isImage = msg.file_type?.startsWith("image");

  return (
    <div className={cn(
      "group flex items-start gap-3 px-5 py-0.5 hover:bg-theme-raised/40 transition-colors rounded-lg mx-2",
      isFirst && "mt-3"
    )}>
      {/* Avatar / timestamp */}
      <div className="w-9 flex-shrink-0 mt-0.5">
        {isFirst ? (
          <Avatar name={msg.sender_name} size="sm" />
        ) : (
          <span className="text-[9px] text-theme-subtle tabular-nums opacity-0 group-hover:opacity-100 transition-opacity block text-center pt-1">
            {format(new Date(msg.created_at), "HH:mm")}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isFirst && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-[13px] font-black text-theme-fg tracking-tight">{msg.sender_name}</span>
            <span className="text-[10px] text-theme-subtle font-medium">
              {format(new Date(msg.created_at), "HH:mm")}
            </span>
          </div>
        )}
        {msg.content && (
          <p className="text-sm text-theme-fg/90 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        )}
        {msg.file_url && (
          <div className="mt-2 max-w-xs rounded-xl border border-theme-border bg-theme-raised overflow-hidden">
            {isImage ? (
              <a href={msg.file_url} target="_blank" rel="noreferrer">
                <img src={msg.file_url} className="max-h-64 w-full object-contain" alt="attachment" />
              </a>
            ) : (
              <div className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-lg bg-theme-primary/10 text-theme-primary flex items-center justify-center flex-shrink-0">
                  <FileIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-theme-fg truncate">{msg.file_name}</p>
                  <p className="text-[10px] text-theme-muted">
                    {((msg.file_size || 0) / 1024).toFixed(1)} KB
                  </p>
                </div>
                <a href={msg.file_url} download className="p-1.5 text-theme-muted hover:text-theme-fg transition-colors">
                  <Download size={14} />
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {canDelete && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-theme-muted hover:bg-red-500/10 hover:text-red-500"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminMessagingPage() {
  const { user } = useAuth();
  const { canView } = usePermission("messages");
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin" && canView === false) {
      router.replace(getDashboardForRole(user.role as Role));
    }
  }, [canView, user, router]);
  const { channels, loading: chLoading, refetch: refetchChannels } = useChannels(true);

  const [activeId, setActiveId]       = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [input, setInput]             = useState("");
  const [showMembers, setShowMembers] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [members, setMembers]         = useState<any[]>([]);
  const { setActiveCall } = useNotifications();

  const { messages, loading: msgLoading, sendMessage, deleteMessage } = useMessaging(activeId);
  const { onlineUsers } = usePresence(activeId);

  const chatEndRef  = useRef<HTMLDivElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onlineIds = new Set(onlineUsers.map(u => u.id));

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Set first channel as active
  useEffect(() => {
    if (channels.length > 0 && !activeId) setActiveId(channels[0].id);
  }, [channels, activeId]);

  // Load members for active channel
  useEffect(() => {
    if (!activeId) return;
    supabase
      .from("channel_members")
      .select("employee_id, employees (id, name, department, designation, is_active)")
      .eq("channel_id", activeId)
      .then(({ data }) => setMembers((data || []).map((m: any) => m.employees).filter(Boolean)));
  }, [activeId]);

  const activeChannel = channels.find(c => c.id === activeId);

  const filteredChannels = channels.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Group channels by category
  const globalChs  = filteredChannels.filter(c => c.category === "global");
  const teamChs    = filteredChannels.filter(c => c.category === "team");
  const deptChs    = filteredChannels.filter(c => c.category === "department");
  const projectChs = filteredChannels.filter(c => c.category === "project");
  const otherChs   = filteredChannels.filter(c => c.category === "other");

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    await sendMessage(text);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploading(true);
    try {
      const path = `${user.id}/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage.from("attachments").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(data.path);
      await sendMessage("", publicUrl, { name: file.name, type: file.type, size: file.size });
    } catch { alert("Upload failed — ensure 'attachments' bucket exists in Supabase Storage."); }
    finally { setIsUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex bg-theme-page text-theme-fg overflow-hidden">
      <input type="file" className="hidden" ref={fileRef} onChange={handleFile} />


      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-[260px] flex-shrink-0 flex flex-col border-r border-theme-border bg-theme-surface">

        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-theme-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.history.back()}
              className="p-1.5 rounded-lg text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-black text-theme-fg uppercase tracking-widest">Channels</span>
          </div>
          <button onClick={refetchChannels} className="p-1.5 rounded-lg text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-theme-border flex-shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-muted" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search channels…"
              className="w-full h-7 rounded-lg bg-theme-raised border border-theme-border pl-7 pr-3 text-xs text-theme-fg outline-none focus:border-theme-strong transition-all"
            />
          </div>
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto py-2 space-y-4 px-2">
          {chLoading ? (
            <div className="flex justify-center py-8">
              <Circle size={16} className="text-theme-muted animate-spin" />
            </div>
          ) : (
            <>
              <ChannelGroup label="Global"      channels={globalChs}  activeId={activeId} onSelect={setActiveId} />
              <ChannelGroup label="Teams"       channels={teamChs}    activeId={activeId} onSelect={setActiveId} />
              <ChannelGroup label="Departments" channels={deptChs}    activeId={activeId} onSelect={setActiveId} />
              <ChannelGroup label="Projects"    channels={projectChs} activeId={activeId} onSelect={setActiveId} />
              {otherChs.length > 0 && <ChannelGroup label="Other" channels={otherChs} activeId={activeId} onSelect={setActiveId} />}
            </>
          )}
        </div>

        {/* User strip */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-t border-theme-border flex-shrink-0 bg-theme-raised/50">
          <Avatar name={user?.name || "AD"} size="sm" online />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-theme-fg truncate">{user?.name || "Admin"}</p>
            <p className="text-[9px] text-theme-muted font-medium">Super Admin</p>
          </div>
          <button className="p-1.5 rounded-lg text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-colors">
            <Mic size={13} />
          </button>
          <button className="p-1.5 rounded-lg text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-colors">
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* ── Chat Area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Chat header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-theme-border bg-theme-surface flex-shrink-0">
          {activeChannel ? (
            <div className="flex items-center gap-3">
              <div className="text-theme-primary">{channelIcon(activeChannel.type, 18)}</div>
              <div>
                <h2 className="text-sm font-black text-theme-fg tracking-tight">{activeChannel.name}</h2>
                <p className="text-[10px] text-theme-muted">{activeChannel.description || "No description"}</p>
              </div>
            </div>
          ) : (
            <span className="text-sm text-theme-muted font-medium">Select a channel</span>
          )}
          <div className="flex items-center gap-1">
            {activeChannel && (
              <>
                <button
                  onClick={() => setActiveCall({ roomName: `channel-${activeChannel.id}-audio`, title: activeChannel.name, type: "audio" })}
                  className="p-2 rounded-lg text-theme-muted hover:bg-theme-raised hover:text-theme-primary transition-colors" title="Audio call">
                  <Mic size={16} />
                </button>
                <button
                  onClick={() => setActiveCall({ roomName: `channel-${activeChannel.id}-video`, title: activeChannel.name, type: "video" })}
                  className="p-2 rounded-lg text-theme-muted hover:bg-theme-raised hover:text-theme-primary transition-colors" title="Video call">
                  <Video size={16} />
                </button>
              </>
            )}
            <button className="p-2 rounded-lg text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-colors">
              <Bell size={16} />
            </button>
            <button
              onClick={() => setShowMembers(v => !v)}
              className={cn("p-2 rounded-lg transition-colors",
                showMembers ? "bg-theme-primary/10 text-theme-primary" : "text-theme-muted hover:bg-theme-raised hover:text-theme-fg"
              )}
            >
              <Users size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-theme-page py-4">
          {!activeId ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-theme-muted">
              <MessageSquare size={32} className="opacity-30" />
              <p className="text-sm font-semibold">Select a channel to start messaging</p>
            </div>
          ) : msgLoading ? (
            <div className="flex justify-center py-16">
              <Circle size={20} className="text-theme-primary animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-theme-muted">
              <div className="w-16 h-16 rounded-2xl bg-theme-raised flex items-center justify-center text-theme-primary">
                {channelIcon(activeChannel?.type ?? "text", 32)}
              </div>
              <p className="text-sm font-bold text-theme-fg">#{activeChannel?.name}</p>
              <p className="text-xs text-theme-muted">No messages yet. Be the first to say something!</p>
            </div>
          ) : (
            <div className="space-y-0">
              {messages.map((msg, idx) => {
                const prev = messages[idx - 1];
                const isFirst = !prev || prev.sender_id !== msg.sender_id
                  || !isSameDay(new Date(prev.created_at), new Date(msg.created_at));
                const showDate = prev && !isSameDay(new Date(prev.created_at), new Date(msg.created_at));
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex items-center gap-3 px-5 my-4">
                        <div className="flex-1 h-px bg-theme-border" />
                        <span className="text-[10px] font-bold text-theme-muted px-3 py-1 rounded-full border border-theme-border bg-theme-surface">
                          {dayLabel(new Date(msg.created_at))}
                        </span>
                        <div className="flex-1 h-px bg-theme-border" />
                      </div>
                    )}
                    <MessageItem
                      msg={msg}
                      isFirst={isFirst}
                      isOwn={msg.sender_id === user?.id}
                      canDelete={msg.sender_id === user?.id || true /* admin can delete all */}
                      onDelete={() => deleteMessage(msg.id)}
                    />
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        {activeId && (
          <div className="px-4 pb-4 pt-2 bg-theme-page flex-shrink-0">
            <div className={cn(
              "flex items-end gap-2 rounded-xl border bg-theme-surface px-3 py-2 transition-all",
              input.trim() ? "border-theme-strong shadow-sm" : "border-theme-border"
            )}>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                className="p-1.5 rounded-lg text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-colors flex-shrink-0"
              >
                {isUploading ? <Circle size={16} className="animate-spin" /> : <Plus size={16} />}
              </button>
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                placeholder={activeChannel ? `Message #${activeChannel.name}` : "Select a channel…"}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
                }}
                className="flex-1 bg-transparent outline-none text-sm text-theme-fg resize-none py-1 placeholder:text-theme-muted/50 min-h-[28px]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={cn(
                  "p-2 rounded-lg flex-shrink-0 transition-all",
                  input.trim()
                    ? "bg-theme-primary text-white shadow-sm hover:opacity-90 active:scale-95"
                    : "text-theme-muted/40 cursor-not-allowed"
                )}
              >
                <Send size={15} />
              </button>
            </div>
            <p className="text-[9px] text-theme-subtle mt-1.5 px-1">Enter to send · Shift+Enter for new line</p>
          </div>
        )}
      </div>

      {/* ── Members panel ────────────────────────────────────────────────── */}
      {showMembers && activeId && (
        <div className="w-[220px] flex-shrink-0 border-l border-theme-border bg-theme-surface flex flex-col">
          <div className="h-14 flex items-center px-4 border-b border-theme-border flex-shrink-0">
            <span className="text-[10px] font-black text-theme-muted uppercase tracking-widest">Members</span>
            <span className="ml-1.5 text-[10px] text-theme-subtle">({members.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
            {/* Online */}
            {members.filter(m => onlineIds.has(m.id)).length > 0 && (
              <div>
                <p className="text-[9px] font-black text-theme-muted uppercase tracking-widest mb-2 px-1">
                  Online — {members.filter(m => onlineIds.has(m.id)).length}
                </p>
                <div className="space-y-1">
                  {members.filter(m => onlineIds.has(m.id)).map(m => (
                    <MemberRow key={m.id} member={m} online />
                  ))}
                </div>
              </div>
            )}
            {/* Offline */}
            {members.filter(m => !onlineIds.has(m.id)).length > 0 && (
              <div>
                <p className="text-[9px] font-black text-theme-muted uppercase tracking-widest mb-2 px-1">
                  Offline — {members.filter(m => !onlineIds.has(m.id)).length}
                </p>
                <div className="space-y-1 opacity-50">
                  {members.filter(m => !onlineIds.has(m.id)).map(m => (
                    <MemberRow key={m.id} member={m} online={false} />
                  ))}
                </div>
              </div>
            )}
            {members.length === 0 && (
              <p className="text-xs text-theme-subtle text-center py-4">No members</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────
function ChannelGroup({
  label, channels, activeId, onSelect,
}: {
  label: string; channels: Channel[]; activeId: string | null; onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (channels.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center gap-1 w-full px-1 mb-1 text-theme-muted hover:text-theme-fg transition-colors"
      >
        <ChevronDown size={11} strokeWidth={3} className={cn("transition-transform", collapsed && "-rotate-90")} />
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
        <span className="ml-1 text-[9px]">({channels.length})</span>
      </button>
      {!collapsed && channels.map(ch => (
        <button
          key={ch.id}
          onClick={() => onSelect(ch.id)}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all group",
            activeId === ch.id
              ? "bg-theme-primary/10 text-theme-primary"
              : "text-theme-muted hover:bg-theme-raised hover:text-theme-fg"
          )}
        >
          <span className={cn("flex-shrink-0", activeId === ch.id ? "text-theme-primary/70" : "text-theme-muted/60")}>
            {channelIcon(ch.type, 13)}
          </span>
          <span className="text-xs font-semibold flex-1 truncate">{ch.name}</span>
          {(ch.unread_count ?? 0) > 0 && activeId !== ch.id && (
            <span className="bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {ch.unread_count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function MemberRow({ member, online }: { member: any; online: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-theme-raised transition-colors cursor-default">
      <Avatar name={member.name} size="sm" online={online} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-theme-fg truncate">{member.name}</p>
        <p className="text-[9px] text-theme-muted truncate">{member.designation || member.department || "—"}</p>
      </div>
    </div>
  );
}
