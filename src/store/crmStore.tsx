"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { createContext, useContext, useState, ReactNode } from "react";
import React from "react";

export interface ConvertedClient {
  id: string;
  company: string;
  value: number;
  leadName: string;
  leadPhone: string;
  empName: string;
  empId: string;
  convertedDate: string;
  status: "Active" | "Pending" | "Churned";
  tier: "Strategic" | "Key Account" | "Standard";
  fromPipeline: boolean;
  gstin?: string;
  pan?: string;
  email?: string;
  address?: string;
}

interface CRMStoreType {
  convertedClients: ConvertedClient[];
  addConvertedClient: (client: ConvertedClient) => void;
  removeClient: (id: string) => void;
}

const CRMStoreContext = createContext<CRMStoreType | null>(null);

const SEED_CLIENTS: ConvertedClient[] = [
  { id: "CL-001", company: "Zomato Private Limited", leadName: "Rahul Jain", leadPhone: "+91 98765 43210", value: 4500000, empName: "Vijay Kumar", empId: "EMP-402", convertedDate: "Apr 05, 2026", status: "Active", tier: "Key Account", fromPipeline: false },
  { id: "CL-002", company: "Rivian Automotive", leadName: "Sarah M.", leadPhone: "+1 415 555-0100", value: 1250000, empName: "Ananya Sharma", empId: "EMP-215", convertedDate: "Apr 08, 2026", status: "Active", tier: "Strategic", fromPipeline: false },
  { id: "CL-003", company: "Paytm Payments Bank", leadName: "Vivek Goyal", leadPhone: "+91 97000 00000", value: 850000, empName: "Rohan Das", empId: "EMP-108", convertedDate: "Mar 28, 2026", status: "Active", tier: "Standard", fromPipeline: false },
  { id: "CL-004", company: "BYJU'S Learning", leadName: "Sneha R.", leadPhone: "+91 96000 00000", value: 3200000, empName: "Vijay Kumar", empId: "EMP-402", convertedDate: "Apr 01, 2026", status: "Active", tier: "Key Account", fromPipeline: false },
  { id: "CL-005", company: "Tesla Energy India", leadName: "Elon M.", leadPhone: "+1 650 555-0199", value: 45000000, empName: "Ananya Sharma", empId: "EMP-215", convertedDate: "Apr 07, 2026", status: "Active", tier: "Strategic", fromPipeline: false },
  { id: "CL-006", company: "Swiggy Limited", leadName: "Sriharsha M.", leadPhone: "+91 95000 00000", value: 1500000, empName: "Vijay Kumar", empId: "EMP-402", convertedDate: "Mar 15, 2026", status: "Churned", tier: "Standard", fromPipeline: false },
];

export function CRMProvider({ children }: { children: ReactNode }) {
  const [convertedClients, setConvertedClients] = useState<ConvertedClient[]>(SEED_CLIENTS);

  const addConvertedClient = (client: ConvertedClient) => {
    setConvertedClients(prev => [client, ...prev]);
  };

  const removeClient = (id: string) => {
    setConvertedClients(prev => prev.filter(c => c.id !== id));
  };

  return (
    <CRMStoreContext.Provider value={{ convertedClients, addConvertedClient, removeClient }}>
      {children}
    </CRMStoreContext.Provider>
  );
}

export function useCRMStore() {
  const ctx = useContext(CRMStoreContext);
  if (!ctx) throw new Error("useCRMStore must be used within a CRMProvider");
  return ctx;
}
