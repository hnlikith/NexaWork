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
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket, Clock, CheckCircle2, AlertCircle, Search,
  ChevronRight, X, Send, MessageSquare, Loader2,
  ShieldAlert, Eye, Zap, RefreshCw,
  UserCheck, ShieldCheck, Signal, Settings, Trash2, Building, XCircle,
  GitBranch, Paperclip, ArrowUpRight, AlertTriangle, Bell, Users
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
  resolved_at: string | null;
  rejection_reason: string | null;
  attachments: string[];
  tracking_log: TrackingEntry[];
  creator: { id: string; name: string; email: string; role: string; department: string | null; employee_id: string | null } | null;
  assignee: { id: string; name: string; email: string; role: string; department: string | null } | null;
  current_handler: { id: string; name: string; email: string; role: string; department: string | null } | null;
  resolver: { id: string; name: string; role: string } | null;
  linked_ticket_id: string | null;
  linked_ticket?: {
    id: string; subject: string; status: string; priority: string; created_at: string;
    creator?: { id: string; name: string; role: string; department: string | null } | null;
  } | null;
}

interface ResponseRow {
  id: string;
  message: string;
  created_at: string;
  is_internal: boolean;
  sender: { id: string; name: string; role: string; department: string | null } | null;
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-rose-500/10",  text: "text-rose-500" },
  high:     { bg: "bg-amber-500/10", text: "text-amber-600" },
  medium:   { bg: "bg-sky-500/10",   text: "text-sky-600" },
  low:      { bg: "bg-zinc-500/10",  text: "text-zinc-500" },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; iconBg: string; icon: any; border: string }> = {
  open:      { label: "Open",      bg: "bg-amber-500/10",  text: "text-amber-500",  iconBg: "bg-amber-500/20",  icon: Ticket,       border: "border-amber-500/20" },
  in_review: { label: "In Review", bg: "bg-blue-500/10",   text: "text-blue-500",   iconBg: "bg-blue-500/20",   icon: Signal,       border: "border-blue-500/20" },
  closed:    { label: "Closed",    bg: "bg-slate-500/10",  text: "text-slate-500",  iconBg: "bg-slate-500/20",  icon: CheckCircle2, border: "border-slate-500/20" },
  rejected:  { label: "Rejected",  bg: "bg-rose-500/10",   text: "text-rose-500",   iconBg: "bg-rose-500/20",   icon: XCircle,      border: "border-rose-500/20" },
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

function TrackingTimeline({ log }: { log: TrackingEntry[] }) {
  if (!log || log.length === 0) return null;
  return (
    <div className="space-y-0">
      {log.map((entry, i) => (
        <div key={i} className="flex gap-3">
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

function getInitials(n: string) {
  return n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function AdminSupportPage() {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [tickets, setTickets]           = useState<TicketRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch]             = useState("");
  const [isSyncing, setIsSyncing]       = useState(false);

  // Employees for re-assignment
  const [employees, setEmployees]       = useState<any[]>([]);
  const [orgDepts, setOrgDepts]         = useState<string[]>([]);

  // Detail drawer
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [responses, setResponses]       = useState<ResponseRow[]>([]);
  const [responseText, setResponseText] = useState("");
  const [sending, setSending]           = useState(false);

  // Admin re-assign controls
  const [reAssignDept, setReAssignDept]   = useState("");
  const [reAssigneeId, setReAssigneeId]   = useState("");
  const [isReAssigning, setIsReAssigning] = useState(false);
  const [rejectReason, setRejectReason]   = useState("");
  const [rejecting, setRejecting]         = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const params = new URLSearchParams({ userId: user.id, userRole: user.role, view: "all" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res  = await fetch(`/api/support?${params}`);
      const json = await res.json();
      if (json.tickets) setTickets(json.tickets);
    } catch { showToast("Failed to load tickets", "error"); }
    finally { setLoading(false); setIsSyncing(false); }
  }, [user, statusFilter, showToast]);

  const loadEmployees = useCallback(async () => {
    const { data: empData } = await supabase
      .from("employees")
      .select("id, name, role, department, team_id, is_team_lead, is_dept_lead, is_active")
      .eq("is_active", true);
    if (empData) setEmployees(empData);

    const { data: deptData } = await supabase
      .from("teams")
      .select("name")
      .eq("type", "department")
      .eq("is_active", true)
      .order("name", { ascending: true });
    
    let deptsList: string[] = [];
    if (deptData) {
      deptsList = deptData.map((d: any) => d.name).filter(Boolean);
    }
    
    if (empData) {
      const empDepts = empData.map((e: any) => e.department).filter(Boolean);
      empDepts.forEach((d: string) => {
        if (!deptsList.includes(d)) {
          deptsList.push(d);
        }
      });
    }
    
    deptsList.sort();
    setOrgDepts(deptsList);
  }, []);

  useEffect(() => {
    loadTickets();
    loadEmployees();
  }, [loadTickets, loadEmployees]);

  useEffect(() => {
    const ch = supabase.channel("admin_tickets_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, loadTickets)
      .subscribe();
    const empCh = supabase.channel("admin_employees_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, loadEmployees)
      .subscribe();
    return () => { supabase.removeChannel(ch); supabase.removeChannel(empCh); };
  }, [loadTickets, loadEmployees]);

  // Thread responses
  useEffect(() => {
    if (!selectedTicket) return;
    (async () => {
      const res  = await fetch(`/api/support/responses?ticketId=${selectedTicket.id}`);
      const json = await res.json();
      const origin: ResponseRow = {
        id: "origin",
        message: selectedTicket.description || "No description.",
        created_at: selectedTicket.created_at,
        sender: selectedTicket.creator,
        is_internal: false,
      };
      setResponses(json.responses ? [origin, ...json.responses] : [origin]);
      setReAssignDept("");
      setReAssigneeId(selectedTicket.current_handler?.id || selectedTicket.assignee?.id || "");
    })();

    const ch = supabase.channel(`admin-resp-${selectedTicket.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_responses", filter: `ticket_id=eq.${selectedTicket.id}` },
        async (payload) => {
          const { data } = await supabase.from("ticket_responses")
            .select("*, sender:employees(id, name, role, department)")
            .eq("id", payload.new.id).single();
          if (data) setResponses(prev => prev.some(r => r.id === data.id) ? prev : [...prev, data]);
        }
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedTicket]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedTicket(null); };
    if (selectedTicket) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [selectedTicket]);

  // ── Admin actions ─────────────────────────────────────────────────────────
  async function handleAdminReAssign() {
    if (!selectedTicket || !reAssigneeId) return;
    setIsReAssigning(true);
    try {
      const res = await fetch("/api/support", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: selectedTicket.id,
          actor_id: user?.id,
          action: "assign_to_member",
          target_assignee_id: reAssigneeId,
          note: "Re-assigned by Admin.",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSelectedTicket(prev => prev ? { ...prev, ...json.ticket } : null);
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, ...json.ticket } : t));
      showToast("Ticket re-assigned successfully.", "success");
    } catch (e: any) { showToast(e.message || "Re-assignment failed.", "error"); }
    finally { setIsReAssigning(false); }
  }

  async function handleAdminReject() {
    if (!selectedTicket || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      const res = await fetch("/api/support", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: selectedTicket.id,
          actor_id: user?.id,
          action: "reject",
          rejection_reason: rejectReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSelectedTicket(prev => prev ? { ...prev, ...json.ticket } : null);
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, ...json.ticket } : t));
      setRejectReason("");
      showToast("Ticket rejected.", "success");
    } catch (e: any) { showToast(e.message || "Failed to reject ticket.", "error"); }
    finally { setRejecting(false); }
  }

  async function sendResponse() {
    if (!responseText.trim() || !selectedTicket || !user) return;
    setSending(true);
    try {
      await fetch("/api/support/responses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: selectedTicket.id, sender_id: user.id, message: responseText }),
      });
      setResponseText("");
      showToast("Message sent.", "success");
    } catch { showToast("Failed to send.", "error"); }
    finally { setSending(false); }
  }

  const filtered = useMemo(() => tickets.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.subject.toLowerCase().includes(q) ||
      t.creator?.name.toLowerCase().includes(q) ||
      (t.current_handler?.name || t.assignee?.name || "").toLowerCase().includes(q) ||
      t.rejection_reason?.toLowerCase().includes(q)
    );
  }), [tickets, search]);

  const { reAssignCandidates, isLocked } = useMemo(() => {
    if (!reAssignDept) {
      return { reAssignCandidates: employees, isLocked: false };
    }
    const deptEmployees = employees.filter((e: any) => e.department === reAssignDept);
    const deptLeads = deptEmployees.filter((e: any) => e.is_dept_lead);
    const teamLeads = deptEmployees.filter((e: any) => e.is_team_lead);

    if (deptLeads.length > 0) {
      return {
        reAssignCandidates: deptLeads,
        isLocked: deptLeads.length === 1
      };
    } else if (teamLeads.length > 0) {
      // Team Lead is present: show everything in the department, and keep unlocked (can change)
      return {
        reAssignCandidates: deptEmployees,
        isLocked: false
      };
    } else {
      // No Department Lead and no Team Lead: show employees
      return {
        reAssignCandidates: deptEmployees,
        isLocked: deptEmployees.length === 1
      };
    }
  }, [employees, reAssignDept]);

  // Synchronize assignee selection and lock status with selected department and real-time employee updates
  useEffect(() => {
    if (!reAssignDept) return;

    const deptEmployees = employees.filter((e: any) => e.department === reAssignDept);
    const deptLeads = deptEmployees.filter((e: any) => e.is_dept_lead);
    const teamLeads = deptEmployees.filter((e: any) => e.is_team_lead);

    if (deptLeads.length > 0) {
      if (deptLeads.length === 1) {
        const singleId = deptLeads[0].id;
        if (reAssigneeId !== singleId) {
          setReAssigneeId(singleId);
        }
      } else {
        const isValid = deptLeads.some((c: any) => c.id === reAssigneeId);
        if (!isValid) {
          setReAssigneeId(deptLeads[0].id);
        }
      }
    } else if (teamLeads.length > 0) {
      // Team Lead present: show everything, default selection to the first team lead if current selection is invalid
      const isValid = deptEmployees.some((c: any) => c.id === reAssigneeId);
      if (!isValid) {
        setReAssigneeId(teamLeads[0].id);
      }
    } else {
      // No Department Lead and no Team Lead: show employees
      if (deptEmployees.length === 1) {
        const singleId = deptEmployees[0].id;
        if (reAssigneeId !== singleId) {
          setReAssigneeId(singleId);
        }
      } else if (deptEmployees.length > 1) {
        const isValid = deptEmployees.some((c: any) => c.id === reAssigneeId);
        if (!isValid) {
          setReAssigneeId(deptEmployees[0].id);
        }
      } else {
        if (reAssigneeId !== "") {
          setReAssigneeId("");
        }
      }
    }
  }, [reAssignDept, employees, reAssigneeId]);

  const stats = {
    total:    tickets.length,
    open:     tickets.filter(t => t.status === "open").length,
    inReview: tickets.filter(t => t.status === "in_review").length,
    closed:   tickets.filter(t => t.status === "closed").length,
    rejected: tickets.filter(t => t.status === "rejected").length,
  };

  return (
    <DashboardShell
      moduleKey="support_admin"
      title="Support Command Center"
      subtitle="Administrative oversight of the hierarchical ticket routing matrix."
      actions={
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest",
            isSyncing ? "border-amber-500/20 text-amber-500 bg-amber-500/5" : "border-emerald-500/20 text-emerald-500 bg-emerald-500/5"
          )}>
            <div className={cn("h-1.5 w-1.5 rounded-full", isSyncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
            {isSyncing ? "Syncing" : "Live Matrix"}
          </div>
          <Button variant="outline" size="sm" onClick={loadTickets} className="h-8">
            <RefreshCw size={12} className={cn("mr-1.5", isSyncing && "animate-spin")} /> Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: "Total",    value: stats.total,    icon: Ticket,       color: "text-theme-fg",    bg: "bg-theme-raised" },
            { label: "Open",     value: stats.open,     icon: AlertCircle,  color: "text-amber-600",   bg: "bg-amber-500/10" },
            { label: "In Review",value: stats.inReview, icon: Signal,       color: "text-sky-600",     bg: "bg-sky-500/10" },
            { label: "Closed",   value: stats.closed,   icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/10" },
            { label: "Rejected", value: stats.rejected, icon: XCircle,      color: "text-rose-600",    bg: "bg-rose-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="page-card flex items-center gap-3">
              <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
                <Icon size={16} className={color} />
              </div>
              <div>
                <p className="text-[11px] text-theme-muted font-bold uppercase tracking-widest leading-none mb-1">{label}</p>
                <p className={cn("text-2xl font-black leading-tight", color)}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-xl border border-theme-border bg-theme-raised p-1 gap-0.5 flex-wrap">
            {[
              { id: "all",       label: "All" },
              { id: "open",      label: "Open" },
              { id: "in_review", label: "In Review" },
              { id: "closed",    label: "Closed" },
              { id: "rejected",  label: "Rejected" },
            ].map(t => (
              <button key={t.id} onClick={() => setStatusFilter(t.id)} className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-bold transition-all",
                statusFilter === t.id ? "bg-theme-surface text-theme-fg shadow-md border border-theme-border" : "text-theme-muted hover:text-theme-fg"
              )}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets or personnel…"
              className="pl-10 pr-4 py-2.5 rounded-xl border border-theme-border bg-theme-surface text-sm text-theme-fg placeholder:text-theme-muted focus:outline-none focus:border-theme-primary transition-all w-72 shadow-sm" />
          </div>
        </div>

        {/* Ticket Table */}
        <div className="page-card overflow-hidden p-0 border-theme-border shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-theme-border bg-theme-page text-left text-[10px] font-black uppercase tracking-widest text-theme-muted">
                  <th className="px-6 py-4">Subject</th>
                  <th className="px-6 py-4">Raised By</th>
                  <th className="px-6 py-4">Current Handler</th>
                  <th className="px-6 py-4">Priority</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border/50">
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-6 py-4"><div className="h-4 animate-pulse rounded bg-theme-raised w-full" /></td>
                    ))}
                  </tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-24 text-center">
                    <div className="flex flex-col items-center justify-center opacity-40">
                      <Ticket size={48} className="text-theme-muted mb-4" />
                      <p className="text-sm font-black text-theme-fg">No Tickets Found</p>
                      <p className="text-xs text-theme-muted mt-1">Adjust filters or wait for incoming requests.</p>
                    </div>
                  </td></tr>
                ) : filtered.map(t => {
                  const ps   = PRIORITY_STYLES[t.priority] ?? PRIORITY_STYLES.medium;
                  const conf = getStatusConf(t.status);
                  const handler = t.current_handler || t.assignee;
                  return (
                    <tr key={t.id} className="group transition-all hover:bg-theme-primary/[0.02] cursor-pointer" onClick={() => setSelectedTicket(t)}>
                      <td className="px-6 py-4 max-w-[220px]">
                        <p className="text-xs font-black text-theme-fg line-clamp-1 group-hover:text-theme-primary transition-colors">{t.subject}</p>
                        {t.rejection_reason && (
                          <p className="text-[9px] text-rose-500 font-bold mt-0.5 italic line-clamp-1">⚠ {t.rejection_reason}</p>
                        )}
                        {t.attachments?.length > 0 && (
                          <p className="text-[9px] text-theme-muted font-bold mt-0.5 flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-full bg-sky-500/50" />{t.attachments.length} file{t.attachments.length > 1 ? "s" : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-theme-primary/10 text-theme-primary text-[10px] font-black flex items-center justify-center shrink-0">
                            {getInitials(t.creator?.name ?? "?")}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-theme-fg truncate">{t.creator?.name}</p>
                            <p className="text-[9px] text-theme-muted uppercase font-bold tracking-tighter truncate">{t.creator?.department}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-sky-500/10 text-sky-600 text-[10px] font-black flex items-center justify-center shrink-0">
                            {getInitials(handler?.name ?? "?")}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-theme-fg truncate">{handler?.name || "Unassigned"}</p>
                            <p className="text-[9px] text-theme-muted uppercase font-bold tracking-tighter truncate">{handler?.department}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg", ps.bg, ps.text)}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[10px] text-theme-muted font-bold">{formatDate(t.created_at)}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 rounded-xl hover:bg-theme-primary/10 text-theme-muted hover:text-theme-primary transition-all">
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-theme-border bg-theme-page px-6 py-4">
            <span className="text-xs font-bold text-theme-muted">{filtered.length} Request{filtered.length !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
                <AlertCircle size={14} /> {stats.open} Awaiting Action
              </span>
              {stats.rejected > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-rose-500">
                  <XCircle size={14} /> {stats.rejected} Rejected
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── TICKET DETAIL DRAWER ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedTicket && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1001] flex justify-end bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedTicket(null)}>
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 35, stiffness: 400 }}
              className="w-full max-w-xl bg-theme-surface border-l border-theme-border h-full overflow-y-auto shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="sticky top-0 z-20 bg-theme-surface/95 backdrop-blur-md border-b border-theme-border px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center border shrink-0",
                      PRIORITY_STYLES[selectedTicket.priority]?.bg)}>
                      <Ticket size={20} className={PRIORITY_STYLES[selectedTicket.priority]?.text} />
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

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-theme-raised/40 border border-theme-border">
                    <p className="text-[9px] text-theme-muted uppercase tracking-widest font-black mb-2">Raised By</p>
                    <p className="text-xs font-black text-theme-fg">{selectedTicket.creator?.name}</p>
                    <p className="text-[9px] text-theme-muted uppercase tracking-tighter mt-0.5">
                      {selectedTicket.creator?.department} · {selectedTicket.creator?.role}
                    </p>
                    {selectedTicket.creator?.email && (
                      <p className="text-[9px] text-theme-primary mt-0.5">{selectedTicket.creator.email}</p>
                    )}
                  </div>
                  <div className="p-4 rounded-2xl bg-theme-raised/40 border border-theme-border">
                    <p className="text-[9px] text-theme-muted uppercase tracking-widest font-black mb-2">Current Handler</p>
                    <p className="text-xs font-black text-theme-fg">
                      {selectedTicket.current_handler?.name || selectedTicket.assignee?.name || "Unassigned"}
                    </p>
                    <p className="text-[9px] text-theme-muted uppercase tracking-tighter mt-0.5">
                      {selectedTicket.current_handler?.department || selectedTicket.assignee?.department || "—"}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div className="p-5 rounded-2xl bg-theme-page border border-theme-border">
                  <p className="text-[10px] text-theme-muted uppercase tracking-widest font-black mb-3">Description</p>
                  <p className="text-sm text-theme-fg leading-relaxed whitespace-pre-wrap">
                    {selectedTicket.description || "No description provided."}
                  </p>
                </div>

                {/* Attachments */}
                {selectedTicket.attachments?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-theme-muted uppercase tracking-widest font-black flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-sky-500/30 inline-block" /> Attachments ({selectedTicket.attachments.length})
                    </p>
                    <div className="space-y-1.5">
                      {selectedTicket.attachments.map((storagePath, i) => {
                        const rawName = storagePath.split("/").pop() || `file_${i + 1}`;
                        const displayName = rawName.replace(/^\d+_/, "");
                        const ext = displayName.split(".").pop()?.toLowerCase() || "";
                        const fileTypeColors: Record<string, string> = {
                          pdf: "text-rose-500 bg-rose-500/10",
                          doc: "text-sky-500 bg-sky-500/10", docx: "text-sky-500 bg-sky-500/10",
                          xls: "text-emerald-500 bg-emerald-500/10", xlsx: "text-emerald-500 bg-emerald-500/10",
                          png: "text-purple-500 bg-purple-500/10", jpg: "text-purple-500 bg-purple-500/10",
                          jpeg: "text-purple-500 bg-purple-500/10",
                          zip: "text-amber-500 bg-amber-500/10", rar: "text-amber-500 bg-amber-500/10",
                          txt: "text-slate-500 bg-slate-500/10",
                          ppt: "text-orange-500 bg-orange-500/10", pptx: "text-orange-500 bg-orange-500/10",
                        };
                        const typeColor = fileTypeColors[ext] || "text-theme-muted bg-theme-raised/60";
                        return (
                          <button key={i}
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/support/upload?path=${encodeURIComponent(storagePath)}`);
                                const json = await res.json();
                                if (!res.ok) throw new Error(json.error);
                                window.open(json.url, "_blank", "noopener,noreferrer");
                              } catch {
                                showToast("Failed to open file.", "error");
                              }
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-theme-raised/40 border border-theme-border/50 hover:border-theme-primary/40 transition-all group/att text-left"
                          >
                            <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-[9px] font-black uppercase shrink-0 ${typeColor}`}>
                              {ext || "?"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] text-theme-fg font-bold truncate group-hover/att:text-theme-primary transition-colors">{displayName}</p>
                              <p className="text-[9px] text-theme-muted uppercase tracking-wider">Click to open</p>
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
                      <GitBranch size={12} /> Routing Timeline ({selectedTicket.tracking_log.length} steps)
                    </p>
                    <div className="p-4 rounded-2xl bg-theme-page border border-theme-border/60">
                      <TrackingTimeline log={selectedTicket.tracking_log} />
                    </div>
                  </div>
                )}

                {/* Admin: Re-assign */}
                {selectedTicket.status !== "closed" && selectedTicket.status !== "rejected" && (
                  <div className="p-5 rounded-2xl bg-theme-primary/[0.02] border border-theme-primary/10 space-y-4">
                    <p className="text-[10px] text-theme-primary uppercase tracking-widest font-black flex items-center gap-2">
                      <ShieldCheck size={14} /> Admin Override — Re-assign
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-theme-muted uppercase tracking-tighter px-1">Filter by Department</label>
                        <Select 
                          value={reAssignDept || "none"} 
                          onValueChange={v => { 
                            const selectedDept = v === "none" ? "" : v;
                            setReAssignDept(selectedDept); 
                          }}
                        >
                          <SelectTrigger className="h-10 rounded-xl font-bold text-[11px]"><SelectValue placeholder="All Departments" /></SelectTrigger>
                          <SelectContent className="z-[2000]">
                            <SelectItem value="none">All Departments</SelectItem>
                            {orgDepts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-theme-muted uppercase tracking-tighter px-1">Assign To</label>
                        <Select 
                          value={reAssigneeId || "none"} 
                          onValueChange={v => setReAssigneeId(v === "none" ? "" : v)}
                          disabled={isLocked}
                        >
                          <SelectTrigger className="h-10 rounded-xl font-bold text-[11px]">
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent className="z-[2000]">
                            <SelectItem value="none">Select assignee...</SelectItem>
                            {reAssignCandidates.map((e: any) => {
                              const getRoleLabel = (emp: any) => {
                                if (emp.role === "admin" || emp.role === "super_admin") return "Admin";
                                if (emp.is_dept_lead) return "DL";
                                if (emp.is_team_lead) return "TL";
                                return "Emp";
                              };
                              return (
                                <SelectItem key={e.id} value={e.id}>
                                  <span className="font-bold">{e.name}</span>
                                  <span className="text-[9px] opacity-60 ml-1.5">({getRoleLabel(e)})</span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button size="sm" className="w-full h-10 rounded-xl bg-theme-primary text-theme-surface font-black uppercase tracking-widest text-[10px] shadow-lg shadow-theme-primary/10"
                      onClick={handleAdminReAssign} loading={isReAssigning}
                      disabled={!reAssigneeId || isReAssigning}>
                      Update Handler
                    </Button>
                  </div>
                )}

                {/* Admin: Reject */}
                {selectedTicket.status !== "closed" && selectedTicket.status !== "rejected" && (
                  <div className="p-5 rounded-2xl bg-rose-500/[0.03] border border-rose-500/15 space-y-3">
                    <p className="text-[10px] text-rose-500 uppercase tracking-widest font-black flex items-center gap-2">
                      <XCircle size={14} /> Admin Reject Ticket
                    </p>
                    <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="Mandatory: State the reason for rejection…"
                      className="w-full p-3 rounded-xl border border-rose-500/20 bg-theme-surface text-xs font-bold text-theme-fg resize-none h-20 focus:border-rose-500/50 outline-none" />
                    <Button size="sm" className="w-full h-9 rounded-xl bg-rose-600 text-white font-black uppercase tracking-widest text-[10px]"
                      loading={rejecting} disabled={!rejectReason.trim() || rejecting} onClick={handleAdminReject}>
                      <XCircle size={12} className="mr-1.5" /> Confirm Rejection
                    </Button>
                  </div>
                )}

                {/* Thread */}
                <div className="space-y-4 pt-4 border-t border-theme-border">
                  <p className="text-[10px] text-theme-muted uppercase tracking-widest font-black flex items-center gap-2">
                    <MessageSquare size={12} /> Chat Thread
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
                      <input value={responseText} onChange={e => setResponseText(e.target.value)}
                        placeholder="Admin message…"
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendResponse()}
                        className="flex-1 px-4 py-3 rounded-xl border border-theme-border bg-theme-raised/30 text-xs font-bold text-theme-fg outline-none focus:border-theme-primary shadow-inner" />
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
