"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { useApi } from "@/hooks/useApi";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { formatCurrency, cn } from "@/lib/utils";
import dayjs from "@/lib/dayjs";
import { toast } from "sonner";
import {
  Mail,
  Briefcase,
  Calendar,
  Award,
  TrendingUp,
  Users,
  FileText,
  ArrowLeft,
  DollarSign,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Target,
  Trophy,
  Zap,
  AlertTriangle,
  Loader2,
} from "lucide-react";

interface Employee {
  id: string; name: string; email: string; employee_id: string;
  role: string; department: string; designation: string; team_id?: string;
  joining_date?: string; employment_type?: string; salary_structure?: string;
  base_salary?: number; salary_min?: number; salary_max?: number; salary_step?: number;
  hourly_rate?: number; daily_rate?: number; stipend_amount?: number;
  kpi_weight?: number; kra_weight?: number; behavioral_weight?: number;
  kpi_enabled?: boolean; enable_salary_linkage?: boolean; is_active: boolean;
  commission_enabled?: boolean;
  monthly_sales_target?: number;
  salary_slab_id?: string;
  zoho_email?: string | null;
  zoho_account_id?: string | null;
  zoho_activated_at?: string | null;
}

interface KpiScore {
  id: string; kpi_score: number; kra_score: number; behavioral_score: number; final_score: number; month: number; year: number;
}

interface WalletData { earned_total: number; locked_amount: number; claimable_amount: number; this_month_payout?: number }
interface TeamData   { id: string; name: string; department: string }

interface SalesRecord {
  id: string; employee_id: string; month: number; year: number;
  amount_achieved: number; notes?: string;
}

interface SalarySlab {
  id: string; name: string; min_target: number; max_target: number | null;
  commission_percent: number; sort_order: number;
}

