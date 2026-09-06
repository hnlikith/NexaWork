/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { supabase } from "@/lib/supabase";
import {
  Building2,
  Users,
  Plus,
  Search,
  Crown,
  X,
  GitMerge,
  Edit2,
  Trash2
} from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ViewMode = "grid" | "table";

export default function TeamsPage() {
  const { canCreate, canEdit, canDelete } = usePermission("teams");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"name" | "created_at">("name");
  const [loading, setLoading] = useState(true);
  
  // Realtime Supabase Data
  const [teamsData, setTeamsData] = useState<any[]>([]);

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null);

  // Form State
  const [form, setForm] = useState({ 
    id: "",
    name: "", 
    type: "department", 
    parent_id: "none", 
    head_designation: ""
  });

  async function fetchData() {
    try {
      setLoading(true);
      const teamsRes = await axios.get('/api/teams');
      if (teamsRes.data.teams) setTeamsData(teamsRes.data.teams);
    } catch (e: any) {
      console.error("Fetch Fault:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Structural Processing Logic (exclude company root from display)
  const departments = useMemo(() => teamsData.filter(t => t.type === 'department'), [teamsData]);
  const subTeams = useMemo(() => teamsData.filter(t => t.type === 'team'), [teamsData]);
  const deptFilters = ["All", ...departments.map(d => d.name)];

  const finalArrangement = useMemo(() => {
    const filtered = teamsData.filter((t: any) => {
      if (t.type === 'company') return false; // company root is implicit, not shown as a card
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase());
      if (typeFilter !== "All" && t.type !== typeFilter.toLowerCase()) return false;
      if (deptFilter !== "All") {
        if (t.type === 'department' && t.name !== deptFilter) return false;
        if (t.type === 'team') {
          const parent = teamsData.find((d: any) => d.id === t.parent_id);
          if (parent?.name !== deptFilter) return false;
        }
      }
      return matchSearch;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // If filtering by a specific type, show flat list (teams have parent_id so tree from null misses them)
    // Otherwise build the full tree
    if (typeFilter !== "All") {
      return sorted;
    }

    const buildTree = (parentId: string | null): any[] => {
      return sorted
        .filter(t => t.parent_id === parentId)
        .reduce((acc: any[], item: any) => [...acc, item, ...buildTree(item.id)], []);
    };

    // Start tree from company root's id so departments come first
    const companyRoot = teamsData.find((t: any) => t.type === 'company');
    return buildTree(companyRoot ? companyRoot.id : null);
  }, [teamsData, search, deptFilter, typeFilter, sortBy]);

  async function handleSaveEntity() {
    if (!form.name || !form.head_designation) {
      toast.warning("Identity breakdown required.");
      return;
    }

    try {
      const payload: any = {
        name: form.name,
        type: form.type,
        head_designation: form.head_designation,
        department: form.type === 'department' ? form.name : "Sub-Team"
      };

      if (form.type === "team" && form.parent_id !== "none") {
        payload.parent_id = form.parent_id;
        const parent = teamsData.find((d: any) => d.id === form.parent_id);
        if (parent) payload.department = parent.name;
      }

      let res;
      if (editingItem) {
        res = await axios.patch(`/api/teams`, { id: editingItem.id, ...payload });
      } else {
        res = await axios.post('/api/teams', payload);
      }
      
      if (res.data.error) throw new Error(res.data.error);
      
      toast.success(`Node '${form.name}' synchronized to the cloud.`);
      setShowForm(false);
      setEditingItem(null);
      setForm({ id: "", name: "", type: "department", parent_id: "none", head_designation: "" });
      fetchData();
    } catch (e: any) {
      toast.error("Sync Interrupted: " + (e.response?.data?.error || e.message));
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    try {
      const res = await axios.delete(`/api/teams?id=${id}`);
      if (res.data.error) throw new Error(res.data.error);
      toast.success(`Node '${name}' purged from architecture.`);
      setDeleteConfirm(null);
      fetchData();
    } catch (e: any) {
      toast.error("Purge Failed: " + e.message);
    }
  }

  return (
    <DashboardShell
      moduleKey="teams"
      title="Architecture Matrix"
      subtitle="Administrative management of the enterprise-grade organizational tree."
      actions={
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button variant="default" size="sm" onClick={() => { setEditingItem(null); setForm({ id: "", type: 'department', name: "", head_designation: "", parent_id: "none" }); setShowForm(true); }}>
              <Plus size={14} className="mr-1" /> Add
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: "Architecture Nodes", value: teamsData.length, icon: GitMerge, color: "text-theme-fg", bg: "bg-theme-raised" },
            { label: "Departments", value: departments.length, icon: Building2, color: "text-amber-600", bg: "bg-amber-500/10" },
            { label: "Operational Teams", value: subTeams.length, icon: Users, color: "text-sky-600", bg: "bg-sky-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="page-card flex items-center gap-4 border border-theme-border h-full">
              <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
                <Icon size={17} className={color} />
              </div>
              <div>
                <p className="text-[11px] text-theme-muted">{label}</p>
                <p className={cn("text-xl font-black leading-tight", color)}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {deptFilters.map((d: any) => (
              <button
                key={d}
                onClick={() => setDeptFilter(d)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all border border-transparent",
                  deptFilter === d
                    ? "bg-theme-primary text-theme-surface shadow-sm border-theme-strong/20"
                    : "bg-theme-raised text-theme-muted hover:text-theme-fg hover:border-theme-border"
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
             <Select value={typeFilter} onValueChange={setTypeFilter}>
               <SelectTrigger className="w-36 text-xs"><SelectValue placeholder="All Units" /></SelectTrigger>
               <SelectContent>
                 <SelectItem value="All">All Entities</SelectItem>
                 <SelectItem value="department">Departments</SelectItem>
                 <SelectItem value="team">Teams</SelectItem>
               </SelectContent>
             </Select>
             <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
               <SelectTrigger className="w-40 text-xs"><SelectValue placeholder="Sort Method" /></SelectTrigger>
               <SelectContent>
                 <SelectItem value="name">Alphabetical</SelectItem>
                 <SelectItem value="created_at">Recently Added</SelectItem>
               </SelectContent>
             </Select>
             <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
               <Input
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 placeholder="Search tree…"
                 className="w-44 pl-9 text-xs"
               />
             </div>
          </div>
        </div>

        {loading ? (
          <div className="text-theme-muted text-sm text-center py-10 font-semibold animate-pulse">Loading Teams...</div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {finalArrangement.map((item: any) => {
              const isDept = item.type === "department";
              const parent = item.parent_id ? teamsData.find(t => t.id === item.parent_id) : null;

              return (
                <div 
                  key={item.id} 
                  className={cn(
                    "page-card group relative overflow-hidden transition-all hover:shadow-md border flex flex-col h-full", 
                    isDept 
                      ? "border-amber-500/20 bg-amber-500/[0.02]" 
                      : "border-theme-border",
                  )}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xs font-black", isDept ? "bg-amber-500/10 text-amber-600" : "bg-theme-primary text-theme-surface")}>
                        {isDept ? <Building2 size={16} /> : <Users size={16} />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-theme-fg">{item.name}</h4>
                        <Badge variant={isDept ? "default" : "secondary"} className={cn("mt-1 text-[10px] px-1.5", isDept && "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent hover:bg-amber-500/20")}>
                          {isDept ? 'Department' : 'Operational Unit'}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canEdit && (
                        <button
                          onClick={() => { setEditingItem(item); setForm({ ...item, head_designation: item.head_designation || "", parent_id: item.parent_id || "none" }); setShowForm(true); }}
                          className="p-1.5 rounded-lg hover:bg-theme-raised text-theme-muted hover:text-theme-fg transition-colors"
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-theme-muted hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-theme-raised px-3 py-2.5">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-theme-page border border-theme-border shadow-sm">
                      <Crown size={11} className="text-theme-muted" />
                    </div>
                    <div>
                      <p className="text-[11px] text-theme-muted">Lead Designation</p>
                      <p className="text-xs font-semibold text-theme-fg truncate">{item.head_designation}</p>
                    </div>
                  </div>

                  {!isDept && parent && (
                    <div className="text-[10px] flex items-center gap-1 mt-auto pt-4 text-theme-subtle">
                       <GitMerge size={12} className="shrink-0" /> 
                       <span className="truncate">Reports to: <span className="font-semibold text-theme-fg">{parent.name}</span></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {/* CREATE / EDIT UNIT DIALOG */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-6rem)] sm:max-h-[80vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
              {editingItem ? <Edit2 size={16} /> : <Plus size={16} />}
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">
                {editingItem ? `Edit ${editingItem.name}` : "Create New Unit"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Define the structural properties of this organizational unit.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Unit Type</Label>
              <Select onValueChange={(v) => setForm({ ...form, type: v, parent_id: "none" })} value={form.type} required>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.type === "team" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Parent Department</Label>
                <Select onValueChange={(v) => setForm({ ...form, parent_id: v })} value={form.parent_id} required>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select parent" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="none">Set as Independent</SelectItem>
                    <SelectGroup>
                      <SelectLabel>Departments</SelectLabel>
                      {departments.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>{d.name} (Dept)</SelectItem>
                      ))}
                    </SelectGroup>
                    {subTeams.length > 0 && (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Existing Teams</SelectLabel>
                          {subTeams.map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>{t.name} (Team)</SelectItem>
                          ))}
                        </SelectGroup>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. Sales Division"
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lead Designation</Label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. General Manager"
                  value={form.head_designation || ""}
                  onChange={(e) => setForm({ ...form, head_designation: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveEntity}>
              {editingItem ? "Save Changes" : "Create Unit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive flex-shrink-0">
                <Trash2 size={18} />
              </div>
              <div className="flex-1 text-left">
                <DialogTitle className="text-sm font-semibold">Delete unit?</DialogTitle>
                <DialogDescription className="text-xs">
                  "{deleteConfirm?.name}" will be permanently removed. This action cannot be undone.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="!flex-row !justify-end gap-2">
            <Button onClick={() => setDeleteConfirm(null)} variant="outline" size="sm">Cancel</Button>
            <Button onClick={handleDelete} variant="destructive" size="sm">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
