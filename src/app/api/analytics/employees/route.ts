/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TEAM_COLORS = ["#38BDF8","#818CF8","#34D399","#FB923C","#F472B6","#A78BFA","#60A5FA","#4ADE80"];

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

  try {
    // ── 1. All active employees ───────────────────────────────────────────────
    const { data: empList, error: empErr } = await supabase
      .from("employees")
      .select("id, name, employee_id, role, department, team_id, teams!team_id(name)")
      .eq("is_active", true)
      .order("name");

    if (empErr) throw empErr;
    if (!empList || empList.length === 0) {
      return NextResponse.json({
        employees:       [],
        kpi:             { avgKpi: 0, totalRevenue: 0, avgAttendance: 0, totalIncentive: 0 },
        performanceTrend:{},
        teamDist:        [],
        attendanceMonths:[],
        revenueByEmp:    [],
        incentiveByEmp:  [],
      });
    }

    const empIds = empList.map((e: any) => e.id);

    // ── 2. Bulk fetch supporting data in parallel ─────────────────────────────
    const [
      { data: kpiScores },
      { data: allLeads },
      { data: attLogs },
      { data: incentives },
      { data: ratings },
    ] = await Promise.all([
      supabase
        .from("kpi_scores")
        .select("employee_id, month, final_score, kpi_score")
        .eq("year", year)
        .in("employee_id", empIds),
      supabase
        .from("leads")
        .select("emp_id, value, stage")
        .in("emp_id", empIds),
      supabase
        .from("attendance_logs")
        .select("employee_id, status, date")
        .gte("date", `${year}-01-01`)
        .lt("date", `${year + 1}-01-01`)
        .in("employee_id", empIds),
      supabase
        .from("incentives")
        .select("employee_id, total_amount, status")
        .eq("year", year)
        .in("employee_id", empIds),
      supabase
        .from("employee_ratings")
        .select("employee_id, rating, period_month")
        .eq("period_year", year)
        .in("employee_id", empIds)
        .order("period_month", { ascending: false }),
    ]);

    // ── 3. Build per-employee record ──────────────────────────────────────────
    const employees = empList.map((emp: any) => {
      // KPI average for the year
      const empKpi = (kpiScores || []).filter((k: any) => k.employee_id === emp.id);
      const avgKpi = empKpi.length > 0
        ? Math.round(empKpi.reduce((a: number, k: any) => a + Number(k.final_score), 0) / empKpi.length)
        : 0;

      // Leads & revenue
      const empLeads   = (allLeads || []).filter((l: any) => l.emp_id === emp.id);
      const wonLeads   = empLeads.filter((l: any) => l.stage === "won");
      const revenue    = wonLeads.reduce((a: number, l: any) => a + Number(l.value), 0);

      // Attendance %
      const empAtt     = (attLogs || []).filter((a: any) => a.employee_id === emp.id);
      const presentDays = empAtt.filter((a: any) => a.status === "present" || a.status === "late").length;
      const attendance = empAtt.length > 0 ? Math.round((presentDays / empAtt.length) * 100) : 0;

      // Incentive total (claimed + claimable)
      const empInc     = (incentives || []).filter((i: any) => i.employee_id === emp.id);
      const incentive  = empInc
        .filter((i: any) => i.status === "claimed" || i.status === "claimable")
        .reduce((a: number, i: any) => a + Number(i.total_amount), 0);

      // Latest rating
      const empRating  = (ratings || []).find((r: any) => r.employee_id === emp.id);
      const rating     = empRating ? Math.round(Number(empRating.rating) * 10) / 10 : 3.5;

      // Month-over-month KPI trend %
      const sorted = [...empKpi].sort((a: any, b: any) => a.month - b.month);
      let trend = 0;
      if (sorted.length >= 2) {
        const last = Number(sorted[sorted.length - 1].final_score);
        const prev = Number(sorted[sorted.length - 2].final_score);
        trend = prev > 0 ? Math.round(((last - prev) / prev) * 100) : 0;
      }

      return {
        id:          emp.id,
        name:        emp.name,
        employee_id: emp.employee_id,
        role:        emp.role,
        team:        (emp.teams as any)?.name || emp.department || "General",
        kpi:         avgKpi,
        leads:       empLeads.length,
        converted:   wonLeads.length,
        revenue,
        attendance,
        incentive,
        rating,
        trend,
      };
    });

    // ── 4. Summary KPIs ────────────────────────────────────────────────────────
    const totalRevenue   = employees.reduce((a: number, e: any) => a + e.revenue, 0);
    const totalIncentive = employees.reduce((a: number, e: any) => a + e.incentive, 0);
    const avgKpi = employees.length > 0
      ? Math.round((employees.reduce((a: number, e: any) => a + e.kpi, 0) / employees.length) * 10) / 10
      : 0;
    const avgAttendance = employees.length > 0
      ? Math.round(employees.reduce((a: number, e: any) => a + e.attendance, 0) / employees.length)
      : 0;

    // ── 5. Performance trend (last 6 months) per employee ─────────────────────
    const now = new Date();
    const performanceTrend: Record<string, number[]> = {};
    empList.forEach((emp: any) => {
      const empKpi = (kpiScores || []).filter((k: any) => k.employee_id === emp.id);
      performanceTrend[emp.id] = Array.from({ length: 6 }, (_, i) => {
        const mNumber = ((now.getMonth() - (5 - i) + 12) % 12) + 1;
        const score = empKpi.find((k: any) => k.month === mNumber);
        return score ? Math.round(Number(score.final_score)) : 0;
      });
    });

    // ── 6. Team distribution ──────────────────────────────────────────────────
    const teamCountMap: Record<string, number> = {};
    employees.forEach((e: any) => {
      teamCountMap[e.team] = (teamCountMap[e.team] || 0) + 1;
    });
    const teamDist = Object.entries(teamCountMap).map(([label, v], i) => ({
      label, v, color: TEAM_COLORS[i % TEAM_COLORS.length],
    }));

    // ── 7. Monthly attendance averages ────────────────────────────────────────
    const attendanceMonths = MONTHS.map((name, i) => {
      const monthLogs = (attLogs || []).filter((a: any) => new Date(a.date).getMonth() === i);
      const present   = monthLogs.filter((a: any) => a.status === "present" || a.status === "late").length;
      return { name, v: monthLogs.length > 0 ? Math.round((present / monthLogs.length) * 100) : 0 };
    });

    // ── 8. Revenue & incentive by employee (top 8) ────────────────────────────
    const revenueByEmp = [...employees]
      .filter((e: any) => e.revenue > 0)
      .sort((a: any, b: any) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((e: any) => ({ name: e.name.split(" ")[0], v: e.revenue }));

    const incentiveByEmp = [...employees]
      .filter((e: any) => e.incentive > 0)
      .sort((a: any, b: any) => b.incentive - a.incentive)
      .slice(0, 8)
      .map((e: any) => ({ name: e.name.split(" ")[0], v: e.incentive }));

    return NextResponse.json({
      employees,
      kpi: { avgKpi, totalRevenue, avgAttendance, totalIncentive },
      performanceTrend,
      teamDist,
      attendanceMonths,
      revenueByEmp,
      incentiveByEmp,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
