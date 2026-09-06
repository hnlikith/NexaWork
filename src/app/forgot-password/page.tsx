"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState } from "react";
import Link from "next/link";
import axios from "axios";
import { Button } from "@/components/ui/ButtonLegacy";
import { Mail, ArrowLeft, Activity, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await axios.post("/api/auth/forgot-password", { email });
      setSent(true);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-theme-page px-4">
      {/* Card */}
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 shadow-lg">
            <Activity size={22} className="text-sky-400" />
          </div>
          <span className="text-base font-bold text-theme-fg">NexaWork Panel</span>
        </div>

        {sent ? (
          /* Success state */
          <div className="rounded-2xl border border-theme-border bg-theme-surface p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 size={28} className="text-emerald-600" />
            </div>
            <h2 className="mb-2 text-lg font-bold text-theme-fg">Check your email</h2>
            <p className="mb-6 text-sm text-theme-muted leading-relaxed">
              We sent a password reset link to <span className="font-semibold text-theme-fg">{email}</span>.
              It expires in 30 minutes.
            </p>
            <p className="mb-6 text-xs text-theme-subtle">
              Didn't receive it? Check your spam folder or{" "}
              <button onClick={() => { setSent(false); setEmail(""); }} className="font-semibold text-sky-600 hover:text-sky-500 transition-colors">
                try again
              </button>.
            </p>
            <Link href="/login">
              <Button variant="secondary" className="w-full">
                <ArrowLeft size={14} className="mr-1.5" /> Back to Sign In
              </Button>
            </Link>
          </div>
        ) : (
          /* Form state */
          <div className="rounded-2xl border border-theme-border bg-theme-surface p-8 shadow-sm">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-theme-fg">Reset password</h1>
              <p className="mt-1 text-sm text-theme-muted">
                Enter your work email and we'll send you a reset link.
              </p>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-red-200/60 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">!</div>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-theme-fg">Work Email</label>
                <div className="relative">
                  <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-subtle" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="name@your-company.com"
                    className="field pl-10 py-2.5"
                  />
                </div>
              </div>

              <Button type="submit" loading={loading} variant="primary" className="w-full py-2.5 text-sm font-semibold">
                Send Reset Link
              </Button>
            </form>

            <div className="mt-5 text-center">
              <Link href="/login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-muted hover:text-theme-fg transition-colors">
                <ArrowLeft size={13} /> Back to Sign In
              </Link>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] font-medium uppercase tracking-widest text-theme-subtle">
          Confidential · Internal use only
        </p>
      </div>
    </div>
  );
}
