"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useRef, useState } from "react";
import { useAuth, getDashboardForRole, type Role } from "@/components/layout/AuthProvider";
import { CheckCircle2, Loader2, Mail, ShieldCheck, ArrowRight } from "lucide-react";

const REDIRECT_SECONDS = 6;

export default function ZohoActivatedPage() {
  const { user, loading } = useAuth();
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);
  const [confirmed, setConfirmed] = useState(false);
  const ran = useRef(false);

  // Once the session has hydrated, confirm activation (stamp + send email) exactly
  // once, then start the countdown. Reaching this page means Zoho accepted the
  // sign-in, so this is the genuine activation moment.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.replace("/login");
      return;
    }
    if (ran.current) return;
    ran.current = true;

    const dashboard = getDashboardForRole(user.role as Role);

    (async () => {
      try {
        await fetch("/api/auth/zoho-activate", { method: "POST" }).catch(() => {});
      } finally {
        setConfirmed(true);
        // Flag the destination so the dashboard installs a one-time Back-trap,
        // preventing the browser Back button from returning to the Zoho pages.
        try { sessionStorage.setItem("nexus_post_activation", "1"); } catch {}

        let s = REDIRECT_SECONDS;
        const timer = setInterval(() => {
          s -= 1;
          setSeconds(s);
          if (s <= 0) {
            clearInterval(timer);
            // Full-page replace: re-hydrates auth with the now-stamped flag (no
            // re-trigger) and removes this page from history so Back can't return here.
            window.location.replace(dashboard);
          }
        }, 1000);
      }
    })();
  }, [user, loading]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground text-background font-black text-lg shadow-sm">N</div>
          <h1 className="mt-3 text-base font-bold tracking-tight text-foreground">NexaWork</h1>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Enterprise Operations Panel
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              {confirmed ? (
                <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              ) : (
                <Loader2 className="h-9 w-9 animate-spin text-emerald-500" />
              )}
            </div>

            <h2 className="mt-5 text-xl font-bold tracking-tight text-foreground">
              {confirmed ? "Zoho mailbox activated" : "Verifying your Zoho sign-in…"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {confirmed
                ? "Single sign-on is set up and your company mailbox is live. You can send and receive company email right inside NexaWork."
                : "Please wait while we confirm your secure session with Zoho."}
            </p>
          </div>

          {/* Checklist */}
          <div className="mt-6 space-y-2.5">
            {[
              { icon: Mail, label: "Company mailbox provisioned & live" },
              { icon: ShieldCheck, label: "SAML single sign-on active" },
              { icon: CheckCircle2, label: "Sign-in recorded in your organization directory" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3"
              >
                <Icon className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                <span className="text-[13px] font-medium text-foreground">{label}</span>
              </div>
            ))}
          </div>

          {/* Countdown / redirect */}
          <div className="mt-7 flex items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground">
            {confirmed ? (
              <>
                <span>Taking you to your workspace in {seconds}s</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
              style={{ width: confirmed ? `${((REDIRECT_SECONDS - seconds) / REDIRECT_SECONDS) * 100}%` : "0%" }}
            />
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Secure session · NexaWork
        </p>
      </div>
    </div>
  );
}
