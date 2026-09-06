"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import {
  X, Search, UserCircle2, Shield, Eye, Edit3, MessageSquare,
  Check, Trash2, Link2, Copy, Globe, Lock, Sparkles, Share2
} from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Employee {
  id: string;
  name: string;
  email: string;
  employee_id: string;
  role: string;
  department?: string;
}

interface SharedUser {
  user_id: string;
  user_name: string;
  user_email: string;
  user_employee_id: string;
  user_role: string;
  permission: string;
  id: string;
}

interface ShareModalProps {
  itemId: string;
  itemType: "document" | "spreadsheet" | "presentation" | "note";
  itemTitle: string;
  currentUserId: string;
  onClose: () => void;
}

const PERMISSIONS = [
  { value: "view",    label: "Can view",    icon: Eye,         color: "text-sky-500"     },
  { value: "comment", label: "Can comment", icon: MessageSquare, color: "text-amber-500" },
  { value: "edit",    label: "Can edit",    icon: Edit3,       color: "text-emerald-500" },
];

function cn2(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}

export function ShareModal({ itemId, itemType, itemTitle, currentUserId, onClose }: ShareModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ id: string; permission: string }[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    Promise.all([fetchEmployees(), fetchSharedUsers()]).finally(() => setLoading(false));
  }, [itemId]);

  async function fetchEmployees() {
    try {
      const res = await axios.get("/api/employees?limit=200");
      setEmployees((res.data.employees || res.data || []).filter((e: Employee) => e.id !== currentUserId));
    } catch {}
  }

  async function fetchSharedUsers() {
    try {
      const res = await axios.get(`/api/workspace/shares?itemId=${itemId}`);
      setSharedUsers(res.data.sharedUsers || []);
    } catch {}
  }

  function toggleEmployee(emp: Employee) {
    const exists = selected.find((s) => s.id === emp.id);
    if (exists) {
      setSelected(selected.filter((s) => s.id !== emp.id));
    } else {
      setSelected([...selected, { id: emp.id, permission: "view" }]);
    }
  }

  function setPermission(id: string, permission: string) {
    setSelected(selected.map((s) => (s.id === id ? { ...s, permission } : s)));
  }

  async function handleShare() {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      await axios.post("/api/workspace/shares", {
        itemId,
        itemType,
        itemTitle,
        message,
        shares: selected.map((s) => ({ userId: s.id, accessLevel: s.permission })),
      });
      setSaved(true);
      setSelected([]);
      setMessage("");
      await fetchSharedUsers();
      setTimeout(() => setSaved(false), 2500);
    } catch {} finally {
      setSaving(false);
    }
  }

  async function removeShare(shareId: string) {
    try {
      await axios.delete(`/api/workspace/shares?shareId=${shareId}`);
      setSharedUsers(sharedUsers.filter((s) => s.id !== shareId));
    } catch {}
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/admin/workspace/${itemType}s/${itemId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filtered = employees.filter(
    (e) =>
      !sharedUsers.some((s) => s.user_id === e.id) &&
      (e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.employee_id.toLowerCase().includes(search.toLowerCase()) ||
        e.role.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl rounded-2xl bg-theme-surface shadow-2xl border border-theme-border flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
        style={{ height: "420px" }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-theme-border px-6 py-3.5 bg-theme-raised/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-theme-primary/10 text-theme-primary">
              <Share2 size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-theme-fg leading-none">Share "{itemTitle}"</h3>
              <p className="text-[10px] text-theme-muted mt-1 capitalize">
                {itemType} · {sharedUsers.length + selected.length} total access points
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Side: Add People */}
          <div className="w-1/2 border-r border-theme-border flex flex-col bg-theme-surface">
            <div className="p-4 border-b border-theme-border/50">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Invite by name, email, or role…"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-theme-border bg-theme-raised text-xs text-theme-fg outline-none focus:border-theme-primary focus:ring-2 focus:ring-theme-primary/10 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {search ? (
                <div className="space-y-1">
                  {filtered.length > 0 ? (
                    filtered.map((emp) => {
                      const isSelected = selected.some((s) => s.id === emp.id);
                      return (
                        <button
                          key={emp.id}
                          onClick={() => toggleEmployee(emp)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all",
                            isSelected ? "bg-theme-primary/10 ring-1 ring-theme-primary/20" : "hover:bg-theme-raised"
                          )}
                        >
                          <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-theme-primary/10 flex items-center justify-center text-theme-primary font-bold text-xs">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-theme-fg truncate">{emp.name}</p>
                            <p className="text-[9px] text-theme-muted truncate">{emp.email}</p>
                          </div>
                          <div className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-theme-raised text-theme-muted border border-theme-border">
                            {emp.employee_id}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-xs text-theme-muted">No employees found</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-40">
                  <UserCircle2 size={32} className="text-theme-muted mb-2" />
                  <p className="text-[10px] font-medium text-theme-muted">Start typing to find team members</p>
                </div>
              )}
            </div>

            {selected.length > 0 && (
              <div className="p-4 border-t border-theme-border bg-theme-raised/30 space-y-3">
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto p-1">
                  {selected.map(s => {
                    const emp = employees.find(e => e.id === s.id);
                    return (
                      <div key={s.id} className="flex items-center gap-1.5 bg-theme-primary text-white pl-2 pr-1 py-1 rounded-lg text-[9px] font-bold">
                        {emp?.name}
                        <button onClick={() => toggleEmployee(emp!)} className="p-0.5 hover:bg-white/20 rounded-md transition-colors">
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Select
                    value={selected[0]?.permission || "view"}
                    onValueChange={(v) => selected.forEach(s => setPermission(s.id, v))}
                  >
                    <SelectTrigger className="flex-1 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERMISSIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button
                    onClick={handleShare}
                    disabled={saving}
                    className="flex-[2] bg-theme-primary text-theme-surface rounded-xl px-4 py-2 text-[10px] font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? "Sharing..." : <><Sparkles size={11} /> Send Invite</>}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Side: Current Access */}
          <div className="w-1/2 flex flex-col bg-theme-raised/10">
            <div className="px-5 py-3 border-b border-theme-border flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Who has access</span>
              <span className="text-[10px] font-bold bg-theme-primary/10 text-theme-primary px-2 py-0.5 rounded-full">
                {sharedUsers.length} people
              </span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
              {sharedUsers.length > 0 ? (
                sharedUsers.map((su) => {
                  const perm = PERMISSIONS.find((p) => p.value === su.permission);
                  const PermIcon = perm?.icon || Eye;
                  return (
                    <div key={su.id} className="group flex items-center gap-3 bg-theme-surface border border-theme-border p-2.5 rounded-xl hover:shadow-md transition-all">
                      <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-theme-primary/5 flex items-center justify-center text-theme-primary font-bold text-xs border border-theme-primary/10">
                        {su.user_name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-theme-fg truncate">{su.user_name}</p>
                        <p className="text-[9px] text-theme-muted truncate">{su.user_role} · {su.user_employee_id}</p>
                      </div>
                      <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg bg-theme-raised text-[10px] font-bold", perm?.color)}>
                        <PermIcon size={11} />
                        {perm?.label}
                      </div>
                      <button
                        onClick={() => removeShare(su.id)}
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-theme-muted hover:bg-rose-500/10 hover:text-rose-500 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-30">
                  <Lock size={32} className="text-theme-muted mb-2" />
                  <p className="text-[10px] font-medium text-theme-muted">Private document · Only you can access</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-theme-border bg-theme-surface flex items-center gap-3">
              <button
                onClick={copyLink}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-theme-border px-4 py-2.5 text-[10px] font-bold text-theme-fg hover:bg-theme-raised transition-all"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Link2 size={12} />}
                {copied ? "Copied!" : "Copy Link"}
              </button>
              <button 
                onClick={onClose}
                className="flex-1 flex items-center justify-center rounded-xl bg-theme-fg text-theme-surface px-4 py-2.5 text-[10px] font-bold hover:opacity-90 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
