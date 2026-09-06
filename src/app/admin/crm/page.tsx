"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Plus, FileText, LayoutGrid, Database, Search as SearchIcon,
  MoreVertical, MoreHorizontal, Trash2, Copy, Pencil, Check, Phone, User,
  UserCheck, Mail, AlertTriangle, Loader2, Building2, Receipt, Tag, IndianRupee,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { validateGSTIN, extractPANFromGSTIN } from "@/lib/gst";
import {
  DragDropContext, Droppable, Draggable, DropResult,
} from "@hello-pangea/dnd";

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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const formatRupee = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

const indianWords = (num: number) => {
  if (!num) return "";
  if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000)   return `${(num / 100000).toFixed(2)} Lakh`;
  if (num >= 1000)     return `${(num / 1000).toFixed(2)} K`;
  return num.toString();
};

const STAGE_COLORS = [
  { name: "Emerald", c: "bg-emerald-500", dotClass: "text-emerald-600 border-emerald-500/30 bg-emerald-500/10" },
  { name: "Rose",    c: "bg-rose-500",    dotClass: "text-rose-600 border-rose-500/30 bg-rose-500/10" },
  { name: "Amber",   c: "bg-amber-500",   dotClass: "text-amber-600 border-amber-500/30 bg-amber-500/10" },
  { name: "Blue",    c: "bg-blue-500",    dotClass: "text-blue-500 border-blue-500/30 bg-blue-500/10" },
  { name: "Indigo",  c: "bg-indigo-500",  dotClass: "text-indigo-600 border-indigo-500/30 bg-indigo-500/10" },
  { name: "Violet",  c: "bg-violet-500",  dotClass: "text-violet-600 border-violet-500/30 bg-violet-500/10" },
  { name: "Pink",    c: "bg-pink-500",    dotClass: "text-pink-600 border-pink-500/30 bg-pink-500/10" },
  { name: "Orange",  c: "bg-orange-500",  dotClass: "text-orange-600 border-orange-500/30 bg-orange-500/10" },
  { name: "Cyan",    c: "bg-cyan-500",    dotClass: "text-cyan-600 border-cyan-500/30 bg-cyan-500/10" },
  { name: "Slate",   c: "bg-slate-500",   dotClass: "text-slate-600 border-slate-500/30 bg-slate-500/10" },
];

const PRIORITY_TONE: Record<string, string> = {
  Critical: "text-rose-600 border-rose-500/30 bg-rose-500/10",
  High:     "text-amber-600 border-amber-500/30 bg-amber-500/10",
  Medium:   "text-sky-600 border-sky-500/30 bg-sky-500/10",
};

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface DealItem {
  id: string; company: string; value: number;
  priority: "Medium" | "High" | "Critical";
  leadName: string; leadPhone: string;
  empName: string; empId: string;
  stage: string; date: string;
  email: string; gstin: string; pan: string; address: string;
}

interface Column {
  id: string; title: string; color: string; dotClass: string; items: DealItem[];
}

const INITIAL_COLUMNS: Record<string, Column> = {
  new:        { id: "new",        title: "New",         color: "bg-emerald-500", dotClass: STAGE_COLORS[0].dotClass, items: [] },
  contacted:  { id: "contacted",  title: "Discovery",   color: "bg-rose-500",    dotClass: STAGE_COLORS[1].dotClass, items: [] },
  negotiation:{ id: "negotiation",title: "Negotiation", color: "bg-amber-500",   dotClass: STAGE_COLORS[2].dotClass, items: [] },
  won:        { id: "won",        title: "Won",         color: "bg-blue-500",    dotClass: STAGE_COLORS[3].dotClass, items: [] },
  lost:       { id: "lost",       title: "Lost",        color: "bg-slate-500",   dotClass: STAGE_COLORS[9].dotClass, items: [] },
};
const INITIAL_ORDER = ["new", "contacted", "negotiation", "won", "lost"];

