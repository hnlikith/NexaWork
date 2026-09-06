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
  Plus, Search, Pin, Archive, Trash2, MoreVertical,
  Grid3X3, List, X, Share2, FileText, Clock,
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

interface Doc {
  id: string;
  title: string;
  icon: string;
  cover_color: string | null;
  is_pinned: boolean;
  status: string;
  tags: string[];
  last_edited_at: string;
  created_at: string;
  owner?: { id: string; name: string; employee_id: string };
}

const COVER_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-500",
  "from-teal-500 to-emerald-600",
  "from-sky-500 to-cyan-600",
];

// ── Doc Card (Grid) ───────────────────────────────────────────────────────────
function DocCard({ doc, onPin, onArchive, onDelete, onShare, onClick }: {
  doc: Doc;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onShare: () => void;
  onClick: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const gradIdx = doc.id.charCodeAt(0) % COVER_GRADIENTS.length;
  const grad = doc.cover_color ?? COVER_GRADIENTS[gradIdx];

  return (
    <div
      onClick={onClick}
      className="group relative bg-theme-card border border-theme-border rounded-xl overflow-hidden hover:border-theme-strong hover:shadow-sm transition-all cursor-pointer"
    >
      {/* Top row: icon swatch + actions */}
      <div className="flex items-start justify-between p-4 pb-3">
        {/* Coloured doc icon */}
        <div className={cn("h-10 w-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-lg flex-shrink-0 shadow-sm", grad)}>
          <span className="leading-none drop-shadow">{doc.icon || "📄"}</span>
        </div>

        {/* Actions — always visible as subtle icons */}
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {doc.is_pinned && (
            <Pin size={11} className="text-amber-500 mr-1" fill="currentColor" />
          )}
          <button
            onClick={onShare}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-fg hover:bg-theme-raised transition-all opacity-0 group-hover:opacity-100"
            title="Share"
          >
            <Share2 size={12} />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenu(!menu)}
              className="p-1.5 rounded-lg text-theme-muted hover:text-theme-fg hover:bg-theme-raised transition-all opacity-0 group-hover:opacity-100"
            >
              <MoreVertical size={12} />
            </button>
            {menu && (
              <div className="absolute top-7 right-0 z-[9999] w-36 rounded-xl border border-theme-border bg-theme-surface shadow-xl p-1">
                <button onClick={() => { onPin(); setMenu(false); }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-theme-raised text-theme-fg flex items-center gap-2">
                  <Pin size={12} /> {doc.is_pinned ? "Unpin" : "Pin"}
                </button>
                <button onClick={() => { onArchive(); setMenu(false); }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-theme-raised text-theme-fg flex items-center gap-2">
                  <Archive size={12} /> Archive
                </button>
                <button onClick={() => { onDelete(); setMenu(false); }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-rose-500/10 text-rose-500 flex items-center gap-2">
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Title + owner */}
      <div className="px-4 pb-3">
        <h3 className="font-semibold text-sm text-theme-fg leading-snug mb-0.5 group-hover:text-theme-primary transition-colors line-clamp-2">
          {doc.title}
        </h3>
        <p className="text-[11px] text-theme-muted truncate">{doc.owner?.name ?? "You"}</p>
      </div>

      {/* Tags */}
      {doc.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {doc.tags.slice(0, 2).map((t) => (
            <span key={t} className="text-[9px] font-semibold bg-theme-raised border border-theme-border text-theme-muted px-2 py-0.5 rounded-full uppercase tracking-wide">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-theme-border">
        <Clock size={10} className="text-theme-muted opacity-50 flex-shrink-0" />
        <span className="text-[10px] text-theme-muted">{dayjs(doc.last_edited_at).fromNow()}</span>
      </div>
    </div>
  );
}

// ── List Row ──────────────────────────────────────────────────────────────────
function ListRow({ doc, onPin, onArchive, onDelete, onShare, onClick }: {
  doc: Doc;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onShare: () => void;
  onClick: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const gradIdx = doc.id.charCodeAt(0) % COVER_GRADIENTS.length;
  const grad = doc.cover_color ?? COVER_GRADIENTS[gradIdx];

  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-theme-border bg-theme-card hover:bg-theme-raised hover:border-theme-strong cursor-pointer transition-all"
    >
      {/* Mini cover swatch */}
      <div className={cn("h-9 w-9 rounded-lg bg-gradient-to-br flex-shrink-0 flex items-center justify-center text-base", grad)}>
        <span className="leading-none">{doc.icon || "📄"}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-theme-fg truncate group-hover:text-theme-primary transition-colors">{doc.title}</p>
        <p className="text-[11px] text-theme-muted">{doc.owner?.name ?? "You"} · {dayjs(doc.last_edited_at).fromNow()}</p>
      </div>

      {doc.tags?.slice(0, 2).map((t) => (
        <span key={t} className="hidden md:inline text-[9px] font-semibold bg-theme-raised border border-theme-border text-theme-muted px-2 py-0.5 rounded-full uppercase tracking-wide">
          {t}
        </span>
      ))}

      {doc.is_pinned && <Pin size={11} className="text-amber-500 flex-shrink-0" fill="currentColor" />}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onShare}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-theme-border hover:bg-theme-primary/10 hover:text-theme-primary text-theme-muted transition-all"
        >
          <Share2 size={11} /> Share
        </button>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="p-1.5 rounded-lg hover:bg-theme-overlay transition-all">
            <MoreVertical size={14} className="text-theme-muted" />
          </button>
          {menu && (
            <div className="absolute right-0 top-8 z-[9999] w-36 rounded-xl border border-theme-border bg-theme-surface shadow-xl p-1">
              <button onClick={() => { onPin(); setMenu(false); }} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-theme-raised flex items-center gap-2 text-theme-fg"><Pin size={12} />{doc.is_pinned ? "Unpin" : "Pin"}</button>
              <button onClick={() => { onArchive(); setMenu(false); }} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-theme-raised flex items-center gap-2 text-theme-fg"><Archive size={12} />Archive</button>
              <button onClick={() => { onDelete(); setMenu(false); }} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-rose-500/10 flex items-center gap-2 text-rose-500"><Trash2 size={12} />Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pinned" | "mine">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [shareTarget, setShareTarget] = useState<Doc | null>(null);

  useEffect(() => { if (user?.id) fetchDocs(); }, [user?.id]);

  async function fetchDocs() {
    setLoading(true);
    try {
      const res = await axios.get(`/api/workspace/documents?userId=${user?.id}&userRole=${user?.role}`);
      setDocs(res.data.documents || []);
    } catch { } finally { setLoading(false); }
  }

  async function createDoc() {
    setCreating(true);
    try {
      const res = await axios.post("/api/workspace/documents", { owner_id: user?.id });
      window.open(`/admin/workspace/documents/${res.data.document.id}`, "_blank");
      fetchDocs();
    } catch { } finally { setCreating(false); }
  }

  async function togglePin(doc: Doc) {
    await axios.patch(`/api/workspace/documents/${doc.id}?userId=${user?.id}`, { is_pinned: !doc.is_pinned });
    fetchDocs();
  }
  async function archiveDoc(doc: Doc) {
    await axios.patch(`/api/workspace/documents/${doc.id}?userId=${user?.id}`, { status: "archived" });
    fetchDocs();
  }
  async function deleteDoc(doc: Doc) {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    await axios.delete(`/api/workspace/documents/${doc.id}?userId=${user?.id}`);
    fetchDocs();
  }

  const filtered = docs.filter((d) => {
    if (filter === "pinned" && !d.is_pinned) return false;
    if (filter === "mine" && d.owner?.id !== user?.id) return false;
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pinned = filtered.filter((d) => d.is_pinned);
  const rest = filtered.filter((d) => !d.is_pinned);

  const FILTERS = [
    { key: "all" as const,    label: "All",    count: docs.length },
    { key: "pinned" as const, label: "Pinned", count: docs.filter(d => d.is_pinned).length },
    { key: "mine" as const,   label: "Mine",   count: docs.filter(d => d.owner?.id === user?.id).length },
  ];

  const openDoc = (doc: Doc) => window.open(`/admin/workspace/documents/${doc.id}`, "_blank");

  return (
    <DashboardShell
      moduleKey="workspace_documents"
      title="Documents"
      subtitle="Rich text docs, reports and wikis"
      actions={
        <Button onClick={createDoc} disabled={creating} size="sm">
          <Plus /> New Document
        </Button>
      }
    >
      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
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
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <Grid3X3 className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <List className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Content */}
      {loading ? (
        <div className={cn("grid gap-4", view === "grid" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1")}>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className={cn(view === "grid" ? "h-48" : "h-14")} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center rounded-xl border border-dashed border-border bg-card">
          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
            <FileText size={20} className="text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1 text-sm">No documents found</p>
            <p className="text-xs text-muted-foreground">{search ? "Try a different search term." : "Create your first document to get started."}</p>
          </div>
          {!search && (
            <Button onClick={createDoc} size="sm">
              <Plus /> New Document
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned */}
          {pinned.length > 0 && (
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                <Pin size={11} fill="currentColor" /> Pinned · {pinned.length}
              </p>
              <div className={cn("grid gap-3", view === "grid" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1")}>
                {pinned.map((doc) =>
                  view === "grid" ? (
                    <DocCard key={doc.id} doc={doc} onPin={() => togglePin(doc)} onArchive={() => archiveDoc(doc)} onDelete={() => deleteDoc(doc)} onShare={() => setShareTarget(doc)} onClick={() => openDoc(doc)} />
                  ) : (
                    <ListRow key={doc.id} doc={doc} onPin={() => togglePin(doc)} onArchive={() => archiveDoc(doc)} onDelete={() => deleteDoc(doc)} onShare={() => setShareTarget(doc)} onClick={() => openDoc(doc)} />
                  )
                )}
              </div>
            </div>
          )}

          {/* Rest */}
          {rest.length > 0 && (
            <div className="space-y-3">
              {pinned.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  <Clock size={11} /> All Documents · {rest.length}
                </p>
              )}
              <div className={cn("grid gap-3", view === "grid" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1")}>
                {rest.map((doc) =>
                  view === "grid" ? (
                    <DocCard key={doc.id} doc={doc} onPin={() => togglePin(doc)} onArchive={() => archiveDoc(doc)} onDelete={() => deleteDoc(doc)} onShare={() => setShareTarget(doc)} onClick={() => openDoc(doc)} />
                  ) : (
                    <ListRow key={doc.id} doc={doc} onPin={() => togglePin(doc)} onArchive={() => archiveDoc(doc)} onDelete={() => deleteDoc(doc)} onShare={() => setShareTarget(doc)} onClick={() => openDoc(doc)} />
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Share Modal */}
      {shareTarget && user?.id && (
        <ShareModal
          itemId={shareTarget.id}
          itemType="document"
          itemTitle={shareTarget.title}
          currentUserId={user.id}
          onClose={() => setShareTarget(null)}
        />
      )}
    </DashboardShell>
  );
}