// ── Enterprise Sales Performance Tracker ────────────────────────────
function SalesTracker({
  achieved,
  target,
  slabs,
}: {
  achieved: number;
  target: number;
  slabs: SalarySlab[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 150); return () => clearTimeout(t); }, []);

  const pct       = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;
  const remaining = Math.max(0, target - achieved);
  const activeSlab = slabs.filter(s => s.min_target <= achieved).at(-1) ?? null;
  const estimatedCommission = activeSlab ? (achieved * activeSlab.commission_percent) / 100 : 0;

  const checkpoints = slabs
    .map(s => ({
      ...s,
      posPct:  target > 0 ? Math.min(100, (s.min_target / target) * 100) : 0,
      cleared: achieved >= s.min_target,
    }))
    .filter(s => s.posPct <= 100);

  const pctColor =
    pct >= 100 ? "#10b981" :
    pct >= 75  ? "#0ea5e9" :
    pct >= 50  ? "#f59e0b" : "#f97316";

  return (
    <div className="page-card overflow-hidden p-0" style={{ borderColor: "rgba(249,115,22,0.25)" }}>
      <style>{`
        @keyframes stShimmer {
          0%   { left: -80%; }
          100% { left: 130%; }
        }
        @keyframes stLiveDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes stFillGlow {
          0%, 100% { filter: brightness(1); }
          50%       { filter: brightness(1.15); }
        }
        @keyframes stCardIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Branded Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #431407 0%, #7c2d12 60%, #9a3412 100%)",
        padding: "14px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(249,115,22,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "8px", flexShrink: 0,
            background: "rgba(249,115,22,0.25)",
            border: "1px solid rgba(249,115,22,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}>
            <Target size={17} style={{ color: "#fb923c" }} />
          </div>
          <div>
            <p style={{ color: "#fed7aa", fontSize: "12px", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>
              Sales Performance
            </p>
            <p style={{ color: "#fdba74", fontSize: "10px", opacity: 0.7, marginTop: "2px" }}>
              {dayjs().format("MMMM YYYY")} · Commission Tracker
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {pct >= 100 && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: "20px", padding: "3px 10px" }}>
              <Trophy size={10} style={{ color: "#34d399" }} />
              <span style={{ color: "#34d399", fontSize: "9px", fontWeight: 900, letterSpacing: "0.08em" }}>TARGET HIT</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.35)", borderRadius: "20px", padding: "4px 10px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fb923c", animation: "stLiveDot 1.6s ease-in-out infinite" }} />
            <span style={{ color: "#fb923c", fontSize: "9px", fontWeight: 900, letterSpacing: "0.1em" }}>LIVE</span>
          </div>
        </div>
      </div>

      {/* ── 4-Stat Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid rgba(249,115,22,0.12)" }}>
        {[
          {
            label: "ACHIEVED",
            value: `₹${achieved.toLocaleString("en-IN")}`,
            color: "#f97316",
            sub: "This month",
            bg: "rgba(249,115,22,0.04)",
            border: "rgba(249,115,22,0.15)",
          },
          {
            label: "TARGET",
            value: `₹${target.toLocaleString("en-IN")}`,
            color: "inherit",
            sub: "Monthly goal",
            bg: "transparent",
            border: "transparent",
          },
          {
            label: "PROGRESS",
            value: `${pct.toFixed(1)}%`,
            color: pctColor,
            sub: remaining > 0 ? `₹${remaining.toLocaleString("en-IN")} left` : "Goal reached!",
            bg: "transparent",
            border: "transparent",
          },
          {
            label: "EST. COMMISSION",
            value: `₹${Math.round(estimatedCommission).toLocaleString("en-IN")}`,
            color: "#10b981",
            sub: activeSlab ? `${activeSlab.commission_percent}% rate` : "No slab active",
            bg: "rgba(16,185,129,0.04)",
            border: "rgba(16,185,129,0.15)",
          },
        ].map((s, i) => (
          <div key={i} style={{
            padding: "14px 18px",
            borderRight: i < 3 ? "1px solid rgba(249,115,22,0.1)" : "none",
            background: s.bg,
            animation: `stCardIn 0.4s ease-out ${i * 0.07}s both`,
          }}>
            <p style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "0.1em", color: "#94a3b8", textTransform: "uppercase", marginBottom: "5px" }}>
              {s.label}
            </p>
            <p style={{ fontSize: i === 0 || i === 3 ? "18px" : "20px", fontWeight: 900, color: s.color, fontFamily: "'SF Mono', 'Fira Code', monospace", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              {s.value}
            </p>
            <p style={{ fontSize: "9px", color: "#94a3b8", marginTop: "3px" }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Progress Bar Section ── */}
      <div style={{ padding: "18px 20px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <p style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", textTransform: "uppercase" }}>
            Commission Milestones
          </p>
          <p style={{ fontSize: "10px", color: "#94a3b8" }}>
            {pct.toFixed(1)}% of target
          </p>
        </div>

        {/* 3D Tube Bar */}
        <div style={{
          position: "relative",
          height: "44px",
          borderRadius: "8px",
          overflow: "hidden",
          background: "linear-gradient(180deg, #0d1117 0%, #161b22 45%, #0d1117 100%)",
          boxShadow: "inset 0 3px 8px rgba(0,0,0,0.6), inset 0 -2px 4px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)",
          border: "1px solid rgba(0,0,0,0.4)",
        }}>
          {/* Track depth lines */}
          {[25, 50, 75].map(p => (
            <div key={p} style={{ position: "absolute", left: `${p}%`, top: 0, height: "100%", width: "1px", background: "rgba(255,255,255,0.03)" }} />
          ))}

          {/* Glowing fill */}
          <div style={{
            position: "absolute",
            left: "3px", top: "4px", bottom: "4px",
            width: mounted ? `calc(${Math.max(pct, 0.5)}% - 6px)` : "3px",
            borderRadius: "5px",
            background: pct >= 100
              ? "linear-gradient(90deg, #047857, #059669, #10b981, #34d399)"
              : "linear-gradient(90deg, #9a3412, #c2410c, #ea580c, #f97316, #fb923c)",
            boxShadow: pct >= 100
              ? "0 0 20px rgba(16,185,129,0.7), 0 0 40px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.25)"
              : "0 0 20px rgba(249,115,22,0.7), 0 0 40px rgba(249,115,22,0.3), inset 0 1px 0 rgba(255,255,255,0.25)",
            transition: "width 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            animation: pct > 0 ? "stFillGlow 2.5s ease-in-out infinite" : "none",
            overflow: "hidden",
          }}>
            {/* 3D top bevel */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 100%)", borderRadius: "5px 5px 0 0" }} />
            {/* Shimmer sweep */}
            {pct > 4 && (
              <div style={{
                position: "absolute", top: 0, bottom: 0,
                width: "35%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
                animation: "stShimmer 2.6s ease-in-out infinite",
              }} />
            )}
          </div>

          {/* Checkpoint notches */}
          {checkpoints.slice(1).map(cp => (
            cp.posPct < 99 && (
              <div key={cp.id} style={{
                position: "absolute", left: `${cp.posPct}%`,
                top: 0, height: "100%", width: "1px",
                background: cp.cleared ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.07)",
                zIndex: 2,
              }} />
            )
          ))}

          {/* % label riding on fill */}
          {pct > 10 && (
            <div style={{
              position: "absolute",
              right: `${100 - Math.min(pct, 97)}%`,
              top: "50%", transform: "translateY(-50%)",
              fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.9)",
              paddingRight: "8px", zIndex: 3, letterSpacing: "-0.02em",
              textShadow: "0 1px 4px rgba(0,0,0,0.5)",
            }}>
              {pct.toFixed(0)}%
            </div>
          )}
        </div>
      </div>

      {/* ── Milestone Cards Grid ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(checkpoints.length, 1)}, 1fr)`,
        gap: "10px",
        padding: "14px 20px 18px",
      }}>
        {checkpoints.map((cp, idx) => {
          const isActive = cp.id === activeSlab?.id;
          return (
            <div
              key={cp.id}
              style={{
                borderRadius: "8px",
                border: isActive
                  ? "1px solid rgba(249,115,22,0.45)"
                  : cp.cleared
                  ? "1px solid rgba(16,185,129,0.3)"
                  : "1px solid rgba(148,163,184,0.15)",
                background: isActive
                  ? "linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(234,88,12,0.06) 100%)"
                  : cp.cleared
                  ? "rgba(16,185,129,0.05)"
                  : "rgba(148,163,184,0.04)",
                padding: "10px 12px",
                position: "relative",
                overflow: "hidden",
                animation: `stCardIn 0.4s ease-out ${idx * 0.08 + 0.2}s both`,
                boxShadow: isActive ? "0 0 12px rgba(249,115,22,0.15)" : "none",
              }}
            >
              {/* Active badge */}
              {isActive && (
                <div style={{
                  position: "absolute", top: "5px", right: "5px",
                  fontSize: "7px", fontWeight: 900, letterSpacing: "0.05em",
                  background: "linear-gradient(90deg, #ea580c, #f97316)",
                  color: "white", padding: "2px 5px", borderRadius: "3px",
                  boxShadow: "0 1px 4px rgba(249,115,22,0.4)",
                }}>
                  ACTIVE
                </div>
              )}

              {/* Icon + name */}
              <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "6px" }}>
                {cp.cleared
                  ? <Trophy size={13} style={{ color: isActive ? "#f97316" : "#10b981", flexShrink: 0 }} />
                  : <div style={{ width: "13px", height: "13px", borderRadius: "3px", border: "1.5px solid #475569", flexShrink: 0 }} />
                }
                <span style={{
                  fontSize: "9px", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase",
                  color: isActive ? "#ea580c" : cp.cleared ? "#10b981" : "#64748b",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {cp.name.split("(")[0].trim()}
                </span>
              </div>

              {/* Commission % */}
              <p style={{
                fontSize: "22px", fontWeight: 900, lineHeight: 1,
                color: isActive ? "#f97316" : cp.cleared ? "#10b981" : "#475569",
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                letterSpacing: "-0.03em",
              }}>
                {cp.commission_percent}%
              </p>

              {/* Threshold */}
              <p style={{ fontSize: "9px", color: "#64748b", marginTop: "3px" }}>
                {cp.min_target > 0 ? `≥ ₹${cp.min_target.toLocaleString("en-IN")}` : "Base tier"}
              </p>

              {/* Status chip */}
              <div style={{ marginTop: "7px" }}>
                <span style={{
                  fontSize: "8px", fontWeight: 800, letterSpacing: "0.06em",
                  padding: "2px 6px", borderRadius: "3px",
                  background: isActive ? "rgba(249,115,22,0.15)" : cp.cleared ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.1)",
                  color: isActive ? "#f97316" : cp.cleared ? "#10b981" : "#94a3b8",
                }}>
                  {isActive ? "⚡ EARNING" : cp.cleared ? "✓ CLEARED" : "○ LOCKED"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bottom Commission Strip ── */}
      <div style={{
        borderTop: "1px solid rgba(249,115,22,0.12)",
        background: "linear-gradient(90deg, rgba(249,115,22,0.05) 0%, transparent 60%)",
        padding: "11px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: activeSlab ? "#f97316" : "#64748b", animation: activeSlab ? "stLiveDot 1.6s ease-in-out infinite" : "none" }} />
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>
              {activeSlab ? (
                <><span style={{ color: "#f97316" }}>{activeSlab.name}</span> · {activeSlab.commission_percent}% commission rate</>
              ) : (
                "No slab reached yet"
              )}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "10px", color: "#64748b" }}>Est. earnings:</span>
          <span style={{ fontSize: "14px", fontWeight: 900, color: "#10b981", letterSpacing: "-0.02em" }}>
            ₹{Math.round(estimatedCommission).toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {achieved === 0 && (
        <div style={{ borderTop: "1px solid rgba(148,163,184,0.1)", padding: "9px 20px", textAlign: "center" }}>
          <p style={{ fontSize: "10px", color: "#64748b", fontStyle: "italic" }}>
            No sales recorded yet this month — your manager will update your progress.
          </p>
        </div>
      )}
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  employee: "Employee",
  hr: "HR",
  accounts: "Accounts",
  admin: "Admin",
  intern: "Intern",
  dept_lead: "Department Lead",
  team_lead: "Team Lead",
  sales: "Sales",
};

// ── Main Profile Page ─────────────────────────────────────
export default function EmployeeProfile() {
  const { user } = useAuth();
  const { request } = useApi();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [kpiScore, setKpiScore] = useState<KpiScore | null>(null);
  const [wallet, setWallet]   = useState<WalletData | null>(null);
  const [team, setTeam]       = useState<TeamData | null>(null);
  const [onboarding, setOnboarding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [salesRecord, setSalesRecord] = useState<SalesRecord | null>(null);
  const [salarySlabs, setSalarySlabs] = useState<SalarySlab[]>([]);
  const [activatingZoho, setActivatingZoho] = useState(false);
  const [reprovisioningZoho, setReprovisioningZoho] = useState(false);

  // Clicking the "Not Activated" badge launches the one-time Zoho SAML hand-off.
  // Refresh np_session first (so the SAML route resolves THIS user), then full-page
  // navigate. Zoho verifies → /auth/zoho-activated confirms + redirects to dashboard,
  // and the badge flips to green on return.
  const handleActivateZoho = useCallback(async () => {
    if (activatingZoho || !user) return;
    setActivatingZoho(true);
    try {
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
      // Zoho refuses to redirect the SAML sign-in back to a non-public host
      // (localhost, LAN IPs) and shows "Website Access Blocked". On such hosts the
      // real Zoho hand-off can't complete, so we finish activation locally and land
      // on the confirmation page (which auto-redirects to the dashboard). The full
      // SAML flow still runs on the live domain (configured via NEXT_PUBLIC_SITE_URL) so Zoho records
      // the actual sign-in / "Last Sign In".
      const host = window.location.hostname;
      const isNonPublicHost =
        host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" ||
        host.endsWith(".local") ||
        /^10\./.test(host) || /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host);
      if (isNonPublicHost) {
        window.location.href = "/auth/zoho-activated";
        return;
      }
      window.location.href = `/api/auth/saml/sso?RelayState=${encodeURIComponent("/auth/zoho-activated")}`;
    } catch {
      setActivatingZoho(false);
    }
  }, [activatingZoho, user]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let currentEmployee: Employee | null = null;

      try {
        const empRes = await request<any>({ url: `/api/employees/${user.id}` });
        if (empRes?.data) {
          currentEmployee = empRes.data as Employee;
          setEmployee(currentEmployee);
          setUsingFallback(false);
        } else {
          throw new Error("No data");
        }
      } catch {
        currentEmployee = { id: user.id, name: user.name, email: user.email, employee_id: user.employee_id, role: user.role, department: user.department || "Not assigned", designation: user.designation || "Not specified", is_active: true };
        setEmployee(currentEmployee);
        setUsingFallback(true);
      }

      try {
        const kpiRes = await request<any>({ url: `/api/kpi?employeeId=${user.id}&month=${dayjs().month() + 1}&year=${dayjs().year()}` });
        if (kpiRes?.data?.[0]) setKpiScore(kpiRes.data[0] as KpiScore);
      } catch {}

      try {
        const walletRes = await request<{ wallet: WalletData }>({ url: "/api/wallet" });
        if (walletRes?.wallet) setWallet(walletRes.wallet);
      } catch {}

      if (currentEmployee?.team_id) {
        try {
          const { data: teamData } = await supabase
            .from("teams")
            .select("id, name, department")
            .eq("id", currentEmployee.team_id)
            .single();
          if (teamData) setTeam(teamData as TeamData);
        } catch {}
      }

      // Load sales data if this is a sales employee
      if (currentEmployee?.commission_enabled) {
        try {
          const [salesRes, slabsRes] = await Promise.all([
            fetch(`/api/sales-records?employeeId=${user.id}&month=${dayjs().month() + 1}&year=${dayjs().year()}`),
            fetch("/api/salary-slabs"),
          ]);
          const salesData = await salesRes.json();
          const slabsData = await slabsRes.json();
          if (salesData.records?.[0]) setSalesRecord(salesData.records[0]);
          if (slabsData.slabs?.length) setSalarySlabs(slabsData.slabs);
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  }, [user, request]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Red "Zoho Setup Failed" badge → re-run provisioning. The mailbox was never
  // created in Zoho (zoho_account_id is null), so this must CREATE it first — it
  // does NOT do SAML (SAML needs an existing mailbox). On success the profile
  // reloads and the badge flips to amber "Not Activated", ready for Activate Now.
  const handleReprovisionZoho = useCallback(async () => {
    if (reprovisioningZoho || !user) return;
    setReprovisioningZoho(true);
    try {
      const res = await fetch(`/api/employees/${user.id}/provision-zoho`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not create the Zoho mailbox.");
        return;
      }
      toast.success("Zoho mailbox created. Click \"Activate Now\" to finish setup.");
      await loadProfile();
    } catch {
      toast.error("Re-provisioning failed. Please try again.");
    } finally {
      setReprovisioningZoho(false);
    }
  }, [reprovisioningZoho, user, loadProfile]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`employee_${user.id}`)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "employees", filter: `id=eq.${user.id}` }, () => {
        const el = document.createElement("div");
        el.innerHTML = `<div style="position:fixed;top:20px;right:20px;background:#ef4444;color:white;padding:16px;border-radius:8px;z-index:9999;">Your profile was deleted. Logging out…</div>`;
        document.body.appendChild(el);
        setTimeout(() => supabase.auth.signOut().then(() => { window.location.href = "/login"; }), 2000);
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [user?.id]);

  return (
    <DashboardShell
      moduleKey="my_profile"
      title="My Profile"
      subtitle="Your professional information and performance overview."
      actions={
        <Link href="/dashboard">
          <Button variant="secondary" size="sm">
            <ArrowLeft size={13} className="mr-1.5" /> Back
          </Button>
        </Link>
      }
    >
      <div className="space-y-5">

        {usingFallback && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/10">
            <span className="mt-0.5 text-amber-600 text-sm font-bold shrink-0">!</span>
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Incomplete Profile Data</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                Profile is still syncing. Salary and employment details will appear once fully synchronized.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-theme-raised" />)}
          </div>
        ) : employee ? (
          <>
            {/* Header Card */}
            <div className="page-card flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-theme-primary text-theme-surface text-lg font-black">
                  {employee.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-black text-theme-fg leading-tight">{employee.name}</h2>
                  <p className="text-sm text-theme-muted mt-0.5">{employee.designation || "—"}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      employee.is_active
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-red-500/10 text-red-500"
                    )}>
                      <span className={cn("h-1 w-1 rounded-full", employee.is_active ? "bg-emerald-500" : "bg-red-500")} />
                      {employee.is_active ? "Active" : "Inactive"}
                    </span>
                    {employee.commission_enabled ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                        <TrendingUp size={10} /> Sales
                      </span>
                    ) : (
                      <span className="rounded-md bg-theme-raised px-2 py-0.5 text-[11px] font-semibold text-theme-muted">
                        {employee.role}
                      </span>
                    )}
                    {employee.employment_type && (
                      <span className="rounded-md bg-theme-raised px-2 py-0.5 text-[11px] font-semibold text-theme-muted capitalize">
                        {employee.employment_type.replace(/_/g, " ")}
                      </span>
                    )}
                    {/* Zoho mailbox activation status */}
                    {employee.zoho_email && (
                      employee.zoho_activated_at ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                          <CheckCircle2 size={11} /> Zoho Activated
                        </span>
                      ) : employee.zoho_account_id ? (
                        <button
                          type="button"
                          onClick={handleActivateZoho}
                          disabled={activatingZoho}
                          title="Click to activate your Zoho mailbox"
                          className="group inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 cursor-pointer transition-all hover:bg-amber-500 hover:text-white hover:shadow-sm hover:shadow-amber-500/30 active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                        >
                          {activatingZoho ? (
                            <><Loader2 size={11} className="animate-spin" /> Activating…</>
                          ) : (
                            <>
                              <Clock size={11} className="group-hover:hidden" />
                              <Zap size={11} className="hidden group-hover:inline" />
                              <span className="group-hover:hidden">Zoho Not Activated</span>
                              <span className="hidden group-hover:inline">Activate Now →</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleReprovisionZoho}
                          disabled={reprovisioningZoho}
                          title="Zoho mailbox was never created. Click to re-run setup."
                          className="group inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-500 cursor-pointer transition-all hover:bg-red-500 hover:text-white hover:shadow-sm hover:shadow-red-500/30 active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                        >
                          {reprovisioningZoho ? (
                            <><Loader2 size={11} className="animate-spin" /> Setting up…</>
                          ) : (
                            <>
                              <AlertTriangle size={11} className="group-hover:hidden" />
                              <Zap size={11} className="hidden group-hover:inline" />
                              <span className="group-hover:hidden">Zoho Setup Failed</span>
                              <span className="hidden group-hover:inline">Re-run setup →</span>
                            </>
                          )}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
              <Link href="/dashboard">
                <Button size="sm" variant="secondary">
                  Edit Profile
                </Button>
              </Link>
            </div>

            {/* Sales Performance Tracker — only for commission-enabled employees */}
            {employee.commission_enabled && employee.monthly_sales_target && (
              <SalesTracker
                achieved={salesRecord?.amount_achieved ?? 0}
                target={employee.monthly_sales_target}
                slabs={salarySlabs}
              />
            )}

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Contact */}
              <div className="page-card overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
                  <Mail size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Contact Information</h3>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <div>
                    <p className="text-xs text-theme-muted">Email Address</p>
                    <p className="text-sm font-semibold text-theme-fg mt-0.5 break-all">
                      {employee.zoho_email || employee.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-theme-muted">Employee ID</p>
                    <p className="text-sm tabular-nums font-bold text-theme-primary mt-0.5">{employee.employee_id}</p>
                  </div>
                  <div className="pt-2 border-t border-theme-border">
                    <a href={`mailto:${employee.zoho_email || employee.email}`}>
                      <Button variant="outline" size="sm" className="w-full">
                        <Mail size={12} className="mr-1.5" /> Send Email
                      </Button>
                    </a>
                  </div>
                </div>
              </div>

              {/* Professional */}
              <div className="page-card overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
                  <Briefcase size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Professional Details</h3>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <div>
                    <p className="text-xs text-theme-muted">Department</p>
                    <p className="text-sm font-semibold text-theme-fg mt-0.5">{employee.department || "Not assigned"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-theme-muted">Designation</p>
                    <p className="text-sm font-semibold text-theme-fg mt-0.5">{employee.designation || "Not specified"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-theme-muted">Matrix Role</p>
                    <p className="text-sm font-semibold text-theme-fg mt-0.5">
                      {employee.commission_enabled ? "Sales" : (ROLE_LABEL[employee.role] || employee.role || "Not specified")}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-theme-border">
                    <p className="text-xs text-theme-muted">Salary Structure</p>
                    <p className="text-sm font-semibold text-theme-fg mt-0.5 capitalize">
                      {employee.salary_structure?.replace(/_/g, " ") || "Not set"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Employment */}
              <div className="page-card overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
                  <Calendar size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Employment Information</h3>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <div>
                    <p className="text-xs text-theme-muted">Joining Date</p>
                    <p className="text-sm font-semibold text-theme-fg mt-0.5">
                      {employee.joining_date ? dayjs(employee.joining_date).format("DD MMMM YYYY") : "Not specified"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-theme-muted">Employment Type</p>
                    <p className="text-sm font-semibold text-theme-fg mt-0.5 capitalize">
                      {employee.employment_type?.replace(/_/g, " ") || "Not set"}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-theme-border">
                    <p className="text-xs text-theme-muted">Tenure</p>
                    <p className="text-sm font-bold text-theme-primary mt-0.5">
                      {employee.joining_date ? `${dayjs().diff(dayjs(employee.joining_date), "months")} months` : "N/A"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Team */}
              <div className="page-card overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
                  <Users size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Team Information</h3>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <div>
                    <p className="text-xs text-theme-muted">Team Name</p>
                    <p className="text-sm font-semibold text-theme-fg mt-0.5">{team?.name || "Not assigned to a team"}</p>
                  </div>
                  {team && (
                    <div>
                      <p className="text-xs text-theme-muted">Team Department</p>
                      <p className="text-sm font-semibold text-theme-fg mt-0.5">{team.department}</p>
                    </div>
                  )}
                  <div className="pt-2 border-t border-theme-border">
                    <Link href="/dashboard">
                      <Button variant="outline" size="sm" className="w-full">
                        <Briefcase size={12} className="mr-1.5" /> View Assigned Projects
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance & Financial */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* KPI */}
              <div className="page-card overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
                  <Award size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Current KPI Score</h3>
                </div>
                <div className="px-5 py-4">
                  {kpiScore ? (
                    <div className="space-y-3">
                      <div className="text-center py-2">
                        <p className="text-3xl font-black text-theme-primary">{kpiScore.final_score.toFixed(1)}%</p>
                        <p className="text-xs text-theme-muted mt-1">{dayjs().format("MMMM YYYY")}</p>
                      </div>
                      {[
                        { label: "KPI Score",        value: kpiScore.kpi_score,        color: "bg-sky-400" },
                        { label: "KRA Score",        value: kpiScore.kra_score,        color: "bg-emerald-400" },
                        { label: "Behavioral Score", value: kpiScore.behavioral_score, color: "bg-amber-400" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-theme-muted">{label}</span>
                            <span className="font-semibold text-theme-fg">{value.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-theme-raised">
                            <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-theme-subtle py-4 text-center">No KPI data available</p>
                  )}
                </div>
              </div>

              {/* Financial Overview */}
              <div className="page-card overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
                  <DollarSign size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Financial Overview</h3>
                </div>
                <div className="px-5 py-4">
                  {wallet ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-theme-primary/10 border border-theme-primary/20 mb-2">
                         <div>
                            <p className="text-[10px] uppercase font-black tracking-widest text-theme-primary/80">Monthly Settlement</p>
                            <p className="text-2xl font-black text-theme-fg">{formatCurrency(wallet.this_month_payout || 0)}</p>
                            <p className="text-[9px] font-bold text-theme-muted mt-1 uppercase tracking-tighter">Current month payout calculated</p>
                         </div>
                         <div className="bg-theme-primary text-theme-surface h-10 w-10 flex items-center justify-center rounded-xl shadow-lg shadow-theme-primary/20">
                            <DollarSign size={20} />
                         </div>
                      </div>
                      <div>
                        <p className="text-xs text-theme-muted">Total Earned (Lifetime)</p>
                        <p className="text-sm font-bold text-theme-fg mt-0.5">{formatCurrency(wallet.earned_total)}</p>
                      </div>
                      <div className="space-y-2 pt-3 border-t border-theme-border">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-theme-muted">Claimable Balance</span>
                          <span className="font-bold text-emerald-600">{formatCurrency(wallet.claimable_amount)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-theme-muted">Locked in Vault</span>
                          <span className="font-bold text-amber-600">{formatCurrency(wallet.locked_amount)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-theme-subtle py-4 text-center">No wallet data available</p>
                  )}
                </div>
              </div>

              {/* Compensation */}
              <div className="page-card overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
                  <TrendingUp size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Compensation</h3>
                </div>
                <div className="px-5 py-4 space-y-4">
                  {employee.salary_min && employee.salary_max ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[10px] font-black text-theme-muted uppercase tracking-widest">Base Range</p>
                          <p className="text-sm font-black text-theme-fg">{formatCurrency(employee.salary_min)} - {formatCurrency(employee.salary_max)}</p>
                        </div>
                        <Badge variant="info" className="text-[9px]">Performance Linked</Badge>
                      </div>
                      <div className="h-2 w-full bg-theme-raised rounded-full overflow-hidden flex">
                        <div className="h-full bg-theme-primary/40" style={{ width: '30%' }} />
                        <div className="h-full bg-theme-primary" style={{ width: '40%' }} />
                        <div className="h-full bg-theme-primary/40" style={{ width: '30%' }} />
                      </div>
                      <div className="flex justify-between text-[9px] font-black text-theme-muted uppercase tracking-tighter">
                        <span>Min Guaranteed</span>
                        <span>Target Range</span>
                        <span>Max Potential</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs text-theme-muted uppercase font-bold tracking-tighter mb-1 opacity-70">
                          {employee.commission_enabled ? "Base Salary + Commission" :
                           employee.salary_structure === "hourly" ? "Hourly Rate" :
                           employee.salary_structure === "daily" ? "Daily Rate" :
                           employee.salary_structure === "stipend" ? "Stipend Amount" :
                           "Base Salary"}
                        </p>
                        <p className="text-2xl font-black text-theme-primary">
                          {employee.hourly_rate ? `₹${employee.hourly_rate}/hr` :
                           employee.daily_rate ? `₹${employee.daily_rate}/day` :
                           employee.stipend_amount ? formatCurrency(employee.stipend_amount) :
                           formatCurrency(employee.base_salary || 0)}
                        </p>
                      </div>
                      {employee.commission_enabled && employee.monthly_sales_target && (
                        <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-100 px-3 py-2">
                          <TrendingUp size={12} className="text-orange-500 flex-shrink-0" />
                          <p className="text-[11px] text-orange-700 font-semibold">
                            + Commission on ₹{employee.monthly_sales_target.toLocaleString("en-IN")} target
                          </p>
                        </div>
                      )}
                      <div className="pt-3 border-t border-theme-border">
                        <p className="text-[10px] font-bold text-theme-muted uppercase tracking-widest">Payment Frequency</p>
                        <p className="text-sm font-semibold text-theme-fg mt-0.5">
                          {employee.salary_structure === "hourly" ? "Cycle: Per Hour" :
                           employee.salary_structure === "daily" ? "Cycle: Per Day" :
                           "Cycle: Monthly Settlement"}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* KPI Weights (if set) */}
            {employee.kpi_weight !== undefined && (
              <div className="page-card overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
                  <Award size={15} className="text-theme-muted" />
                  <h3 className="text-sm font-semibold text-theme-fg">Performance Weights</h3>
                </div>
                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: "KPI Weight",        value: employee.kpi_weight ?? 0,        color: "bg-sky-400",   textColor: "text-sky-600" },
                    { label: "KRA Weight",        value: employee.kra_weight ?? 0,        color: "bg-emerald-400", textColor: "text-emerald-600" },
                    { label: "Behavioral Weight", value: employee.behavioral_weight ?? 0, color: "bg-amber-400", textColor: "text-amber-600" },
                  ].map(({ label, value, color, textColor }) => (
                    <div key={label} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-theme-muted">{label}</span>
                        <span className={cn("font-bold", textColor)}>{value}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-theme-raised">
                        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Onboarding & Compliance History */}
            <div className="page-card overflow-hidden p-0">
              <div className="flex items-center gap-2 border-b border-theme-border px-5 py-4">
                <ShieldCheck size={15} className="text-theme-muted" />
                <h3 className="text-sm font-semibold text-theme-fg">Onboarding & Compliance History</h3>
              </div>
              <div className="px-5 py-4">
                {onboarding ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-theme-raised/50 border border-theme-border">
                      <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                        <CheckCircle2 size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-theme-fg">Consultant Onboarding Completed</p>
                        <p className="text-xs text-theme-muted mt-0.5">
                          Successfully verified all prerequisites and signed the Consultant Agreement.
                        </p>
                        <div className="flex items-center gap-4 mt-3 text-[10px] font-bold uppercase tracking-widest text-theme-muted">
                          <span className="flex items-center gap-1.5">
                            <Calendar size={10} />
                            {dayjs(onboarding.completed_at).format("DD MMM YYYY")}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock size={10} />
                            {dayjs(onboarding.completed_at).format("hh:mm A")}
                          </span>
                          <span className="text-emerald-500 flex items-center gap-1">
                            <ShieldCheck size={10} />
                            NDA Signed
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                      {onboarding.completed_steps?.map((step: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-raised/30 border border-theme-border/50">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          <span className="text-[11px] font-medium text-theme-muted">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center bg-theme-raised/30 rounded-xl border border-dashed border-theme-border">
                    <p className="text-xs text-theme-subtle">No onboarding history found for this profile.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="page-card">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={15} className="text-theme-muted" />
                <h3 className="text-sm font-semibold text-theme-fg">Quick Links</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/dashboard/attendance">
                  <Button variant="secondary" size="sm">
                    <Calendar size={13} className="mr-1.5" /> Attendance
                  </Button>
                </Link>
                <Link href="/dashboard/incentives">
                  <Button variant="secondary" size="sm">
                    <Award size={13} className="mr-1.5" /> Incentives
                  </Button>
                </Link>
                <Link href="/dashboard/payslips">
                  <Button variant="secondary" size="sm">
                    <FileText size={13} className="mr-1.5" /> Payslips
                  </Button>
                </Link>
                <Link href="/dashboard/performance">
                  <Button variant="secondary" size="sm">
                    <TrendingUp size={13} className="mr-1.5" /> Performance
                  </Button>
                </Link>
              </div>
            </div>
          </>
        ) : (
          <div className="page-card py-16 text-center">
            <p className="text-sm font-semibold text-theme-muted">Limited profile data available</p>
            <p className="text-xs text-theme-subtle mt-1 max-w-md mx-auto">
              Your profile appears to have just been created. Please contact your administrator or check back shortly.
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
