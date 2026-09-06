/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import {
  StickyNote, Plus, Search, Pin, Archive, Trash2, X, Palette, MoreVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "@/lib/dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

dayjs.extend(relativeTime);

interface Note {
  id: string;
  title: string;
  content: string;
  color: string;
  is_pinned: boolean;
  status: string;
  tags: string[];
  last_edited_at: string;
  owner?: { name: string };
}

const NOTE_COLORS = [
  { bg: "#ffffff", label: "Default" },
  { bg: "#fef9c3", label: "Yellow" },
  { bg: "#dcfce7", label: "Green" },
  { bg: "#dbeafe", label: "Blue" },
  { bg: "#fce7f3", label: "Pink" },
  { bg: "#ede9fe", label: "Purple" },
  { bg: "#ffedd5", label: "Orange" },
  { bg: "#e0f2fe", label: "Sky" },
];

function NoteCard({ note, onUpdate, onDelete }: {
  note: Note;
  onUpdate: (id: string, updates: Partial<Note>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(note.title);
  const [draftContent, setDraftContent] = useState(note.content);
  const cardRef = useRef<HTMLDivElement>(null);

  function save() {
    if (draftTitle !== note.title || draftContent !== note.content) {
      onUpdate(note.id, { title: draftTitle, content: draftContent });
    }
    setEditing(false);
  }

  useEffect(() => {
    if (!editing) return;
    function handler(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) save();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editing, draftTitle, draftContent]);

  const isColored = note.color && note.color !== "#ffffff";
  const cardStyle = isColored ? { backgroundColor: note.color } : undefined;

  return (
    <div
      ref={cardRef}
      className={cn(
        "group relative rounded-md border transition-shadow overflow-hidden",
        editing ? "shadow-lg z-20 border-primary/40" : "hover:shadow-md cursor-pointer border-border",
        !isColored && "bg-card"
      )}
      style={cardStyle}
      onClick={() => { if (!editing) setEditing(true); }}
    >
      <div className="p-4">
        {editing ? (
          <Input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Title"
            className="mb-2 h-8 px-0 bg-transparent border-0 font-semibold text-sm focus-visible:ring-0"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          note.title && note.title !== "Untitled Note" && (
            <p className="font-semibold text-sm text-foreground mb-2 truncate">{note.title}</p>
          )
        )}

        {editing ? (
          <Textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            placeholder="Write something…"
            rows={5}
            className="bg-transparent border-0 px-0 resize-none focus-visible:ring-0 text-sm leading-relaxed"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6 leading-relaxed">
            {note.content || <span className="italic opacity-50">Empty note</span>}
          </p>
        )}

        {note.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {note.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs font-normal">
                {t}
              </Badge>
            ))}
          </div>
        )}

        {editing ? (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
                  <Palette size={14} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2.5">
                <div className="flex gap-2">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c.bg}
                      type="button"
                      onClick={() => onUpdate(note.id, { color: c.bg })}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                        note.color === c.bg ? "border-foreground scale-110" : "border-border"
                      )}
                      style={{ background: c.bg }}
                      title={c.label}
                    />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setEditing(false); setDraftTitle(note.title); setDraftContent(note.content); }}
              >
                Discard
              </Button>
              <Button type="button" size="sm" onClick={save}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-3">{dayjs(note.last_edited_at).fromNow()}</p>
        )}
      </div>

      {!editing && (
        <div
          className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 bg-card/80 backdrop-blur"
            onClick={() => onUpdate(note.id, { is_pinned: !note.is_pinned })}
            title={note.is_pinned ? "Unpin" : "Pin"}
          >
            <Pin size={12} className={note.is_pinned ? "text-amber-500" : "text-muted-foreground"} fill={note.is_pinned ? "currentColor" : "none"} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 bg-card/80 backdrop-blur"
              >
                <MoreVertical size={12} className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={() => onUpdate(note.id, { status: "archived" })}>
                <Archive size={12} className="mr-2" /> Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(note.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 size={12} className="mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

export default function NotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickContent, setQuickContent] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const quickRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (user?.id) fetchNotes(); }, [user?.id]);

  useEffect(() => {
    if (!quickOpen) return;
    function handler(e: MouseEvent) {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) {
        if (quickContent.trim() || quickTitle.trim()) saveQuick();
        else setQuickOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [quickOpen, quickTitle, quickContent]);

  async function fetchNotes() {
    setLoading(true);
    try {
      const res = await axios.get(`/api/workspace/notes?userId=${user?.id}&userRole=${user?.role}`);
      setNotes(res.data.notes || []);
    } catch { } finally { setLoading(false); }
  }

  async function saveQuick() {
    if (!quickTitle.trim() && !quickContent.trim()) { setQuickOpen(false); return; }
    setCreating(true);
    try {
      await axios.post("/api/workspace/notes", {
        title: quickTitle || "Untitled Note",
        content: quickContent,
        owner_id: user?.id,
        color: "#ffffff",
      });
      setQuickTitle(""); setQuickContent(""); setQuickOpen(false);
      fetchNotes();
    } catch { } finally { setCreating(false); }
  }

  async function updateNote(id: string, updates: Partial<Note>) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...updates } : n));
    await axios.patch(`/api/workspace/notes/${id}`, { ...updates, last_edited_by: user?.id });
  }

  async function deleteNote(id: string) {
    if (!confirm("Delete this note?")) return;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await axios.delete(`/api/workspace/notes/${id}`);
  }

  const filtered = notes.filter((n) => {
    if (n.status === "archived") return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pinned = filtered.filter((n) => n.is_pinned);
  const rest = filtered.filter((n) => !n.is_pinned);

  return (
    <DashboardShell
      moduleKey="workspace_notes"
      title="Notes"
      subtitle="Quick notes, ideas and checklists"
      actions={
        <Button onClick={() => setQuickOpen(true)} size="sm">
          <Plus /> New Note
        </Button>
      }
    >
      {/* Search */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="pl-9 pr-9"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Quick create */}
      <div className="mb-6 max-w-xl">
        <div
          ref={quickRef}
          onClick={() => setQuickOpen(true)}
          className={cn(
            "rounded-xl border bg-card transition-all cursor-text",
            quickOpen ? "shadow-sm border-foreground/20 p-4" : "border-border p-3 hover:border-foreground/20"
          )}
        >
          {quickOpen ? (
            <div className="space-y-3">
              <input
                autoFocus
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-transparent font-semibold text-sm text-foreground focus:outline-none placeholder:text-muted-foreground"
              />
              <Textarea
                value={quickContent}
                onChange={(e) => setQuickContent(e.target.value)}
                placeholder="What's on your mind?"
                rows={3}
                className="border-0 px-0 py-0 bg-transparent shadow-none focus-visible:ring-0 resize-none leading-relaxed"
              />
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => { setQuickOpen(false); setQuickTitle(""); setQuickContent(""); }}>
                  Discard
                </Button>
                <Button size="sm" onClick={saveQuick} disabled={creating}>
                  Save Note
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <StickyNote size={16} />
              <span className="text-sm">Take a note…</span>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="mb-4 break-inside-avoid">
              <Skeleton style={{ height: `${160 + (i % 3) * 50}px` }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center rounded-xl border border-dashed border-border bg-card">
          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
            <StickyNote size={20} className="text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1 text-sm">{search ? "No notes match your search" : "No notes yet"}</p>
            <p className="text-xs text-muted-foreground">{search ? "Try a different keyword" : "Create your first note above."}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {pinned.length > 0 && (
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground px-1">
                <Pin size={11} fill="currentColor" /> Pinned · {pinned.length}
              </p>
              <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4">
                {pinned.map((note) => (
                  <div key={note.id} className="mb-4 break-inside-avoid">
                    <NoteCard note={note} onUpdate={updateNote} onDelete={deleteNote} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div className="space-y-3">
              {pinned.length > 0 && <p className="text-xs font-semibold text-muted-foreground px-1">All notes · {rest.length}</p>}
              <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4">
                {rest.map((note) => (
                  <div key={note.id} className="mb-4 break-inside-avoid">
                    <NoteCard note={note} onUpdate={updateNote} onDelete={deleteNote} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
