"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Lock, Eye, EyeOff, ShieldCheck, ArrowRight } from "lucide-react";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function Req({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${met ? "text-emerald-600 dark:text-emerald-400" : "text-theme-subtle"}`}>
      <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 transition-colors ${met ? "bg-emerald-500" : "bg-theme-border"}`} />
      {label}
    </div>
  );
}

export function ChangePasswordModal() {
  const { user } = useAuth();
  const router = useRouter();
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!user?.must_change_password) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!PASSWORD_REGEX.test(newPwd)) {
      setError("Password must be 8+ characters with uppercase, lowercase, number, and symbol.");
      return;
    }
    if (newPwd !== confirmPwd) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: authErr } = await supabase.auth.updateUser({ password: newPwd });
      if (authErr) throw new Error(authErr.message);

      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user!.id, newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Password update failed.");

      setDone(true);
      setTimeout(async () => {
        const companyEmail = user?.email ?? "";
        // Store before signOut so it survives the navigation
        if (companyEmail) sessionStorage.setItem("nexus_post_pwd_email", companyEmail);
        await supabase.auth.signOut();
        router.replace("/login?pwd=changed");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Overlay — light blur, dashboard stays visible behind */
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-theme-fg/10 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-[420px] page-card shadow-2xl shadow-black/10 border-theme-border/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="border-b border-theme-border px-8 py-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-theme-primary/10 text-theme-primary flex-shrink-0">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black text-theme-fg uppercase tracking-wider">Secure Your Account</h2>
            <p className="text-[11px] text-theme-muted font-medium mt-0.5">Set a new password to activate your workspace</p>
          </div>
        </div>

        <div className="px-8 py-6">
          {done ? (
            <div className="py-4 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                <ShieldCheck size={22} />
              </div>
              <div>
                <p className="text-sm font-black text-theme-fg">Password Updated</p>
                <p className="mt-2 text-[11px] text-theme-muted leading-relaxed">
                  Logging you out now. Use your{" "}
                  <span className="font-bold text-theme-primary">company email</span>{" "}
                  <span className="font-mono font-semibold">({user?.email})</span>{" "}
                  to log back in.
                </p>
              </div>
              <p className="text-[10px] text-theme-subtle">Redirecting in 3 seconds…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Notice */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 leading-relaxed">
                  This is your first login. Set a strong password to unlock your dashboard. After this,
                  your personal email login will be disabled — use{" "}
                  <span className="font-mono font-black">{user?.email}</span>.
                </p>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-theme-muted px-1">
                  New Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                    <Lock size={14} className="text-theme-subtle" />
                  </div>
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="field pl-10 pr-10 h-11 text-xs font-semibold w-full bg-theme-raised/30 border-theme-border/80 focus:bg-theme-surface focus:border-theme-strong transition-all"
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-subtle hover:text-theme-fg transition-colors">
                    {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-theme-muted px-1">
                  Confirm Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                    <Lock size={14} className="text-theme-subtle" />
                  </div>
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="field pl-10 pr-10 h-11 text-xs font-semibold w-full bg-theme-raised/30 border-theme-border/80 focus:bg-theme-surface focus:border-theme-strong transition-all"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-subtle hover:text-theme-fg transition-colors">
                    {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {confirmPwd && newPwd !== confirmPwd && (
                  <p className="text-[10px] font-semibold text-red-500 px-1">Passwords do not match</p>
                )}
              </div>

              {/* Requirements grid */}
              <div className="grid grid-cols-2 gap-1.5 px-1">
                <Req met={newPwd.length >= 8}          label="8+ characters" />
                <Req met={/[A-Z]/.test(newPwd)}        label="Uppercase letter" />
                <Req met={/[a-z]/.test(newPwd)}        label="Lowercase letter" />
                <Req met={/\d/.test(newPwd)}            label="Number" />
                <Req met={/[^A-Za-z0-9]/.test(newPwd)} label="Symbol (!@#$…)" />
              </div>

              {error && (
                <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !PASSWORD_REGEX.test(newPwd) || newPwd !== confirmPwd}
                className="w-full h-11 rounded-xl bg-theme-primary text-theme-surface text-xs font-black uppercase tracking-widest shadow-md shadow-theme-primary/10 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <>Set Password & Continue <ArrowRight size={14} /></>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
