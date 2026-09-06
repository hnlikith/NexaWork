/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DEPT_COLORS = ["#38BDF8","#818CF8","#34D399","#FB923C","#F472B6","#A78BFA","#60A5FA","#4ADE80"];

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

  try {
    // ── 1. Monthly Revenue (company_revenues + won leads) ─────────────────────
    const [{ data: revRows }, { data: wonLeads }] = await Promise.all([
      supabase
        .from("company_revenues")
        .select("month, amount")
        .eq("year", year)
        .order("month"),
      supabase
        .from("leads")
        .select("value, created_at")
        .eq("stage", "won")
        .gte("created_at", `${year}-01-01`)
        .lt("created_at", `${year + 1}-01-01`),
    ]);

    const revenue = Array(12).fill(0);
    (revRows || []).forEach((r: any) => { revenue[r.month - 1] += Number(r.amount); });
    (wonLeads || []).forEach((l: any) => {
      const m = new Date(l.created_at).getMonth();
      revenue[m] += Number(l.value);
    });

    // ── 2. Monthly Expenses (company_expenses + paid payroll + reimbursements) ─
    const [{ data: expRows }, { data: payrollRows }, { data: reimbRows }] = await Promise.all([
      supabase
        .from("company_expenses")
        .select("month, amount")
        .eq("year", year)
        .order("month"),
      supabase
        .from("payroll_runs")
        .select("month, net_pay")
        .eq("year", year)
        .eq("status", "paid"),
      supabase
        .from("reimbursements")
        .select("amount, processed_at")
        .eq("status", "paid")
        .gte("processed_at", `${year}-01-01`)
        .lt("processed_at", `${year + 1}-01-01`),
    ]);

    const expenses = Array(12).fill(0);
    (expRows || []).forEach((r: any) => { expenses[r.month - 1] += Number(r.amount); });
    (payrollRows || []).forEach((r: any) => { expenses[r.month - 1] += Number(r.net_pay); });
    (reimbRows || []).forEach((r: any) => {
      const m = new Date(r.processed_at).getMonth();
      expenses[m] += Number(r.amount);
    });

    // ── 3. KPI totals ─────────────────────────────────────────────────────────
    const totalRevenue = revenue.reduce((a, b) => a + b, 0);
    const totalExpenses = expenses.reduce((a, b) => a + b, 0);
    const totalProfit = totalRevenue - totalExpenses;

    // ── 4. Active projects count + budget utilization ─────────────────────────
    const [{ count: projectCount }, { data: projBudgetData }] = await Promise.all([
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("projects")
        .select("budget, actual_spent")
        .eq("is_active", true)
        .gt("budget", 0),
    ]);

    let budgetUsed = 0;
    if (projBudgetData && projBudgetData.length > 0) {
      const totalBudget = projBudgetData.reduce((a: number, p: any) => a + Number(p.budget), 0);
      const totalSpent  = projBudgetData.reduce((a: number, p: any) => a + Number(p.actual_spent), 0);
      budgetUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    }

    // ── 5. Quarter Profit % ────────────────────────────────────────────────────
    const quarterProfit = ["Q1","Q2","Q3","Q4"].map((q, qi) => {
      const base = qi * 3;
      const qRev = revenue[base] + revenue[base + 1] + revenue[base + 2];
      const qExp = expenses[base] + expenses[base + 1] + expenses[base + 2];
      return { q, v: qRev > 0 ? Math.round(((qRev - qExp) / qRev) * 100) : 0 };
    });

    // ── 6. Budget by Department (projects → project_teams → teams.department) ─
    const { data: deptData } = await supabase
      .from("projects")
      .select("budget, project_teams(teams(department))")
      .eq("is_active", true)
      .gt("budget", 0);

    const deptBudgetMap: Record<string, number> = {};
    (deptData || []).forEach((p: any) => {
      const depts: string[] = (p.project_teams || [])
        .map((pt: any) => pt.teams?.department)
        .filter(Boolean);
      const unique = [...new Set(depts)];
      if (unique.length > 0) {
        unique.forEach((d: string) => {
          deptBudgetMap[d] = (deptBudgetMap[d] || 0) + Number(p.budget) / unique.length;
        });
      } else {
        deptBudgetMap["General"] = (deptBudgetMap["General"] || 0) + Number(p.budget);
      }
    });
    const totalDeptBudget = Object.values(deptBudgetMap).reduce((a, b) => a + b, 0) || 1;
    const budgetDept = Object.entries(deptBudgetMap).map(([label, v], i) => ({
      label,
      v: Math.round((v / totalDeptBudget) * 100),
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }));

    // ── 7. Project Health Matrix (top 6 active projects) ─────────────────────
    const { data: projectsData } = await supabase
      .from("projects")
      .select("name, health_score, budget, actual_spent, phase")
      .eq("is_active", true)
      .order("health_score", { ascending: false })
      .limit(6);

    const projects = (projectsData || []).map((p: any) => ({
      name:   p.name,
      health: Math.min(100, Math.max(0, Math.round(Number(p.health_score) || 75))),
      budget: Number(p.budget),
      spent:  Number(p.actual_spent),
      status: p.phase,
    }));

    // ── 8. KPI Scorecard (aggregated from kpi_scores + attendance + leads) ────
    const [{ data: kpiData }, { data: attData }, { data: leadsAll }, { data: leadsWon }] =
      await Promise.all([
        supabase.from("kpi_scores").select("kra_score, kpi_score, behavioral_score, final_score").eq("year", year),
        supabase.from("attendance_logs").select("status").gte("date", `${year}-01-01`).lt("date", `${year + 1}-01-01`),
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("stage", "won"),
      ]);

    const avg = (arr: any[], key: string) =>
      arr.length > 0 ? Math.round(arr.reduce((a: number, r: any) => a + Number(r[key]), 0) / arr.length) : 0;

    const attTotal   = (attData || []).length;
    const attPresent = (attData || []).filter((r: any) => r.status === "present" || r.status === "late").length;
    const attendanceRate  = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 85;
    const leadsAllCount  = (leadsAll as any)?.length ?? 0;
    const leadsWonCount  = (leadsWon as any)?.length ?? 0;
    const conversionRate = leadsAllCount > 0 ? Math.round((leadsWonCount / leadsAllCount) * 100) : 0;

    const kpiScorecard = [
      { label: "KRA Performance",      v: avg(kpiData || [], "kra_score")      || 78, color: "#6366f1" },
      { label: "KPI Achievement",      v: avg(kpiData || [], "kpi_score")      || 82, color: "#38BDF8" },
      { label: "Behavioral Score",     v: avg(kpiData || [], "behavioral_score") || 74, color: "#10b981" },
      { label: "Overall Score",        v: avg(kpiData || [], "final_score")    || 79, color: "#f59e0b" },
      { label: "Attendance Rate",      v: attendanceRate,                            color: "#8b5cf6" },
      { label: "Lead Conversion Rate", v: conversionRate || 65,                      color: "#ec4899" },
    ];

    // ── 9. P&L Table (last 6 months that have any data) ──────────────────────
    const plTable = MONTHS
      .map((month, i) => ({ month, revenue: revenue[i], expenses: expenses[i] }))
      .filter(r => r.revenue > 0 || r.expenses > 0)
      .slice(-6);

    return NextResponse.json({
      revenue,
      expenses,
      profit: revenue.map((r, i) => r - expenses[i]),
      kpi: {
        revenue:    totalRevenue,
        expenses:   totalExpenses,
        profit:     totalProfit,
        projects:   projectCount || 0,
        budgetUsed,
      },
      quarterProfit,
      budgetDept,
      projects,
      kpiScorecard,
      plTable,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
