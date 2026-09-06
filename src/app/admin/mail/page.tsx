"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/ToastLegacy";
import { useAuth } from "@/components/layout/AuthProvider";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Mail, Inbox, Send, FileText, Paperclip, Layers, PenLine,
  AlertTriangle, Briefcase, IndianRupee, RotateCcw,
  Bot, Sparkles, RefreshCw, Settings, ExternalLink, Clock,
  MessageSquare, Star,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type MailMessage = {
  id: string;
  zoho_message_id: string;
  subject: string;
  from_name: string;
  from_address: string;
  preview: string;
  received_at: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachment: boolean;
  ai_category: string;
  ai_priority: number;
  ai_sentiment: string;
  ai_summary: string;
};

const COLUMNS: { id: string; label: string; color: string; bg: string; border: string; icon: React.ElementType }[] = [
  { id: "URGENT",    label: "Urgent",     color: "text-rose-500",    bg: "bg-rose-500/10",    border: "border-rose-500/20",    icon: AlertTriangle },
  { id: "WORK",      label: "Work",       color: "text-blue-500",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    icon: Briefcase },
  { id: "FINANCE",   label: "Finance",    color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   icon: IndianRupee },
  { id: "FOLLOW_UP", label: "Follow-Up",  color: "text-purple-500",  bg: "bg-purple-500/10",  border: "border-purple-500/20",  icon: RotateCcw },
  { id: "GENERAL",   label: "General",    color: "text-theme-muted", bg: "bg-theme-raised",   border: "border-theme-border",   icon: Mail },
];

