"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface MultiSelectOption {
  label: string;
  value: string;
}

export interface MultiSelectProps {
  value: string[];
  options: MultiSelectOption[];
  onChange: (val: string[]) => void;
  placeholder: string;
  icon?: React.ReactNode;
  label?: string;
  className?: string;
  searchable?: boolean;
  /** Max badge chips shown in the trigger before collapsing to "+N more". */
  maxChips?: number;
}

export function MultiSelect({
  value,
  options,
  onChange,
  placeholder,
  icon,
  label,
  className,
  searchable = true,
  maxChips = 4,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const selectedOptions = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is MultiSelectOption => !!o);

  const visibleChips = selectedOptions.slice(0, maxChips);
  const overflow = selectedOptions.length - visibleChips.length;

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      {label && (
        <Label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          {icon}
          {label}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between min-h-9 h-auto py-1.5 px-3 font-normal",
              !value.length && "text-muted-foreground"
            )}
          >
            <div className="flex flex-wrap items-center gap-1 min-w-0">
              {!label && icon}
              {selectedOptions.length === 0 ? (
                <span className="truncate">{placeholder}</span>
              ) : (
                <>
                  {visibleChips.map((opt) => (
                    <Badge
                      key={opt.value}
                      variant="secondary"
                      className="gap-1 pr-1 font-medium"
                    >
                      {opt.label}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(opt.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            toggle(opt.value);
                          }
                        }}
                        className="ml-0.5 rounded-sm outline-none hover:bg-muted-foreground/20 p-0.5"
                      >
                        <X className="size-3" />
                      </span>
                    </Badge>
                  ))}
                  {overflow > 0 && (
                    <Badge variant="outline" className="font-medium">
                      +{overflow}
                    </Badge>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {selectedOptions.length > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={clearAll}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onChange([]);
                    }
                  }}
                  aria-label="Clear all"
                  className="rounded-sm outline-none hover:bg-muted p-0.5"
                >
                  <X className="size-3.5 text-muted-foreground" />
                </span>
              )}
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 gap-0 w-[var(--radix-popover-trigger-width)] min-w-[200px]"
          align="start"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <Command className="max-h-[300px]">
            {searchable && <CommandInput placeholder={`Search ${placeholder.toLowerCase()}…`} />}
            <CommandList
              className="max-h-[260px] overflow-y-auto overscroll-contain"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const selected = value.includes(opt.value);
                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      onSelect={() => toggle(opt.value)}
                    >
                      <div
                        className={cn(
                          "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                          selected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                        )}
                      >
                        <Check className="size-3" />
                      </div>
                      <span>{opt.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default MultiSelect;
