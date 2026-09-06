/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import {
  BookOpen, Table2, Presentation, StickyNote, Plus, Clock,
  Pin, LayoutTemplate, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "@/lib/dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import axios from "axios";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

dayjs.extend(relativeTime);

interface WorkspaceItem {
  id: string;
  title: string;
  icon: string;
  last_edited_at: string;
  is_pinned: boolean;
  owner?: { name: string };
  type: "document" | "spreadsheet" | "presentation" | "note";
}

const TYPE_CONFIG = {
  document: {
    label: "Documents",
    icon: BookOpen,
    href: "/admin/workspace/documents",
    gradient: "from-blue-500 to-indigo-600",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-theme-border",
    desc: "Rich text docs, reports & wikis",
    emoji: "📄",
  },
  spreadsheet: {
    label: "Spreadsheets",
    icon: Table2,
    href: "/admin/workspace/spreadsheets",
    gradient: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-theme-border",
    desc: "Tables, trackers & data grids",
    emoji: "📊",
  },
  presentation: {
    label: "Presentations",
    icon: Presentation,
    href: "/admin/workspace/presentations",
    gradient: "from-violet-500 to-purple-600",
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    border: "border-theme-border",
    desc: "Slide decks & visual stories",
    emoji: "📑",
  },
  note: {
    label: "Notes",
    icon: StickyNote,
    href: "/admin/workspace/notes",
    gradient: "from-amber-500 to-orange-500",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-theme-border",
    desc: "Quick notes, ideas & checklists",
    emoji: "📝",
  },
};

function getGreeting(name: string) {
  const h = new Date().getHours();
  const g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${g}, ${name?.split(" ")[0] ?? "there"}`;
}

export default function WorkspaceHubPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [counts, setCounts] = useState({ document: 0, spreadsheet: 0, presentation: 0, note: 0 });
  const [recent, setRecent] = useState<WorkspaceItem[]>([]);
  const [pinned, setPinned] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    fetchAll();

    // Subscribe to all relevant workspace tables for realtime updates
    const channel = supabase
      .channel('workspace-hub-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_documents' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_spreadsheets' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_presentations' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_notes' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_shares', filter: `user_id=eq.${user.id}` }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  async function fetchAll() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const role = user.role || "";
      const [docsRes, sheetsRes, pptsRes, notesRes] = await Promise.all([
        axios.get(`/api/workspace/documents?userId=${user.id}&userRole=${role}`),
        axios.get(`/api/workspace/spreadsheets?userId=${user.id}&userRole=${role}`),
        axios.get(`/api/workspace/presentations?userId=${user.id}&userRole=${role}`),
        axios.get(`/api/workspace/notes?userId=${user.id}&userRole=${role}`),
      ]);

      const docs = (docsRes.data.documents || []).map((d: any) => ({ ...d, type: "document" }));
      const sheets = (sheetsRes.data.spreadsheets || []).map((d: any) => ({ ...d, type: "spreadsheet" }));
      const ppts = (pptsRes.data.presentations || []).map((d: any) => ({ ...d, type: "presentation" }));
      const notes = (notesRes.data.notes || []).map((d: any) => ({ ...d, type: "note" }));

      setCounts({
        document: docs.length,
        spreadsheet: sheets.length,
        presentation: ppts.length,
        note: notes.length,
      });

      const all = [...docs, ...sheets, ...ppts, ...notes].sort(
        (a, b) => new Date(b.last_edited_at).getTime() - new Date(a.last_edited_at).getTime()
      );

      setRecent(all.slice(0, 8));
      setPinned(all.filter((i) => i.is_pinned).slice(0, 6));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function createNew(type: keyof typeof TYPE_CONFIG) {
    setCreating(true);
    try {
      const endpoints: Record<string, string> = {
        document: "/api/workspace/documents",
        spreadsheet: "/api/workspace/spreadsheets",
        presentation: "/api/workspace/presentations",
        note: "/api/workspace/notes",
      };
      const keys: Record<string, string> = {
        document: "document", spreadsheet: "spreadsheet",
        presentation: "presentation", note: "note",
      };
      const res = await axios.post(endpoints[type], { owner_id: user?.id });
      const item = res.data[keys[type]];
      if (item) {
        router.push(`/admin/workspace/${type}s/${item.id}`);
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  const itemHref = (item: WorkspaceItem) =>
    `/admin/workspace/${item.type}s/${item.id}`;

  return (
    <DashboardShell
      moduleKey="workspace_hub" title="Workspace Hub" subtitle={getGreeting(user?.name ?? "")}>
      <div className="space-y-8">

        {/* 4 type cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
            const cfg = TYPE_CONFIG[type];
            return (
              <Card key={type} className="group relative gap-3 p-4 hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer">
                <Link href={cfg.href} className="absolute inset-0 z-10 rounded-xl" aria-label={cfg.label} />
                <div className="flex items-start justify-between">
                  <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0", cfg.bg)}>
                    {cfg.emoji}
                  </div>
                  <span className={cn("text-base font-semibold tabular-nums", cfg.text)}>
                    {loading ? <Skeleton className="h-5 w-6" /> : counts[type]}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{cfg.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{cfg.desc}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => { e.preventDefault(); createNew(type); }}
                  disabled={creating}
                  className={cn("relative z-20 w-fit", cfg.bg, cfg.text, "hover:opacity-80")}
                >
                  <Plus /> New
                </Button>
              </Card>
            );
          })}
        </div>

        {/* Pinned */}
        {pinned.length > 0 && (
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Pin size={11} fill="currentColor" /> Pinned · {pinned.length}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {pinned.map((item) => {
                const cfg = TYPE_CONFIG[item.type];
                return (
                  <Link key={item.id} href={itemHref(item)} target="_blank" className="group block">
                    <Card className="p-3.5 gap-0 hover:border-foreground/20 hover:shadow-sm transition-all flex-row items-start">
                      <span className="text-lg flex-shrink-0 mt-0.5 mr-3">{item.icon || cfg.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">{item.title}</p>
                        <div className="flex items-center justify-between mt-1.5 gap-2">
                          <Badge variant="secondary" className={cn("text-[9px] px-1.5 py-0 font-medium", cfg.bg, cfg.text, "border-transparent")}>
                            {cfg.label.replace(/s$/, "")}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{dayjs(item.last_edited_at).fromNow()}</span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent */}
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock size={11} /> Recent
          </p>

          {loading ? (
            <Card className="overflow-hidden p-0 gap-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="pl-4">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Owner</TableHead>
                    <TableHead className="pr-4 text-right">Edited</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-4 w-4" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16 rounded-full" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-3 w-24" /></TableCell>
                      <TableCell className="pr-4 text-right"><Skeleton className="h-3 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : recent.length === 0 ? (
            <Card className="border-dashed py-12 items-center justify-center text-center gap-3">
              <LayoutTemplate size={28} className="text-muted-foreground opacity-30 mx-auto" />
              <div>
                <p className="font-semibold text-sm text-foreground">Workspace is empty</p>
                <p className="text-xs text-muted-foreground mt-1">Create your first doc, sheet, presentation or note.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {(Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
                  const cfg = TYPE_CONFIG[type];
                  return (
                    <Button key={type} size="sm" variant="outline" onClick={() => createNew(type)}>
                      <span>{cfg.emoji}</span> {cfg.label.replace(/s$/, "")}
                    </Button>
                  );
                })}
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0 gap-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="pl-4">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Owner</TableHead>
                    <TableHead className="pr-4 text-right">Edited</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((item) => {
                    const cfg = TYPE_CONFIG[item.type];
                    return (
                      <TableRow key={item.id} className="cursor-pointer group">
                        <TableCell className="pl-4">
                          <Link href={itemHref(item)} target="_blank"
                            onClick={() => { setNavigatingId(item.id); setTimeout(() => setNavigatingId(null), 2000); }}
                            className="flex items-center gap-3">
                            <span className="flex items-center justify-center w-5 flex-shrink-0">
                              {navigatingId === item.id
                                ? <Loader2 size={14} className="animate-spin text-primary" />
                                : <span className="text-base leading-none">{item.icon || cfg.emoji}</span>}
                            </span>
                            <span className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">{item.title}</span>
                            {item.is_pinned && <Pin size={10} className="text-amber-500 flex-shrink-0" fill="currentColor" />}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="secondary" className={cn("text-[10px] font-medium", cfg.bg, cfg.text, "border-transparent")}>
                            {cfg.label.replace(/s$/, "")}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{item.owner?.name ?? "—"}</TableCell>
                        <TableCell className="pr-4 text-right text-xs text-muted-foreground">{dayjs(item.last_edited_at).fromNow()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
