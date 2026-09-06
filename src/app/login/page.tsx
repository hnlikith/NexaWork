"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth, getDashboardForRole, type Role } from "@/components/layout/AuthProvider";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/ButtonLegacy";
import { Mail, Lock, ShieldCheck, ArrowRight, Eye, EyeOff, Info } from "lucide-react";
import { Badge } from "@/components/ui/BadgeLegacy";
import { useToast } from "@/components/ui/ToastLegacy";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent opacity-60" /></div>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const { user, loading: authLoading, login } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams?.get("next");
  const pwdChanged = searchParams?.get("pwd") === "changed";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  // Pre-fill company email stored before signOut in ChangePasswordModal
  useEffect(() => {
    const stored = sessionStorage.getItem("nexus_post_pwd_email");
    if (stored) {
      setEmail(stored);
      sessionStorage.removeItem("nexus_post_pwd_email");
    }
  }, []);

  // Redirect already-authenticated users to their dashboard
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(nextPath && nextPath.startsWith("/") ? nextPath : getDashboardForRole(user.role as Role));
    }
  }, [user, authLoading, router, nextPath]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      showToast("Access Granted. Welcome back to NexaWork.", "success");
    } catch (err: any) {
      const msg = err.message || "Authentication failed. Please check your credentials.";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-theme-page p-6 selection:bg-theme-primary/10">
      <div className="w-full max-w-[400px] space-y-6">
        
        {/* Branding */}
        <div className="flex flex-col items-center text-center space-y-4 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-theme-primary text-theme-surface font-black text-xl shadow-lg shadow-black/5 ring-4 ring-theme-surface">
            N
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-theme-fg">NexaWork</h1>
            <p className="text-xs font-semibold text-theme-muted uppercase tracking-widest mt-1">Enterprise Operations Panel</p>
          </div>
        </div>

        {/* Login Card */}
        <div className="page-card shadow-2xl shadow-black/[0.03] border-theme-border/60 bg-theme-surface p-8">
          <div className="mb-8 border-b border-theme-border pb-5 -mx-8 px-8">
            <h2 className="text-sm font-black text-theme-fg uppercase tracking-wider">Internal Sign In</h2>
            <p className="text-[11px] text-theme-muted mt-1 font-medium">Access your financial administration dashboard</p>
          </div>

          {pwdChanged && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3">
              <Info size={14} className="mt-0.5 flex-shrink-0 text-sky-400" />
              <p className="text-[11px] font-semibold text-sky-300 leading-relaxed">
                Password updated. Please log in with your <span className="font-black text-sky-200">professional (company) email</span> from now on. Personal email access has been disabled.
              </p>
            </div>
          )}



          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-theme-muted px-1">
                Corporate Email
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none transition-colors group-focus-within:text-theme-fg">
                  <Mail className="h-4 w-4 text-theme-subtle" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="field pl-10 h-11 text-xs font-semibold bg-theme-raised/30 border-theme-border/80 focus:bg-theme-surface focus:border-theme-strong transition-all"
                  placeholder="name@nexawork.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-theme-muted">
                  Security Password
                </label>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none transition-colors group-focus-within:text-theme-fg">
                  <Lock className="h-4 w-4 text-theme-subtle" />
                </div>
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="field pl-10 pr-10 h-11 text-xs font-semibold bg-theme-raised/30 border-theme-border/80 focus:bg-theme-surface focus:border-theme-strong transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-subtle hover:text-theme-fg transition-colors"
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <Button 
                type="submit" 
                loading={loading} 
                className="w-full h-11 text-xs font-black uppercase tracking-widest bg-theme-primary text-theme-surface rounded-xl shadow-md shadow-theme-primary/10 transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              Authorize Access
              {!loading && <ArrowRight className="h-3.5 w-3.5 ml-2" />}
            </Button>
          </form>

          <div className="mt-8 pt-5 border-t border-theme-border/60 flex items-center justify-between">
            <a 
              href={`/forgot-credentials?email=${encodeURIComponent(email)}`} 
              className="text-[11px] font-bold text-theme-muted hover:text-theme-fg transition-colors"
            >
              Forgot credentials?
            </a>
            <Badge variant="success" className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/10 py-1 px-3">
              <ShieldCheck size={10} className="mr-1.5" /> System Secure
            </Badge>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex flex-col items-center gap-2 pt-2 opacity-50">
          <p className="text-[10px] font-black text-theme-subtle uppercase tracking-[0.25em]">
            Confidential · IP Restricted
          </p>
          <div className="flex items-center gap-3 text-[10px] font-bold text-theme-muted">
             <span>v2.1.0-preview</span>
             <span className="h-1 w-1 rounded-full bg-theme-border" />
             <span>NexaWork</span>
          </div>
          <div className="text-[9px] text-theme-muted text-center leading-tight mt-1">
             © 2026 NexaWork
             <br />Covered under AGPL 3.
          </div>
        </div>
      </div>
    </div>
  );
}
