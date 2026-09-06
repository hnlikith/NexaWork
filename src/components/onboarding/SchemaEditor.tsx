"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, ChevronUp, ChevronDown, GripVertical, ListChecks, CircleDot, AlignLeft, FormInput, SeparatorHorizontal,
} from "lucide-react";
import type { ConfigCategory, ConfigCategoryKind } from "@/lib/onboarding/types";

const uid = () => Math.random().toString(36).slice(2, 8);
const reletter = (cats: ConfigCategory[]) =>
  cats.map((c, i) => ({ ...c, letter: String.fromCharCode(65 + (i % 26)) }));

const KIND_META: Record<ConfigCategoryKind, { label: string; icon: React.ElementType }> = {
  single: { label: "Radio (one choice)", icon: CircleDot },
  multi: { label: "Checkbox (multiple)", icon: ListChecks },
  description: { label: "Description (free text)", icon: AlignLeft },
  fields: { label: "Fields (labelled inputs)", icon: FormInput },
};

export function SchemaEditor({
  value,
  onChange,
  disabled,
}: {
  value: ConfigCategory[];
  onChange: (next: ConfigCategory[]) => void;
  disabled?: boolean;
}) {
  const commit = (next: ConfigCategory[]) => onChange(reletter(next));
  const patchCat = (i: number, patch: Partial<ConfigCategory>) =>
    commit(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const setKind = (i: number, kind: ConfigCategoryKind) => {
    const c = { ...value[i], kind };
    if ((kind === "single" || kind === "multi") && (!c.options || c.options.length === 0)) {
      c.options = [{ id: `o_${uid()}`, label: "Option 1" }];
    }
    if (kind === "fields" && (!c.fields || c.fields.length === 0)) {
      c.fields = [{ id: `f_${uid()}`, label: "Field 1" }];
    }
    commit(value.map((x, idx) => (idx === i ? c : x)));
  };

  const addCat = () =>
    commit([
      ...value,
      { id: `q_${uid()}`, letter: "?", title: "New Question", kind: "multi", options: [{ id: `o_${uid()}`, label: "Option 1" }] },
    ]);
  const removeCat = (i: number) => commit(value.filter((_, idx) => idx !== i));
  const moveCat = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  const addOption = (i: number) =>
    patchCat(i, { options: [...(value[i].options ?? []), { id: `o_${uid()}`, label: "New option" }] });
  const patchOption = (i: number, j: number, patch: Partial<NonNullable<ConfigCategory["options"]>[number]>) =>
    patchCat(i, { options: (value[i].options ?? []).map((o, k) => (k === j ? { ...o, ...patch } : o)) });
  const removeOption = (i: number, j: number) =>
    patchCat(i, { options: (value[i].options ?? []).filter((_, k) => k !== j) });

  const addField = (i: number) =>
    patchCat(i, { fields: [...(value[i].fields ?? []), { id: `f_${uid()}`, label: "New field" }] });
  const patchField = (i: number, j: number, patch: Partial<NonNullable<ConfigCategory["fields"]>[number]>) =>
    patchCat(i, { fields: (value[i].fields ?? []).map((f, k) => (k === j ? { ...f, ...patch } : f)) });
  const removeField = (i: number, j: number) =>
    patchCat(i, { fields: (value[i].fields ?? []).filter((_, k) => k !== j) });

  return (
    <div className="space-y-3">
      {value.map((cat, i) => (
        <div key={cat.id} className="rounded-xl border border-border bg-card overflow-hidden">
          {cat.pageBreakBefore && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/5 border-b border-primary/20 text-[10px] font-semibold text-primary">
              <SeparatorHorizontal size={11} /> Starts on a new page
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 border-b border-border">
            <GripVertical size={14} className="text-muted-foreground/50 shrink-0" />
            <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary shrink-0">
              {cat.letter}
            </span>
            <Input
              value={cat.title}
              disabled={disabled}
              onChange={(e) => patchCat(i, { title: e.target.value })}
              className="h-8 text-sm font-medium flex-1"
            />
            <Select value={cat.kind} onValueChange={(v) => setKind(i, v as ConfigCategoryKind)} disabled={disabled}>
              <SelectTrigger className="h-8 w-[160px] text-xs shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_META) as ConfigCategoryKind[]).map((k) => {
                  const Icon = KIND_META[k].icon;
                  return (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2"><Icon size={13} /> {KIND_META[k].label}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={() => patchCat(i, { pageBreakBefore: !cat.pageBreakBefore })}
                disabled={disabled}
                title="Start this section on a new page"
                className={cn("p-1 rounded hover:text-foreground disabled:opacity-30", cat.pageBreakBefore ? "text-primary bg-primary/10" : "text-muted-foreground")}
              >
                <SeparatorHorizontal size={14} />
              </button>
              <button onClick={() => moveCat(i, -1)} disabled={disabled || i === 0} className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp size={14} /></button>
              <button onClick={() => moveCat(i, 1)} disabled={disabled || i === value.length - 1} className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown size={14} /></button>
              <button onClick={() => removeCat(i)} disabled={disabled} className="p-1 rounded text-muted-foreground hover:text-rose-500 disabled:opacity-30"><Trash2 size={14} /></button>
            </div>
          </div>

          <div className="px-3 py-3">
            {/* Radio / Checkbox options */}
            {(cat.kind === "single" || cat.kind === "multi") && (
              <div className="space-y-1.5">
                {(cat.options ?? []).map((o, j) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <span className="text-muted-foreground/50 shrink-0">
                      {cat.kind === "single" ? <CircleDot size={13} /> : <ListChecks size={13} />}
                    </span>
                    <Input value={o.label} disabled={disabled} onChange={(e) => patchOption(i, j, { label: e.target.value })} className="h-8 text-sm flex-1" />
                    {cat.kind === "multi" && (
                      <div className="flex items-center gap-1.5 shrink-0" title="Pre-ticked by default">
                        <Switch checked={!!o.defaultChecked} disabled={disabled} onCheckedChange={() => patchOption(i, j, { defaultChecked: !o.defaultChecked })} />
                        <span className="text-[10px] text-muted-foreground w-12">{o.defaultChecked ? "Default" : "Off"}</span>
                      </div>
                    )}
                    <button onClick={() => removeOption(i, j)} disabled={disabled} className="p-1 rounded text-muted-foreground hover:text-rose-500 disabled:opacity-30 shrink-0"><Trash2 size={13} /></button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => addOption(i)} disabled={disabled} className="text-xs text-primary h-7 mt-1">
                  <Plus size={13} /> Add checklist point
                </Button>
              </div>
            )}

            {/* Fields */}
            {cat.kind === "fields" && (
              <div className="space-y-1.5">
                {(cat.fields ?? []).map((f, j) => (
                  <div key={f.id} className="flex items-center gap-2">
                    <FormInput size={13} className="text-muted-foreground/50 shrink-0" />
                    <Input value={f.label} disabled={disabled} onChange={(e) => patchField(i, j, { label: e.target.value })} className="h-8 text-sm flex-1" />
                    <button onClick={() => removeField(i, j)} disabled={disabled} className="p-1 rounded text-muted-foreground hover:text-rose-500 disabled:opacity-30 shrink-0"><Trash2 size={13} /></button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => addField(i)} disabled={disabled} className="text-xs text-primary h-7 mt-1">
                  <Plus size={13} /> Add field
                </Button>
              </div>
            )}

            {/* Description */}
            {cat.kind === "description" && (
              <p className="text-xs text-muted-foreground italic">The person filling the form will type a free-text description here.</p>
            )}
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addCat} disabled={disabled} className="w-full border-dashed">
        <Plus size={14} /> Add Question / Section
      </Button>
    </div>
  );
}
