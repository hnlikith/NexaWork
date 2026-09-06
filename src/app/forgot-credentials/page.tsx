"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/ToastLegacy";
import { Button } from "@/components/ui/ButtonLegacy";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mail, Key, Lock, ArrowRight, Loader2, ArrowLeft, CheckCircle2, ShieldCheck 
} from "lucide-react";
import { cn } from "@/lib/utils";

const PASSWORD_REQUIREMENTS = [
  { label: "Minimum 8 characters", check: (pw: string) => pw.length >= 8 },
  { label: "At least one uppercase letter (A-Z)", check: (pw: string) => /[A-Z]/.test(pw) },
  { label: "At least one lowercase letter (a-z)", check: (pw: string) => /[a-z]/.test(pw) },
  { label: "At least one number (0-9)", check: (pw: string) => /\d/.test(pw) },
  { label: "At least one special symbol (e.g. @, #, $, %)", check: (pw: string) => /[^A-Za-z0-9]/.test(pw) }
];

export default function ForgotCredentialsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-theme-page">
        <Loader2 className="animate-spin text-theme-primary h-8 w-8" />
      </div>
    }>
      <ForgotCredentialsInner />
    </Suspense>
  );
}

function ForgotCredentialsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [obscuredEmails, setObscuredEmails] = useState<string[]>([]);

  // Pre-fill email from query param if available
  useEffect(() => {
    const qEmail = searchParams?.get("email");
    if (qEmail) {
      setEmail(qEmail);
    }
  }, [searchParams]);

  // Request OTP code
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-credentials/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to request verification code.");
      }

      showToast(data.message, "success");
      setObscuredEmails(data.recipients || []);
      setStep("verify");
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP and reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password policy
    const metAll = PASSWORD_REQUIREMENTS.every(req => req.check(newPassword));
    if (!metAll) {
      showToast("Password does not meet all security requirements.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }

    if (!otp) {
      showToast("Verification code is required.", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-credentials/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to reset credentials.");
      }

      showToast("Password updated successfully across all accounts!", "success");
      setMessage("Your security credentials have been updated. You will be redirected to the sign-in page in a moment.");
      
      setTimeout(() => {
        router.push(`/login?email=${encodeURIComponent(email)}`);
      }, 4000);

    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-theme-page p-6 selection:bg-theme-primary/10">
      <div className="w-full max-w-[420px] space-y-6">
        
        {/* Branding */}
        <div className="flex flex-col items-center text-center space-y-4 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-theme-primary text-theme-surface font-black text-xl shadow-lg shadow-black/5 ring-4 ring-theme-surface">N</div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-theme-fg">NexaWork</h1>
            <p className="text-xs font-semibold text-theme-muted uppercase tracking-widest mt-1">Recovery Console</p>
          </div>
        </div>

        {/* Form Card */}
        <div className="page-card shadow-2xl shadow-black/[0.03] border-theme-border/60 bg-theme-surface p-8 relative overflow-hidden">
          
          {message ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6 py-6"
            >
              <div className="h-16 w-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-black text-theme-fg">Credentials Reset Complete</h3>
                <p className="text-xs text-theme-muted leading-relaxed px-4">
                  {message}
                </p>
              </div>
              <div className="h-1.5 w-full bg-theme-raised rounded-full overflow-hidden p-0.5 max-w-[200px] mx-auto">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 3.5, ease: "linear" }}
                  className="h-full bg-theme-primary rounded-full"
                />
              </div>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              {step === "request" ? (
                <motion.div
                  key="request"
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 15 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-sm font-black text-theme-fg uppercase tracking-wider">Forgot Credentials</h2>
                    <p className="text-[11px] text-theme-muted mt-1 font-medium leading-relaxed">
                      Enter your corporate or personal email below to request a security verification code.
                    </p>
                  </div>

                  <form onSubmit={handleRequestOTP} className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-wider text-theme-muted px-1">
                        Registered Email Address
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
                          className="field pl-10 h-11 text-xs font-semibold bg-theme-raised/30 border-theme-border/80 focus:bg-theme-surface focus:border-theme-strong transition-all"
                          placeholder="name@nexawork.com"
                        />
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      loading={loading} 
                      className="w-full h-11 text-xs font-black uppercase tracking-widest bg-theme-primary text-theme-surface rounded-xl shadow-md transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                      Send Verification Code
                      {!loading && <ArrowRight className="h-3.5 w-3.5 ml-2" />}
                    </Button>
                  </form>

                  <div className="mt-8 pt-5 border-t border-theme-border/60 flex items-center justify-between">
                    <button 
                      onClick={() => router.push("/login")}
                      className="text-[11px] font-bold text-theme-muted hover:text-theme-fg transition-colors flex items-center gap-1.5"
                    >
                      <ArrowLeft size={12} /> Back to Sign In
                    </button>
                    <span className="text-[10px] font-bold text-theme-subtle uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck size={12} /> Secure Auth
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="verify"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-sm font-black text-theme-fg uppercase tracking-wider">Security Verification</h2>
                    <p className="text-[11px] text-theme-muted mt-1 font-medium leading-relaxed">
                      A 6-digit OTP code has been dispatched. Enter it below along with your new password.
                    </p>
                    {obscuredEmails.length > 0 && (
                      <div className="mt-2.5 p-3 rounded-xl bg-theme-raised/40 border border-theme-border/60 text-[10px] text-theme-muted space-y-1.5 font-semibold">
                        <p className="text-theme-fg uppercase tracking-wider text-[9px] font-black">Dispatched to:</p>
                        {obscuredEmails.map((e, idx) => (
                          <p key={idx} className="font-mono flex items-center gap-1.5">
                            <span className="text-emerald-500">✓</span> {e}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleResetPassword} className="space-y-5">
                    {/* OTP field */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-wider text-theme-muted px-1">
                        One-Time Verification Code
                      </label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none transition-colors group-focus-within:text-theme-fg">
                          <Key className="h-4 w-4 text-theme-subtle" />
                        </div>
                        <input
                          type="text"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          maxLength={6}
                          required
                          className="field pl-10 h-11 text-xs font-bold tracking-[0.25em] text-center bg-theme-raised/30 border-theme-border/80 focus:bg-theme-surface focus:border-theme-strong transition-all font-mono"
                          placeholder="••••••"
                        />
                      </div>
                    </div>

                    {/* New Password field */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-wider text-theme-muted px-1">
                        New Security Password
                      </label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none transition-colors group-focus-within:text-theme-fg">
                          <Lock className="h-4 w-4 text-theme-subtle" />
                        </div>
                        <input
                          type={showPwd ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          className="field pl-10 pr-10 h-11 text-xs font-semibold bg-theme-raised/30 border-theme-border/80 focus:bg-theme-surface focus:border-theme-strong transition-all"
                          placeholder="Enter new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd(!showPwd)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-subtle hover:text-theme-fg transition-colors"
                        >
                          {showPwd ? "Hide" : "Show"}
                        </button>
                      </div>

                      {/* Password Requirements Checklist */}
                      <div className="pt-2 pb-1.5 space-y-1.5 bg-theme-raised/40 p-3 rounded-xl border border-theme-border/40 text-[10px]">
                        <p className="text-[9px] font-black text-theme-muted uppercase tracking-wider">Password Requirements:</p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {PASSWORD_REQUIREMENTS.map((req, idx) => {
                            const isMet = req.check(newPassword);
                            return (
                              <div key={idx} className="flex items-center gap-2 font-bold transition-all">
                                <div className={cn(
                                  "h-3.5 w-3.5 rounded-full flex items-center justify-center border transition-all text-[8px]",
                                  isMet 
                                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-500 font-extrabold" 
                                    : "bg-theme-surface border-theme-border text-theme-muted"
                                )}>
                                  {isMet ? "✓" : "○"}
                                </div>
                                <span className={cn(
                                  "transition-colors",
                                  isMet ? "text-emerald-600 dark:text-emerald-400" : "text-theme-muted"
                                )}>
                                  {req.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Confirm Password field */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-wider text-theme-muted px-1">
                        Confirm Security Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className={cn(
                          "field h-11 text-xs font-semibold bg-theme-raised/30 transition-all",
                          confirmPassword && newPassword !== confirmPassword 
                            ? "border-red-500 focus:border-red-500" 
                            : "border-theme-border/80 focus:border-theme-strong"
                        )}
                        placeholder="Confirm new password"
                      />
                      {confirmPassword && newPassword !== confirmPassword && (
                        <p className="text-[10px] font-bold text-red-500 mt-1 flex items-center gap-1 animate-pulse">
                          <span>⚠️</span> Passwords do not match
                        </p>
                      )}
                    </div>

                    <Button 
                      type="submit" 
                      loading={loading} 
                      disabled={!otp || newPassword !== confirmPassword || !PASSWORD_REQUIREMENTS.every(r => r.check(newPassword))}
                      className="w-full h-11 text-xs font-black uppercase tracking-widest bg-theme-primary text-theme-surface rounded-xl shadow-md transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                      Update Credentials
                      {!loading && <ArrowRight className="h-3.5 w-3.5 ml-2" />}
                    </Button>
                  </form>

                  <div className="mt-8 pt-5 border-t border-theme-border/60 flex items-center justify-between">
                    <button 
                      onClick={() => setStep("request")}
                      className="text-[11px] font-bold text-theme-muted hover:text-theme-fg transition-colors flex items-center gap-1.5"
                    >
                      <ArrowLeft size={12} /> Request code again
                    </button>
                    <span className="text-[10px] font-bold text-theme-subtle uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck size={12} /> Secure Auth
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}

        </div>

        {/* Footer info */}
        <div className="flex flex-col items-center gap-2 pt-2 opacity-50">
          <p className="text-[10px] font-black text-theme-subtle uppercase tracking-[0.25em]">
            Confidential · Recovery System
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