const EMPTY_FORM = {
  id: "" as string | undefined,
  company: "", value: 0, leadName: "", leadPhone: "",
  email: "", gstin: "", pan: "", address: "",
  empId: "", empName: "",
  priority: "Medium" as DealItem["priority"],
  stage: "new",
};

function initials(name?: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function CRMPipelinePage() {
  const [columns, setColumns] = useState<Record<string, Column>>(INITIAL_COLUMNS);
  const [columnOrder, setColumnOrder] = useState<string[]>(INITIAL_ORDER);
  const [isReady, setIsReady] = useState(false);
  const [view, setView] = useState<"board" | "database">("board");
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<{ id: string; employee_id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/edit lead dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Add stage dialog
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [stageForm, setStageForm] = useState({ title: "", colorIdx: 9 });

  // Delete confirms
  const [confirmDeleteLead, setConfirmDeleteLead] = useState<DealItem | null>(null);
  const [confirmDeleteStage, setConfirmDeleteStage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Load ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    setIsReady(true);
    fetchEmployees();
    fetchLeads();
    const channel = supabase
      .channel("crm_realtime_sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchLeads())
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => fetchEmployees())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchLeads = async () => {
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: true });
    if (error) { toast.error("Error fetching leads"); }
    else {
      const newCols: Record<string, Column> = {};
      Object.keys(INITIAL_COLUMNS).forEach(k => {
        newCols[k] = { ...INITIAL_COLUMNS[k], items: [] };
      });
      (data || []).forEach((lead: any) => {
        const stageId = lead.stage?.toLowerCase() || "new";
        if (!newCols[stageId]) {
          // Create dynamic stage column
          newCols[stageId] = {
            id: stageId,
            title: lead.stage,
            color: "bg-slate-500",
            dotClass: STAGE_COLORS[9].dotClass,
            items: [],
          };
        }
        newCols[stageId].items.push({
          id: lead.id,
          company: lead.company || lead.name,
          value: Number(lead.value || 0),
          leadName: lead.lead_name || "",
          leadPhone: lead.lead_phone || "",
          stage: stageId,
          priority: (lead.priority as DealItem["priority"]) || "Medium",
          empName: lead.emp_name || "Unassigned",
          empId: lead.emp_id || "",
          email: lead.email || "",
          gstin: lead.gstin || "",
          pan: lead.pan || "",
          address: lead.address || "",
          date: new Date(lead.created_at).toLocaleDateString("en-IN", { month: "short", day: "2-digit" }),
        });
      });
      setColumns(newCols);
      // Re-derive order if dynamic stages exist
      const dynamic = Object.keys(newCols).filter(k => !INITIAL_ORDER.includes(k));
      setColumnOrder([...INITIAL_ORDER.filter(o => newCols[o]), ...dynamic]);
    }
    setLoading(false);
  };

  const fetchEmployees = async () => {
    const { data, error } = await supabase.from("employees").select("id, employee_id, name").order("employee_id");
    if (!error) setEmployees(data || []);
  };

  /* ── Lead dialog ──────────────────────────────────────────────────────── */
  const openAdd = (stageId?: string) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, stage: stageId || "new" });
    setDialogOpen(true);
  };
  const openEdit = (item: DealItem) => {
    setEditingId(item.id);
    setForm({
      id: item.id, company: item.company, value: item.value,
      leadName: item.leadName, leadPhone: item.leadPhone,
      email: item.email, gstin: item.gstin, pan: item.pan, address: item.address,
      empId: item.empId, empName: item.empName,
      priority: item.priority, stage: item.stage,
    });
    setDialogOpen(true);
  };

  const onGstinChange = (val: string) => {
    const upper = val.toUpperCase();
    const pan = extractPANFromGSTIN(upper);
    setForm(f => ({ ...f, gstin: upper, pan: pan || f.pan }));
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form.company.trim()) { toast.warning("Company name is required"); return; }
    if (form.gstin && !validateGSTIN(form.gstin)) { toast.error("Invalid GSTIN"); return; }
    setSaving(true);
    try {
      const emp = employees.find(e => e.employee_id === form.empId);
      const payload = {
        company: form.company, name: form.company,
        value: form.value,
        lead_name: form.leadName, lead_phone: form.leadPhone,
        email: form.email, gstin: form.gstin, pan: form.pan, address: form.address,
        stage: form.stage, priority: form.priority,
        emp_id: emp?.id || null,
        emp_name: form.empName,
      };
      if (editingId) {
        const { error } = await supabase.from("leads").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Lead updated");
      } else {
        const { error } = await supabase.from("leads").insert([payload]);
        if (error) throw error;
        toast.success("Lead captured");
      }
      setDialogOpen(false);
      fetchLeads();
    } catch (err: any) {
      toast.error(err.message || "Failed to save lead");
    } finally { setSaving(false); }
  };

  const handleDuplicate = async (item: DealItem) => {
    try {
      const emp = employees.find(e => e.employee_id === item.empId || e.id === item.empId);
      const { error } = await supabase.from("leads").insert([{
        company: `${item.company} (Copy)`, name: `${item.company} (Copy)`,
        value: item.value, lead_name: item.leadName, lead_phone: item.leadPhone,
        email: item.email, gstin: item.gstin, pan: item.pan,
        stage: item.stage, priority: item.priority,
        emp_id: emp?.id || null, emp_name: item.empName,
      }]);
      if (error) throw error;
      toast.success("Lead duplicated");
      fetchLeads();
    } catch (err: any) {
      toast.error(err.message || "Duplicate failed");
    }
  };

  const handleConvert = async (item: DealItem) => {
    try {
      const emp = employees.find(e => e.employee_id === item.empId);
      const { error } = await supabase.from("clients").insert([{
        name: item.company, company: item.company, company_name: item.company,
        lead_name: item.leadName, contact_person: item.leadName, lead_phone: item.leadPhone,
        value: item.value, emp_id: emp?.id || null, status: "Active",
        email: item.email, gstin: item.gstin, pan: item.pan, address: item.address,
        tier: item.priority === "Critical" ? "Strategic" : item.priority === "High" ? "Key Account" : "Standard",
        from_pipeline: true, converted_at: new Date().toISOString(),
      }]);
      if (error) throw error;
      await supabase.from("leads").delete().eq("id", item.id);
      toast.success(`${item.company} converted to client`);
      fetchLeads();
    } catch (err: any) {
      toast.error(err.message || "Conversion failed");
    }
  };

  const handleDeleteLead = async () => {
    if (!confirmDeleteLead) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("leads").delete().eq("id", confirmDeleteLead.id);
      if (error) throw error;
      toast.success("Lead removed");
      setConfirmDeleteLead(null);
      fetchLeads();
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    } finally { setDeleting(false); }
  };

  /* ── Stage actions ────────────────────────────────────────────────────── */
  const openStageDialog = () => { setStageForm({ title: "", colorIdx: 9 }); setStageDialogOpen(true); };

  const saveStage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!stageForm.title.trim()) return;
    const id = stageForm.title.toLowerCase().replace(/\s+/g, "_");
    if (columns[id]) { toast.error("A stage with that name already exists"); return; }
    const color = STAGE_COLORS[stageForm.colorIdx];
    setColumns(c => ({ ...c, [id]: { id, title: stageForm.title, color: color.c, dotClass: color.dotClass, items: [] } }));
    setColumnOrder(o => [...o, id]);
    setStageDialogOpen(false);
    toast.success(`Stage "${stageForm.title}" added`);
  };

  const deleteStage = () => {
    if (!confirmDeleteStage) return;
    setColumns(c => { const next = { ...c }; delete next[confirmDeleteStage]; return next; });
    setColumnOrder(o => o.filter(id => id !== confirmDeleteStage));
    setConfirmDeleteStage(null);
    toast.success("Stage removed");
  };

  /* ── Drag & drop ─────────────────────────────────────────────────────── */
  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const start = columns[source.droppableId];
    const finish = columns[destination.droppableId];

    if (start === finish) {
      const newItems = Array.from(start.items);
      const [removed] = newItems.splice(source.index, 1);
      newItems.splice(destination.index, 0, removed);
      setColumns(c => ({ ...c, [start.id]: { ...start, items: newItems } }));
    } else {
      const startItems = Array.from(start.items);
      const [removed] = startItems.splice(source.index, 1);
      const finishItems = Array.from(finish.items);
      finishItems.splice(destination.index, 0, { ...removed, stage: finish.id });
      setColumns(c => ({
        ...c,
        [start.id]: { ...start, items: startItems },
        [finish.id]: { ...finish, items: finishItems },
      }));
      const { error } = await supabase.from("leads").update({ stage: finish.id }).eq("id", draggableId);
      if (error) {
        toast.error("Failed to sync stage");
        fetchLeads();
      }
    }
  };

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const filteredCols = useMemo(() => {
    if (!search) return columns;
    const out: Record<string, Column> = {};
    Object.entries(columns).forEach(([id, col]) => {
      out[id] = {
        ...col,
        items: col.items.filter(i =>
          i.company.toLowerCase().includes(search.toLowerCase()) ||
          i.leadName.toLowerCase().includes(search.toLowerCase()) ||
          (i.empName || "").toLowerCase().includes(search.toLowerCase()) ||
          (i.empId || "").toLowerCase().includes(search.toLowerCase())
        ),
      };
    });
    return out;
  }, [columns, search]);

  const allDeals = useMemo(
    () => columnOrder.flatMap(id => filteredCols[id]?.items.map(i => ({ ...i, _col: filteredCols[id] })) || []),
    [filteredCols, columnOrder]
  );

  const totalDeals = Object.values(columns).reduce((s, c) => s + c.items.length, 0);
  const totalValue = Object.values(columns).reduce((s, c) => s + c.items.reduce((a, b) => a + b.value, 0), 0);
  const wonCount = (columns.won?.items.length || 0);
  const criticalCount = Object.values(columns).reduce((s, c) => s + c.items.filter(i => i.priority === "Critical").length, 0);

  const gstinInvalid = form.gstin && !validateGSTIN(form.gstin);

  if (!isReady) return null;

  const stats = [
    { label: "Total Leads",     value: String(totalDeals),       icon: FileText,    tone: "text-foreground",  bg: "bg-muted" },
    { label: "Pipeline Value",  value: formatRupee(totalValue),   icon: IndianRupee, tone: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Won",             value: String(wonCount),          icon: UserCheck,   tone: "text-sky-600",     bg: "bg-sky-500/10" },
    { label: "Critical Deals",  value: String(criticalCount),     icon: AlertTriangle, tone: "text-rose-600",  bg: "bg-rose-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="sales_pipeline"
      title="Sales Pipeline"
      subtitle="Drag deals across stages, capture leads, and convert won deals to clients."
      actions={
        <div className="flex items-center gap-2">
          {view === "board" && (
            <Button variant="outline" size="sm" onClick={openStageDialog}>
              <Plus size={13} /> New Stage
            </Button>
          )}
          <Button size="sm" onClick={() => openAdd()}>
            <Plus size={13} /> Add Lead
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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

        {/* View toggle + search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList>
              <TabsTrigger value="board" className="text-xs gap-1.5"><LayoutGrid size={11} /> Pipeline</TabsTrigger>
              <TabsTrigger value="database" className="text-xs gap-1.5"><Database size={11} /> Database</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <SearchIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by company, contact, employee…" className="h-8 w-72 pl-8 text-xs" />
          </div>
        </div>

        {/* Board / Database */}
        {view === "board" ? (
          <div className="flex gap-4 pb-6 items-start overflow-x-auto">
            <DragDropContext onDragEnd={onDragEnd}>
              {columnOrder.map(colId => {
                const column = filteredCols[colId];
                if (!column) return null;
                const colTotal = column.items.reduce((s, i) => s + i.value, 0);
                const isDefault = INITIAL_ORDER.includes(colId);
                return (
                  <div key={column.id} className="flex-shrink-0 w-72 flex flex-col gap-3">
                    <div className="flex items-center justify-between px-1 group/header">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-3 h-3 rounded-sm", column.color)} />
                        <h4 className="text-sm font-semibold text-foreground">{column.title}</h4>
                        <span className="text-xs text-muted-foreground tabular-nums">{column.items.length}</span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
                        {colTotal > 0 && <span className="text-[11px] text-muted-foreground tabular-nums mr-1">{formatRupee(colTotal)}</span>}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openAdd(column.id)}>
                          <Plus size={13} />
                        </Button>
                        {!isDefault && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreHorizontal size={13} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setConfirmDeleteStage(column.id)}
                              >
                                <Trash2 size={12} className="mr-2" /> Delete Stage
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    <Droppable droppableId={column.id}>
                      {(provided, snapshot) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className={cn(
                            "flex flex-col gap-2 min-h-[100px] rounded-md transition-colors p-1",
                            snapshot.isDraggingOver ? "bg-muted/50" : "bg-transparent",
                          )}
                        >
                          {loading ? (
                            <>
                              <Skeleton className="h-24 rounded-md" />
                              <Skeleton className="h-24 rounded-md" />
                            </>
                          ) : column.items.length === 0 ? (
                            <button
                              onClick={() => openAdd(column.id)}
                              className="rounded-md border border-dashed border-border bg-card/50 p-4 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Plus size={11} /> Add lead
                            </button>
                          ) : column.items.map((item, index) => (
                            <Draggable key={item.id} draggableId={item.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={cn(
                                    "group rounded-md border border-border bg-card p-3 shadow-sm transition-shadow",
                                    snapshot.isDragging && "shadow-lg ring-2 ring-primary/30",
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-start gap-2 min-w-0">
                                      <Avatar className="h-7 w-7 flex-shrink-0">
                                        <AvatarFallback className="text-[10px] font-semibold bg-sky-500/10 text-sky-600">{initials(item.company)}</AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate leading-tight">{item.company}</p>
                                        <p className="text-sm font-medium text-emerald-600 tabular-nums leading-tight">{formatRupee(item.value)}</p>
                                      </div>
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <MoreVertical size={13} />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuItem className="text-emerald-600 focus:text-emerald-600" onClick={() => handleConvert(item)}>
                                          <UserCheck size={12} className="mr-2" /> Convert to Client
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => openEdit(item)}>
                                          <Pencil size={12} className="mr-2" /> Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleDuplicate(item)}>
                                          <Copy size={12} className="mr-2" /> Duplicate
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDeleteLead(item)}>
                                          <Trash2 size={12} className="mr-2" /> Delete
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  <div className="space-y-1 text-xs text-muted-foreground">
                                    {item.leadName && (
                                      <div className="flex items-center gap-1.5"><User size={10} /> {item.leadName}</div>
                                    )}
                                    {item.leadPhone && (
                                      <div className="flex items-center gap-1.5"><Phone size={10} /> {item.leadPhone}</div>
                                    )}
                                  </div>

                                  <Separator className="my-2.5" />

                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <Avatar className="h-5 w-5">
                                        <AvatarFallback className="text-[8px] font-semibold">{initials(item.empName)}</AvatarFallback>
                                      </Avatar>
                                      <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">{item.empName}</span>
                                    </div>
                                    <Badge variant="outline" className={cn("text-[10px]", PRIORITY_TONE[item.priority])}>
                                      {item.priority}
                                    </Badge>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {column.items.length > 0 && (
                            <button
                              onClick={() => openAdd(column.id)}
                              className="rounded-md border border-dashed border-border bg-transparent p-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Plus size={11} /> Add lead
                            </button>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </DragDropContext>
            <button
              onClick={openStageDialog}
              className="flex-shrink-0 w-72 h-10 border border-dashed border-border rounded-md flex items-center justify-center gap-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors text-xs font-medium"
            >
              <Plus size={13} /> Add Stage
            </button>
          </div>
        ) : (
          /* Database view */
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 11 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : allDeals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                            <FileText size={20} className="text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">{search ? "No leads match your search" : "No leads yet"}</p>
                          {!search && <Button size="sm" onClick={() => openAdd()}><Plus size={12} /> Add First Lead</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : allDeals.map((deal) => (
                    <TableRow key={deal.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[9px] font-semibold bg-sky-500/10 text-sky-600">{initials(deal.company)}</AvatarFallback>
                          </Avatar>
                          <p className="text-sm font-medium text-foreground">{deal.company}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(deal._col.dotClass)}>{deal._col.title}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-emerald-600 tabular-nums">{formatRupee(deal.value)}</TableCell>
                      <TableCell className="text-xs text-foreground">{deal.leadName || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{deal.leadPhone || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[160px]">{deal.email || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">{deal.gstin || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[9px] font-semibold">{initials(deal.empName)}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-foreground">{deal.empName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(PRIORITY_TONE[deal.priority])}>{deal.priority}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{deal.date}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical size={13} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem className="text-emerald-600 focus:text-emerald-600" onClick={() => handleConvert(deal)}>
                              <UserCheck size={12} className="mr-2" /> Convert to Client
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEdit(deal)}>
                              <Pencil size={12} className="mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(deal)}>
                              <Copy size={12} className="mr-2" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDeleteLead(deal)}>
                              <Trash2 size={12} className="mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
              <span className="text-xs text-muted-foreground">{allDeals.length} of {totalDeals} leads</span>
              <span className="text-xs text-muted-foreground">
                Pipeline value: <span className="font-semibold text-foreground tabular-nums">{formatRupee(totalValue)}</span>
              </span>
            </div>
          </Card>
        )}
      </div>

      {/* ── Add / Edit Lead Dialog ─────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-4rem)] sm:max-h-[88vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0",
              editingId ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary")}>
              {editingId ? <Pencil size={16} /> : <Plus size={16} />}
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">{editingId ? "Edit Lead" : "Add New Lead"}</DialogTitle>
              <DialogDescription className="text-xs">
                {editingId ? `Updating ${form.company || "lead"}` : "Capture a new lead and place it in a pipeline stage"}
              </DialogDescription>
            </div>
          </DialogHeader>

          <form id="lead-form" onSubmit={handleSave} className="min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Building2 size={11} /> Company Identity
              </p>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Company / Lead Name *</Label>
                  <Input
                    value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    placeholder="e.g. Acme Industries" autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Billing Address</Label>
                  <Textarea
                    value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    rows={2} placeholder="Street, City, State, Pincode" className="resize-none"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <User size={11} /> Contact Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact Person</Label>
                  <Input value={form.leadName} onChange={e => setForm(f => ({ ...f, leadName: e.target.value }))} placeholder="Full name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.leadPhone} onChange={e => setForm(f => ({ ...f, leadPhone: e.target.value.replace(/[^0-9+\- ]/g, "").slice(0, 18) }))} placeholder="+91 98765 43210" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@company.com" />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Receipt size={11} /> Tax Identifiers
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">GSTIN</Label>
                  <div className="relative">
                    <Input
                      value={form.gstin} onChange={e => onGstinChange(e.target.value)}
                      placeholder="29ABCDE1234F1Z5"
                      className={cn("uppercase", gstinInvalid && "border-rose-500 focus-visible:ring-rose-500/30")}
                    />
                    {gstinInvalid && <AlertTriangle size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-500" />}
                    {form.gstin && !gstinInvalid && <Check size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
                  </div>
                  {form.gstin && !gstinInvalid && <p className="text-[10px] text-emerald-600">Valid · PAN auto-extracted</p>}
                  {gstinInvalid && <p className="text-[10px] text-rose-500">Invalid GSTIN format</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">PAN</Label>
                  <Input value={form.pan} onChange={e => setForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" className="uppercase" />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Tag size={11} /> Deal &amp; Assignment
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Deal Value (₹)</Label>
                  <div className="relative">
                    <Input
                      type="number" min={0}
                      value={form.value || ""} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                      placeholder="0" className="tabular-nums"
                    />
                  </div>
                  {form.value > 0 && <p className="text-[10px] text-emerald-600 font-medium">{indianWords(form.value)}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Stage</Label>
                  <Select value={form.stage} onValueChange={(v) => setForm(f => ({ ...f, stage: v }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {columnOrder.map(id => columns[id] && (
                        <SelectItem key={id} value={id}>{columns[id].title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v as DealItem["priority"] }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigned Employee</Label>
                  <Select value={form.empId || undefined} onValueChange={(v) => {
                    const emp = employees.find(e => e.employee_id === v);
                    setForm(f => ({ ...f, empId: v, empName: emp?.name || "" }));
                  }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      {employees.map(e => (
                        <SelectItem key={e.id} value={e.employee_id}>{e.name} · {e.employee_id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </form>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-between gap-2 border-t border-border bg-background px-6 py-4">
            <p className="text-xs text-muted-foreground hidden sm:block">
              {editingId ? "Saved leads update in real-time" : "Leads convert to Clients from the action menu"}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" form="lead-form" size="sm" disabled={saving || !form.company.trim()}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {editingId ? "Save Changes" : "Add Lead"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Stage Dialog ───────────────────────────────────────────── */}
      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Pipeline Stage</DialogTitle>
            <DialogDescription className="text-xs">Add a custom stage to the kanban board.</DialogDescription>
          </DialogHeader>
          <form id="stage-form" onSubmit={saveStage} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Stage Name *</Label>
              <Input value={stageForm.title} onChange={e => setStageForm(s => ({ ...s, title: e.target.value }))} placeholder="e.g. Legal Review" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Color</Label>
              <div className="flex flex-wrap gap-2">
                {STAGE_COLORS.map((c, idx) => (
                  <button
                    key={c.name} type="button"
                    onClick={() => setStageForm(s => ({ ...s, colorIdx: idx }))}
                    className={cn("h-7 w-7 rounded-full transition-transform hover:scale-110", c.c,
                      stageForm.colorIdx === idx ? "ring-2 ring-offset-2 ring-foreground" : "")}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setStageDialogOpen(false)}>Cancel</Button>
            <Button type="submit" form="stage-form" size="sm" disabled={!stageForm.title.trim()}>
              <Plus size={12} /> Add Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete lead confirm */}
      <AlertDialog open={!!confirmDeleteLead} onOpenChange={(o) => !o && setConfirmDeleteLead(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">&ldquo;{confirmDeleteLead?.company}&rdquo;</span> will be permanently removed from the pipeline. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteLead(); }} className="bg-destructive text-white hover:bg-destructive/90">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete stage confirm */}
      <AlertDialog open={!!confirmDeleteStage} onOpenChange={(o) => !o && setConfirmDeleteStage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stage?</AlertDialogTitle>
            <AlertDialogDescription>
              The <span className="font-medium text-foreground">{confirmDeleteStage && columns[confirmDeleteStage]?.title}</span> stage will be removed from the board. Any leads in it will need to be moved manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); deleteStage(); }} className="bg-destructive text-white hover:bg-destructive/90">
              <Trash2 size={12} /> Delete Stage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}
