"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useAuth, getDashboardForRole, type Role } from "./AuthProvider";
import { Sidebar } from "./Sidebar";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { GlobalAttendanceWidget } from "./GlobalAttendanceWidget";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { InternActivityTracker } from "./InternActivityTracker";
import { isPayrollInternOnly, isPayrollInternPathAllowed, PAYROLL_INTERN_HOME } from "@/lib/payroll-access";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getPresenceSessionId } from "@/lib/log-ui";

interface DashboardShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  // Single key, or several acceptable keys (access granted if ANY is viewable) —
  // used for pages a role can reach under more than one nav entry (e.g. Academy).
  moduleKey?: string | string[];
}

export function DashboardShell({ children, title, subtitle, actions, moduleKey }: DashboardShellProps) {
  const { user, permissions, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // 1. One-time Zoho SAML activation for already-logged-in users whose Zoho
  //    "Last Sign In" hasn't been seeded yet (covers returning sessions where the
  //    login() hand-off didn't just run). ONE-TIME full-page hand-off to the SAML
  //    route: a top-level navigation lets Zoho set its session cookie and record
  //    the sign-in, so "Last Sign In" flips in the Admin Console (a hidden iframe
  //    could not). Zoho accepts the assertion and redirects back here. Gated on
  //    the server's zoho_activated_at (stamped by the route) so it fires exactly
  //    once and never for users who haven't set their password yet.
  useEffect(() => {
    if (!user || user.must_change_password) return;
    if (!user.zoho_email) return;
    if (user.zoho_activated_at) return; // already activated (server source of truth)
    if (sessionStorage.getItem("zoho_sso_seeded") === user.zoho_email) return;
    sessionStorage.setItem("zoho_sso_seeded", user.zoho_email);

    (async () => {
      try {
        // Make sure the server-side np_session reflects THIS user before we hit the
        // SAML route (covers returning sessions where login() didn't just run).
        const { data: sb } = await supabase.auth.getSession();
        if (sb?.session?.access_token) {
          await fetch("/api/auth/save-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: sb.session.access_token,
              refresh_token: sb.session.refresh_token,
              employee_id: user.id,
              role: user.role,
              email: user.email,
            }),
          }).catch(() => {});
        }
        window.location.href = `/api/auth/saml/sso?RelayState=${encodeURIComponent("/auth/zoho-activated")}`;
      } catch { /* non-fatal — activation will retry on next session */ }
    })();
  }, [user]);

  // 1b. One-time Back-trap after Zoho activation. The activation landing page sets
  //     this flag right before redirecting here. While the user sits on this freshly
  //     activated dashboard, intercept Back so it can't navigate to the Zoho sign-in
  //     pages still sitting in browser history. It self-clears: the flag is removed
  //     immediately, and the listener is torn down when the user navigates onward.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("nexus_post_activation") !== "1") return;
    sessionStorage.removeItem("nexus_post_activation");

    window.history.pushState(null, "", window.location.href);
    const onPop = () => window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // 2. Automate inbox sync fetch on successful return from session seeding
  useEffect(() => {
    if (user?.zoho_email && sessionStorage.getItem("zoho_sso_seeded") === user.zoho_email && sessionStorage.getItem("zoho_inbox_synced") !== user.zoho_email) {
      sessionStorage.setItem("zoho_inbox_synced", user.zoho_email);
      fetch(`/api/mail/inbox?sync=true&employee_id=${user.id}`).catch(() => {});
    }
  }, [user]);

  // Presence heartbeat — marks the user active + their EXACT current screen for
  // Workspace Monitor / Sessions. Fires immediately on every route change (so the
  // live "current screen" updates instantly, no refresh needed) and every 30s as a
  // keep-alive. Sending the current pathname resolves to a friendly screen name.
  useEffect(() => {
    if (!user) return;
    const ping = () =>
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: pathname || (typeof window !== "undefined" ? window.location.pathname : null),
          device_id: getPresenceSessionId(),
        }),
      }).catch(() => {});
    ping();
    const t = setInterval(ping, 30000);
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [user, pathname]);

  // Redirect away when not authenticated
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Payroll-intern accounts may ONLY be on the internship pages — bounce them
  // back to the internship home from anywhere else (hard scope, independent of role).
  useEffect(() => {
    if (loading || !user) return;
    if (isPayrollInternOnly(user.email) && !isPayrollInternPathAllowed(pathname)) {
      router.replace(PAYROLL_INTERN_HOME);
    }
  }, [user, loading, pathname, router]);

  // Real-time permission guard — a module is accessible ONLY if the role has an
  // explicit can_view=true. The permission map is fully seeded (every role × every
  // module has a row), so a MISSING or FALSE permission both mean "no access" — this
  // blocks typing the URL directly, not just hiding the item from the sidebar. We
  // never bounce a user off their own role home, to avoid any redirect loop.
  useEffect(() => {
    if (!moduleKey || !user || !permissions) return;
    if (user.role === "admin") return; // admin is the apex role — always allowed
    const isPayrollIntern = isPayrollInternOnly(user.email);
    const keys = Array.isArray(moduleKey) ? moduleKey : [moduleKey];
    if (!keys.length) return;
    const canView = keys.some((k) => {
      if (isPayrollIntern && k === "payroll_internship") return true;
      return !!permissions[k]?.can_view;
    });
    if (canView) return;
    const home = isPayrollIntern ? PAYROLL_INTERN_HOME : getDashboardForRole(user.role as Role);
    if (pathname !== home) router.replace(home);
  }, [permissions, moduleKey, user, router, pathname]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Loading…</p>
        </div>
      </div>
    );
  }

  // Access check at RENDER time — never paint restricted content (not even for one
  // frame) before the redirect effect above fires. By the time `loading` is false,
  // permissions are already loaded, so this is reliable. We never block a user's own
  // role home (pathname === home) to avoid a blank-screen loop.
  const gateKeys = moduleKey ? (Array.isArray(moduleKey) ? moduleKey : [moduleKey]) : [];
  const isPayrollIntern = user ? isPayrollInternOnly(user.email) : false;
  const homePath = isPayrollIntern ? PAYROLL_INTERN_HOME : getDashboardForRole(user?.role as Role);
  const accessDenied =
    user &&
    user.role !== "admin" && // admin always allowed
    gateKeys.length > 0 &&
    !!permissions &&
    pathname !== homePath &&
    !gateKeys.some((k) => {
      if (isPayrollIntern && k === "payroll_internship") return true;
      return !!permissions[k]?.can_view;
    });
  if (accessDenied) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Redirecting…</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <ChangePasswordModal />
    {user && <InternActivityTracker />}
    <SidebarProvider>
      <Sidebar />
      <SidebarInset className="bg-background overflow-x-hidden min-w-0">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 sm:px-6 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1 min-w-0">
            {title && <h1 className="text-base sm:text-lg font-semibold text-foreground tracking-tight leading-tight truncate">{title}</h1>}
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 leading-snug truncate">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {actions && (
              <div className="flex items-center gap-2">
                {actions}
              </div>
            )}
            <GlobalAttendanceWidget />
          </div>
        </header>

        <div className="flex-1 overflow-x-hidden p-4 sm:p-5 lg:p-6">
          <div className="mx-auto w-full max-w-[1400px]">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
    </>
  );
}
