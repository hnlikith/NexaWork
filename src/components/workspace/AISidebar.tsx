"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState } from "react";
import {
  Sparkles, Wand2, RotateCcw, BookOpen, Search, Lightbulb,
  PenTool, AlertCircle,
} from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";

interface AISidebarProps {
  content: string;
  /** Called when AI produces a result — parent handles the on-doc ghost/preview */
  onAIDraft: (draft: string) => void;
  /** Called whenever the loading state changes so parent can show on-doc loader */
  onLoadingChange?: (loading: boolean) => void;
  onRenameDocument?: (newTitle: string) => void;
}

const QUICK_ACTIONS = [
  { id: "summarize",  icon: BookOpen,  label: "Summarize",        description: "Create a concise summary of your document" },
  { id: "improve",    icon: Wand2,     label: "Improve writing",  description: "Fix grammar, flow and professional tone" },
  { id: "rewrite",    icon: RotateCcw, label: "Rewrite",          description: "Express the same ideas in a fresh way" },
  { id: "brainstorm", icon: Lightbulb, label: "Brainstorm",       description: "Generate ideas based on current content" },
  { id: "plagiarism", icon: Search,    label: "Plagiarism check", description: "Verify original content and detect matches" },
  { id: "shorten",    icon: PenTool,   label: "Make shorter",     description: "Condensed version for quick reading" },
];

// Patterns that mean "rename this document to X"
const RENAME_RE = [
  /^(?:rename|call|title|name)\s+(?:this\s+)?(?:document|doc|it)\s+(?:as|to|"')?(.+?)["']?$/i,
  /^change\s+(?:the\s+)?(?:document\s+)?(?:title|name)\s+(?:to|as)\s+(.+)$/i,
  /^(?:set|update)\s+(?:the\s+)?(?:title|name)\s+(?:to|as)\s+(.+)$/i,
  /^rename\s+to\s+(.+)$/i,
];

function detectRename(p: string): string | null {
  const t = p.trim();
  for (const re of RENAME_RE) {
    const m = t.match(re);
    if (m?.[1]) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

export function AISidebar({ content, onAIDraft, onLoadingChange, onRenameDocument }: AISidebarProps) {
  const [loading, setLoading]   = useState(false);

  const setLoadingState = (val: boolean) => { setLoading(val); onLoadingChange?.(val); };
  const [error, setError]       = useState<string | null>(null);
  const [renamed, setRenamed]   = useState<string | null>(null);
  const [prompt, setPrompt]     = useState("");
  const [lastLabel, setLastLabel] = useState("");

  const runAIAction = async (action: string, customPrompt?: string) => {
    const effectivePrompt = customPrompt || prompt;

    // Rename intent — client-side, no AI call
    if (action === "custom" && onRenameDocument) {
      const newTitle = detectRename(effectivePrompt);
      if (newTitle) {
        onRenameDocument(newTitle);
        setRenamed(newTitle);
        setPrompt("");
        setTimeout(() => setRenamed(null), 3500);
        return;
      }
    }

    setLoadingState(true);
    setError(null);
    const label = QUICK_ACTIONS.find(a => a.id === action)?.label ?? "Generating";
    setLastLabel(action === "custom" ? "Writing…" : `${label}…`);

    try {
      const response = await axios.post("/api/workspace/ai", {
        action,
        content,
        customPrompt: effectivePrompt || undefined,
      });
      const draft = response.data.result;
      if (draft) {
        onAIDraft(draft);
        if (action === "custom") setPrompt("");
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "AI engine unavailable — try again.";
      setError(msg);
    } finally {
      setLoadingState(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card w-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">AI Writing Assistant</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Powered by Gemma4:e4b Intelligence</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Prompt input */}
        <div className="space-y-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && prompt.trim() && !loading) {
                e.preventDefault();
                runAIAction("custom");
              }
            }}
            placeholder={
              'Write anything…\n• "write 100 lines about Mahabharata"\n• "rename this document as Project Brief"\n• Ctrl+Enter to send'
            }
            className="h-28 resize-none text-sm"
          />
          <Button
            type="button"
            onClick={() => runAIAction("custom")}
            disabled={loading || !prompt.trim()}
            className="w-full"
          >
            <Sparkles size={14} className="mr-1.5" />
            Generate content
          </Button>
        </div>

        <Separator />

        {/* Quick actions */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Quick actions</p>
          {QUICK_ACTIONS.map(({ id, icon: Icon, label, description }) => (
            <button
              key={id}
              type="button"
              onClick={() => runAIAction(id)}
              disabled={loading}
              className="w-full rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Icon size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground leading-tight">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Rename success */}
        {renamed && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="px-4 py-3">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Document renamed to <span className="font-bold">"{renamed}"</span>
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-2.5 px-4 py-3">
              <AlertCircle size={14} className="text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive leading-snug">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Loading state — minimal chip; full animation shows on the document */}
        {loading && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-primary/20 bg-primary/5">
            <div className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary truncate">{lastLabel}</p>
              <p className="text-[10px] text-muted-foreground">Writing on document…</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
