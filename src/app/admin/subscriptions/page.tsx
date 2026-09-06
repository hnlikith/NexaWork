"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/components/layout/AuthProvider";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  Plus, Search, RefreshCw, Pencil, Trash2, Mail, Users, Tag, CreditCard,
  CheckCircle2, AlertCircle, Clock, Globe, Building2, User, Calendar,
  IndianRupee, Send, ExternalLink, Shield, Zap, MailCheck, Loader2,
  ChevronsUpDown, Check, StickyNote,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Employee {
  id: string; name: string; email: string;
  employee_id: string; department: string; designation: string;
}
interface Team { id: string; name: string; department?: string; }

interface SubscriptionAssignment {
  id: string; subscription_id: string;
  assignment_type: "department" | "team" | "employee";
  department_name: string | null;
  team_id: string | null;
  employee_id: string | null;
  seats_allocated: number;
  access_email: string | null;
  access_login: string | null;
  access_note: string | null;
  credentials_sent: boolean;
  sent_at: string | null;
  sent_by_name: string | null;
  created_at: string;
  teams?: { name: string } | null;
  employees?: { name: string; email: string; employee_id: string; department: string; designation: string } | null;
}

interface Subscription {
  id: string; sub_number: string; name: string; provider: string | null;
  category: string; cost_per_seat: number; total_seats: number;
  billing_cycle: "Monthly" | "Annual" | "Quarterly" | "One-time";
  currency: string; renewal_date: string | null;
  status: "active" | "expiring" | "inactive" | "cancelled" | "trial";
  notes: string | null; website_url: string | null;
  created_at: string; updated_at: string;
  subscription_assignments?: SubscriptionAssignment[];
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const SUB_CATEGORIES = [
  "AI & ML", "Design", "Development", "Cloud", "Communication", "Productivity",
  "Project Management", "Analytics", "Security", "Documents", "Marketing", "HR & Ops", "Finance", "Other", "Software",
];

const CATEGORY_TONE: Record<string, string> = {
  "AI & ML":          "text-purple-600 border-purple-500/20 bg-purple-500/10",
  "Design":           "text-pink-600 border-pink-500/20 bg-pink-500/10",
  "Development":      "text-sky-600 border-sky-500/20 bg-sky-500/10",
  "Cloud":            "text-sky-600 border-sky-500/20 bg-sky-500/10",
  "Communication":    "text-emerald-600 border-emerald-500/20 bg-emerald-500/10",
  "Productivity":     "text-indigo-600 border-indigo-500/20 bg-indigo-500/10",
  "Project Management": "text-amber-600 border-amber-500/20 bg-amber-500/10",
  "Analytics":        "text-orange-600 border-orange-500/20 bg-orange-500/10",
  "Security":         "text-rose-600 border-rose-500/20 bg-rose-500/10",
  "Marketing":        "text-pink-600 border-pink-500/20 bg-pink-500/10",
  "HR & Ops":         "text-teal-600 border-teal-500/20 bg-teal-500/10",
  "Finance":          "text-emerald-600 border-emerald-500/20 bg-emerald-500/10",
  "Software":         "text-indigo-600 border-indigo-500/20 bg-indigo-500/10",
};

const PRESET_TOOLS = [
  { name: "Claude AI", provider: "Anthropic", category: "AI & ML", website: "https://claude.ai" },
  { name: "ChatGPT", provider: "OpenAI", category: "AI & ML", website: "https://chat.openai.com" },
  { name: "Gemini", provider: "Google", category: "AI & ML", website: "https://gemini.google.com" },
  { name: "GitHub Copilot", provider: "GitHub", category: "AI & ML", website: "https://github.com/features/copilot" },
  { name: "Midjourney", provider: "Midjourney", category: "AI & ML", website: "https://midjourney.com" },
  { name: "Perplexity", provider: "Perplexity AI", category: "AI & ML", website: "https://perplexity.ai" },
  { name: "Figma", provider: "Figma Inc.", category: "Design", website: "https://figma.com" },
  { name: "Adobe Creative Cloud", provider: "Adobe", category: "Design", website: "https://adobe.com" },
  { name: "Canva", provider: "Canva", category: "Design", website: "https://canva.com" },
  { name: "Framer", provider: "Framer", category: "Design", website: "https://framer.com" },
  { name: "GitHub", provider: "GitHub Inc.", category: "Development", website: "https://github.com" },
  { name: "GitLab", provider: "GitLab", category: "Development", website: "https://gitlab.com" },
  { name: "Vercel", provider: "Vercel Inc.", category: "Development", website: "https://vercel.com" },
  { name: "Postman", provider: "Postman Inc.", category: "Development", website: "https://postman.com" },
  { name: "AWS", provider: "Amazon Web Services", category: "Cloud", website: "https://aws.amazon.com" },
  { name: "Google Cloud", provider: "Google", category: "Cloud", website: "https://cloud.google.com" },
  { name: "Azure", provider: "Microsoft", category: "Cloud", website: "https://azure.microsoft.com" },
  { name: "Supabase", provider: "Supabase Inc.", category: "Cloud", website: "https://supabase.com" },
  { name: "Slack", provider: "Salesforce", category: "Communication", website: "https://slack.com" },
  { name: "Zoom", provider: "Zoom Video", category: "Communication", website: "https://zoom.us" },
  { name: "Google Workspace", provider: "Google", category: "Productivity", website: "https://workspace.google.com" },
  { name: "Microsoft 365", provider: "Microsoft", category: "Productivity", website: "https://microsoft.com/365" },
  { name: "Notion", provider: "Notion Labs", category: "Productivity", website: "https://notion.so" },
  { name: "Loom", provider: "Loom Inc.", category: "Productivity", website: "https://loom.com" },
  { name: "Grammarly", provider: "Grammarly Inc.", category: "Productivity", website: "https://grammarly.com" },
  { name: "Jira", provider: "Atlassian", category: "Project Management", website: "https://atlassian.com/jira" },
  { name: "Linear", provider: "Linear", category: "Project Management", website: "https://linear.app" },
  { name: "Asana", provider: "Asana Inc.", category: "Project Management", website: "https://asana.com" },
  { name: "ClickUp", provider: "ClickUp", category: "Project Management", website: "https://clickup.com" },
  { name: "Mixpanel", provider: "Mixpanel Inc.", category: "Analytics", website: "https://mixpanel.com" },
  { name: "Datadog", provider: "Datadog Inc.", category: "Analytics", website: "https://datadoghq.com" },
  { name: "1Password", provider: "AgileBits", category: "Security", website: "https://1password.com" },
  { name: "LastPass", provider: "LogMeIn", category: "Security", website: "https://lastpass.com" },
  { name: "DocuSign", provider: "DocuSign", category: "Documents", website: "https://docusign.com" },
  { name: "Zapier", provider: "Zapier Inc.", category: "Other", website: "https://zapier.com" },
];

const BILLING_CYCLES = ["Monthly", "Annual", "Quarterly", "One-time"] as const;

const CURRENCIES = [
  { code: "INR", symbol: "₹" }, { code: "USD", symbol: "$" }, { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" }, { code: "JPY", symbol: "¥" }, { code: "AUD", symbol: "A$" },
  { code: "CAD", symbol: "C$" }, { code: "CHF", symbol: "CHF" }, { code: "CNY", symbol: "¥" },
  { code: "SGD", symbol: "S$" }, { code: "AED", symbol: "د.إ" }, { code: "SAR", symbol: "﷼" },
];

type SubFormState = {
  name: string; provider: string; category: string;
  cost_per_seat: string; total_seats: string;
  billing_cycle: "Monthly" | "Annual" | "Quarterly" | "One-time";
  renewal_date: string; currency: string;
  status: "active" | "trial" | "inactive" | "cancelled" | "expiring";
  notes: string; website_url: string;
  filed_by_emp_id: string;
  filed_by_name: string;
  filed_by_dept: string;
  filed_by_desig: string;
  filed_by_uuid: string;
};

const EMPTY_SUB_FORM: SubFormState = {
  name: "", provider: "", category: "Software", cost_per_seat: "", total_seats: "1",
  billing_cycle: "Monthly", renewal_date: "", currency: "INR", status: "active",
  notes: "", website_url: "",
  filed_by_emp_id: "", filed_by_name: "", filed_by_dept: "", filed_by_desig: "", filed_by_uuid: "",
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function monthlyCost(sub: Subscription) {
  const c = sub.cost_per_seat * sub.total_seats;
  if (sub.billing_cycle === "Annual") return c / 12;
  if (sub.billing_cycle === "Quarterly") return c / 3;
  if (sub.billing_cycle === "One-time") return 0;
  return c;
}

function daysUntilRenewal(date: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function initials(name?: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function statusBadge(status: Subscription["status"]) {
  if (status === "active")    return <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white capitalize gap-1"><CheckCircle2 size={10} /> Active</Badge>;
  if (status === "expiring")  return <Badge className="bg-amber-500 hover:bg-amber-500/90 text-white capitalize gap-1"><AlertCircle size={10} /> Expiring</Badge>;
  if (status === "trial")     return <Badge className="bg-sky-500 hover:bg-sky-500/90 text-white capitalize gap-1"><Zap size={10} /> Trial</Badge>;
  if (status === "cancelled") return <Badge variant="destructive" className="capitalize gap-1"><Clock size={10} /> Cancelled</Badge>;
  return <Badge variant="secondary" className="capitalize gap-1"><Clock size={10} /> Inactive</Badge>;
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

export default function SubscriptionsPage() {
  const { user } = useAuth();

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"subscriptions" | "assignments">("subscriptions");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [realtime, setRealtime] = useState<"connecting" | "connected" | "disconnected">("connecting");

  /* dialogs */
  const [showSubModal, setShowSubModal] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Subscription | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Subscription | null>(null);
  const [confirmDeleteAssign, setConfirmDeleteAssign] = useState<SubscriptionAssignment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [sendSuccess, setSendSuccess] = useState<Set<string>>(new Set());

  /* sub form */
  const [subForm, setSubForm] = useState<SubFormState>(EMPTY_SUB_FORM);
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [filerPickerOpen, setFilerPickerOpen] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState("INR");
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ INR: 1 });
  const [loadingRates, setLoadingRates] = useState(false);

  /* assign form */
  const [assignType, setAssignType] = useState<"dept_team" | "employee">("dept_team");
  const [assignDept, setAssignDept] = useState("");
  const [assignTeamId, setAssignTeamId] = useState("");
  const [assignEmpId, setAssignEmpId] = useState("");
  const [assignSeats, setAssignSeats] = useState("1");
  const [assignAccessEmail, setAssignAccessEmail] = useState("");
  const [assignLogin, setAssignLogin] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [selectedAssignEmp, setSelectedAssignEmp] = useState<Employee | null>(null);
  const [empPickerOpen, setEmpPickerOpen] = useState(false);

  /* ── Load ─────────────────────────────────────────────────────────────── */
  const loadSubscriptions = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (filterStatus !== "all") p.set("status", filterStatus);
      const res = await fetch(`/api/subscriptions?${p}`);
      const json = await res.json();
      if (json.subscriptions) setSubscriptions(json.subscriptions);
    } catch {} finally { setLoading(false); }
  }, [search, filterStatus]);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/employees");
      const json = await res.json();
      if (json.employees) setEmployees(json.employees);
    } catch {}
  }, []);

  const loadTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/teams");
      const json = await res.json();
      if (json.teams) setTeams(json.teams);
    } catch {}
  }, []);

  const fetchExchangeRates = useCallback(async (base: string) => {
    if (!base) return;
    setLoadingRates(true);
    try {
      const res = await fetch(`/api/exchange-rates?from=${base}`);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      if (data?.rates) setExchangeRates({ ...data.rates, [base]: 1 });
    } catch {
      setExchangeRates(prev => ({ ...prev, [base]: 1 }));
    } finally {
      setLoadingRates(false);
    }
  }, []);

  useEffect(() => { loadSubscriptions(); }, [loadSubscriptions]);
  useEffect(() => { loadEmployees(); loadTeams(); }, [loadEmployees, loadTeams]);
  useEffect(() => { if (subForm.currency) fetchExchangeRates(subForm.currency); }, [subForm.currency, fetchExchangeRates]);

  useEffect(() => {
    const ch = supabase.channel("subs-rt-v1")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => loadSubscriptions())
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_assignments" }, () => loadSubscriptions())
      .subscribe(s => {
        if (s === "SUBSCRIBED") setRealtime("connected");
        else if (s === "CLOSED" || s === "CHANNEL_ERROR") setRealtime("disconnected");
        else setRealtime("connecting");
      });
    return () => { supabase.removeChannel(ch); };
  }, [loadSubscriptions]);

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const allAssignments = useMemo(() => subscriptions.flatMap(s =>
    (s.subscription_assignments || []).map(a => ({ ...a, subscription: s }))
  ), [subscriptions]);

  const filtered = useMemo(() => subscriptions.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !search || s.name.toLowerCase().includes(q) || (s.provider || "").toLowerCase().includes(q);
    return matchSearch && (filterStatus === "all" || s.status === filterStatus);
  }), [subscriptions, search, filterStatus]);

  const totalMonthly = subscriptions.filter(s => s.status !== "cancelled").reduce((t, s) => t + monthlyCost(s), 0);
  const totalAnnual = totalMonthly * 12;
  const activeCount = subscriptions.filter(s => s.status === "active").length;
  const expiringCount = subscriptions.filter(s => s.status === "expiring").length;
  const totalSeats = subscriptions.filter(s => s.status !== "cancelled").reduce((t, s) => t + s.total_seats, 0);
  const assignedSeats = subscriptions.reduce((t, s) => t + (s.subscription_assignments || []).reduce((a, x) => a + x.seats_allocated, 0), 0);

  const departments = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))].sort(), [employees]);
  const filteredTeams = useMemo(() =>
    assignDept ? teams.filter(t => (t.department || "").toLowerCase() === assignDept.toLowerCase()) : teams
  , [teams, assignDept]);

  /* ── Sub actions ─────────────────────────────────────────────────────── */
  function openAddSub() { setEditingSub(null); setSubForm(EMPTY_SUB_FORM); setShowSubModal(true); }
  function openEditSub(s: Subscription) {
    setEditingSub(s);
    setSubForm({
      name: s.name, provider: s.provider || "", category: s.category,
      cost_per_seat: String(s.cost_per_seat), total_seats: String(s.total_seats),
      billing_cycle: s.billing_cycle, renewal_date: s.renewal_date || "",
      currency: s.currency || "INR",
      status: s.status, notes: s.notes || "", website_url: s.website_url || "",
      filed_by_emp_id: "", filed_by_name: "", filed_by_dept: "", filed_by_desig: "", filed_by_uuid: "",
    });
    setShowSubModal(true);
  }

  async function handleSaveSub(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!subForm.name) return;
    setSaving(true);
    try {
      const payload = {
        name: subForm.name,
        provider: subForm.provider || null,
        category: subForm.category,
        cost_per_seat: Number(subForm.cost_per_seat) || 0,
        total_seats: Number(subForm.total_seats) || 1,
        billing_cycle: subForm.billing_cycle,
        renewal_date: subForm.renewal_date || null,
        currency: subForm.currency,
        status: subForm.status,
        notes: subForm.notes || null,
        website_url: subForm.website_url || null,
        filed_by_emp_id: subForm.filed_by_emp_id || undefined,
        filed_by_name: subForm.filed_by_name || undefined,
        filed_by_dept: subForm.filed_by_dept || undefined,
        filed_by_desig: subForm.filed_by_desig || undefined,
        filed_by_uuid: subForm.filed_by_uuid || undefined,
      };
      if (editingSub) {
        const res = await fetch(`/api/subscriptions/${editingSub.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const json = await res.json();
        if (!res.ok) { toast.error(json.error || "Failed to update"); return; }
        if (json.subscription) setSubscriptions(prev => prev.map(s => s.id === editingSub.id ? { ...s, ...json.subscription } : s));
        toast.success(`${subForm.name} updated`);
      } else {
        const res = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const json = await res.json();
        if (!res.ok) { toast.error(json.error || "Failed to add"); return; }
        loadSubscriptions();
        toast.success(`${subForm.name} added`);
      }
      setShowSubModal(false);
    } catch {
      toast.error("Something went wrong");
    } finally { setSaving(false); }
  }

  async function handleDeleteSub() {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    try {
      await fetch(`/api/subscriptions/${confirmDelete.id}`, { method: "DELETE" });
      setSubscriptions(prev => prev.filter(x => x.id !== confirmDelete.id));
      toast.success("Subscription deleted");
    } finally { setDeletingId(null); setConfirmDelete(null); }
  }

  /* ── Assign actions ──────────────────────────────────────────────────── */
  function openAssign(s: Subscription) {
    setAssignTarget(s);
    setAssignType("dept_team"); setAssignDept(""); setAssignTeamId("");
    setAssignEmpId(""); setAssignSeats("1");
    setAssignAccessEmail(""); setAssignLogin(""); setAssignNote("");
    setSelectedAssignEmp(null);
    setShowAssignModal(true);
  }

  async function handleSaveAssign(shouldSendEmail = false) {
    if (!assignTarget) return;
    setSaving(true);
    try {
      const payload = assignType === "employee"
        ? { assignment_type: "employee", employee_id: assignEmpId || null, seats_allocated: Number(assignSeats) || 1, access_email: selectedAssignEmp?.email || null, access_login: assignLogin, access_note: assignNote }
        : { assignment_type: assignTeamId ? "team" : "department", department_name: assignDept || null, team_id: assignTeamId || null, seats_allocated: Number(assignSeats) || 1, access_email: assignAccessEmail || null, access_login: assignLogin, access_note: assignNote };
      const res = await fetch(`/api/subscriptions/${assignTarget.id}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Failed to save assignment"); return; }
      if (shouldSendEmail && json.assignment?.id) {
        await handleSendAccess(assignTarget.id, [json.assignment.id]);
      } else if (!shouldSendEmail) {
        toast.success("Assignment saved");
      }
      loadSubscriptions();
      setShowAssignModal(false);
    } finally { setSaving(false); }
  }

  async function handleDeleteAssignment() {
    if (!confirmDeleteAssign) return;
    setDeletingId(confirmDeleteAssign.id);
    try {
      await fetch(`/api/subscriptions/${confirmDeleteAssign.subscription_id}/assign/${confirmDeleteAssign.id}`, { method: "DELETE" });
      loadSubscriptions();
      toast.success("Assignment removed");
    } finally { setDeletingId(null); setConfirmDeleteAssign(null); }
  }

  async function handleSendAccess(subId: string, assignmentIds: string[]) {
    setSendingIds(prev => new Set([...prev, ...assignmentIds]));
    try {
      const res = await fetch(`/api/subscriptions/${subId}/send-access`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_ids: assignmentIds, sent_by_emp_id: user?.employee_id || null, sent_by_name: user?.name || null }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      if (json.sent > 0) {
        toast.success(`Credentials sent to ${json.sent} recipient${json.sent !== 1 ? "s" : ""}`);
        setSendSuccess(prev => new Set([...prev, ...assignmentIds]));
        setTimeout(() => setSendSuccess(prev => { const n = new Set(prev); assignmentIds.forEach(i => n.delete(i)); return n; }), 3000);
        loadSubscriptions();
      } else if (json.total > 0) {
        toast.warning("No emails could be sent — check access email addresses");
      }
    } finally {
      setSendingIds(prev => { const n = new Set(prev); assignmentIds.forEach(i => n.delete(i)); return n; });
    }
  }

  const subFormValid = !!subForm.name && !!subForm.cost_per_seat && !!subForm.total_seats && (!!editingSub || !!subForm.filed_by_uuid);
  const assignValid = assignType === "employee" ? !!assignEmpId : !!assignDept;
  const canSendEmail = assignType === "employee"
    ? !!assignEmpId && !!(selectedAssignEmp?.email)
    : !!assignDept && !!assignAccessEmail;

  /* ─── Render ─────────────────────────────────────────────────────────── */

  const stats = [
    { label: "Monthly Cost",  value: formatCurrency(totalMonthly), icon: IndianRupee,  tone: "text-rose-600",    bg: "bg-rose-500/10" },
    { label: "Annual Commit", value: formatCurrency(totalAnnual),  icon: Calendar,     tone: "text-foreground",  bg: "bg-muted" },
    { label: "Active Tools",  value: String(activeCount),          icon: CheckCircle2, tone: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Expiring Soon", value: String(expiringCount),        icon: AlertCircle,  tone: "text-amber-600",   bg: "bg-amber-500/10" },
    { label: "Total Seats",   value: `${assignedSeats}/${totalSeats}`, icon: Users,    tone: "text-sky-600",     bg: "bg-sky-500/10" },
  ];

  const assignmentStats = [
    { label: "Total Assignments", value: String(allAssignments.length),                                        icon: Users,     tone: "text-foreground",  bg: "bg-muted" },
    { label: "Seats Assigned",    value: String(assignedSeats),                                                icon: Shield,    tone: "text-sky-600",     bg: "bg-sky-500/10" },
    { label: "Emails Sent",       value: String(allAssignments.filter(a => a.credentials_sent).length),        icon: MailCheck, tone: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Pending Send",      value: String(allAssignments.filter(a => !a.credentials_sent).length),       icon: Mail,      tone: "text-amber-600",   bg: "bg-amber-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="subscriptions"
      title="Subscriptions"
      subtitle="Manage SaaS tools, licenses, access credentials and team assignments."
      actions={
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs">
            <span className={cn("h-1.5 w-1.5 rounded-full", realtime === "connected" ? "bg-emerald-500 animate-pulse" : realtime === "connecting" ? "bg-amber-500 animate-pulse" : "bg-rose-500")} />
            <span className={cn("font-medium", realtime === "connected" ? "text-emerald-600" : realtime === "connecting" ? "text-amber-600" : "text-rose-500")}>
              {realtime === "connected" ? "Live" : realtime === "connecting" ? "Connecting" : "Offline"}
            </span>
          </span>
          <Button variant="outline" size="sm" onClick={loadSubscriptions}><RefreshCw size={13} /> Refresh</Button>
          <Button size="sm" onClick={openAddSub}><Plus size={13} /> Add Subscription</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="subscriptions" className="text-xs gap-1.5">
              <CreditCard size={11} /> Subscriptions
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{subscriptions.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="assignments" className="text-xs gap-1.5">
              <Users size={11} /> Assignments
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{allAssignments.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "subscriptions" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {stats.map(({ label, value, icon: Icon, tone, bg }) => (
                <Card key={label}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", bg)}>
                      <Icon size={15} className={tone} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={cn("text-xl font-semibold tabular-nums leading-tight", tone)}>{value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Table */}
            <Card className="p-0 overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <Tabs value={filterStatus} onValueChange={setFilterStatus}>
                  <TabsList>
                    <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                    <TabsTrigger value="active" className="text-xs">Active</TabsTrigger>
                    <TabsTrigger value="expiring" className="text-xs">Expiring</TabsTrigger>
                    <TabsTrigger value="trial" className="text-xs">Trial</TabsTrigger>
                    <TabsTrigger value="inactive" className="text-xs">Inactive</TabsTrigger>
                    <TabsTrigger value="cancelled" className="text-xs">Cancelled</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tools…" className="h-8 w-48 pl-8 text-xs" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Seats</TableHead>
                      <TableHead>Monthly Cost</TableHead>
                      <TableHead>Renewal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                        </TableRow>
                      ))
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-16 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted"><CreditCard size={20} className="text-muted-foreground" /></div>
                            <p className="text-sm text-muted-foreground">{search ? "No tools match your search" : "No subscriptions yet"}</p>
                            {!search && <Button size="sm" onClick={openAddSub}><Plus size={12} /> Add First Subscription</Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filtered.map(s => {
                      const days = daysUntilRenewal(s.renewal_date);
                      const mc = monthlyCost(s);
                      const assigns = s.subscription_assignments || [];
                      const usedSeats = assigns.reduce((t, a) => t + a.seats_allocated, 0);
                      const seatPct = s.total_seats > 0 ? (usedSeats / s.total_seats) * 100 : 0;
                      return (
                        <TableRow key={s.id} className="group">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold", CATEGORY_TONE[s.category] || "bg-muted text-muted-foreground")}>
                                {s.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-foreground">{s.name}</p>
                                  {s.website_url && <a href={s.website_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-sky-500 transition-colors"><ExternalLink size={10} /></a>}
                                </div>
                                <p className="text-xs text-muted-foreground tabular-nums">{s.sub_number}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("gap-1", CATEGORY_TONE[s.category])}>
                              <Tag size={10} /> {s.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="text-xs font-medium text-foreground">{s.billing_cycle}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(s.cost_per_seat)}/seat</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className={cn("h-full rounded-full transition-all", seatPct >= 90 ? "bg-rose-500" : seatPct >= 70 ? "bg-amber-500" : "bg-emerald-500")}
                                  style={{ width: `${Math.min(100, seatPct)}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground tabular-nums">{usedSeats}/{s.total_seats}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-semibold text-rose-500 tabular-nums">
                            {mc > 0 ? `−${formatCurrency(mc)}` : <span className="text-muted-foreground text-xs font-normal">One-time</span>}
                          </TableCell>
                          <TableCell>
                            {s.renewal_date ? (
                              <div>
                                <p className={cn("text-xs font-medium",
                                  days !== null && days <= 30 ? "text-rose-500" :
                                  days !== null && days <= 60 ? "text-amber-600" :
                                  "text-foreground")}>
                                  {formatDate(s.renewal_date)}
                                </p>
                                {days !== null && days >= 0 && (
                                  <p className={cn("text-[10px]", days <= 30 ? "text-rose-500" : days <= 60 ? "text-amber-500" : "text-muted-foreground")}>{days}d left</p>
                                )}
                                {days !== null && days < 0 && <p className="text-[10px] text-rose-500">Overdue</p>}
                              </div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>{statusBadge(s.status)}</TableCell>
                          <TableCell>
                            {assigns.length > 0 ? (
                              <div className="flex items-center -space-x-2">
                                {assigns.slice(0, 3).map(a => (
                                  <Avatar key={a.id} className="h-6 w-6 border-2 border-card" title={a.employees?.name || a.department_name || a.teams?.name || ""}>
                                    <AvatarFallback className={cn("text-[9px] font-semibold",
                                      a.assignment_type === "employee" ? "bg-sky-500/20 text-sky-600" :
                                      a.assignment_type === "team" ? "bg-purple-500/20 text-purple-600" :
                                      "bg-emerald-500/20 text-emerald-600")}>
                                      {initials(a.employees?.name || a.department_name || a.teams?.name)}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                                {assigns.length > 3 && (
                                  <Avatar className="h-6 w-6 border-2 border-card">
                                    <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">+{assigns.length - 3}</AvatarFallback>
                                  </Avatar>
                                )}
                              </div>
                            ) : <span className="text-xs text-muted-foreground">Unassigned</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Assign access" onClick={() => openAssign(s)}>
                                <Users size={13} />
                              </Button>
                              {assigns.length > 0 && (
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                  title="Send access to all" disabled={assigns.some(a => sendingIds.has(a.id))}
                                  onClick={() => handleSendAccess(s.id, assigns.map(a => a.id))}>
                                  {assigns.some(a => sendSuccess.has(a.id)) ? <MailCheck size={13} /> : <Send size={13} />}
                                </Button>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEditSub(s)}>
                                <Pencil size={13} />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                title="Delete" onClick={() => setConfirmDelete(s)}>
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
                <span className="text-xs text-muted-foreground">{filtered.length} subscription{filtered.length !== 1 ? "s" : ""}</span>
                <span className="text-xs text-muted-foreground">
                  Monthly total: <span className="font-semibold text-foreground tabular-nums">
                    {formatCurrency(filtered.filter(s => s.status !== "cancelled").reduce((t, s) => t + monthlyCost(s), 0))}
                  </span>
                </span>
              </div>
            </Card>
          </>
        )}

        {activeTab === "assignments" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {assignmentStats.map(({ label, value, icon: Icon, tone, bg }) => (
                <Card key={label}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", bg)}>
                      <Icon size={15} className={tone} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={cn("text-xl font-semibold tabular-nums leading-tight", tone)}>{value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="p-0 overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <p className="text-sm font-semibold text-foreground">All Assignments</p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Seats</TableHead>
                      <TableHead>Access Email</TableHead>
                      <TableHead>Credentials</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allAssignments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                          No assignments yet — assign tools from the Subscriptions tab
                        </TableCell>
                      </TableRow>
                    ) : allAssignments.map(a => {
                      const sub = (a as typeof a & { subscription: Subscription }).subscription;
                      const isSending = sendingIds.has(a.id);
                      const isSent = sendSuccess.has(a.id);
                      return (
                        <TableRow key={a.id} className="group">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={cn("flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-semibold", CATEGORY_TONE[sub.category] || "bg-muted text-muted-foreground")}>
                                {sub.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{sub.name}</p>
                                <p className="text-xs text-muted-foreground tabular-nums">{sub.sub_number}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("gap-1 capitalize",
                              a.assignment_type === "employee" ? "text-sky-600 border-sky-500/20 bg-sky-500/10" :
                              a.assignment_type === "team" ? "text-purple-600 border-purple-500/20 bg-purple-500/10" :
                              "text-emerald-600 border-emerald-500/20 bg-emerald-500/10")}>
                              {a.assignment_type === "employee" ? <User size={10} /> : <Building2 size={10} />}
                              {a.assignment_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {a.assignment_type === "employee" && a.employees ? (
                              <div>
                                <p className="text-sm font-medium text-foreground">{a.employees.name}</p>
                                <p className="text-xs text-muted-foreground">{a.employees.designation} · {a.employees.department}</p>
                              </div>
                            ) : a.assignment_type === "team" && a.teams ? (
                              <p className="text-sm font-medium text-foreground">{a.teams.name}</p>
                            ) : (
                              <p className="text-sm font-medium text-foreground">{a.department_name || "—"}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-muted-foreground">{a.seats_allocated}</TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[160px]">{a.access_email || "—"}</TableCell>
                          <TableCell>
                            {a.credentials_sent ? (
                              <div>
                                <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white gap-1"><MailCheck size={10} /> Sent</Badge>
                                {a.sent_at && <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(a.sent_at)}</p>}
                              </div>
                            ) : (
                              <Badge className="bg-amber-500 hover:bg-amber-500/90 text-white gap-1"><Clock size={10} /> Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                title="Send access email" disabled={isSending} onClick={() => handleSendAccess(a.subscription_id, [a.id])}>
                                {isSent ? <MailCheck size={13} /> : isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                title="Remove assignment" onClick={() => setConfirmDeleteAssign(a)}>
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
                <span className="text-xs text-muted-foreground">{allAssignments.length} assignment{allAssignments.length !== 1 ? "s" : ""}</span>
                <span className="text-xs text-muted-foreground">{allAssignments.filter(a => a.credentials_sent).length} credentials sent</span>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* ── Add / Edit Subscription Dialog ─────────────────────────────── */}
      <Dialog open={showSubModal} onOpenChange={setShowSubModal}>
        <DialogContent className="sm:max-w-3xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-4rem)] sm:max-h-[88vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0",
              editingSub ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary")}>
              {editingSub ? <Pencil size={16} /> : <CreditCard size={16} />}
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">{editingSub ? "Edit Subscription" : "Add Subscription"}</DialogTitle>
              <DialogDescription className="text-xs">
                {editingSub ? `${editingSub.sub_number} · ${editingSub.name}` : "Register a new SaaS tool or license"}
              </DialogDescription>
            </div>
          </DialogHeader>

          <form id="sub-form" onSubmit={handleSaveSub} className="min-h-0 overflow-y-auto">
            {/* Authorization strip (new only) */}
            {!editingSub && (
              <div className={cn("border-b border-border px-6 py-4 transition-colors",
                subForm.filed_by_uuid ? "bg-emerald-500/5" : "bg-muted/30")}>
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
                    subForm.filed_by_uuid ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>
                    {subForm.filed_by_uuid ? <CheckCircle2 size={15} /> : <Shield size={14} />}
                  </div>

                  {!subForm.filed_by_uuid ? (
                    <Popover open={filerPickerOpen} onOpenChange={setFilerPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="flex-1 justify-between font-normal">
                          <span className="text-muted-foreground">Select initiating personnel to authorize…</span>
                          <ChevronsUpDown size={13} className="opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[400px]" align="start">
                        <Command>
                          <CommandInput placeholder="Search by name or ID…" />
                          <CommandList>
                            <CommandEmpty>No personnel found.</CommandEmpty>
                            <CommandGroup>
                              {employees.map(e => (
                                <CommandItem
                                  key={e.id} value={`${e.name} ${e.employee_id} ${e.department}`}
                                  onSelect={() => {
                                    setSubForm(f => ({ ...f, filed_by_emp_id: e.employee_id, filed_by_name: e.name, filed_by_dept: e.department, filed_by_desig: e.designation, filed_by_uuid: e.id }));
                                    setFilerPickerOpen(false);
                                  }}
                                >
                                  <Avatar className="h-7 w-7 mr-2.5"><AvatarFallback className="text-[10px] font-semibold">{initials(e.name)}</AvatarFallback></Avatar>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">{e.name}</p>
                                    <p className="text-xs text-muted-foreground tabular-nums">{e.employee_id} · {e.department}</p>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="flex flex-1 items-center gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white">Authorized</Badge>
                          <span className="text-xs text-muted-foreground tabular-nums">{subForm.filed_by_emp_id}</span>
                        </div>
                        <p className="text-sm font-medium text-foreground mt-0.5">{subForm.filed_by_name}</p>
                        <p className="text-xs text-muted-foreground">{subForm.filed_by_desig} · {subForm.filed_by_dept}</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="text-xs"
                        onClick={() => setSubForm(f => ({ ...f, filed_by_emp_id: "", filed_by_name: "", filed_by_dept: "", filed_by_desig: "", filed_by_uuid: "" }))}>
                        Change
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={cn("p-6 grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity",
              !editingSub && !subForm.filed_by_uuid ? "opacity-40 pointer-events-none select-none" : "")}>
              {/* LEFT: Tool Identity */}
              <div className="space-y-4">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Tag size={11} /> Tool Identity
                </p>

                <div className="space-y-1.5">
                  <Label className="text-xs">Tool / Service Name *</Label>
                  <Popover open={toolPickerOpen} onOpenChange={setToolPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {subForm.name ? (
                          <span className="text-foreground">{subForm.name}</span>
                        ) : (
                          <span className="text-muted-foreground">Search presets or type custom…</span>
                        )}
                        <ChevronsUpDown size={13} className="opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[400px]" align="start">
                      <Command>
                        <CommandInput placeholder="Search tools or type custom name…" />
                        <CommandList>
                          <CommandEmpty>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-xs text-sky-600 hover:bg-muted"
                              onClick={() => setToolPickerOpen(false)}
                            >
                              Use a custom tool name — type it in the search box and continue editing.
                            </button>
                          </CommandEmpty>
                          <CommandGroup>
                            {PRESET_TOOLS.map(t => (
                              <CommandItem
                                key={t.name} value={`${t.name} ${t.provider} ${t.category}`}
                                onSelect={() => {
                                  setSubForm(f => ({ ...f, name: t.name, provider: t.provider, category: t.category, website_url: t.website }));
                                  setToolPickerOpen(false);
                                }}
                              >
                                <div className={cn("flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-semibold mr-2.5", CATEGORY_TONE[t.category] || "bg-muted")}>
                                  {t.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{t.name}</p>
                                  <p className="text-xs text-muted-foreground">{t.provider}</p>
                                </div>
                                <Badge variant="outline" className={cn("text-[10px]", CATEGORY_TONE[t.category])}>{t.category}</Badge>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Input
                    value={subForm.name}
                    onChange={(e) => setSubForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Or type a custom tool name…"
                    className="text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Provider / Vendor</Label>
                    <Input value={subForm.provider} onChange={e => setSubForm(f => ({ ...f, provider: e.target.value }))} placeholder="e.g. Anthropic" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Category</Label>
                    <Select value={subForm.category} onValueChange={v => setSubForm(f => ({ ...f, category: v }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUB_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Website URL</Label>
                  <div className="relative">
                    <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input value={subForm.website_url} onChange={e => setSubForm(f => ({ ...f, website_url: e.target.value }))} placeholder="https://…" className="pl-9" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Tabs value={subForm.status} onValueChange={(v) => setSubForm(f => ({ ...f, status: v as typeof subForm.status }))}>
                    <TabsList className="grid grid-cols-4 w-full">
                      <TabsTrigger value="active" className="text-xs">Active</TabsTrigger>
                      <TabsTrigger value="trial" className="text-xs">Trial</TabsTrigger>
                      <TabsTrigger value="inactive" className="text-xs">Inactive</TabsTrigger>
                      <TabsTrigger value="cancelled" className="text-xs">Cancelled</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={subForm.notes} onChange={e => setSubForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3} placeholder="Vendor notes, contract terms, special access instructions…" className="resize-none" />
                </div>
              </div>

              {/* RIGHT: Billing & Cost */}
              <div className="space-y-4">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <CreditCard size={11} /> Billing &amp; Seats
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cost per Seat *</Label>
                    <div className="flex">
                      <Select value={subForm.currency} onValueChange={v => setSubForm(f => ({ ...f, currency: v }))}>
                        <SelectTrigger className="w-[80px] rounded-r-none border-r-0 flex-shrink-0 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="number" value={subForm.cost_per_seat} onChange={e => setSubForm(f => ({ ...f, cost_per_seat: e.target.value }))}
                        placeholder="0.00" className="rounded-l-none tabular-nums" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total Seats *</Label>
                    <Input type="number" value={subForm.total_seats} onChange={e => setSubForm(f => ({ ...f, total_seats: e.target.value }))} placeholder="1" className="tabular-nums" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Billing Cycle *</Label>
                  <Tabs value={subForm.billing_cycle} onValueChange={(v) => setSubForm(f => ({ ...f, billing_cycle: v as typeof subForm.billing_cycle }))}>
                    <TabsList className="grid grid-cols-4 w-full">
                      {BILLING_CYCLES.map(c => <TabsTrigger key={c} value={c} className="text-xs">{c}</TabsTrigger>)}
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Renewal Date</Label>
                  <Input type="date" value={subForm.renewal_date} onChange={e => setSubForm(f => ({ ...f, renewal_date: e.target.value }))} />
                </div>

                {subForm.cost_per_seat && subForm.total_seats && (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground">Cost Analysis</p>
                        <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
                          <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      {(() => {
                        const base = CURRENCIES.find(c => c.code === subForm.currency) || { code: "INR", symbol: "₹" };
                        const target = CURRENCIES.find(c => c.code === displayCurrency) || { code: "INR", symbol: "₹" };
                        const rate = exchangeRates[displayCurrency] || 1;
                        const costPerSeatBase = Number(subForm.cost_per_seat) || 0;
                        const totalS = Number(subForm.total_seats) || 1;
                        const monthlyBase = subForm.billing_cycle === "Annual" ? (costPerSeatBase * totalS) / 12
                          : subForm.billing_cycle === "Quarterly" ? (costPerSeatBase * totalS) / 3
                          : subForm.billing_cycle === "One-time" ? 0
                          : costPerSeatBase * totalS;
                        const monthlyTarget = monthlyBase * rate;

                        return (
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Unit Price</span>
                              <span className="font-medium text-foreground tabular-nums">{base.symbol}{costPerSeatBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Seats</span>
                              <span className="font-medium text-foreground">{totalS} × {subForm.billing_cycle}</span>
                            </div>
                            {displayCurrency !== subForm.currency && (
                              <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5 border border-border">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-muted-foreground">FX Rate</span>
                                  <span className="tabular-nums font-medium text-foreground">1 {base.code} = {rate.toFixed(4)} {target.code}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Converted Monthly</span>
                                  <span className="font-semibold text-foreground tabular-nums">{target.symbol}{monthlyTarget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                            )}
                            <Separator />
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-semibold text-muted-foreground">Monthly Commitment</span>
                              <div className="text-right">
                                {subForm.billing_cycle === "One-time"
                                  ? <span className="text-xs font-medium text-muted-foreground">One-time only</span>
                                  : <span className="text-base font-semibold text-rose-500 tabular-nums">{base.symbol}{monthlyBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                }
                                {subForm.billing_cycle !== "One-time" && <p className="text-[10px] text-muted-foreground">{base.code} / mo</p>}
                              </div>
                            </div>
                            {loadingRates && <p className="text-[10px] text-sky-500 animate-pulse">Fetching live rates…</p>}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </form>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-between gap-2 border-t border-border bg-background px-6 py-4">
            <p className="text-xs text-muted-foreground hidden sm:block">After saving, use Assign Access to grant tool access.</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowSubModal(false)}>Cancel</Button>
              <Button type="submit" form="sub-form" size="sm" disabled={saving || !subFormValid}>
                {saving && <Loader2 size={12} className="animate-spin" />}
                {editingSub ? "Save Changes" : "Add Subscription"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Access Dialog ────────────────────────────────────────── */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="sm:max-w-2xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-4rem)] sm:max-h-[88vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 flex-shrink-0">
              <Users size={16} />
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">Assign Access</DialogTitle>
              <DialogDescription className="text-xs">
                Grant access to <span className="font-medium text-foreground">{assignTarget?.name}</span> and send credentials via email
              </DialogDescription>
            </div>
            {assignTarget && (
              <Badge variant="outline" className={cn("flex-shrink-0", CATEGORY_TONE[assignTarget.category])}>
                {assignTarget.sub_number} · {assignTarget.total_seats} seats
              </Badge>
            )}
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Assignment Scope</Label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { type: "dept_team", label: "Department / Team", icon: Building2, desc: "Assign to an entire dept or team — all members get access" },
                  { type: "employee",  label: "Specific Employee",  icon: User,      desc: "Grant access to a single employee only" },
                ] as const).map(({ type, label, icon: Icon, desc }) => {
                  const active = assignType === type;
                  return (
                    <button
                      key={type} type="button" onClick={() => setAssignType(type)}
                      className={cn(
                        "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
                        active ? "border-sky-500 bg-sky-500/5" : "border-border hover:bg-muted/50",
                      )}
                    >
                      <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md mt-0.5",
                        active ? "bg-sky-500/10 text-sky-600" : "bg-muted text-muted-foreground")}>
                        <Icon size={15} />
                      </div>
                      <div>
                        <p className={cn("text-sm font-medium", active ? "text-sky-600" : "text-foreground")}>{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {assignType === "dept_team" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Department *</Label>
                    <Select value={assignDept || undefined} onValueChange={(v) => { setAssignDept(v); setAssignTeamId(""); }}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select department…" /></SelectTrigger>
                      <SelectContent>
                        {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {assignDept && (
                      <div className="flex flex-wrap items-center gap-1">
                        {employees.filter(e => e.department === assignDept).slice(0, 6).map(e => (
                          <Avatar key={e.id} className="h-6 w-6" title={e.name}>
                            <AvatarFallback className="text-[9px] font-semibold bg-emerald-500/10 text-emerald-600">{initials(e.name)}</AvatarFallback>
                          </Avatar>
                        ))}
                        {employees.filter(e => e.department === assignDept).length > 6 && (
                          <span className="text-xs text-muted-foreground">+{employees.filter(e => e.department === assignDept).length - 6} more</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Team (optional)</Label>
                    <Select value={assignTeamId || undefined} onValueChange={setAssignTeamId}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="All teams in dept" /></SelectTrigger>
                      <SelectContent>
                        {filteredTeams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Access Email (required to send credentials)</Label>
                  <div className="relative">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input value={assignAccessEmail} onChange={e => setAssignAccessEmail(e.target.value)} placeholder="shared-access@company.com or team DL…" className="pl-9" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    For dept/team assignments use a shared inbox or distribution list.
                  </p>
                </div>
              </div>
            )}

            {assignType === "employee" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Select Employee *</Label>
                  <Popover open={empPickerOpen} onOpenChange={setEmpPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {selectedAssignEmp ? (
                          <span className="text-foreground">{selectedAssignEmp.name} · {selectedAssignEmp.employee_id}</span>
                        ) : (
                          <span className="text-muted-foreground">Search employee name or ID…</span>
                        )}
                        <ChevronsUpDown size={13} className="opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[400px]" align="start">
                      <Command>
                        <CommandInput placeholder="Search employee…" />
                        <CommandList>
                          <CommandEmpty>No employees found.</CommandEmpty>
                          <CommandGroup>
                            {employees.map(e => (
                              <CommandItem
                                key={e.id} value={`${e.name} ${e.employee_id} ${e.department}`}
                                onSelect={() => { setSelectedAssignEmp(e); setAssignEmpId(e.id); setEmpPickerOpen(false); }}
                              >
                                <Avatar className="h-7 w-7 mr-2.5">
                                  <AvatarFallback className="text-[10px] font-semibold bg-sky-500/10 text-sky-600">{initials(e.name)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{e.name}</p>
                                  <p className="text-xs text-muted-foreground tabular-nums">{e.employee_id} · {e.department}</p>
                                </div>
                                {assignEmpId === e.id && <Check size={13} className="text-sky-600" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {selectedAssignEmp && (
                  <Card className="bg-sky-500/5 border-sky-500/30">
                    <CardContent className="p-3.5 flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="text-sm font-semibold bg-sky-500/10 text-sky-600">{initials(selectedAssignEmp.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-foreground">{selectedAssignEmp.name}</p>
                        <p className="text-xs text-muted-foreground">{selectedAssignEmp.designation} · {selectedAssignEmp.department}</p>
                        <p className="text-xs text-sky-600 tabular-nums">{selectedAssignEmp.email}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Seats Allocated</Label>
                <Input type="number" value={assignSeats} onChange={e => setAssignSeats(e.target.value)} className="tabular-nums" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Access Login / Username</Label>
                <div className="relative">
                  <Shield size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input value={assignLogin} onChange={e => setAssignLogin(e.target.value)} placeholder="login@company.com or username" className="pl-9" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Access Note (optional)</Label>
              <Textarea value={assignNote} onChange={e => setAssignNote(e.target.value)} rows={2}
                placeholder="Any extra instructions, temp password, etc…" className="resize-none" />
            </div>

            {/* Email preview */}
            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Mail size={11} /> Email Preview — who will receive access mail
                </p>
                {assignType === "employee" && selectedAssignEmp && (
                  <div className="flex items-center gap-2 text-xs">
                    <MailCheck size={12} className="text-emerald-500" />
                    <span className="font-medium text-foreground">{selectedAssignEmp.name}</span>
                    <span className="text-muted-foreground tabular-nums">→ {selectedAssignEmp.email}</span>
                  </div>
                )}
                {assignType === "dept_team" && assignDept && employees.filter(e => e.department === assignDept).slice(0, 5).map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-xs">
                    <MailCheck size={12} className="text-emerald-500" />
                    <span className="font-medium text-foreground">{e.name}</span>
                    <span className="text-muted-foreground tabular-nums">→ {e.email}</span>
                  </div>
                ))}
                {assignType === "dept_team" && assignDept && employees.filter(e => e.department === assignDept).length > 5 && (
                  <p className="text-xs text-muted-foreground pl-5">+{employees.filter(e => e.department === assignDept).length - 5} more in dept</p>
                )}
                {((assignType === "dept_team" && !assignDept) || (assignType === "employee" && !selectedAssignEmp)) && (
                  <p className="text-xs text-muted-foreground">Select {assignType === "dept_team" ? "a department" : "an employee"} above to preview recipients</p>
                )}
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-between gap-2 border-t border-border bg-background px-6 py-4">
            <p className="text-xs text-muted-foreground hidden sm:block">Credentials email uses your configured SMTP</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAssignModal(false)}>Cancel</Button>
              <Button type="button" variant="outline" size="sm" disabled={saving || !assignValid} onClick={() => handleSaveAssign(false)}>
                {saving && <Loader2 size={12} className="animate-spin" />}
                Save Assignment
              </Button>
              <Button type="button" size="sm" disabled={saving || !canSendEmail} onClick={() => handleSaveAssign(true)}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Save &amp; Send Email
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete subscription confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">&ldquo;{confirmDelete?.name}&rdquo;</span> and all assignments will be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteSub(); }} className="bg-destructive text-white hover:bg-destructive/90">
              {deletingId === confirmDelete?.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete assignment confirm */}
      <AlertDialog open={!!confirmDeleteAssign} onOpenChange={(o) => !o && setConfirmDeleteAssign(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              Access credentials already sent will not be revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteAssignment(); }} className="bg-destructive text-white hover:bg-destructive/90">
              {deletingId === confirmDeleteAssign?.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}
