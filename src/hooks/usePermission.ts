"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useAuth } from "@/components/layout/AuthProvider";

export interface PermissionState {
  canView:   boolean;
  canCreate: boolean;
  canEdit:   boolean;
  canDelete: boolean;
  canExport: boolean;
}

/**
 * Returns the permission state for a given module key.
 * Falls back to full access when permissions haven't loaded yet
 * (DashboardShell blocks render during that window).
 * Super Admin always gets full access regardless of DB config.
 */
export function usePermission(moduleKey: string): PermissionState {
  const { user, permissions } = useAuth();

  if (user?.role === "admin") {
    return { canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true };
  }

  if (!permissions) {
    return { canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true };
  }

  const perm = permissions[moduleKey];
  if (!perm) {
    return { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false };
  }

  return {
    canView:   perm.can_view,
    canCreate: perm.can_create,
    canEdit:   perm.can_edit,
    canDelete: perm.can_delete,
    canExport: perm.can_export,
  };
}
