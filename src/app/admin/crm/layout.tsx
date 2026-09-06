"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { CRMProvider } from "@/store/crmStore";

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  return (
    <CRMProvider>
      {children}
    </CRMProvider>
  );
}
