"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/BadgeLegacy";
import { Button } from "@/components/ui/ButtonLegacy";
import { useToast } from "@/components/ui/ToastLegacy";
import { useAuth } from "@/components/layout/AuthProvider";
import { supabase } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket, Plus, Search, Clock, CheckCircle2, AlertCircle,
  ChevronRight, X, Send, MessageSquare, Loader2,
  Inbox, Zap, ArrowRight, Signal, RefreshCw, Building, Users,
  Paperclip, XCircle, AlertTriangle, ArrowUpRight, GitBranch, Bell
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ──────────────────────────────────────────────────────────────────
interface TrackingEntry {
  timestamp: string;
  action: string;
  by_id: string | null;
  by_name: string;
  by_role?: string | null;
  to_id: string | null;
  to_name: string | null;
  to_role?: string | null;
  notes: string | null;
}

interface TicketRow {
  id: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  rejection_reason: string | null;
  attachments: string[];
  tracking_log: TrackingEntry[];
  creator: { id: string; name: string; role: string; department: string | null } | null;
  assignee: { id: string; name: string; role: string; department: string | null } | null;
  current_handler: { id: string; name: string; role: string; department: string | null } | null;
  linked_ticket_id: string | null;
}

interface ResponseRow {
  id: string;
  message: string;
  created_at: string;
  is_internal: boolean;
  sender: { id: string; name: string; role: string; department: string | null } | null;
}

const PRIORITIES = ["low", "medium", "high", "critical"];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; iconBg: string; icon: any; border: string }> = {
  open:      { label: "Open",       bg: "bg-amber-500/10",   text: "text-amber-500",   iconBg: "bg-amber-500/20",   icon: Ticket,       border: "border-amber-500/20" },
  in_review: { label: "In Review",  bg: "bg-blue-500/10",    text: "text-blue-500",    iconBg: "bg-blue-500/20",    icon: Signal,       border: "border-blue-500/20" },
  closed:    { label: "Closed",     bg: "bg-slate-500/10",   text: "text-slate-500",   iconBg: "bg-slate-500/20",   icon: CheckCircle2, border: "border-slate-500/20" },
  rejected:  { label: "Rejected",   bg: "bg-rose-500/10",    text: "text-rose-500",    iconBg: "bg-rose-500/20",    icon: XCircle,      border: "border-rose-500/20" },
};

const getStatusConf = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.open;

function StatusBadge({ status, className }: { status: string; className?: string }) {
  const conf = getStatusConf(status);
  return (
    <span className={cn("text-[8px] px-2 py-0.5 rounded-md font-black uppercase tracking-widest border", conf.bg, conf.text, conf.border, className)}>
      {conf.label}
    </span>
  );
}

