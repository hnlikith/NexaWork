"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { ConfigCategory, ConfigField, OnboardingConfig } from "@/lib/onboarding/types";

interface Props {
  schema: ConfigCategory[];
  config: OnboardingConfig;
  onChange: (next: OnboardingConfig) => void;
  disabled?: boolean;
}

// Hoisted to module scope so its component identity is stable across renders.
// (Defining it inside ConfigForm caused inputs to remount and lose focus on every keystroke.)
function FieldInput({
  f, value, onChange, disabled,
}: {
  f: ConfigField;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{f.label}</Label>
      {f.id.includes("terms") ? (
        <Textarea
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder}
          className="min-h-[60px] text-sm"
        />
      ) : (
        <div className="flex items-center gap-2">
          {f.prefix && <span className="text-xs font-semibold text-muted-foreground shrink-0">{f.prefix}</span>}
          <Input
            disabled={disabled}
            type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={f.placeholder}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}

export function ConfigForm({ schema, config, onChange, disabled }: Props) {
  const setVal = (id: string, v: string) => onChange({ ...config, [id]: v });
  const setSingle = (catId: string, optId: string) => onChange({ ...config, [catId]: optId });
  const toggleMulti = (catId: string, optId: string) => {
    const cur = Array.isArray(config[catId]) ? (config[catId] as string[]) : [];
    const next = cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId];
    onChange({ ...config, [catId]: next });
  };

  return (
    <div className="space-y-6">
      {schema.map((cat) => (
        <div key={cat.id} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
              {cat.letter}
            </span>
            <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">{cat.title}</h4>
          </div>

          {/* fields */}
          {cat.kind === "fields" && cat.fields && (
            <div className="grid sm:grid-cols-2 gap-3 pl-7">
              {cat.fields.map((f) => (
                <FieldInput key={f.id} f={f} value={(config[f.id] as string) ?? ""} onChange={(v) => setVal(f.id, v)} disabled={disabled} />
              ))}
            </div>
          )}

          {/* description → free text */}
          {cat.kind === "description" && (
            <div className="pl-7">
              <Textarea
                disabled={disabled}
                value={(config[cat.id] as string) ?? ""}
                onChange={(e) => setVal(cat.id, e.target.value)}
                placeholder="Enter description…"
                className="text-sm min-h-[72px]"
              />
            </div>
          )}

          {/* single → checkbox-style toggle (one selection; click again to clear) */}
          {cat.kind === "single" && cat.options && (
            <div className="pl-7 space-y-1.5">
              {cat.options.map((opt) => {
                const selected = config[cat.id] === opt.id;
                return (
                  <div key={opt.id} className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        id={`${cat.id}-${opt.id}`}
                        checked={selected}
                        disabled={disabled}
                        onCheckedChange={() => setSingle(cat.id, selected ? "" : opt.id)}
                      />
                      <Label htmlFor={`${cat.id}-${opt.id}`} className="text-sm font-normal cursor-pointer">
                        {opt.label}
                      </Label>
                    </div>
                    {selected && opt.fields && (
                      <div className="grid sm:grid-cols-2 gap-3 pl-7">
                        {opt.fields.map((f) => (
                          <FieldInput key={f.id} f={f} value={(config[f.id] as string) ?? ""} onChange={(v) => setVal(f.id, v)} disabled={disabled} />
                        ))}
                      </div>
                    )}
                    {selected && opt.docNote && (
                      <p className="pl-7 text-[11px] text-muted-foreground italic leading-snug">{opt.docNote}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* multi → checkboxes */}
          {cat.kind === "multi" && cat.options && (
            <div className="pl-7 space-y-1.5">
              {cat.options.map((opt) => {
                const arr = Array.isArray(config[cat.id]) ? (config[cat.id] as string[]) : [];
                const checked = arr.includes(opt.id);
                return (
                  <div key={opt.id} className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        id={`${cat.id}-${opt.id}`}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => toggleMulti(cat.id, opt.id)}
                      />
                      <Label htmlFor={`${cat.id}-${opt.id}`} className="text-sm font-normal cursor-pointer">
                        {opt.label}
                      </Label>
                    </div>
                    {checked && opt.fields && (
                      <div className="grid sm:grid-cols-2 gap-3 pl-7">
                        {opt.fields.map((f) => (
                          <FieldInput key={f.id} f={f} value={(config[f.id] as string) ?? ""} onChange={(v) => setVal(f.id, v)} disabled={disabled} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