function getInitials(name: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function PriorityDot({ p }: { p: number }) {
  const c = ["", "bg-rose-500", "bg-orange-400", "bg-amber-400", "bg-blue-400", "bg-slate-400"];
  return <span className={cn("inline-block w-1.5 h-1.5 rounded-full flex-shrink-0", c[p] || "bg-slate-400")} />;
}

function MailScopeBadge({ msg, size = "small" }: { msg: any; size?: "small" | "large" }) {
  // No hardcoded company domain here — this is a client component and can't
  // read the server-only ZOHO_MAIL_DOMAIN config; left empty rather than
  // guessing, so this badge simply doesn't mark anything "company" until a
  // public config source for the mail domain is introduced.
  const companyDomains: string[] = [];
  
  const isCompanyEmail = (email: string) => {
    if (!email) return false;
    const clean = email.toLowerCase().trim();
    return companyDomains.some(domain => clean.endsWith(`@${domain}`) || clean.endsWith(`.${domain}`));
  };

  const fromAddress = msg.from_address || "";
  
  let recipients: string[] = [];
  if (Array.isArray(msg.to_address)) {
    recipients = msg.to_address;
  } else if (typeof msg.to_address === "string") {
    recipients = msg.to_address.split(",").map((e: string) => e.trim());
  }

  const isFromCompany = isCompanyEmail(fromAddress);
  const isAllToCompany = recipients.length > 0 && recipients.every(email => isCompanyEmail(email));
  const isInternal = isFromCompany && isAllToCompany;

  if (isInternal) {
    return (
      <span className={cn(
        "font-black uppercase tracking-wider rounded-md border",
        size === "large" 
          ? "px-2.5 py-1 text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
          : "px-1.5 py-0.5 text-[8px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
      )}>
        Internal
      </span>
    );
  } else {
    return (
      <span className={cn(
        "font-black uppercase tracking-wider rounded-md border",
        size === "large" 
          ? "px-2.5 py-1 text-[11px] bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40 shadow-sm animate-pulse"
          : "px-1.5 py-0.5 text-[8px] bg-rose-500/15 text-rose-500 border-rose-500/25"
      )}>
        External
      </span>
    );
  }
}

export default function MailHubPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [columns, setColumns]           = useState<Record<string, MailMessage[]>>({
    URGENT: [], WORK: [], FINANCE: [], FOLLOW_UP: [], GENERAL: [],
  });
  const [stats, setStats]               = useState({ unread: 0, sent: 0, threads: 0, files: 0 });
  const [connected, setConnected]       = useState<boolean | null>(null);
  const [loading, setLoading]           = useState(true);
  const [digest, setDigest]             = useState("");
  const [digestLoading, setDigestLoading] = useState(false);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("mail_realtime_kanban")
      .on("broadcast", { event: "new_mail" }, (payload: any) => {
        if (payload.payload && payload.payload.employee_id === user?.id) {
          loadData();
        }
      })
      .on("broadcast", { event: "mail_status_changed" }, (payload: any) => {
        if (payload.payload && payload.payload.employee_id === user?.id) {
          loadData();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mail_messages" }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: cfg } = await supabase
        .from("zoho_config")
        .select("is_connected")
        .maybeSingle();
      setConnected(cfg?.is_connected ?? false);

      const { data: msgs } = await supabase
        .from("mail_messages")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(100);

      const grouped: Record<string, MailMessage[]> = {
        URGENT: [], WORK: [], FINANCE: [], FOLLOW_UP: [], GENERAL: [],
      };
      (msgs || []).forEach((m: MailMessage) => {
        const cat = m.ai_category || "GENERAL";
        const target = grouped[cat] ?? grouped["GENERAL"];
        target.push(m);
      });

      setColumns(grouped);

      const { count: fileCount } = await supabase
        .from("mail_file_shares")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      setStats({
        unread:  (msgs || []).filter((m: MailMessage) => !m.is_read).length,
        sent:    0,
        threads: new Set((msgs || []).map((m: MailMessage) => m.zoho_message_id?.split(".")?.[0]).filter(Boolean)).size,
        files:   fileCount || 0,
      });
    } finally {
      setLoading(false);
    }
  }

  async function generateDigest() {
    setDigestLoading(true);
    try {
      const { data: msgs } = await supabase
        .from("mail_messages")
        .select("from_name, subject, preview, ai_category")
        .in("ai_category", ["URGENT", "WORK"])
        .eq("is_read", false)
        .limit(10);

      if (!msgs?.length) {
        setDigest("Inbox clear — no urgent emails pending.");
        return;
      }

      const res = await fetch("/api/mail/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "digest", messages: msgs }),
      });
      const data = await res.json();
      setDigest(data.digest || "Unable to generate digest.");
    } catch {
      setDigest("AI digest temporarily unavailable.");
    } finally {
      setDigestLoading(false);
    }
  }

  async function handleDragEnd(result: any) {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;

    const srcCol: string = source.droppableId;
    const dstCol: string = destination.droppableId;

    await supabase.from("mail_messages").update({ ai_category: dstCol }).eq("id", draggableId);

    setColumns((prev) => {
      const next = { ...prev, [srcCol]: [...prev[srcCol]], [dstCol]: [...prev[dstCol]] };
      const [moved] = next[srcCol].splice(source.index, 1);
      moved.ai_category = dstCol;
      next[dstCol].splice(destination.index, 0, moved);
      return next;
    });
  }

  return (
    <DashboardShell
      moduleKey="mail_hub"
      title="Mail Hub"
      subtitle="AI-powered email overview — powered by Gemma 4 & Zoho Mail."
      actions={
        <div className="flex items-center gap-2">
          <Link href="/admin/mail/config">
            <button className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-theme-border bg-theme-raised text-xs font-semibold text-theme-muted hover:text-theme-fg transition-all">
              <Settings size={13} /> Config
            </button>
          </Link>
          <button
            onClick={() => { fetch(`/api/mail/inbox?sync=true${user?.id ? `&employee_id=${user.id}` : ""}`); setTimeout(loadData, 2000); }}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-theme-border bg-theme-raised text-xs font-semibold text-theme-muted hover:text-theme-fg transition-all"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Sync
          </button>
          <Link href="/admin/mail/compose">
            <button className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all shadow-sm">
              <PenLine size={13} /> Compose
            </button>
          </Link>
        </div>
      }
    >
      {/* Not Connected Banner */}
      {connected === false && (
        <div className="mb-5 flex items-center gap-4 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-500 flex-shrink-0">
            <AlertTriangle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400">Zoho Mail not connected</p>
            <p className="text-xs text-theme-muted mt-0.5">Connect your Zoho Mail account to start receiving and sending emails from this hub.</p>
          </div>
          <Link href="/admin/mail/config">
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-all flex-shrink-0">
              Connect Now <ExternalLink size={11} className="ml-1" />
            </button>
          </Link>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        {[
          { label: "Unread",         value: stats.unread,  icon: Inbox,        color: "text-blue-500",    bg: "bg-blue-500/10" },
          { label: "Sent Today",     value: stats.sent,    icon: Send,         color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "Active Threads", value: stats.threads, icon: MessageSquare, color: "text-purple-500", bg: "bg-purple-500/10" },
          { label: "Shared Files",   value: stats.files,   icon: Paperclip,    color: "text-amber-500",   bg: "bg-amber-500/10" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="page-card flex items-center gap-3">
            <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
              <Icon size={16} className={color} />
            </div>
            <div>
              <p className="text-[11px] text-theme-muted">{label}</p>
              <p className={cn("text-lg font-black leading-tight", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main: Kanban + Sidebar Panel */}
      <div className="flex gap-5 min-h-0">
        {/* Kanban Board */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-theme-fg">AI-Sorted Email Board</p>
            <span className="flex items-center gap-1 text-[11px] text-theme-muted">
              <Bot size={11} className="text-theme-primary" /> Gemma 4 sorted — drag to re-categorize
            </span>
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-3">
              {COLUMNS.map((col) => {
                const emails = columns[col.id] || [];
                return (
                  <div key={col.id} className="flex-shrink-0 w-60">
                    {/* Column header */}
                    <div className={cn("flex items-center gap-2 mb-2 px-3 py-2 rounded-xl border", col.bg, col.border)}>
                      <col.icon size={13} className={col.color} />
                      <span className={cn("text-xs font-bold", col.color)}>{col.label}</span>
                      <span className={cn("ml-auto text-[10px] font-black opacity-60", col.color)}>{emails.length}</span>
                    </div>

                    <Droppable droppableId={col.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "min-h-20 space-y-2 rounded-xl p-1.5 transition-all",
                            snapshot.isDraggingOver && "bg-theme-raised/70 ring-2 ring-dashed ring-theme-primary/25"
                          )}
                        >
                          {emails.map((email, idx) => (
                            <Draggable key={email.id} draggableId={email.id} index={idx}>
                              {(prov, snap) => (
                                <Link href="/admin/mail/inbox">
                                  <div
                                    ref={prov.innerRef}
                                    {...prov.draggableProps}
                                    {...prov.dragHandleProps}
                                    className={cn(
                                      "p-3 rounded-xl border bg-theme-surface transition-all cursor-grab active:cursor-grabbing select-none",
                                      snap.isDragging
                                        ? "shadow-lg border-theme-primary/30 rotate-1 scale-105"
                                        : "border-theme-border hover:border-theme-primary/30 hover:shadow-sm",
                                      !email.is_read && "border-l-2 border-l-theme-primary"
                                    )}
                                  >
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <div className="h-5 w-5 rounded-full bg-theme-primary/10 flex items-center justify-center text-[9px] font-black text-theme-primary flex-shrink-0">
                                        {getInitials(email.from_name)}
                                      </div>
                                      <span className="text-[11px] font-semibold text-theme-fg truncate flex-1">
                                        {email.from_name || email.from_address}
                                      </span>
                                      <PriorityDot p={email.ai_priority || 3} />
                                      <MailScopeBadge msg={email} />
                                    </div>
                                    <p className={cn("text-[11px] truncate mb-1", !email.is_read ? "font-bold text-theme-fg" : "text-theme-muted font-medium")}>
                                      {email.subject || "(no subject)"}
                                    </p>
                                    <p className="text-[10px] text-theme-muted truncate leading-relaxed">
                                      {email.ai_summary || email.preview}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-theme-border/40">
                                      <Clock size={9} className="text-theme-muted" />
                                      <span className="text-[9px] text-theme-muted flex-1">
                                        {email.received_at
                                          ? formatDistanceToNow(new Date(email.received_at), { addSuffix: true })
                                          : "—"}
                                      </span>
                                      {email.is_starred   && <Star      size={9} className="text-amber-400 fill-amber-400" />}
                                      {email.has_attachment && <Paperclip size={9} className="text-theme-muted" />}
                                    </div>
                                  </div>
                                </Link>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {emails.length === 0 && !snapshot.isDraggingOver && (
                            <div className="flex items-center justify-center h-16 rounded-xl border-2 border-dashed border-theme-border/30">
                              <span className="text-[10px] text-theme-muted/50">Drop here</span>
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        </div>

        {/* Right Sidebar */}
        <div className="w-68 flex-shrink-0 space-y-4" style={{ width: 272 }}>
          {/* AI Digest */}
          <div className="page-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-theme-primary/10 flex items-center justify-center flex-shrink-0">
                <Sparkles size={14} className="text-theme-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-theme-fg">AI Daily Digest</p>
                <p className="text-[10px] text-theme-muted">Gemma 4 · NexaWork AI</p>
              </div>
              <button
                onClick={generateDigest}
                disabled={digestLoading}
                className="p-1.5 rounded-lg hover:bg-theme-raised text-theme-muted hover:text-theme-fg transition-colors"
              >
                <RefreshCw size={12} className={digestLoading ? "animate-spin" : ""} />
              </button>
            </div>

            {digest ? (
              <p className="text-xs text-theme-muted leading-relaxed">{digest}</p>
            ) : (
              <div className="text-center py-3">
                <Bot size={22} className="text-theme-muted/30 mx-auto mb-2" />
                <p className="text-[11px] text-theme-muted mb-3">Generate your AI email digest</p>
                <button
                  onClick={generateDigest}
                  disabled={digestLoading}
                  className="w-full py-2 rounded-xl bg-theme-primary/10 text-theme-primary text-xs font-semibold hover:bg-theme-primary/20 transition-all disabled:opacity-50"
                >
                  {digestLoading ? "Generating..." : "Generate Digest"}
                </button>
              </div>
            )}
          </div>

          {/* Quick Access */}
          <div className="page-card">
            <p className="text-xs font-bold text-theme-fg mb-3">Quick Access</p>
            <div className="space-y-0.5">
              {[
                { href: "/admin/mail/inbox",     label: "Inbox",       icon: Inbox,     badge: stats.unread },
                { href: "/admin/mail/compose",   label: "New Email",   icon: PenLine },
                { href: "/admin/mail/sent",      label: "Sent",        icon: Send },
                { href: "/admin/mail/drafts",    label: "Drafts",      icon: FileText },
                { href: "/admin/mail/files",     label: "File Share",  icon: Paperclip, badge: stats.files },
                { href: "/admin/mail/templates", label: "Templates",   icon: Layers },
              ].map(({ href, label, icon: Icon, badge }) => (
                <Link key={href} href={href}>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-theme-raised text-theme-muted hover:text-theme-fg transition-all">
                    <Icon size={13} className="flex-shrink-0" />
                    <span className="text-xs font-medium flex-1">{label}</span>
                    {badge !== undefined && badge > 0 && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-theme-primary/10 text-theme-primary">
                        {badge}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Sentiment Overview */}
          {Object.values(columns).flat().length > 0 && (
            <div className="page-card">
              <p className="text-xs font-bold text-theme-fg mb-3">Sentiment Overview</p>
              {(["POSITIVE", "NEUTRAL", "NEGATIVE"] as const).map((s) => {
                const all   = Object.values(columns).flat();
                const count = all.filter((m) => m.ai_sentiment === s).length;
                const pct   = all.length ? Math.round((count / all.length) * 100) : 0;
                const colors: Record<string, string> = { POSITIVE: "bg-emerald-500", NEUTRAL: "bg-blue-400", NEGATIVE: "bg-rose-500" };
                const labels: Record<string, string> = { POSITIVE: "Positive", NEUTRAL: "Neutral", NEGATIVE: "Negative" };
                return (
                  <div key={s} className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-theme-muted">{labels[s]}</span>
                      <span className="text-[11px] font-semibold text-theme-fg">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-theme-raised overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", colors[s])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
