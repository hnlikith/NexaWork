/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { useToast } from "@/components/ui/ToastLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  Layers, Plus, X, Edit2, Trash2, Copy, Check, Search, Loader2,
  FileText, ChevronDown, Tag,
} from "lucide-react";

type Template = {
  id: string; name: string; category: string; subject: string;
  body: string; variables: { name: string; description?: string }[];
  status: string; usage_count: number; created_at: string;
  creator?: { id: string; name: string };
};

const CATEGORIES = ["all", "general", "hr", "finance", "ops", "sales"] as const;
const STATUS_COLS = [
  { id: "active",   label: "Active",   color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  { id: "draft",    label: "Draft",    color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
  { id: "archived", label: "Archived", color: "text-theme-muted", bg: "bg-theme-raised",   border: "border-theme-border" },
];

const CAT_COLORS: Record<string, string> = {
  hr: "info", finance: "warning", general: "secondary", ops: "success", sales: "danger",
};

export default function TemplatesPage() {
  const { user }       = useAuth();
  const { showToast }  = useToast();

  const [templates, setTemplates]   = useState<Template[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [category,  setCategory]    = useState<string>("all");
  const [search,    setSearch]      = useState("");
  const [view,      setView]        = useState<"grid" | "kanban">("grid");

  const [showForm,  setShowForm]    = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm] = useState({ name:"", category:"general", subject:"", body:"", variables:"" });
  const [saving,    setSaving]      = useState(false);
  const [copiedId,  setCopiedId]    = useState<string | null>(null);
  const [preview,   setPreview]     = useState<Template | null>(null);
  const [currentEmp, setCurrentEmp] = useState<{ id: string } | null>(null);

  useEffect(() => {
    import("@/lib/supabase").then(({ supabase }) =>
      supabase.from("employees").select("id").eq("email",(user as any)?.email||"").maybeSingle()
        .then(({ data }) => setCurrentEmp(data))
    );
    load();
  }, []);

  async function load() {
    const res  = await fetch("/api/mail/templates?status=all");
    const data = await res.json();
    setTemplates(data.data || []);
    setLoading(false);
  }

  async function save() {
    if (!form.name || !form.subject || !form.body) {
      showToast("Name, subject and body are required.", "warning"); return;
    }
    setSaving(true);
    try {
      let vars: { name: string }[] = [];
      try { vars = form.variables ? JSON.parse(form.variables) : []; } catch { vars = []; }

      const payload: any = { ...form, variables: vars, created_by: currentEmp?.id };
      const method = editingId ? "PATCH" : "POST";
      if (editingId) payload.id = editingId;

      const res = await fetch("/api/mail/templates", { method, headers: { "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        showToast(editingId ? "Template updated." : "Template created.", "success");
        setShowForm(false); setEditingId(null);
        setForm({ name:"", category:"general", subject:"", body:"", variables:"" });
        load();
      }
    } finally { setSaving(false); }
  }

  function editTemplate(t: Template) {
    setEditingId(t.id);
    setForm({ name: t.name, category: t.category, subject: t.subject, body: t.body, variables: JSON.stringify(t.variables||[]) });
    setShowForm(true);
  }

  async function archiveTemplate(id: string) {
    await fetch("/api/mail/templates", { method:"DELETE", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id }) });
    showToast("Template archived.", "success");
    load();
  }

  function copySubject(t: Template) {
    navigator.clipboard.writeText(t.subject);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function handleDragEnd(result: any) {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    await fetch("/api/mail/templates", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draggableId, status: newStatus }),
    });
    setTemplates((prev) => prev.map((t) => t.id === draggableId ? { ...t, status: newStatus } : t));
  }

  const filtered = templates.filter((t) => {
    const q = search.toLowerCase();
    const matchCat = category === "all" || t.category === category;
    const matchQ   = !q || t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  return (
    <DashboardShell
      moduleKey="mail_templates"
      title="Email Templates"
      subtitle="Reusable email templates with variable support."
      actions={
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-theme-border bg-theme-raised p-1 gap-0.5">
            {(["grid","kanban"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={cn("px-3 py-1 rounded-lg text-xs font-semibold transition-all capitalize",
                  view===v ? "bg-theme-surface text-theme-fg shadow-sm" : "text-theme-muted hover:text-theme-fg")}>
                {v === "grid" ? "Grid" : "Kanban"}
              </button>
            ))}
          </div>
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm({name:"",category:"general",subject:"",body:"",variables:""}); }}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all shadow-sm">
            <Plus size={13} /> New Template
          </button>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex rounded-xl border border-theme-border bg-theme-raised p-1 gap-0.5">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize",
                category===c ? "bg-theme-surface text-theme-fg shadow-sm" : "text-theme-muted hover:text-theme-fg")}>
              {c === "all" ? "All" : c.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…"
            className="h-9 pl-8 pr-3 rounded-xl border border-theme-border bg-theme-surface text-xs text-theme-fg outline-none focus:border-theme-primary w-52" />
        </div>
        <p className="text-xs text-theme-muted ml-auto">{filtered.length} template{filtered.length !== 1 ? "s" : ""}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-theme-muted" /></div>
      ) : view === "kanban" ? (
        /* Kanban View */
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-3">
            {STATUS_COLS.map((col) => {
              const colTemplates = filtered.filter((t) => t.status === col.id);
              return (
                <div key={col.id} className="flex-shrink-0 w-72">
                  <div className={cn("flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border", col.bg, col.border)}>
                    <span className={cn("text-xs font-bold", col.color)}>{col.label}</span>
                    <span className={cn("ml-auto text-[10px] font-black opacity-60", col.color)}>{colTemplates.length}</span>
                  </div>
                  <Droppable droppableId={col.id}>
                    {(prov, snap) => (
                      <div ref={prov.innerRef} {...prov.droppableProps}
                        className={cn("min-h-16 space-y-2 rounded-xl p-1.5 transition-all",
                          snap.isDraggingOver && "bg-theme-raised/60 ring-2 ring-dashed ring-theme-primary/20")}>
                        {colTemplates.map((t, idx) => (
                          <Draggable key={t.id} draggableId={t.id} index={idx}>
                            {(p, s) => (
                              <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                                className={cn("p-3 rounded-xl border bg-theme-surface cursor-grab transition-all",
                                  s.isDragging ? "shadow-lg rotate-1 border-theme-primary/30" : "border-theme-border hover:border-theme-primary/30")}>
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <p className="text-xs font-bold text-theme-fg leading-tight">{t.name}</p>
                                  <Badge variant={(CAT_COLORS[t.category] as any) || "secondary"}>
                                    {t.category}
                                  </Badge>
                                </div>
                                <p className="text-[10px] text-theme-muted truncate">{t.subject}</p>
                                <div className="flex items-center gap-1.5 mt-2">
                                  <span className="text-[9px] text-theme-muted">{t.usage_count} uses</span>
                                  <button onClick={() => editTemplate(t)} className="ml-auto p-1 rounded hover:bg-theme-raised text-theme-muted hover:text-theme-fg transition-all">
                                    <Edit2 size={10} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {prov.placeholder}
                        {colTemplates.length === 0 && !snap.isDraggingOver && (
                          <div className="flex items-center justify-center h-14 rounded-xl border-2 border-dashed border-theme-border/30">
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
      ) : (
        /* Grid View */
        filtered.length === 0 ? (
          <div className="page-card flex flex-col items-center justify-center py-16">
            <Layers size={36} className="text-theme-muted/20 mb-4" />
            <p className="text-sm font-semibold text-theme-muted">No templates found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <div key={t.id} className="page-card hover:border-theme-primary/30 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText size={14} className="text-theme-primary flex-shrink-0" />
                      <h3 className="text-sm font-bold text-theme-fg truncate">{t.name}</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={(CAT_COLORS[t.category] as any)||"secondary"}>{t.category}</Badge>
                      {t.status !== "active" && (
                        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full",
                          t.status === "draft" ? "bg-amber-500/10 text-amber-500" : "bg-theme-raised text-theme-muted")}>
                          {t.status.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => editTemplate(t)}
                      className="p-1.5 rounded-lg hover:bg-theme-raised text-theme-muted hover:text-theme-fg transition-all"><Edit2 size={12} /></button>
                    <button onClick={() => archiveTemplate(t.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 text-theme-muted hover:text-rose-500 transition-all"><Trash2 size={12} /></button>
                  </div>
                </div>

                <p className="text-xs font-semibold text-theme-fg mb-1 truncate">{t.subject}</p>
                <p className="text-[11px] text-theme-muted leading-relaxed line-clamp-2 mb-3">
                  {t.body?.replace(/\n/g," ").slice(0,120)}…
                </p>

                {t.variables?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {t.variables.slice(0,3).map((v) => (
                      <span key={v.name} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-theme-raised text-theme-muted">
                        {`{{${v.name}}}`}
                      </span>
                    ))}
                    {t.variables.length > 3 && <span className="text-[9px] text-theme-muted">+{t.variables.length-3} more</span>}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-3 border-t border-theme-border/50">
                  <span className="text-[10px] text-theme-muted">{t.usage_count} uses</span>
                  <span className="text-theme-border mx-1">·</span>
                  <span className="text-[10px] text-theme-muted">{t.variables?.length || 0} variables</span>
                  <button onClick={() => copySubject(t)} className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-theme-raised text-theme-muted hover:text-theme-fg text-[10px] transition-all">
                    {copiedId === t.id ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                    Copy Subject
                  </button>
                  <button onClick={() => setPreview(t)} className="px-2 py-1 rounded-lg bg-theme-primary/10 text-theme-primary text-[10px] font-semibold hover:bg-theme-primary/20 transition-all">
                    Preview
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-theme-surface border border-theme-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border bg-theme-raised/30">
              <h3 className="text-sm font-bold text-theme-fg">{editingId ? "Edit Template" : "New Template"}</h3>
              <button onClick={() => setShowForm(false)} className="text-theme-muted hover:text-theme-fg"><X size={15} /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-theme-muted">Template Name *</label>
                  <input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="e.g. Welcome Email"
                    className="w-full h-10 px-3 rounded-xl border border-theme-border bg-theme-page text-sm text-theme-fg outline-none focus:border-theme-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-theme-muted">Category</label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["general","hr","finance","ops","sales"].map(c => <SelectItem key={c} value={c}>{c.toUpperCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-theme-muted">Subject *</label>
                <input value={form.subject} onChange={(e)=>setForm({...form,subject:e.target.value})} placeholder="Email subject…"
                  className="w-full h-10 px-3 rounded-xl border border-theme-border bg-theme-page text-sm text-theme-fg outline-none focus:border-theme-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-theme-muted">Body * <span className="text-theme-muted font-normal">(use {`{{variable_name}}`} for placeholders)</span></label>
                <textarea value={form.body} onChange={(e)=>setForm({...form,body:e.target.value})} rows={8} placeholder="Email body…"
                  className="w-full px-3 py-2 rounded-xl border border-theme-border bg-theme-page text-sm text-theme-fg outline-none focus:border-theme-primary resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-theme-muted">Variables JSON <span className="text-theme-muted font-normal">(optional)</span></label>
                <input value={form.variables} onChange={(e)=>setForm({...form,variables:e.target.value})}
                  placeholder='[{"name":"employee_name"},{"name":"joining_date"}]'
                  className="w-full h-10 px-3 rounded-xl border border-theme-border bg-theme-page text-xs text-theme-fg outline-none focus:border-theme-primary tabular-nums" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-theme-border">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-theme-border text-xs font-semibold text-theme-muted hover:bg-theme-raised">Cancel</button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 disabled:opacity-60">
                {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                {editingId ? "Save Changes" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-theme-surface border border-theme-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-theme-border bg-theme-raised/30">
              <h3 className="text-sm font-bold text-theme-fg">{preview.name}</h3>
              <button onClick={() => setPreview(null)} className="text-theme-muted hover:text-theme-fg"><X size={15} /></button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-theme-muted uppercase">Subject:</span>
                <span className="text-sm font-semibold text-theme-fg">{preview.subject}</span>
              </div>
              <div className="rounded-xl border border-theme-border bg-theme-page p-4">
                <p className="text-sm text-theme-fg leading-relaxed whitespace-pre-wrap">{preview.body}</p>
              </div>
              {preview.variables?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-theme-muted uppercase mb-2">Variables</p>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.variables.map(v=>(
                      <span key={v.name} className="px-2 py-1 rounded-lg bg-theme-primary/10 text-theme-primary text-xs tabular-nums">{`{{${v.name}}}`}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-theme-border">
              <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-xl border border-theme-border text-xs font-semibold text-theme-muted hover:bg-theme-raised">Close</button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
