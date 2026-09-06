"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/layout/AuthProvider";
import { useToast } from "@/components/ui/ToastLegacy";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { FileText, Trash2, Edit2, PenLine, Clock, Loader2, MailOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Draft = {
  id: string; subject: string; body: string;
  to_addresses: string[]; cc_addresses: string[];
  last_saved_at: string; created_at: string;
};

export default function DraftsPage() {
  const { user }       = useAuth();
  const { showToast }  = useToast();
  const [drafts,    setDrafts]    = useState<Draft[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<Draft | null>(null);
  const [deleting,  setDeleting]  = useState<string | null>(null);

  async function load() {
    const { data: emp } = await supabase.from("employees").select("id").eq("email", (user as any)?.email || "").maybeSingle();
    if (!emp) { setLoading(false); return; }
    const { data } = await fetch(`/api/mail/drafts?employee_id=${emp.id}`).then(r => r.json());
    setDrafts(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function deleteDraft(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(id);
    await fetch(`/api/mail/drafts?id=${id}`, { method: "DELETE" });
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    if (selected?.id === id) setSelected(null);
    showToast("Draft deleted.", "success");
    setDeleting(null);
  }

  return (
    <DashboardShell
      moduleKey="mail_drafts"
      title="Drafts"
      subtitle="Your saved draft emails."
      actions={
        <Link href="/admin/mail/compose">
          <button className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all shadow-sm">
            <PenLine size={13} /> New Draft
          </button>
        </Link>
      }
    >
      <div className="flex h-[calc(100vh-168px)] gap-0 overflow-hidden rounded-2xl border border-theme-border shadow-sm">
        {/* Draft List */}
        <div className="w-96 flex-shrink-0 border-r border-theme-border flex flex-col bg-theme-page">
          <div className="px-4 py-3 border-b border-theme-border">
            <p className="text-xs font-bold text-theme-fg">{drafts.length} Draft{drafts.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-theme-border/30">
            {loading ? (
              <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-theme-muted" /></div>
            ) : drafts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48">
                <FileText size={28} className="text-theme-muted/20 mb-3" />
                <p className="text-xs text-theme-muted">No drafts saved</p>
                <Link href="/admin/mail/compose" className="mt-3 text-xs text-theme-primary hover:underline">Compose new</Link>
              </div>
            ) : drafts.map((d) => (
              <div key={d.id} onClick={() => setSelected(d)}
                className={cn("px-4 py-3 cursor-pointer transition-all group relative",
                  selected?.id === d.id ? "bg-theme-primary/5 border-l-2 border-l-theme-primary" : "hover:bg-theme-raised/50")}>
                <div className="flex items-center gap-2 mb-1">
                  <FileText size={12} className="text-amber-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-theme-fg truncate flex-1">
                    {d.subject || "(no subject)"}
                  </p>
                  <button
                    onClick={(e) => deleteDraft(d.id, e)}
                    disabled={deleting === d.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-rose-500/10 text-theme-muted hover:text-rose-500"
                  >
                    {deleting === d.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </div>
                {d.to_addresses?.length > 0 && (
                  <p className="text-[10px] text-theme-muted truncate mb-0.5">To: {d.to_addresses.join(", ")}</p>
                )}
                <p className="text-[10px] text-theme-muted truncate mb-1">
                  {d.body?.replace(/<[^>]*>/g,"").slice(0, 60) || "Empty draft"}
                </p>
                <div className="flex items-center gap-1 text-[9px] text-theme-muted">
                  <Clock size={9} />
                  {d.last_saved_at ? formatDistanceToNow(new Date(d.last_saved_at), { addSuffix: true }) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview Pane */}
        <div className="flex-1 bg-theme-surface overflow-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full">
              <MailOpen size={36} className="text-theme-muted/20 mb-3" />
              <p className="text-sm font-semibold text-theme-muted">Select a draft to preview</p>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-theme-fg">{selected.subject || "(no subject)"}</h2>
                <Link href={`/admin/mail/compose`}>
                  <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all">
                    <Edit2 size={12} /> Continue Editing
                  </button>
                </Link>
              </div>
              {selected.to_addresses?.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-theme-muted font-semibold">To:</span>
                  <span className="text-theme-fg">{selected.to_addresses.join(", ")}</span>
                </div>
              )}
              {selected.cc_addresses?.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-theme-muted font-semibold">CC:</span>
                  <span className="text-theme-fg">{selected.cc_addresses.join(", ")}</span>
                </div>
              )}
              <div className="rounded-xl border border-theme-border bg-theme-page p-4">
                <p className="text-sm text-theme-fg leading-relaxed whitespace-pre-wrap">
                  {selected.body || "Empty draft."}
                </p>
              </div>
              <p className="text-[10px] text-theme-muted">
                Last saved: {selected.last_saved_at ? formatDistanceToNow(new Date(selected.last_saved_at), { addSuffix: true }) : "—"}
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