// ─── Tracking Timeline ───────────────────────────────────────────────────────
function TrackingTimeline({ log }: { log: TrackingEntry[] }) {
  if (!log || log.length === 0) return null;
  return (
    <div className="space-y-0">
      {log.map((entry, i) => (
        <div key={i} className="flex gap-3 group">
          <div className="flex flex-col items-center">
            <div className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center border text-[9px] font-black shrink-0 z-10 mt-1",
              i === log.length - 1
                ? "bg-theme-primary/20 border-theme-primary/40 text-theme-primary"
                : "bg-theme-raised/60 border-theme-border/50 text-theme-muted"
            )}>
              {i + 1}
            </div>
            {i < log.length - 1 && <div className="w-px flex-1 bg-theme-border/40 mt-1 mb-0 min-h-[16px]" />}
          </div>
          <div className={cn("pb-4 min-w-0 flex-1", i === log.length - 1 && "pb-0")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-theme-fg">{entry.action}</p>
                <p className="text-[9px] text-theme-muted mt-0.5">
                  By: <span className="text-theme-fg font-bold">{entry.by_name}</span>
                  {entry.by_role && <span className="text-theme-muted font-normal text-[8px]"> ({entry.by_role})</span>}
                  {entry.to_name && (
                    <>
                      {" → "}
                      <span className="text-theme-primary font-bold">{entry.to_name}</span>
                      {entry.to_role && <span className="text-theme-muted font-normal text-[8px]"> ({entry.to_role})</span>}
                    </>
                  )}
                </p>
                {entry.notes && (
                  <p className="text-[9px] text-theme-muted mt-1 italic bg-theme-raised/50 px-2 py-1 rounded-lg border border-theme-border/40">
                    "{entry.notes}"
                  </p>
                )}
              </div>
              <span className="text-[8px] text-theme-muted font-bold whitespace-nowrap shrink-0 mt-0.5">
                {formatDate(entry.timestamp)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Hub ─────────────────────────────────────────────────────────────────
export default function SupportHubPage() {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [activeTab, setActiveTab]     = useState<"raise" | "solve">("raise");
  const [tickets, setTickets]         = useState<TicketRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [isSyncing, setIsSyncing]     = useState(false);

  // Form state (simplified — no manual assignment)
  const [subject, setSubject]         = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority]       = useState("medium");
  const [linkedTicketId, setLinkedTicketId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting]   = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Detail drawer
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [responses, setResponses]     = useState<ResponseRow[]>([]);
  const [responseText, setResponseText] = useState("");
  const [sending, setSending]         = useState(false);
  const [resolving, setResolving]     = useState(false);

  // Desk actions (for TL / DL / solvers)
  const [deskAction, setDeskAction]   = useState<"" | "route_dept" | "notify_dl" | "assign_member" | "reject" | "close">(""); 
  const [actionNote, setActionNote]   = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [deskEmployees, setDeskEmployees] = useState<any[]>([]);
  const [targetDeptName, setTargetDeptName] = useState("");
  const [targetMemberId, setTargetMemberId] = useState("");
  const [deptNames, setDeptNames]     = useState<string[]>([]);
  const [performingAction, setPerformingAction] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/support?userId=${user.id}&userRole=${user.role}`);
      const json = await res.json();
      if (json.tickets) setTickets(json.tickets);
    } catch { showToast("Sync Error: Ticket list failed to refresh", "error"); }
    finally { setLoading(false); setIsSyncing(false); }
  }, [user, showToast]);

  const loadDeptNames = useCallback(async () => {
    const { data } = await supabase.from("employees").select("department").eq("is_active", true);
    if (data) {
      const unique = [...new Set(data.map((e: any) => e.department).filter(Boolean))];
      setDeptNames(unique as string[]);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadTickets();
      loadDeptNames();

      const ch = supabase.channel("realtime-tickets-hub")
        .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, loadTickets)
        .subscribe();

      return () => { supabase.removeChannel(ch); };
    }
  }, [user, loadTickets, loadDeptNames]);

  // Thread responses realtime
  useEffect(() => {
    if (!selectedTicket) return;
    const channel = supabase
      .channel(`ticket-thread-${selectedTicket.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_responses", filter: `ticket_id=eq.${selectedTicket.id}` },
        async (payload) => {
          const { data } = await supabase
            .from("ticket_responses")
            .select("*, sender:employees(id, name, role, department)")
            .eq("id", payload.new.id)
            .single();
          if (data) setResponses(prev => prev.some(r => r.id === data.id) ? prev : [...prev, data]);
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedTicket]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedTicket(null); };
    if (selectedTicket) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [selectedTicket]);

  // ── File handling ─────────────────────────────────────────────────────────
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []);
    const oversized = incoming.filter(f => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      showToast(`File too large (max 50MB): ${oversized.map(f => f.name).join(", ")}`, "error");
    }
    const valid = incoming.filter(f => f.size <= MAX_FILE_SIZE);
    setAttachments(prev => [...prev, ...valid].slice(0, 5));
    e.target.value = "";
  };

  // Upload via server-side API route — uses service role key, bypasses RLS
  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const formData = new FormData();
    formData.append("userId", user!.id);
    files.forEach(f => formData.append("files", f));

    const res = await fetch("/api/support/upload", {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Upload failed");
    return json.paths as string[]; // array of storage paths
  };

  // Get a signed URL via server-side API route
  const getFileUrl = async (storagePath: string): Promise<string> => {
    const res = await fetch(`/api/support/upload?path=${encodeURIComponent(storagePath)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to get file URL");
    return json.url as string;
  };

  // ── Ticket submission ─────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!user || !subject.trim()) {
      showToast("Subject is required.", "warning"); return;
    }
    setSubmitting(true);
    try {
      let attachmentUrls: string[] = [];
      if (attachments.length > 0) {
        setUploadingFiles(true);
        attachmentUrls = await uploadFiles(attachments);
        setUploadingFiles(false);
      }

      const res = await fetch("/api/support", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_id: user.id,
          subject,
          description,
          priority,
          linked_ticket_id: linkedTicketId,
          attachments: attachmentUrls,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast("Ticket raised. Auto-routed to your leads.", "success");
      setSubject(""); setDescription(""); setPriority("medium"); setLinkedTicketId(null); setAttachments([]);
      loadTickets();
    } catch (e: any) {
      showToast(e.message || "Failed to raise ticket.", "error");
    }
    finally { setSubmitting(false); setUploadingFiles(false); }
  }

  // ── Ticket detail ─────────────────────────────────────────────────────────
  const handleTicketSelect = async (ticket: TicketRow) => {
    setSelectedTicket(ticket);
    setDeskAction("");
    setActionNote(""); setRejectionReason(""); setTargetDeptName(""); setTargetMemberId("");
    setResponses([]);

    const origin: ResponseRow = {
      id: "origin",
      message: ticket.description || "No description provided.",
      created_at: ticket.created_at,
      sender: ticket.creator,
      is_internal: false,
    };

    try {
      const res = await fetch(`/api/support/responses?ticketId=${ticket.id}`);
      const json = await res.json();
      setResponses(json.responses ? [origin, ...json.responses] : [origin]);
    } catch {
      setResponses([origin]);
    }

    // Load desk employee list if needed
    if (user?.is_dept_lead || user?.is_team_lead) {
      const { data } = await supabase
        .from("employees")
        .select("id, name, role, department, team_id, is_team_lead, is_dept_lead")
        .eq("is_active", true)
        .neq("id", user.id);
      setDeskEmployees(data || []);
    }
  };

  // ── Desk actions ─────────────────────────────────────────────────────────
  async function performDeskAction() {
    if (!selectedTicket || !user) return;
    setPerformingAction(true);
    try {
      let payload: any = { ticket_id: selectedTicket.id, actor_id: user.id };

      if (deskAction === "reject") {
        if (!rejectionReason.trim()) { showToast("Rejection reason is required.", "warning"); return; }
        payload.action = "reject";
        payload.rejection_reason = rejectionReason;
      } else if (deskAction === "route_dept") {
        if (!targetDeptName) { showToast("Select a target department.", "warning"); return; }
        payload.action = "route_to_dept";
        payload.target_dept_name = targetDeptName;
      } else if (deskAction === "notify_dl") {
        if (!actionNote.trim()) { showToast("Add a note for the Department Lead.", "warning"); return; }
        payload.action = "notify_dept_lead";
        payload.note = actionNote;
      } else if (deskAction === "assign_member") {
        if (!targetMemberId) { showToast("Select a team member.", "warning"); return; }
        payload.action = "assign_to_member";
        payload.target_assignee_id = targetMemberId;
        payload.note = actionNote;
      } else if (deskAction === "close") {
        if (selectedTicket.status !== "in_review") {
          showToast("You must mark the ticket 'In Review' before closing.", "warning"); return;
        }
        payload.action = "update_status";
        payload.status = "closed";
        payload.resolution_notes = actionNote;
        payload.resolved_by = user.id;
      }

      const res = await fetch("/api/support", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      // Update local state
      const updated = json.ticket;
      setSelectedTicket(updated);
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, ...updated } : t));
      showToast("Action performed successfully.", "success");
      setDeskAction(""); setActionNote(""); setRejectionReason(""); setTargetDeptName(""); setTargetMemberId("");
    } catch (e: any) {
      showToast(e.message || "Action failed.", "error");
    }
    finally { setPerformingAction(false); }
  }

  async function markInReview() {
    if (!selectedTicket || !user) return;
    setResolving(true);
    try {
      const res = await fetch("/api/support", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: selectedTicket.id, actor_id: user.id, action: "mark_in_review" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const updated = json.ticket;
      setSelectedTicket(updated);
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, ...updated } : t));
      showToast("Ticket marked as In Review.", "success");
    } catch (e: any) {
      showToast(e.message || "Failed.", "error");
    }
    finally { setResolving(false); }
  }

  async function sendResponse() {
    if (!responseText.trim() || !selectedTicket || !user) return;
    setSending(true);
    try {
      const res = await fetch("/api/support/responses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: selectedTicket.id, sender_id: user.id, message: responseText }),
      });
      if (!res.ok) throw new Error();
      setResponseText("");
      showToast("Message sent.", "success");
    } catch { showToast("Failed to send message.", "error"); }
    finally { setSending(false); }
  }

  const raisedTickets   = tickets.filter(t => t.creator?.id === user?.id);
  const assignedTickets = tickets.filter(t =>
    t.assignee?.id === user?.id || t.current_handler?.id === user?.id
  );

  const isCurrentHandler = selectedTicket
    ? (selectedTicket.assignee?.id === user?.id || selectedTicket.current_handler?.id === user?.id)
    : false;
  const isDeptLead = !!user?.is_dept_lead;
  const isTeamLead = !!user?.is_team_lead;
  const isManager  = isDeptLead || isTeamLead;

  // Determine available desk employees based on role
  const deskMemberOptions = (() => {
    if (!user || !selectedTicket) return deskEmployees;
    if (isDeptLead) return deskEmployees; // Can assign to anyone
    if (isTeamLead) return deskEmployees.filter((e: any) => e.team_id === user?.managed_team_id); // Only same team
    return [];
  })();

  return (
    <DashboardShell
      moduleKey="support_user"
      title="Support Hub"
      subtitle="Raise tickets — system auto-routes to your leads based on your org structure."
      actions={
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest",
            isSyncing ? "border-amber-500/20 text-amber-500 bg-amber-500/5" : "border-emerald-500/20 text-emerald-500 bg-emerald-500/5"
          )}>
            <div className={cn("h-1.5 w-1.5 rounded-full", isSyncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
            {isSyncing ? "Syncing" : "Live"}
          </div>
          <Button variant="outline" size="sm" onClick={loadTickets} className="h-8">
            <RefreshCw size={12} className={cn("mr-1.5", isSyncing && "animate-spin")} /> Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Tab Bar */}
        <div className="flex items-center gap-2 bg-theme-raised/30 p-1 rounded-2xl border border-theme-border w-fit">
          {[
            { id: "raise" as const, label: "Raise Ticket", icon: Plus, count: raisedTickets.length },
            { id: "solve" as const, label: "My Desk", icon: Inbox, count: assignedTickets.filter(t => t.status === "open" || t.status === "in_review").length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all",
                activeTab === tab.id
                  ? "bg-theme-surface text-theme-fg shadow-xl border border-theme-border"
                  : "text-theme-muted hover:text-theme-fg"
              )}
            >
              <tab.icon size={14} className={activeTab === tab.id ? "text-theme-primary" : ""} />
              {tab.label}
              {tab.count > 0 && (
                <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md ml-1",
                  activeTab === tab.id ? "bg-theme-primary text-white" : "bg-theme-raised text-theme-muted"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── RAISE TAB ─────────────────────────────────────────────────── */}
        {activeTab === "raise" && (
          <div className="grid lg:grid-cols-5 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Form */}
            <div className="lg:col-span-2 space-y-4">
              <div className="page-card p-6 space-y-5 border-theme-strong/10 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-theme-primary/10 flex items-center justify-center border border-theme-primary/20">
                    <Plus size={16} className="text-theme-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-theme-fg">Create Request</p>
                    <p className="text-[10px] text-theme-muted uppercase tracking-widest font-bold">Auto-routed to your leads</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex gap-3">
                  <GitBranch size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-theme-fg leading-relaxed">
                    <span className="font-bold text-emerald-600">Smart Routing Active:</span> Your ticket will be automatically sent to your{" "}
                    <span className="font-bold">Team Lead</span> and <span className="font-bold">Department Lead</span> based on your profile.
                    No manual assignment needed.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-theme-muted uppercase tracking-widest flex items-center gap-2 px-1">
                    <Ticket size={12} className="text-sky-500" /> Issue Subject *
                  </label>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Brief summary of the issue…"
                    className="w-full h-11 rounded-xl border border-theme-border bg-theme-raised/30 px-4 text-sm font-bold text-theme-fg outline-none focus:border-theme-primary transition-all shadow-inner"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-theme-muted uppercase tracking-widest flex items-center gap-2 px-1">
                    <Zap size={12} className="text-amber-500" /> Priority
                  </label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="w-1/2 h-11 rounded-xl bg-theme-raised/30 font-bold border-theme-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-theme-muted uppercase tracking-widest flex items-center gap-2 px-1">
                    <MessageSquare size={12} className="text-theme-muted" /> Detailed Description
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the issue in detail…"
                    className="w-full h-28 rounded-xl border border-theme-border bg-theme-raised/30 p-4 text-sm font-semibold text-theme-fg outline-none focus:border-theme-primary transition-all shadow-inner resize-none"
                  />
                </div>

                {/* File attachments */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-theme-muted uppercase tracking-widest flex items-center gap-2 px-1">
                    <Paperclip size={12} className="text-theme-muted" /> Attachments (up to 5)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer px-4 h-10 rounded-xl border border-dashed border-theme-border hover:border-theme-primary/40 bg-theme-raised/20 text-[10px] font-bold text-theme-muted hover:text-theme-primary transition-all">
                    <Paperclip size={12} /> Click to attach files
                    <input type="file" multiple className="hidden" onChange={handleFilePick} accept="*/*" />
                  </label>
                  {attachments.length > 0 && (
                    <div className="space-y-1">
                      {attachments.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-raised/40 border border-theme-border/50">
                          <Paperclip size={10} className="text-theme-muted shrink-0" />
                          <span className="text-[10px] text-theme-fg font-bold truncate flex-1">{f.name}</span>
                          <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-theme-muted hover:text-rose-500 transition-colors">
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Link reference */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-theme-muted uppercase tracking-widest flex items-center gap-2 px-1">
                    <Zap size={12} className="text-theme-primary" /> Link Previous Ticket (Optional)
                  </label>
                  <Select value={linkedTicketId || "none"} onValueChange={v => setLinkedTicketId(v === "none" ? null : v)}>
                    <SelectTrigger className="w-full h-11 rounded-xl bg-theme-raised/30 border-theme-border font-bold text-xs">
                      <SelectValue placeholder="No link" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Link (New Instance)</SelectItem>
                      {raisedTickets.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex flex-col py-1">
                            <span className="font-bold">#{t.id.slice(0, 8)} – {t.subject}</span>
                            <span className="text-[9px] opacity-60 uppercase">{t.status} · {formatDate(t.created_at)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full h-12 rounded-xl bg-theme-primary text-theme-surface font-black text-sm uppercase tracking-widest shadow-xl hover:shadow-theme-primary/20 transition-all group"
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={submitting || !subject.trim()}
                >
                  {uploadingFiles ? <><Loader2 size={14} className="mr-2 animate-spin" />Uploading files…</> : <>Raise Ticket <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" /></>}
                </Button>
              </div>
            </div>

            {/* My Raised Tickets */}
            <div className="lg:col-span-3 space-y-4">
              <div className="flex items-center justify-between px-2">
                <p className="text-xs font-black text-theme-fg uppercase tracking-widest">My Active Requests</p>
                <Badge variant="secondary" className="text-[10px]">{raisedTickets.length} Total</Badge>
              </div>

              <div className="space-y-3">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-2xl bg-theme-raised/50 animate-pulse border border-theme-border/50" />
                  ))
                ) : raisedTickets.length === 0 ? (
                  <div className="py-20 text-center bg-theme-raised/20 rounded-2xl border-2 border-dashed border-theme-border/50">
                    <Ticket size={40} className="mx-auto text-theme-muted opacity-20 mb-3" />
                    <p className="text-xs font-bold text-theme-muted">No tickets raised yet.</p>
                  </div>
                ) : (
                  raisedTickets.map(t => {
                    const conf = getStatusConf(t.status);
                    const StatusIcon = conf.icon;
                    return (
                      <div
                        key={t.id}
                        onClick={() => handleTicketSelect(t)}
                        className="group p-4 rounded-2xl bg-theme-surface border border-theme-border hover:border-theme-primary/30 transition-all hover:shadow-lg cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center border transition-colors", conf.iconBg, conf.border)}>
                            <StatusIcon size={18} className={conf.text} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-theme-fg truncate group-hover:text-theme-primary transition-colors">{t.subject}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <StatusBadge status={t.status} />
                              {t.status === "rejected" && t.rejection_reason && (
                                <span className="text-[9px] text-rose-500 font-bold italic truncate max-w-[180px]">
                                  ⚠ {t.rejection_reason}
                                </span>
                              )}
                              {t.current_handler && t.status !== "closed" && t.status !== "rejected" && (
                                <span className="text-[9px] text-theme-muted font-bold">
                                  With: <span className="text-theme-fg">{t.current_handler.name}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-4">
                          <div className="text-right hidden sm:block">
                            <p className="text-[10px] text-theme-muted font-bold uppercase tracking-tighter">{t.priority}</p>
                            <p className="text-[9px] text-theme-muted mt-0.5">{formatDate(t.created_at)}</p>
                          </div>
                          <ChevronRight size={16} className="text-theme-muted group-hover:text-theme-primary group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── SOLVE/DESK TAB ────────────────────────────────────────────── */}
        {activeTab === "solve" && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300 space-y-4">
            <div className="flex items-center justify-between px-2">
              <div>
                <p className="text-xs font-black text-theme-fg uppercase tracking-widest">
                  {isManager ? "Team Tickets — Your Desk" : "Assigned to Me"}
                </p>
                <p className="text-[10px] text-theme-muted mt-0.5">
                  {isDeptLead ? "Department Lead Desk" : isTeamLead ? "Team Lead Desk" : "Resolver Desk"}
                </p>
              </div>
              <Badge variant="secondary" className="text-[10px]">{assignedTickets.length} Tickets</Badge>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {assignedTickets.length === 0 ? (
                <div className="col-span-full py-32 text-center bg-theme-raised/20 rounded-3xl border-2 border-dashed border-theme-border/50">
                  <Inbox size={48} className="mx-auto text-theme-muted opacity-20 mb-4" />
                  <p className="text-sm font-black text-theme-muted">Your Desk is clear.</p>
                  <p className="text-xs text-theme-muted mt-1">No pending tickets assigned to you.</p>
                </div>
              ) : (
                assignedTickets.map(t => {
                  const conf = getStatusConf(t.status);
                  return (
                    <div
                      key={t.id}
                      onClick={() => handleTicketSelect(t)}
                      className="page-card p-5 border-theme-border hover:border-theme-primary/40 transition-all group flex flex-col h-full bg-theme-surface shadow-md hover:shadow-xl cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <StatusBadge status={t.status} />
                        <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-500 uppercase tracking-widest">
                          <Zap size={10} fill="currentColor" /> {t.priority}
                        </div>
                      </div>
                      <h4 className="text-sm font-black text-theme-fg line-clamp-2 mb-2 group-hover:text-theme-primary transition-colors h-10">
                        {t.subject}
                      </h4>
                      <div className="mt-auto space-y-3">
                        <div className="p-2.5 rounded-xl bg-theme-raised/50 border border-theme-border/50 flex items-center gap-3">
                          <div className="h-7 w-7 rounded-lg bg-theme-primary text-theme-surface flex items-center justify-center text-[10px] font-black shadow-sm">
                            {t.creator?.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-theme-fg truncate">{t.creator?.name}</p>
                            <p className="text-[9px] text-theme-muted uppercase font-bold tracking-tighter truncate">{t.creator?.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-theme-muted pt-2 border-t border-theme-border/50">
                          <span className="font-bold uppercase tracking-tighter">{t.priority} priority</span>
                          <span>{formatDate(t.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── TICKET DETAIL DRAWER ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedTicket && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1001] flex justify-end bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedTicket(null)}
          >
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 35, stiffness: 400 }}
              className="w-full max-w-xl bg-theme-surface border-l border-theme-border h-full overflow-y-auto shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="sticky top-0 z-10 bg-theme-surface/95 backdrop-blur-md border-b border-theme-border px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center border shrink-0", getStatusConf(selectedTicket.status).iconBg, getStatusConf(selectedTicket.status).border)}>
                      {(() => { const I = getStatusConf(selectedTicket.status).icon; return <I size={18} className={getStatusConf(selectedTicket.status).text} />; })()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-theme-fg truncate">{selectedTicket.subject}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <StatusBadge status={selectedTicket.status} />
                        <span className="text-[9px] text-theme-muted font-bold uppercase">{selectedTicket.priority} priority</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedTicket(null)} className="p-2 rounded-xl hover:bg-theme-raised text-theme-muted transition-colors shrink-0">
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6 flex-1">
                {/* Rejection Banner */}
                {selectedTicket.status === "rejected" && selectedTicket.rejection_reason && (
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex gap-3">
                    <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Ticket Rejected</p>
                      <p className="text-xs text-theme-fg">{selectedTicket.rejection_reason}</p>
                    </div>
                  </div>
                )}

                {/* Creator / Handler Meta */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-theme-raised/40 border border-theme-border">
                    <p className="text-[9px] text-theme-muted uppercase tracking-widest font-black mb-2">Raised By</p>
                    <p className="text-xs font-black text-theme-fg">{selectedTicket.creator?.name}</p>
                    <p className="text-[9px] text-theme-muted uppercase tracking-tighter mt-0.5">
                      {selectedTicket.creator?.department} · {selectedTicket.creator?.role}
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-theme-raised/40 border border-theme-border">
                    <p className="text-[9px] text-theme-muted uppercase tracking-widest font-black mb-2">Currently With</p>
                    <p className="text-xs font-black text-theme-fg">{selectedTicket.current_handler?.name || selectedTicket.assignee?.name || "Unassigned"}</p>
                    <p className="text-[9px] text-theme-muted uppercase tracking-tighter mt-0.5">
                      {selectedTicket.current_handler?.department || selectedTicket.assignee?.department}
                    </p>
                  </div>
                </div>

                {/* Attachments */}
                {selectedTicket.attachments?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-theme-muted uppercase tracking-widest font-black flex items-center gap-2">
                      <Paperclip size={12} /> Attachments ({selectedTicket.attachments.length})
                    </p>
                    <div className="space-y-1.5">
                      {selectedTicket.attachments.map((storagePath, i) => {
                        // Extract original filename from path: "support/userId/timestamp_filename.ext"
                        const rawName = storagePath.split("/").pop() || `file_${i + 1}`;
                        // Remove timestamp prefix: "1234567890_filename.ext" → "filename.ext"
                        const displayName = rawName.replace(/^\d+_/, "");
                        const ext = displayName.split(".").pop()?.toLowerCase() || "";
                        
                        const fileTypeColors: Record<string, string> = {
                          pdf: "text-rose-500 bg-rose-500/10",
                          doc: "text-sky-500 bg-sky-500/10", docx: "text-sky-500 bg-sky-500/10",
                          xls: "text-emerald-500 bg-emerald-500/10", xlsx: "text-emerald-500 bg-emerald-500/10",
                          png: "text-purple-500 bg-purple-500/10", jpg: "text-purple-500 bg-purple-500/10",
                          jpeg: "text-purple-500 bg-purple-500/10", gif: "text-purple-500 bg-purple-500/10",
                          zip: "text-amber-500 bg-amber-500/10", rar: "text-amber-500 bg-amber-500/10",
                          mp4: "text-indigo-500 bg-indigo-500/10", mov: "text-indigo-500 bg-indigo-500/10",
                          txt: "text-slate-500 bg-slate-500/10",
                          ppt: "text-orange-500 bg-orange-500/10", pptx: "text-orange-500 bg-orange-500/10",
                        };
                        const typeColor = fileTypeColors[ext] || "text-theme-muted bg-theme-raised/60";

                        return (
                          <button
                            key={i}
                            onClick={async () => {
                              try {
                                const url = await getFileUrl(storagePath);
                                window.open(url, "_blank", "noopener,noreferrer");
                              } catch {
                                showToast("Failed to open file. Please try again.", "error");
                              }
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-theme-raised/40 border border-theme-border/50 hover:border-theme-primary/40 transition-all group/att text-left"
                          >
                            <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-[9px] font-black uppercase shrink-0 ${typeColor}`}>
                              {ext || "?"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] text-theme-fg font-bold truncate group-hover/att:text-theme-primary transition-colors">
                                {displayName}
                              </p>
                              <p className="text-[9px] text-theme-muted uppercase tracking-wider">
                                Click to open
                              </p>
                            </div>
                            <ArrowUpRight size={12} className="text-theme-muted group-hover/att:text-theme-primary shrink-0 transition-colors" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}


                {/* Tracking Timeline */}
                {selectedTicket.tracking_log?.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-theme-muted uppercase tracking-widest font-black flex items-center gap-2">
                      <GitBranch size={12} /> Routing Timeline
                    </p>
                    <div className="p-4 rounded-2xl bg-theme-page border border-theme-border/60">
                      <TrackingTimeline log={selectedTicket.tracking_log} />
                    </div>
                  </div>
                )}

                {/* ── DESK ACTIONS (for assigned handlers / managers) ────── */}
                {isCurrentHandler && selectedTicket.status !== "closed" && selectedTicket.status !== "rejected" && (
                  <div className="space-y-3 p-5 rounded-2xl bg-theme-primary/[0.03] border border-theme-primary/15">
                    <p className="text-[10px] text-theme-primary uppercase tracking-widest font-black flex items-center gap-2">
                      <Zap size={12} /> Desk Actions
                    </p>

                    {/* Mark In Review (for solvers — non-managers) */}
                    {!isManager && selectedTicket.status === "open" && (
                      <Button size="sm" className="w-full h-10 rounded-xl bg-blue-500 text-white font-black text-[10px] uppercase tracking-widest"
                        loading={resolving} onClick={markInReview}>
                        <Signal size={12} className="mr-2" /> Mark as In Review
                      </Button>
                    )}

                    {/* Close (after in_review) */}
                    {!isManager && selectedTicket.status === "in_review" && (
                      <>
                        {deskAction === "close" ? (
                          <div className="space-y-3">
                            <textarea value={actionNote} onChange={e => setActionNote(e.target.value)}
                              placeholder="Add resolution notes (optional)…"
                              className="w-full p-3 rounded-xl border border-theme-border bg-theme-surface text-xs font-bold text-theme-fg resize-none h-20 focus:border-theme-primary outline-none" />
                            <div className="flex gap-2">
                              <Button size="sm" className="flex-1 h-9 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest"
                                loading={performingAction} onClick={performDeskAction}>
                                <CheckCircle2 size={12} className="mr-1" /> Confirm Close
                              </Button>
                              <Button size="sm" variant="outline" className="h-9 rounded-xl font-black text-[10px]"
                                onClick={() => setDeskAction("")}> Cancel </Button>
                            </div>
                          </div>
                        ) : (
                          <Button size="sm" className="w-full h-10 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest"
                            onClick={() => setDeskAction("close")}>
                            <CheckCircle2 size={12} className="mr-2" /> Close Ticket
                          </Button>
                        )}
                      </>
                    )}

                    {/* Manager Actions */}
                    {isManager && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          {/* Route to other department (TL and DL can both do this) */}
                          <button onClick={() => setDeskAction(deskAction === "route_dept" ? "" : "route_dept")}
                            className={cn("flex flex-col items-center gap-1.5 p-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all",
                              deskAction === "route_dept" ? "bg-sky-500/10 border-sky-500/30 text-sky-500" : "border-theme-border text-theme-muted hover:border-theme-primary/30 hover:text-theme-primary"
                            )}>
                            <Building size={14} />Route to Dept
                          </button>

                          {/* Notify DL (TL only — cannot directly assign same-dept teams) */}
                          {isTeamLead && !isDeptLead && (
                            <button onClick={() => setDeskAction(deskAction === "notify_dl" ? "" : "notify_dl")}
                              className={cn("flex flex-col items-center gap-1.5 p-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all",
                                deskAction === "notify_dl" ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "border-theme-border text-theme-muted hover:border-theme-primary/30 hover:text-theme-primary"
                              )}>
                              <Bell size={14} />Notify Dept Lead
                            </button>
                          )}

                          {/* Assign to team member (DL can assign; TL can only assign within their team) */}
                          <button onClick={() => setDeskAction(deskAction === "assign_member" ? "" : "assign_member")}
                            className={cn("flex flex-col items-center gap-1.5 p-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all",
                              deskAction === "assign_member" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "border-theme-border text-theme-muted hover:border-theme-primary/30 hover:text-theme-primary"
                            )}>
                            <Users size={14} />Assign Member
                          </button>

                          {/* Reject */}
                          <button onClick={() => setDeskAction(deskAction === "reject" ? "" : "reject")}
                            className={cn("flex flex-col items-center gap-1.5 p-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all",
                              deskAction === "reject" ? "bg-rose-500/10 border-rose-500/30 text-rose-500" : "border-theme-border text-theme-muted hover:border-rose-500/30 hover:text-rose-500"
                            )}>
                            <XCircle size={14} />Reject
                          </button>
                        </div>

                        {/* Action panels */}
                        <AnimatePresence>
                          {deskAction === "route_dept" && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                              className="space-y-3 overflow-hidden">
                              <Select value={targetDeptName} onValueChange={setTargetDeptName}>
                                <SelectTrigger className="h-10 rounded-xl font-bold text-xs">
                                  <SelectValue placeholder="Select target department…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {deptNames.filter(d => d !== user?.department).map(d => (
                                    <SelectItem key={d} value={d}>{d}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" className="w-full h-9 rounded-xl bg-sky-600 text-white font-black text-[10px] uppercase"
                                loading={performingAction} disabled={!targetDeptName} onClick={performDeskAction}>
                                <Building size={12} className="mr-1.5" /> Route to {targetDeptName || "Department"}
                              </Button>
                            </motion.div>
                          )}

                          {deskAction === "notify_dl" && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                              className="space-y-3 overflow-hidden">
                              <textarea value={actionNote} onChange={e => setActionNote(e.target.value)}
                                placeholder="Write note for Department Lead — explain why this needs re-routing within the department…"
                                className="w-full p-3 rounded-xl border border-theme-border bg-theme-surface text-xs font-bold text-theme-fg resize-none h-24 focus:border-amber-500/50 outline-none" />
                              <Button size="sm" className="w-full h-9 rounded-xl bg-amber-500 text-white font-black text-[10px] uppercase"
                                loading={performingAction} disabled={!actionNote.trim()} onClick={performDeskAction}>
                                <Bell size={12} className="mr-1.5" /> Notify Department Lead
                              </Button>
                            </motion.div>
                          )}

                          {deskAction === "assign_member" && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                              className="space-y-3 overflow-hidden">
                              <Select value={targetMemberId} onValueChange={setTargetMemberId}>
                                <SelectTrigger className="h-10 rounded-xl font-bold text-xs">
                                  <SelectValue placeholder="Select team member…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {deskMemberOptions.map((e: any) => (
                                    <SelectItem key={e.id} value={e.id}>
                                      <div className="flex flex-col">
                                        <span className="font-bold">{e.name}</span>
                                        <span className="text-[9px] opacity-60 uppercase">{e.department} · {e.role}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <textarea value={actionNote} onChange={e => setActionNote(e.target.value)}
                                placeholder="Add note (optional)…"
                                className="w-full p-3 rounded-xl border border-theme-border bg-theme-surface text-xs font-bold text-theme-fg resize-none h-16 focus:border-emerald-500/50 outline-none" />
                              <Button size="sm" className="w-full h-9 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase"
                                loading={performingAction} disabled={!targetMemberId} onClick={performDeskAction}>
                                <Users size={12} className="mr-1.5" /> Assign Member
                              </Button>
                            </motion.div>
                          )}

                          {deskAction === "reject" && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                              className="space-y-3 overflow-hidden">
                              <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                                placeholder="Required: State the reason for rejection…"
                                className="w-full p-3 rounded-xl border border-rose-500/30 bg-theme-surface text-xs font-bold text-theme-fg resize-none h-20 focus:border-rose-500/60 outline-none" />
                              <Button size="sm" className="w-full h-9 rounded-xl bg-rose-600 text-white font-black text-[10px] uppercase"
                                loading={performingAction} disabled={!rejectionReason.trim()} onClick={performDeskAction}>
                                <XCircle size={12} className="mr-1.5" /> Confirm Rejection
                              </Button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </div>
                )}

                {/* Thread / Messages */}
                <div className="space-y-4 pt-4 border-t border-theme-border">
                  <p className="text-[10px] text-theme-muted uppercase tracking-widest font-black flex items-center gap-2">
                    <MessageSquare size={12} /> Thread
                  </p>
                  <div className="space-y-4">
                    {responses.length === 0 ? (
                      <div className="py-12 text-center bg-theme-raised/20 rounded-2xl border border-theme-border/50 opacity-40">
                        <MessageSquare size={24} className="mx-auto text-theme-muted mb-2" />
                        <p className="text-[10px] font-black uppercase tracking-widest">No messages yet</p>
                      </div>
                    ) : responses.map(r => (
                      <div key={r.id} className={cn("p-4 rounded-2xl border shadow-sm",
                        r.id === "origin" ? "bg-theme-raised/40 border-theme-border/50 border-dashed"
                          : r.sender?.id === selectedTicket.creator?.id
                            ? "bg-theme-primary/[0.03] border-theme-primary/10 mr-8"
                            : "bg-theme-surface border-theme-border ml-8"
                      )}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] font-black text-theme-fg">
                              {r.sender?.name} <span className="text-theme-muted font-normal">· {r.sender?.role}</span>
                            </p>
                            {r.id === "origin" && (
                              <Badge variant="secondary" className="text-[8px] h-4 px-1.5 font-black uppercase text-theme-primary border-theme-primary/30">
                                Initial Request
                              </Badge>
                            )}
                          </div>
                          <p className="text-[9px] text-theme-muted font-bold">{formatDate(r.created_at)}</p>
                        </div>
                        <p className="text-xs text-theme-fg leading-relaxed">{r.message}</p>
                      </div>
                    ))}
                  </div>
                  {selectedTicket.status !== "closed" && selectedTicket.status !== "rejected" && (
                    <div className="flex gap-2 sticky bottom-0 bg-theme-surface/95 py-3">
                      <input
                        value={responseText} onChange={e => setResponseText(e.target.value)}
                        placeholder="Type a message…"
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendResponse()}
                        className="flex-1 px-4 py-3 rounded-xl border border-theme-border bg-theme-raised/30 text-xs font-bold text-theme-fg outline-none focus:border-theme-primary shadow-inner"
                      />
                      <Button size="sm" className="rounded-xl px-5 h-11 shadow-lg" loading={sending} onClick={sendResponse} disabled={!responseText.trim()}>
                        <Send size={16} />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
