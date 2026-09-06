/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { ShareModal } from "@/components/workspace/ShareModal";
import {
  Table2, Plus, Search, Pin, Archive, Trash2, MoreVertical,
  Grid3X3, List, X, Share2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "@/lib/dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

dayjs.extend(relativeTime);

interface Sheet {
  id: string;
  title: string;
  icon: string;
  is_pinned: boolean;
  status: string;
  tags: string[];
  last_edited_at: string;
  owner?: { id: string; name: string };
}

const COVER_GRADIENTS = [
  "from-emerald-500 to-teal-600",
  "from-teal-500 to-cyan-600",
  "from-sky-500 to-blue-500",
  "from-violet-500 to-purple-600",
  "from-green-500 to-emerald-700",
  "from-cyan-500 to-sky-600",
];

function ItemMenu({ isPin, onPin, onArchive, onDelete, up }: { isPin: boolean; onPin: () => void; onArchive: () => void; onDelete: () => void; up?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg text-theme-muted hover:text-theme-fg hover:bg-theme-raised transition-all opacity-0 group-hover:opacity-100">
        <MoreVertical size={12} />
      </button>
      {open && (
        <div className={cn("absolute right-0 z-[9999] w-36 rounded-xl border border-theme-border bg-theme-surface shadow-xl p-1", up ? "bottom-7" : "top-7")}>
          <button onClick={() => { onPin(); setOpen(false); }} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-theme-raised text-theme-fg flex items-center gap-2"><Pin size={12} />{isPin ? "Unpin" : "Pin"}</button>
          <button onClick={() => { onArchive(); setOpen(false); }} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-theme-raised text-theme-fg flex items-center gap-2"><Archive size={12} />Archive</button>
          <div className="h-px bg-theme-border my-1" />
          <button onClick={() => { onDelete(); setOpen(false); }} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-rose-500/10 text-rose-500 flex items-center gap-2"><Trash2 size={12} />Delete</button>
        </div>
      )}
    </div>
  );
}

function SheetCard({ s, onPin, onArchive, onDelete, onShare, onClick }: {
  s: Sheet; onPin: () => void; onArchive: () => void; onDelete: () => void; onShare: () => void; onClick: () => void;
}) {
  const gradIdx = s.id.charCodeAt(0) % COVER_GRADIENTS.length;
  const grad = COVER_GRADIENTS[gradIdx];

  return (
    <div onClick={onClick} className="group relative bg-theme-card border border-theme-border rounded-xl overflow-hidden hover:border-theme-strong hover:shadow-sm transition-all cursor-pointer">
      {/* Top row */}
      <div className="flex items-start justify-between p-4 pb-3">
        {/* Icon with mini grid overlay */}
        <div className={cn("h-10 w-10 rounded-lg bg-gradient-to-br flex-shrink-0 relative overflow-hidden shadow-sm", grad)}>
          <div className="absolute inset-0 opacity-20 pointer-events-none"
            style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 4px,rgba(255,255,255,.6) 4px,rgba(255,255,255,.6) 5px),repeating-linear-gradient(90deg,transparent,transparent 4px,rgba(255,255,255,.6) 4px,rgba(255,255,255,.6) 5px)" }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-base leading-none">{s.icon || "📊"}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {s.is_pinned && <Pin size={11} className="text-amber-500 mr-1" fill="currentColor" />}
          <button onClick={(e) => { e.stopPropagation(); onShare(); }} className="p-1.5 rounded-lg text-theme-muted hover:text-theme-fg hover:bg-theme-raised transition-all opacity-0 group-hover:opacity-100" title="Share"><Share2 size={12} /></button>
          <ItemMenu isPin={s.is_pinned} onPin={onPin} onArchive={onArchive} onDelete={onDelete} />
        </div>
      </div>
      <div className="px-4 pb-3">
        <h3 className="font-semibold text-sm text-theme-fg leading-snug mb-0.5 group-hover:text-theme-primary transition-colors line-clamp-2">{s.title}</h3>
        <p className="text-[11px] text-theme-muted truncate">{s.owner?.name ?? "You"}</p>
      </div>
      {s.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {s.tags.slice(0, 2).map((t) => (
            <span key={t} className="text-[9px] font-semibold bg-theme-raised border border-theme-border text-theme-muted px-2 py-0.5 rounded-full uppercase tracking-wide">{t}</span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-theme-border">
        <Clock size={10} className="text-theme-muted opacity-50 flex-shrink-0" />
        <span className="text-[10px] text-theme-muted">{dayjs(s.last_edited_at).fromNow()}</span>
      </div>
    </div>
  );
}

function ListRow({ s, onPin, onArchive, onDelete, onShare, onClick }: {
  s: Sheet; onPin: () => void; onArchive: () => void; onDelete: () => void; onShare: () => void; onClick: () => void;
}) {
  const gradIdx = s.id.charCodeAt(0) % COVER_GRADIENTS.length;
  return (
    <div onClick={onClick} className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-theme-border bg-theme-card hover:bg-theme-raised hover:border-theme-strong cursor-pointer transition-all">
      <div className={cn("h-9 w-9 rounded-lg bg-gradient-to-br flex-shrink-0 flex items-center justify-center text-base relative overflow-hidden", COVER_GRADIENTS[gradIdx])}>
        <span className="leading-none z-10">{s.icon || "📊"}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-theme-fg truncate group-hover:text-theme-primary transition-colors">{s.title}</p>
        <p className="text-[11px] text-theme-muted">{s.owner?.name ?? "You"} · {dayjs(s.last_edited_at).fromNow()}</p>
      </div>
      {s.tags?.slice(0, 2).map((t) => (
        <span key={t} className="hidden md:inline text-[9px] font-semibold bg-theme-raised border border-theme-border text-theme-muted px-2 py-0.5 rounded-full uppercase tracking-wide">{t}</span>
      ))}
      {s.is_pinned && <Pin size={11} className="text-amber-500 flex-shrink-0" fill="currentColor" />}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={onShare} className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-theme-border hover:bg-theme-primary/10 hover:text-theme-primary text-theme-muted transition-all"><Share2 size={11} /> Share</button>
        <ItemMenu isPin={s.is_pinned} onPin={onPin} onArchive={onArchive} onDelete={onDelete} />
      </div>
    </div>
  );
}

export default function SpreadsheetsPage() {
  const { user } = useAuth();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pinned" | "mine">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [shareTarget, setShareTarget] = useState<Sheet | null>(null);

  useEffect(() => { if (user?.id) fetchSheets(); }, [user?.id]);

  async function fetchSheets() {
    setLoading(true);
    try {
      const res = await axios.get(`/api/workspace/spreadsheets?userId=${user?.id}&userRole=${user?.role}`);
      setSheets(res.data.spreadsheets || []);
    } catch {} finally { setLoading(false); }
  }

  async function createSheet() {
    setCreating(true);
    try {
      const res = await axios.post("/api/workspace/spreadsheets", { owner_id: user?.id });
      window.open(`/admin/workspace/spreadsheets/${res.data.spreadsheet.id}`, "_blank");
      fetchSheets();
    } catch {} finally { setCreating(false); }
  }

  async function togglePin(s: Sheet) {
    await axios.patch(`/api/workspace/spreadsheets/${s.id}?userId=${user?.id}`, { is_pinned: !s.is_pinned });
    fetchSheets();
  }
  async function archiveSheet(s: Sheet) {
    await axios.patch(`/api/workspace/spreadsheets/${s.id}?userId=${user?.id}`, { status: "archived" });
    fetchSheets();
  }
  async function deleteSheet(s: Sheet) {
    if (!confirm(`Delete "${s.title}"?`)) return;
    await axios.delete(`/api/workspace/spreadsheets/${s.id}?userId=${user?.id}`);
    fetchSheets();
  }

  const filtered = sheets.filter((s) => {
    if (filter === "pinned" && !s.is_pinned) return false;
    if (filter === "mine" && s.owner?.id !== user?.id) return false;
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pinned = filtered.filter((s) => s.is_pinned);
  const rest = filtered.filter((s) => !s.is_pinned);

  const FILTERS = [
    { key: "all" as const,    label: "All",    count: sheets.length },
    { key: "pinned" as const, label: "Pinned", count: sheets.filter(s => s.is_pinned).length },
    { key: "mine" as const,   label: "Mine",   count: sheets.filter(s => s.owner?.id === user?.id).length },
  ];

  const props = (s: Sheet) => ({
    s, onPin: () => togglePin(s), onArchive: () => archiveSheet(s),
    onDelete: () => deleteSheet(s), onShare: () => setShareTarget(s),
    onClick: () => window.open(`/admin/workspace/spreadsheets/${s.id}`, "_blank"),
  });

  return (
    <DashboardShell
      moduleKey="workspace_spreadsheets"
      title="Spreadsheets"
      subtitle="Tables, trackers and data grids"
      actions={
        <Button onClick={createSheet} disabled={creating} size="sm">
          <Plus /> New Spreadsheet
        </Button>
      }
    >
      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search spreadsheets…" className="pl-9 pr-9" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key} className="gap-2 data-[state=active]:font-semibold">
                {f.label}
                <span className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                  filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"
                )}>{f.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as typeof view)} variant="outline" size="sm">
          <ToggleGroupItem value="grid" aria-label="Grid view"><Grid3X3 className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view"><List className="size-3.5" /></ToggleGroupItem>
        </ToggleGroup>
      </div>

      {loading ? (
        <div className={cn("grid gap-3", view === "grid" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1")}>
          {[...Array(8)].map((_, i) => <Skeleton key={i} className={cn(view === "grid" ? "h-44" : "h-14")} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center rounded-xl border border-dashed border-border bg-card">
          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
            <Table2 size={20} className="text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1 text-sm">No spreadsheets found</p>
            <p className="text-xs text-muted-foreground">{search ? "Try a different keyword." : "Create your first spreadsheet to get started."}</p>
          </div>
          {!search && (
            <Button onClick={createSheet} size="sm"><Plus /> New Spreadsheet</Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1"><Pin size={11} fill="currentColor" /> Pinned · {pinned.length}</p>
              <div className={cn("grid gap-3", view === "grid" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1")}>
                {pinned.map((s) => view === "grid" ? <SheetCard key={s.id} {...props(s)} /> : <ListRow key={s.id} {...props(s)} />)}
              </div>
            </div>
          )}
          {rest.length > 0 && (
            <div className="space-y-3">
              {pinned.length > 0 && <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1"><Clock size={11} /> All Spreadsheets · {rest.length}</p>}
              <div className={cn("grid gap-3", view === "grid" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1")}>
                {rest.map((s) => view === "grid" ? <SheetCard key={s.id} {...props(s)} /> : <ListRow key={s.id} {...props(s)} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {shareTarget && user && (
        <ShareModal itemId={shareTarget.id} itemType="spreadsheet" itemTitle={shareTarget.title} currentUserId={user.id} onClose={() => setShareTarget(null)} />
      )}
    </DashboardShell>
  );
}
