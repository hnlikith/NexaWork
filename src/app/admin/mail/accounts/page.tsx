"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/ToastLegacy";
import { cn } from "@/lib/utils";
import {
  Mail, Users, Plus, Search, RefreshCw, Check, X, Loader2,
  Zap, UserCheck, AlertTriangle, Copy, Globe, ShieldCheck, Clock, AlertCircle,
} from "lucide-react";

type MailAccount = {
  id: string;
  user_id: string;
  zoho_account_id: string | null;
  email_address: string;
  display_name: string;
  access_type: string;
  created_at: string;
  employee: { id: string; name: string; email: string; designation: string } | null;
};

type ZohoUser = {
  accountId: string | null;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  domain: string;
  lastLogin: string | null;
  neverSignedIn: boolean;
  lastClient: string | null;
  mailboxStatus: string | null;
  accountCreationTime: string | null;
};

type Employee = {
  id: string;
  name: string;
  email: string;
  designation: string;
};

function getInitials(name: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function MailAccountsPage() {
  const { showToast } = useToast();

  const [accounts,     setAccounts]     = useState<MailAccount[]>([]);
  const [zohoUsers,    setZohoUsers]    = useState<ZohoUser[]>([]);
  const [zohoDomain,   setZohoDomain]   = useState("your-company.com");
  const [loading,      setLoading]      = useState(true);
  const [zohoLoading,  setZohoLoading]  = useState(true);
  const [connected,    setConnected]    = useState(false);
  const [search,       setSearch]       = useState("");
  const [zohoSearch,   setZohoSearch]   = useState("");
  const [showCreate,   setShowCreate]   = useState(false);
  const [creating,     setCreating]     = useState(false);
  const [activeTab,    setActiveTab]    = useState<"local" | "zoho">("zoho");

  // Manual creation form
  const [selEmpId,    setSelEmpId]    = useState("");
  const [empSearch,   setEmpSearch]   = useState("");
  const [empResults,  setEmpResults]  = useState<Employee[]>([]);
  const [customEmail, setCustomEmail] = useState("");
  const [useCustom,   setUseCustom]   = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, configRes, domainRes] = await Promise.all([
        fetch("/api/mail/accounts/create-employee"),
        fetch("/api/mail/auth/connect"),
        fetch("/api/mail/config/domain"),
      ]);
      const accountsData = await accountsRes.json();
      const configData   = await configRes.json();
      const domainData   = await domainRes.json();
      setAccounts(accountsData.data || []);
      setConnected(configData.config?.is_connected === true);
      if (domainData.current_domain) setZohoDomain(domainData.current_domain);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadZohoUsers = useCallback(async () => {
    setZohoLoading(true);
    try {
      const res  = await fetch("/api/mail/accounts/zoho-users");
      const data = await res.json();
      setZohoUsers(data.users || []);
      if (data.domain) setZohoDomain(data.domain);
    } finally {
      setZohoLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadZohoUsers();
  }, [loadAccounts, loadZohoUsers]);

  async function searchEmployees(q: string) {
    setEmpSearch(q);
    if (!q || q.length < 2) { setEmpResults([]); return; }
    const { data } = await supabase
      .from("employees")
      .select("id,name,email,designation")
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);
    setEmpResults(data || []);
  }

  function selectEmployee(emp: Employee) {
    setSelEmpId(emp.id);
    setEmpSearch(emp.name);
    setEmpResults([]);
    if (!useCustom) {
      const parts = emp.name.trim().toLowerCase().split(/\s+/);
      const local = parts.length >= 2 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0];
      setCustomEmail(`${local}@${zohoDomain}`);
    }
  }

  async function handleCreate() {
    if (!selEmpId) { showToast("Select an employee first.", "warning"); return; }
    setCreating(true);
    try {
      const emp  = empResults.find(e => e.id === selEmpId);
      const body: Record<string, string> = {
        employee_id: selEmpId,
        name:        emp?.name || "",
        domain:      zohoDomain,
      };
      if (useCustom && customEmail) body.email = customEmail;

      const res  = await fetch("/api/mail/accounts/create-employee", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        if (data.already_exists) {
          showToast(`Already provisioned: ${data.email_address}`, "info");
        } else {
          showToast(`Zoho Mail created: ${data.email_address}`, "success");
        }
        setShowCreate(false);
        setSelEmpId(""); setEmpSearch(""); setCustomEmail(""); setUseCustom(false);
        loadAccounts();
        loadZohoUsers();
      } else {
        showToast(data.error || "Failed to create mail account.", "error");
      }
    } finally {
      setCreating(false);
    }
  }

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email);
    showToast("Copied!", "success");
  }

  function closeModal() {
    setShowCreate(false);
    setSelEmpId(""); setEmpSearch(""); setEmpResults([]); setCustomEmail(""); setUseCustom(false);
  }

  const filteredLocal = accounts.filter(a => {
    const q = search.toLowerCase();
    return !q || a.email_address.toLowerCase().includes(q) || a.display_name.toLowerCase().includes(q);
  });

  const filteredZoho = zohoUsers.filter(u => {
    const q = zohoSearch.toLowerCase();
    return !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q);
  });

  const activeCount = zohoUsers.filter(u => u.isActive).length;

  return (
    <DashboardShell
      moduleKey="mail_accounts"
      title="Mail Accounts"
      subtitle="Manage Zoho Mail accounts provisioned for your employees."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadAccounts(); loadZohoUsers(); }}
            disabled={loading || zohoLoading}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-theme-border bg-theme-raised text-xs font-semibold text-theme-muted hover:text-theme-fg transition-all"
          >
            <RefreshCw size={13} className={loading || zohoLoading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            disabled={!connected}
            title={!connected ? "Connect Zoho Mail first (Mail Config)" : ""}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={13} /> Create Account
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Zoho Users",     value: zohoUsers.length, icon: Users,     color: "text-theme-fg",    bg: "bg-theme-raised" },
            { label: "Active",         value: activeCount,       icon: UserCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Inactive",       value: zohoUsers.length - activeCount, icon: X, color: "text-rose-500", bg: "bg-rose-500/10" },
            { label: "Local Records",  value: accounts.length,  icon: Zap,       color: "text-blue-500",    bg: "bg-blue-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="page-card flex items-center gap-3">
              <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
                <Icon size={16} className={color} />
              </div>
              <div>
                <p className="text-xs text-theme-muted">{label}</p>
                <p className={cn("text-xl font-bold leading-tight", color)}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Active domain pill */}
        {zohoDomain && (
          <div className="flex items-center gap-2">
            <Globe size={13} className="text-theme-muted" />
            <span className="text-xs text-theme-muted">Active domain:</span>
            <span className="text-xs tabular-nums font-bold text-theme-primary bg-theme-primary/10 px-2 py-0.5 rounded-full">
              @{zohoDomain}
            </span>
          </div>
        )}

        {/* Not connected banner */}
        {!loading && !connected && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-600 dark:text-amber-400">Zoho Mail Not Connected</p>
              <p className="text-xs text-theme-muted mt-0.5">
                Go to <strong className="text-theme-fg">Comms → Mail Config</strong> to connect Zoho Mail before provisioning accounts.
              </p>
            </div>
          </div>
        )}

        {/* Never Signed In info banner — explains Zoho admin console limitation */}
        {connected && zohoUsers.some(u => u.neverSignedIn) && (
          <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <AlertCircle size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-500">About "Never Signed In" Status</p>
              <p className="text-xs text-theme-muted leading-relaxed">
                Some users show <strong className="text-amber-500">Never Signed In</strong> in Zoho Admin Console.
                This status updates only when users directly sign into{" "}
                <strong className="text-theme-fg">mail.zoho.in</strong> via browser — it cannot be triggered via API.
                Ask affected employees to open Zoho Mail once directly to activate their account session.
              </p>
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-theme-raised rounded-xl w-fit border border-theme-border">
          {(["zoho", "local"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                activeTab === tab
                  ? "bg-theme-surface text-theme-fg shadow-sm"
                  : "text-theme-muted hover:text-theme-fg"
              )}
            >
              {tab === "zoho" ? `Zoho Console Users (${zohoUsers.length})` : `Local Records (${accounts.length})`}
            </button>
          ))}
        </div>

        {/* Zoho Console Users */}
        {activeTab === "zoho" && (
          <div className="page-card p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-theme-border bg-theme-raised/30">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-500" />
                <p className="text-xs font-bold text-theme-fg">
                  Zoho Admin Console — Users (@{zohoDomain})
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" size={13} />
                <input
                  value={zohoSearch}
                  onChange={e => setZohoSearch(e.target.value)}
                  placeholder="Search users..."
                  className="h-8 w-56 rounded-lg border border-theme-border bg-theme-page pl-8 pr-3 text-xs text-theme-fg outline-none focus:border-theme-primary transition-all"
                />
              </div>
            </div>

            {zohoLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-theme-muted" />
              </div>
            ) : filteredZoho.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <Users size={32} className="mx-auto text-theme-muted opacity-30" />
                <p className="text-sm font-semibold text-theme-fg">
                  {connected ? "No users found in Zoho Admin Console" : "Connect Zoho to see users"}
                </p>
                <p className="text-xs text-theme-muted">
                  {connected
                    ? "Create accounts for employees using the \"Create Account\" button above."
                    : "Go to Comms → Mail Config to connect your Zoho account."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border bg-theme-page text-left text-xs font-semibold text-theme-muted">
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Email Address</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Last Sign In</th>
                      <th className="px-5 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border/30">
                    {filteredZoho.map((u, i) => (
                      <tr key={u.accountId || i} className="group hover:bg-theme-raised/30 transition-all duration-200">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-theme-primary text-theme-surface text-[10px] font-bold shadow-sm flex-shrink-0">
                              {getInitials(u.name)}
                            </div>
                            <p className="text-xs font-semibold text-theme-fg">{u.name}</p>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs tabular-nums text-theme-fg">{u.email}</span>
                            <button
                              onClick={() => copyEmail(u.email)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-theme-raised text-theme-muted hover:text-theme-fg transition-all"
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs text-theme-muted capitalize">{u.role}</span>
                        </td>
                        <td className="px-5 py-3">
                          {u.neverSignedIn ? (
                            <div className="flex items-center gap-1.5">
                              <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
                              <span className="text-[10px] font-bold text-amber-500">Never Signed In</span>
                            </div>
                          ) : u.lastLogin ? (
                            <div className="flex items-center gap-1.5">
                              <Clock size={11} className="text-emerald-500 flex-shrink-0" />
                              <span className="text-[10px] font-semibold text-theme-muted" title={u.lastLogin}>
                                {new Date(u.lastLogin).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-theme-muted">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={cn(
                            "rounded-lg px-2.5 py-1 text-[10px] font-black",
                            u.isActive
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-rose-500/10 text-rose-500"
                          )}>
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Local Provisioning Records */}
        {activeTab === "local" && (
          <div className="page-card p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-theme-border bg-theme-raised/30">
              <p className="text-xs font-bold text-theme-fg">
                {filteredLocal.length} local record{filteredLocal.length !== 1 ? "s" : ""}
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" size={13} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search accounts..."
                  className="h-8 w-60 rounded-lg border border-theme-border bg-theme-page pl-8 pr-3 text-xs text-theme-fg outline-none focus:border-theme-primary transition-all"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-theme-muted" />
              </div>
            ) : filteredLocal.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <Mail size={32} className="mx-auto text-theme-muted opacity-30" />
                <p className="text-sm font-semibold text-theme-fg">No local records found</p>
                <p className="text-xs text-theme-muted">
                  {connected
                    ? "Create an account to provision a Zoho Mail address."
                    : "Connect Zoho Mail first, then create accounts for your employees."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border bg-theme-page text-left text-xs font-semibold text-theme-muted">
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3">Mail Address</th>
                      <th className="px-5 py-3">Zoho Account ID</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border/30">
                    {filteredLocal.map(account => (
                      <tr key={account.id} className="group hover:bg-theme-raised/30 transition-all duration-200">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-theme-primary text-theme-surface text-[10px] font-bold shadow-sm">
                              {getInitials(account.display_name)}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-theme-fg">{account.display_name}</p>
                              <p className="text-[10px] text-theme-muted">{account.employee?.designation || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs tabular-nums text-theme-fg">{account.email_address}</span>
                            <button
                              onClick={() => copyEmail(account.email_address)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-theme-raised text-theme-muted hover:text-theme-fg transition-all"
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {account.zoho_account_id ? (
                            <span className="flex items-center gap-1.5 text-xs text-theme-muted tabular-nums">
                              <Zap size={11} className="text-blue-500" />
                              {account.zoho_account_id.slice(0, 16)}…
                            </span>
                          ) : (
                            <span className="text-xs text-amber-500 font-semibold">Pending Sync</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs text-theme-muted capitalize">{account.access_type?.replace("_", " ") || "owner"}</span>
                        </td>
                        <td className="px-5 py-3 text-xs text-theme-muted">
                          {new Date(account.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Account Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-theme-surface border border-theme-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Mail size={16} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-theme-fg">Create Zoho Mail Account</p>
                  <p className="text-xs text-theme-muted">Domain: <span className="tabular-nums text-theme-primary">@{zohoDomain}</span></p>
                </div>
              </div>
              <button onClick={closeModal}
                className="p-1.5 rounded-lg text-theme-muted hover:bg-theme-raised hover:text-theme-fg transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Employee Search */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-theme-muted flex items-center gap-1.5">
                  <Users size={11} /> Select Employee
                </label>
                <div className="relative">
                  <input
                    value={empSearch}
                    onChange={e => searchEmployees(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full h-10 px-3 rounded-xl border border-theme-border bg-theme-page text-sm text-theme-fg outline-none focus:border-theme-primary transition-all"
                  />
                  {empResults.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-xl border border-theme-border bg-theme-surface shadow-xl overflow-hidden">
                      {empResults.map(emp => (
                        <button key={emp.id} onClick={() => selectEmployee(emp)}
                          className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-theme-raised transition-all">
                          <div className="h-7 w-7 rounded-full bg-theme-primary flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                            {getInitials(emp.name)}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-theme-fg">{emp.name}</p>
                            <p className="text-[10px] text-theme-muted">{emp.designation} · {emp.email}</p>
                          </div>
                          {selEmpId === emp.id && <Check size={12} className="ml-auto text-theme-primary" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Email Preview */}
              {selEmpId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-theme-muted flex items-center gap-1.5">
                      <Mail size={11} /> Mail Address
                    </label>
                    <button onClick={() => setUseCustom(!useCustom)}
                      className="text-[10px] font-bold text-theme-primary hover:underline">
                      {useCustom ? "Use auto-generated" : "Customize"}
                    </button>
                  </div>
                  {useCustom ? (
                    <input
                      value={customEmail}
                      onChange={e => setCustomEmail(e.target.value)}
                      placeholder={`firstname.lastname@${zohoDomain}`}
                      className="w-full h-10 px-3 rounded-xl border border-theme-border bg-theme-page text-sm tabular-nums text-theme-fg outline-none focus:border-theme-primary transition-all"
                    />
                  ) : (
                    <div className="h-10 px-3 flex items-center rounded-xl border border-theme-border/50 bg-theme-raised text-sm tabular-nums text-theme-fg">
                      {customEmail || "—"}
                    </div>
                  )}
                  <p className="text-[10px] text-theme-muted">
                    Auto-generated from employee name · format: firstname.lastname@{zohoDomain}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={closeModal}
                  className="flex-1 h-10 rounded-xl border border-theme-border text-xs font-semibold text-theme-muted hover:text-theme-fg hover:bg-theme-raised transition-all">
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!selEmpId || creating}
                  className="flex-1 h-10 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creating ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  {creating ? "Creating…" : "Create Mail Account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
