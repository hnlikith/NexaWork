"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ShieldAlert, LogOut } from "lucide-react";
import { isPayrollInternOnly, PAYROLL_INTERN_HOME } from "@/lib/payroll-access";

// ─── Types ───────────────────────────────────────────────────

export type Role = "admin" | "hr" | "accounts" | "employee" | "intern" | "dept_lead" | "team_lead";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  employee_id: string;
  department: string;
  designation: string;
  is_dept_lead: boolean;
  is_team_lead: boolean;
  managed_department_id: string | null;
  managed_team_id: string | null;
  is_active?: boolean;
  deactivated_by?: string | null;
  deactivated_at?: string | null;
  deactivator?: {
    name: string;
    email: string;
    employee_id: string;
    role: string;
  } | null;
  zoho_email?: string | null;
  personal_email?: string | null;
  must_change_password?: boolean;
  zoho_activated_at?: string | null;
}

export function getDashboardForRole(role: Role): string {
  switch (role) {
    case "admin":    return "/admin";
    case "hr":       return "/hr";
    case "accounts": return "/accounts";
    case "employee":
    case "intern":
    case "dept_lead":
    case "team_lead":
    default:         return "/dashboard";
  }
}

export interface PermissionNode {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
}

// moduleKey → what the user can do
export type PermissionMap = Record<string, PermissionNode>;

interface AuthContextType {
  user: AuthUser | null;
  permissions: PermissionMap | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Helper — fetch effective permissions (role defaults merged with per-employee overrides) ─
async function fetchPermissions(role: string, employeeId?: string): Promise<PermissionMap | null> {
  try {
    const qs = new URLSearchParams({ role });
    if (employeeId) qs.set("employee_id", employeeId);
    const res = await fetch(`/api/permissions?${qs.toString()}`);
    if (!res.ok) return null;
    const { permissions } = await res.json();
    return permissions ?? null;
  } catch {
    return null;
  }
}

// ─── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]               = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [loading, setLoading]         = useState(true);
  const [isRemoved, setIsRemoved]     = useState(false);
  const [removedMessage, setRemovedMessage] = useState("");
  const router = useRouter();

  // Reload permissions for the currently logged-in user
  const refreshPermissions = useCallback(async () => {
    if (!user) return;
    const perms = await fetchPermissions(user.role, user.id);
    setPermissions(perms);
  }, [user]);

