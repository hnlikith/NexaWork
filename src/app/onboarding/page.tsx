"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, getDashboardForRole, type Role } from "@/components/layout/AuthProvider";

// Onboarding removed. First-login password setup is now handled by
// ChangePasswordModal inside DashboardShell.
export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    router.replace(getDashboardForRole(user.role as Role));
  }, [user, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
    </div>
  );
}
