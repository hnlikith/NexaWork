/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, Search, MoreVertical, Edit2, Trash2,
  XCircle, AlertCircle, Calendar, Building2, 
  LayoutGrid, X, ChevronDown, Timer, Target, 
  CalendarDays, Check, Palette, Clock, Building, ShieldCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import dayjs from "@/lib/dayjs";

// ─── Types ───────────────────────────────────────────────
interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color_code: string;
  valid_from: string | null;
  valid_to: string | null;
  department: string | null;
  team_id: string | null;
  is_active: boolean;
  member_count?: number;
}

interface TeamNode { 
  id: string; 
  name: string; 
  type: 'department' | 'team';
  parent_id: string | null;
}

interface Employee {
  id: string;
  name: string;
  employee_id: string;
  department: string;
  designation: string;
  shift_id: string | null;
}

// ─── Custom Dropdown ────────────────────────────────────
// shadcn-backed wrapper preserving the legacy CustomSelect API
// (shadcn Select forbids empty-string values, so we map "" <-> a sentinel internally)
const EMPTY_SENTINEL = "__none__";
function CustomSelect({ value, options, onChange, placeholder, icon, label }: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
  placeholder: string;
  icon?: React.ReactNode;
  label?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          {icon}{label}
        </label>
      )}
      <Select
        value={value === "" ? EMPTY_SENTINEL : (value || undefined)}
        onValueChange={(v) => onChange(v === EMPTY_SENTINEL ? "" : v)}
      >
        <SelectTrigger className="w-full">
          <span className="flex items-center gap-2 min-w-0 flex-1 text-left">
            {!label && icon}
            <SelectValue placeholder={placeholder} />
          </span>
        </SelectTrigger>
        <SelectContent>
          {options.length > 0 ? (
            options.map(opt => (
              <SelectItem key={opt.value || EMPTY_SENTINEL} value={opt.value || EMPTY_SENTINEL}>
                {opt.label}
              </SelectItem>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No options available</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Shift Action Menu ──────────────────────────────────
function ShiftCardMenu({ onEdit, onDelete }: { onEdit: () => void, onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button 
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1 px-1.5 rounded-lg hover:bg-theme-raised text-theme-muted transition-all"
      >
        <MoreVertical size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-[100] w-40 bg-theme-surface rounded-2xl shadow-2xl border border-theme-border p-1.5 animate-in zoom-in-95 duration-150">
           <button onClick={(e) => { e.stopPropagation(); onEdit(); setOpen(false); }}
             className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[11px] font-bold text-theme-fg hover:bg-theme-raised transition-all group">
             <Edit2 size={13} className="text-theme-muted group-hover:text-theme-primary transition-colors" /> Edit Protocol
           </button>
           <button onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false); }}
             className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[11px] font-black text-rose-500 hover:bg-rose-50 transition-all">
             <Trash2 size={13} /> Delete Protocol
           </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────
export default function ShiftManagementPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orgNodes, setOrgNodes] = useState<TeamNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<string>("all");
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Shift | null>(null);
  
  // Modal State
  const [showDefineModal, setShowDefineModal] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState({
    name: "",
    start_time: "09:00",
    end_time: "18:00",
    color_code: "#10b981",
    valid_from: dayjs().format("YYYY-MM-DD"),
    valid_to: dayjs().add(1, 'year').format("YYYY-MM-DD"),
    department_id: "",
    team_id: ""
  });

  async function loadData() {
    setLoading(true);
    try {
      const { data: shiftsData } = await supabase.from("shifts").select("*").order("start_time");
      const { data: empData } = await supabase.from("employees").select("id, name, employee_id, department, designation, shift_id").order("name");
      const { data: nodesData } = await supabase.from("teams").select("id, name, type, parent_id");
      
      const shiftsWithCount = shiftsData?.map(s => ({
        ...s,
        member_count: empData?.filter(e => e.shift_id === s.id).length || 0
      }));

      setShifts(shiftsWithCount || []);
      setEmployees(empData || []);
      setOrgNodes(nodesData || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { 
      if (e.key === "Escape") {
        setShowDefineModal(false);
        setDeleteConfirm(null);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  async function handleSaveShift() {
    if (!shiftForm.name) return toast.warning("Protocol name is mandatory");
    setSubmitting(true);
    try {
      const deptNode = orgNodes.find(n => n.id === shiftForm.department_id);
      const payload = {
        name: shiftForm.name,
        start_time: shiftForm.start_time,
        end_time: shiftForm.end_time,
        color_code: shiftForm.color_code,
        valid_from: shiftForm.valid_from,
        valid_to: shiftForm.valid_to,
        department: deptNode ? deptNode.name : null,
        team_id: shiftForm.team_id || null
      };

      if (editingShiftId) {
        const { error } = await supabase.from("shifts").update(payload).eq("id", editingShiftId);
        if (error) throw error;
        toast.success("Shift protocol re-indexed successfully");
      } else {
        const { error } = await supabase.from("shifts").insert([payload]);
        if (error) throw error;
        toast.success("New shift protocol established successfully");
      }

      setShowDefineModal(false);
      setEditingShiftId(null);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("shifts").delete().eq("id", deleteConfirm.id);
      if (error) throw error;
      toast.success(`Protocol "${deleteConfirm.name}" decommissioned.`);
      setDeleteConfirm(null);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const filteredEmployees = employees.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) || 
                          e.employee_id.toLowerCase().includes(search.toLowerCase());
    const matchesShift = selectedShiftFilter === "all" ? true : e.shift_id === selectedShiftFilter;
    if (selectedShiftFilter === "unassigned") return matchesSearch && !e.shift_id;
    return matchesSearch && matchesShift;
  });

  const departments = orgNodes.filter(n => n.type === 'department');
  const teams = orgNodes.filter(n => n.type === 'team');

  return (
    <DashboardShell
      moduleKey="shift_management"
      title="Shift Management"
      subtitle="Define precisely targeted operational temporal cycles."
      actions={
        <Button size="sm" onClick={() => {
            setEditingShiftId(null);
            setShiftForm({
              name: "", start_time: "09:00", end_time: "18:00", color_code: "#10b981",
              valid_from: dayjs().format("YYYY-MM-DD"), valid_to: dayjs().add(1, 'year').format("YYYY-MM-DD"),
              department_id: "", team_id: ""
            });
            setShowDefineModal(true);
        }}>
          <Plus size={14} className="mr-1.5" /> Define Shift
        </Button>
      }
    >
      <div className="space-y-8">
        {/* SHIFT REGISTRY CARDS */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {shifts.map(shift => (
            <div key={shift.id} onClick={() => setSelectedShiftFilter(shift.id)}
              className={cn("relative page-card group cursor-pointer border-l-4 transition-all hover:shadow-xl hover:-translate-y-1", 
                selectedShiftFilter === shift.id ? "border-zinc-900 bg-zinc-50" : "border-theme-border"
              )}
              style={{ borderLeftColor: shift.color_code }}>
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-xl bg-theme-raised flex items-center justify-center shadow-sm">
                  <Clock size={18} style={{ color: shift.color_code }} strokeWidth={2.5} />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[9px] px-2 py-0.5 tracking-wider">{shift.member_count} ACTIVE</Badge>
                  <ShiftCardMenu 
                    onDelete={() => setDeleteConfirm(shift)}
                    onEdit={() => {
                        const node = orgNodes.find(n => n.name === shift.department && n.type === 'department');
                        setEditingShiftId(shift.id);
                        setShiftForm({
                            name: shift.name,
                            start_time: shift.start_time.slice(0, 5),
                            end_time: shift.end_time.slice(0, 5),
                            color_code: shift.color_code,
                            valid_from: shift.valid_from || dayjs().format("YYYY-MM-DD"),
                            valid_to: shift.valid_to || dayjs().add(1,'year').format("YYYY-MM-DD"),
                            department_id: node ? node.id : "",
                            team_id: shift.team_id || ""
                        });
                        setShowDefineModal(true);
                    }}
                  />
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-bold text-theme-fg">{shift.name}</h3>
                <p className="text-xs text-theme-muted mt-1 tabular-nums">
                   {dayjs(`2000-01-01 ${shift.start_time}`).format("hh:mm A")} — {dayjs(`2000-01-01 ${shift.end_time}`).format("hh:mm A")}
                </p>
              </div>
              
              <div className="mt-6 pt-4 border-t border-theme-border/50 flex flex-col gap-2">
                {shift.department && (
                  <div className="flex items-center gap-2 text-xs text-theme-muted">
                    <Building2 size={13} className="text-theme-muted" /> {shift.department}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-theme-muted">
                  <Calendar size={11} className="opacity-40" /> {dayjs(shift.valid_from).format("MMM DD, YYYY")} — {dayjs(shift.valid_to).format("MMM DD")}
                </div>
              </div>
            </div>
          ))}

          <div onClick={() => setSelectedShiftFilter("unassigned")}
            className={cn("page-card border-dashed border-2 cursor-pointer flex flex-col items-center justify-center py-8 hover:bg-theme-raised/50 transition-all", 
              selectedShiftFilter === "unassigned" ? "border-amber-500 bg-amber-500/5 shadow-inner" : "border-theme-border opacity-50 opacity-40"
            )}>
            <AlertCircle size={24} className="text-amber-500 mb-3" />
            <h3 className="text-sm font-semibold text-theme-fg">Unassigned Pool</h3>
            <p className="text-xs text-theme-muted mt-1">Pending Assignment</p>
          </div>
        </div>

        {/* PERSONNEL ASSIGNMENT TABLE */}
        <Card className="overflow-hidden p-0 gap-0">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Personnel Assignments</h3>
                <p className="text-[11px] text-muted-foreground">{dayjs().format("DD MMM YYYY")}</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input type="text" placeholder="Search personnel..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-72 pl-9" />
            </div>
          </div>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">Personnel</TableHead>
                  <TableHead>Department / Role</TableHead>
                  <TableHead className="text-center">Assigned Shift</TableHead>
                  <TableHead className="text-center">Schedule</TableHead>
                  <TableHead className="pr-4 text-right">Assign</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-2.5 w-20" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-3 w-32" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-3 w-28 mx-auto" /></TableCell>
                      <TableCell className="pr-4 text-right"><Skeleton className="h-8 w-[160px] ml-auto rounded-md" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Clock size={20} className="text-muted-foreground/60" />
                        <span>No personnel in this sector</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.map(emp => {
                  const currentShift = shifts.find(s => s.id === emp.shift_id);
                  return (
                    <TableRow key={emp.id}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-semibold">
                              {emp.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{emp.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{emp.employee_id}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <span className="font-medium text-foreground">{emp.department}</span>
                          {emp.designation && (
                            <>
                              <span className="mx-1.5 text-border">·</span>
                              <span className="text-muted-foreground">{emp.designation}</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {currentShift ? (
                          <Badge
                            style={{
                              backgroundColor: `${currentShift.color_code}15`,
                              color: currentShift.color_code,
                              borderColor: `${currentShift.color_code}30`,
                            }}
                            className="border font-medium"
                          >
                            {currentShift.name}
                          </Badge>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                            <XCircle size={12} /> Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-xs text-foreground">
                        {currentShift
                          ? <span>{dayjs(`2000-01-01 ${currentShift.start_time}`).format("hh:mm A")} — {dayjs(`2000-01-01 ${currentShift.end_time}`).format("hh:mm A")}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Select
                          value={emp.shift_id || "none"}
                          onValueChange={(v) => {
                            const sid = v === "none" ? null : v;
                            supabase.from("employees").update({ shift_id: sid }).eq("id", emp.id).then(() => {
                              toast.success("Shift assignment updated");
                              loadData();
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs ml-auto w-[170px]"><SelectValue placeholder="Change shift..." /></SelectTrigger>
                          <SelectContent>
                            {shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            <SelectItem value="none">Remove assignment</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* DEFINE / EDIT SHIFT DIALOG */}
      <Dialog open={showDefineModal} onOpenChange={setShowDefineModal}>
        <DialogContent className="sm:max-w-lg !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-6rem)] sm:max-h-[80vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
              {editingShiftId ? <Edit2 size={16} /> : <Timer size={16} />}
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">{editingShiftId ? "Edit Shift" : "Create New Shift"}</DialogTitle>
              <DialogDescription className="text-xs">Configure operational timings</DialogDescription>
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Shift Name</Label>
              <Input type="text" placeholder="e.g. Night Vanguard" value={shiftForm.name} onChange={(e) => setShiftForm({...shiftForm, name: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Time</Label>
                <Input type="time" value={shiftForm.start_time} onChange={(e) => setShiftForm({...shiftForm, start_time: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Time</Label>
                <Input type="time" value={shiftForm.end_time} onChange={(e) => setShiftForm({...shiftForm, end_time: e.target.value})} />
              </div>
            </div>

            <CustomSelect
              label="Department" icon={<Building size={12} />} placeholder="Select Department"
              value={shiftForm.department_id} onChange={(v) => setShiftForm({...shiftForm, department_id: v, team_id: ""})}
              options={[{ label: "Global / Any Department", value: "" }, ...departments.map(d => ({ label: d.name, value: d.id }))]}
            />

            <CustomSelect
              label="Team" icon={<LayoutGrid size={12} />} placeholder="Select Team"
              value={shiftForm.team_id} onChange={(v) => {
                const team = teams.find(t => t.id === v);
                if (team && !shiftForm.department_id) setShiftForm({...shiftForm, team_id: v, department_id: team.parent_id || ""});
                else setShiftForm({...shiftForm, team_id: v});
              }}
              options={[{ label: "Global / Any Team", value: "" }, ...teams.filter(t => !shiftForm.department_id || t.parent_id === shiftForm.department_id).map(t => ({ label: t.name, value: t.id }))]}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Active From</Label>
                <DatePicker value={shiftForm.valid_from} onChange={(d) => setShiftForm({...shiftForm, valid_from: d})} label="" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Active Until</Label>
                <DatePicker value={shiftForm.valid_to} onChange={(d) => setShiftForm({...shiftForm, valid_to: d})} label="" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Color Tag</Label>
              <div className="flex flex-wrap gap-2">
                {['#10b981', '#0ea5e9', '#f59e0b', '#6366f1', '#f43f5e', '#8b5cf6', '#000000'].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setShiftForm({...shiftForm, color_code: c})}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-all hover:scale-110",
                      shiftForm.color_code === c ? "border-foreground scale-110" : "border-border"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  >
                    {shiftForm.color_code === c && <Check size={14} className="mx-auto text-white drop-shadow" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowDefineModal(false)}>Cancel</Button>
            <Button onClick={handleSaveShift} size="sm" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {editingShiftId ? "Save Changes" : "Create Shift"}
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
                <DialogTitle className="text-sm font-semibold">Delete shift?</DialogTitle>
                <DialogDescription className="text-xs">
                  "{deleteConfirm?.name}" will be removed. All personnel assigned to it will be unassigned.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="!flex-row !justify-end gap-2">
            <Button onClick={() => setDeleteConfirm(null)} disabled={submitting} variant="outline" size="sm">Cancel</Button>
            <Button onClick={handleDeleteConfirm} disabled={submitting} variant="destructive" size="sm">
              {submitting && <Loader2 className="animate-spin" />}
              {submitting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