  // On mount: hydrate from existing Supabase session
  useEffect(() => {
    let mounted = true;

    async function hydrateSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          const isStaleToken =
            error.message?.includes("Refresh Token") ||
            error.message?.includes("refresh_token") ||
            error.message?.includes("Invalid Refresh Token");

          if (isStaleToken) {
            // Expected: stale browser cookie after re-deploy or DB reset.
            // Sign out silently and send to login — no console.error so the
            // Next.js dev overlay doesn't surface this as a bug.
            await supabase.auth.signOut().catch(() => {});
            if (mounted) { setUser(null); setPermissions(null); }
            router.replace("/login");
            return;
          }
          // Unexpected error — log it
          console.warn("[AuthProvider] Session error:", error.message);
        }

        if (!session?.user) {
          if (mounted) setUser(null);
          return;
        }

        const { data: emp, error: empErr } = await supabase
          .from("employees")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (empErr) {
          if (empErr.message?.includes("not authorized") || empErr.code === "PGRST116") {
            await supabase.auth.signOut().catch(() => {});
            if (mounted) { setUser(null); setPermissions(null); }
            router.replace("/login?error=unauthorized");
            return;
          }
          console.warn("[AuthProvider] Profile load error:", empErr.message);
        }

        if (emp && !empErr && mounted) {
          setUser(emp as AuthUser);
          const perms = await fetchPermissions(emp.role, emp.id);
          if (mounted) setPermissions(perms);
        } else if (mounted) {
          setUser(null);
        }
      } catch (err: any) {
        const isStaleToken =
          err.message?.includes("Refresh Token") ||
          err.message?.includes("refresh_token") ||
          err.message?.includes("Invalid Refresh Token");

        if (isStaleToken) {
          await supabase.auth.signOut().catch(() => {});
          if (mounted) { setUser(null); setPermissions(null); }
          router.replace("/login");
        } else {
          console.warn("[AuthProvider] Hydration error:", err.message);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    hydrateSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
          if (event === "SIGNED_OUT") {
            setUser(null);
            setPermissions(null);
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Real-time permissions sync — listens for DB changes on the role_permissions table.
  // When an admin saves permissions for a role, all logged-in users with that role
  // receive the update and immediately re-fetch their permissions.
  useEffect(() => {
    if (!user?.role) return;

    const channel = supabase
      .channel("permissions_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_permissions", filter: `role=eq.${user.role}` },
        async () => {
          const perms = await fetchPermissions(user.role, user.id);
          if (perms) setPermissions(perms);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_permissions", filter: `employee_id=eq.${user.id}` },
        async () => {
          const perms = await fetchPermissions(user.role, user.id);
          if (perms) setPermissions(perms);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.role, user?.id]);

  // Real-time employee status sync — listens to account activation/deactivation & deletion in real-time
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`employee_status_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employees", filter: `id=eq.${user.id}` },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            setIsRemoved(true);
            setRemovedMessage("You have been removed from the organization or company.");
            await supabase.auth.signOut();
          } else if (payload.eventType === "UPDATE") {
            const nextActive = payload.new.is_active;
            const nextStatus = payload.new.status;
            const nextDeactivatedBy = payload.new.deactivated_by;

            if (nextActive === false || nextStatus === "disabled") {
              setIsRemoved(true);
              setRemovedMessage("Your account has been deactivated. Please contact your administrator.");
              await supabase.auth.signOut();
            } else if (nextActive === true) {
              setUser(prev => prev ? { 
                ...prev, 
                is_active: true, 
                deactivated_by: null, 
                deactivated_at: null,
                deactivator: null 
              } as any : null);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const login = useCallback(async (email: string, password: string) => {
    // 1. Run server-side pre-login checks to bypass RLS and apply onboarding guards
    const preLoginRes = await fetch("/api/auth/pre-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const preLoginData = await preLoginRes.json();
    if (!preLoginRes.ok) {
      throw new Error(preLoginData.error || "Authorization check failed.");
    }

    const { emailToAuth, isProfessionalLogin, zoho_email } = preLoginData;

    // 2. Authenticate against Supabase Auth using the correct identity email returned by the server
    let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailToAuth,
      password,
    });

    // Fallback: if it fails, try signing in with their original input email (for legacy users)
    if ((authError || !authData.user) && emailToAuth !== email) {
      const retry = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (retry.data?.user && !retry.error) {
        authData = retry.data;
        authError = null;
      }
    }

    if (authError || !authData.user) {
      throw new Error(authError?.message || "Invalid credentials");
    }

    // 3. Fetch employee profile (since we are authenticated, the SELECT policy will permit this read)
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("*")
      .eq("id", authData.user.id)
      .single();

    if (empErr || !emp) {
      throw new Error("Unable to retrieve employee profile.");
    }

    setUser(emp as AuthUser);

    // Load permissions immediately after login (merged with per-employee overrides)
    const perms = await fetchPermissions(emp.role, emp.id);
    setPermissions(perms);

    // Persist the iron-session (np_session) server-side on EVERY successful login.
    // This cookie is the ONLY identity the server-side SAML route can read, so it
    // MUST always reflect the user who just logged in. Previously it was saved only
    // inside the activation branch below — meaning personal-email logins, already-
    // activated users, and admins never refreshed it, so a stale userId from a prior
    // session lingered (7-day cookie) and made /api/auth/saml/sso resolve the wrong
    // user or none at all → the "User profile not found" blank page.
    try {
      const { data: sbSession } = await supabase.auth.getSession();
      if (sbSession?.session?.access_token) {
        await fetch("/api/auth/save-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token:  sbSession.session.access_token,
            refresh_token: sbSession.session.refresh_token,
            employee_id:   emp.id,
            role:          emp.role,
            email:         emp.email,
          }),
        });
      }
    } catch (e) {
      console.warn("[auth] save-session failed:", e);
    }

    // 4. Always route to dashboard — ChangePasswordModal blocks the UI if must_change_password is true.
    //    Payroll-intern accounts are scoped to the internship module only.
    const targetRoute = isPayrollInternOnly(emp.email)
      ? PAYROLL_INTERN_HOME
      : getDashboardForRole(emp.role as Role);

    if (isPayrollInternOnly(emp.email)) {
      await fetch("/api/interns/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "intern.login", summary: "Logged in" }),
      }).catch(() => {});
    }

    // 6. FIRST company-mail login → ONE-TIME full-page Zoho SSO hand-off.
    //    Flips the user's Zoho "Last Sign In" from "Never signed in" → a real
    //    timestamp. A top-level navigation (not a hidden iframe) is required so
    //    Zoho can set its own session cookie + record the authentication. Zoho
    //    accepts our signed assertion (correct ACS = accounts.zoho.in/signin/
    //    samlsp/<id>, audience = zoho.in) and then redirects back to our
    //    dashboard. The server SAML route stamps zoho_activated_at + sends the
    //    confirmation email, so this fires EXACTLY ONCE and never again.
    //    np_session was just refreshed above, so the route resolves THIS user.
    const alreadyActivated = Boolean((emp as any).zoho_activated_at);
    const needsZohoActivation =
      isProfessionalLogin &&
      (zoho_email || emp.zoho_email) &&
      !alreadyActivated &&
      !emp.must_change_password; // never hand off before the password is set

    if (needsZohoActivation) {
      // RelayState points at our activation landing page (NOT the dashboard): Zoho
      // returns there after accepting the sign-in, and that page confirms activation
      // (stamp + email), shows a themed screen, then redirects to the role dashboard.
      window.location.href = `/api/auth/saml/sso?RelayState=${encodeURIComponent("/auth/zoho-activated")}`;
      return; // full-page navigation — nothing after this runs
    }

    // Normal login (personal email, or an already-activated company user) → straight in.
    router.push(targetRoute);
  }, [router]);

  const logout = useCallback(async () => {
    if (user && isPayrollInternOnly(user.email)) {
      await fetch("/api/interns/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "intern.logout", summary: "Logged out" }),
      }).catch(() => {});
    }
    // Destroy the server-side iron-session (np_session) FIRST so a stale userId can
    // never linger and be picked up by the SAML route on the next person's login.
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    try { sessionStorage.removeItem("zoho_sso_seeded"); sessionStorage.removeItem("zoho_inbox_synced"); } catch {}
    await supabase.auth.signOut();
    setUser(null);
    setPermissions(null);
    router.push("/login");
  }, [router]);

  if (isRemoved) {
    return <RemovedOverlay message={removedMessage} />;
  }

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, refreshPermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

function RemovedOverlay({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 text-slate-100 font-sans">
      <div className="w-full max-w-md bg-slate-900 border border-red-500/20 rounded-3xl p-8 shadow-2xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="h-16 w-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-red-500/10">
          <ShieldAlert size={32} />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-black tracking-tight text-white uppercase">Access Revoked</h2>
          <p className="text-[10px] text-red-400 font-black uppercase tracking-widest">
            Security Policy Enforcement
          </p>
        </div>

        <p className="text-sm text-slate-400 leading-relaxed font-medium">
          {message}
        </p>

        <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-[11px] text-slate-500 leading-normal text-left font-medium space-y-1">
          <p className="font-bold text-slate-400">⚠️ NOTICE:</p>
          <p>Your workspace session has been terminated. You can no longer access company resources, logs, or correspondence from this device.</p>
        </div>

        <button
          onClick={() => {
            window.location.href = "/login?revoked=true";
          }}
          className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-red-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <LogOut size={14} />
          Exit Workspace
        </button>
      </div>
    </div>
  );
}
