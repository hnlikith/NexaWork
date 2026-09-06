"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mail, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type MailContext =
  | "payslip"
  | "offer_letter"
  | "vendor"
  | "compose"
  | "announcement"
  | "system";

export interface MailAccount {
  zoho_account_id?: string;
  email_address:    string;
  display_name:     string;
  access_type:      "owner" | "shared_read" | "shared_send";
  is_personal?:     boolean;
}

interface AccountSelectorProps {
  context:   MailContext;
  userId:    string;
  value:     string;           // selected email_address
  onChange:  (account: MailAccount) => void;
  disabled?: boolean;
  className?: string;
}

// Per-spec default "from" addresses by context. Left empty rather than
// hardcoded — there's no per-context routing configuration elsewhere in the
// app to source real values from, so the selector falls through to the
// account list's own personal/first-account fallback below instead of
// guessing an address that doesn't exist for this deployment.
const CONTEXT_DEFAULTS: Record<MailContext, string> = {
  payslip:      "",
  offer_letter: "",
  vendor:       "",
  compose:      "",            // personal mailbox — filled at runtime
  announcement: "",
  system:       "",
};

// Contexts locked to only admin
const LOCKED_CONTEXTS: MailContext[] = ["system"];

export function AccountSelector({
  context,
  userId,
  value,
  onChange,
  disabled,
  className,
}: AccountSelectorProps) {
  const [accounts, setAccounts]   = useState<MailAccount[]>([]);
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(true);
  const ref                       = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch(`/api/users/me/accounts?userId=${userId}`)
      .then(r => r.json())
      .then(({ accounts: accs }) => {
        const list: MailAccount[] = accs || [];
        setAccounts(list);

        // Auto-select default for context
        const defaultEmail = CONTEXT_DEFAULTS[context] || list.find(a => a.is_personal)?.email_address || "";
        const defaultAcc   = list.find(a => a.email_address === defaultEmail) || list.find(a => a.is_personal) || list[0];
        if (defaultAcc && !value) {
          onChange(defaultAcc);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, context]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected    = accounts.find(a => a.email_address === value);
  const isLocked    = LOCKED_CONTEXTS.includes(context) || disabled;
  const sendable    = accounts.filter(a => a.access_type !== "shared_read");

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={isLocked || loading}
        onClick={() => !isLocked && setOpen(o => !o)}
        className={cn(
          "flex h-11 w-full items-center gap-3 rounded-xl border border-theme-border bg-theme-card px-3 text-sm font-medium transition-all",
          isLocked
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-indigo-400 focus:outline-none focus:border-indigo-500",
          open && "border-indigo-500 ring-1 ring-indigo-500/30"
        )}
      >
        <Mail className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="flex-1 truncate text-left text-theme-fg">
          {loading
            ? "Loading accounts…"
            : selected
            ? `${selected.display_name} <${selected.email_address}>`
            : "Select sender account"}
        </span>
        {!isLocked && <ChevronDown className={cn("h-4 w-4 text-theme-muted shrink-0 transition-transform", open && "rotate-180")} />}
      </button>

      {open && sendable.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-theme-border bg-theme-card shadow-xl py-1 max-h-64 overflow-y-auto">
          {sendable.map(acc => (
            <button
              key={acc.email_address}
              type="button"
              onClick={() => { onChange(acc); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-theme-page transition-colors",
                value === acc.email_address && "bg-indigo-50 dark:bg-indigo-950/30"
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 text-xs font-bold uppercase">
                {acc.display_name?.[0] || "M"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-theme-fg truncate">{acc.display_name}</span>
                <span className="block text-xs text-theme-muted truncate">{acc.email_address}</span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-theme-page text-theme-muted shrink-0">
                {acc.is_personal ? "Personal" : "Shared"}
              </span>
              {value === acc.email_address && <Check className="h-4 w-4 text-indigo-500 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
