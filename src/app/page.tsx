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
import { isPayrollInternOnly, PAYROLL_INTERN_HOME } from "@/lib/payroll-access";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // Payroll-intern accounts are scoped to the internship module only.
    if (isPayrollInternOnly(user.email)) {
      router.replace(PAYROLL_INTERN_HOME);
      return;
    }
    // Root page just routes to the role's dashboard.
    router.replace(getDashboardForRole(user.role as Role));
  }, [user, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
    </div>
  );
}
