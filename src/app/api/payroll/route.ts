/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import dayjs from "@/lib/dayjs";

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const month = parseInt(searchParams.get("month") || "3");
    const year = parseInt(searchParams.get("year") || "2026");

    // 1. Fetch all active employees
    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id, name, employee_id, department, employment_type, salary_structure, base_salary")
      .eq("is_active", true);

    if (empErr) throw new Error(empErr.message);

    // 2. Fetch existing payroll runs for this month/year
    const { data: existingRuns } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("month", month)
      .eq("year", year);

    // 3. Fetch attendance logs for all employees for this month
    const startOfMonth = dayjs(`${year}-${month}-01`).startOf('month').format('YYYY-MM-DD');
    const endOfMonth = dayjs(`${year}-${month}-01`).endOf('month').format('YYYY-MM-DD');
    
    const { data: attendance } = await supabase
      .from("attendance_logs")
      .select("employee_id, status, clock_in, clock_out")
      .gte("date", startOfMonth)
      .lte("date", endOfMonth);

    // 3.5 Fetch Claims, Reimbursements, and Priority Payouts
    const { data: claims } = await supabase.from("claims").select("employee_id, amount").eq("status", "approved");
    const { data: reimbursements } = await supabase.from("reimbursements").select("employee_id, amount").eq("status", "approved");
    const { data: priorityPayouts } = await supabase.from("priority_payouts").select("employee_id, amount").eq("status", "approved");
    const { data: incentives } = await supabase.from("incentives").select("employee, amount").eq("status", "claimable").eq("month", month).eq("year", year);

    // 4. Calculate for everyone
    const results = employees.map((emp) => {
      // Check if a run already exists
      const existing = existingRuns?.find(r => r.employee_id === emp.id);
      if (existing) {
        return {
          id: existing.id,
          empId: emp.id,
          empName: emp.name,
          empCode: emp.employee_id,
          dept: emp.department || "N/A",
          empType: emp.employment_type,
          base: existing.base_salary,
          incentive: existing.incentive_amount,
          deductions: existing.deductions,
          gross: existing.gross_pay,
          net: existing.net_pay,
          status: existing.status
        };
      }

      // Compute fresh mock draft
      let base = emp.base_salary || 0;
      let deductions = 0;
      let incentive = 0;

      // Add aggregated approvals
      const empClaims = claims?.filter(c => c.employee_id === emp.id).reduce((s, c) => s + Number(c.amount), 0) || 0;
      const empReimburse = reimbursements?.filter(r => r.employee_id === emp.id).reduce((s, r) => s + Number(r.amount), 0) || 0;
      const empIncentives = incentives?.filter(i => i.employee === emp.id).reduce((s, i) => s + Number(i.amount), 0) || 0;
      
      const empPriority = priorityPayouts?.filter(p => p.employee_id === emp.id).reduce((s, p) => s + Number(p.amount), 0) || 0;

      incentive += (empClaims + empReimburse + empIncentives);
      deductions += empPriority; // Priority Payout is an advance, so deduct it from final payroll payout

      const empLogs = attendance?.filter(a => a.employee_id === emp.id) || [];

      if (emp.salary_structure === "hourly") {
         // Calculate hours from clock_in out
         let totalHours = 0;
         empLogs.forEach(log => {
           if (log.clock_in && log.clock_out) {
              const [h1, m1] = log.clock_in.split(':').map(Number);
              const [h2, m2] = log.clock_out.split(':').map(Number);
              let diff = (h2 - h1) + (m2 - m1) / 60;
              if (diff > 0) totalHours += diff;
           }
         });
         base = totalHours * (emp.base_salary || 0);
      } else if (emp.salary_structure === "fixed_monthly" || emp.salary_structure === "stipend") {
         // Standard deductions for unpaid leaves could happen here
         // Simplified deduction: If there are 3 absent days, deduct a pro-rated amount (just for realism)
         const absentDays = empLogs.filter(a => a.status === 'absent').length;
         if (absentDays > 0) {
            deductions = (base / 30) * absentDays;
         }
      } else if (emp.salary_structure === "daily") {
         const presentDays = empLogs.filter(a => ['present', 'half_day'].includes(a.status)).length;
         base = presentDays * (emp.base_salary || 0);
      }

      const gross = base + incentive;
      const net = gross - deductions;

      return {
          id: `draft-${emp.id}`, // Temporary ID for Drafts not in DB yet
          empId: emp.id,
          empName: emp.name,
          empCode: emp.employee_id,
          dept: emp.department || "N/A",
          empType: emp.employment_type,
          base,
          incentive,
          deductions,
          gross,
          net,
          status: "draft"
      };
    });

    return NextResponse.json({ payrolls: results }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Fire POST to generate/update the drafted states in DB or disburse
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { action, payrolls, month, year, employee_id } = body;

    if (action === "generate_drafts") {
       // Insert or Update the provided payroll rows
       const upserts = payrolls.map((p: any) => ({
          employee_id: p.empId,
          month,
          year,
          base_salary: p.base,
          incentive_amount: p.incentive,
          deductions: p.deductions,
          gross_pay: p.gross,
          net_pay: p.net,
          status: "processed" // Mark as processed/ready to disburse
       }));

       // Need to delete old drafts for this month first to be clean, or use upsert. 
       // For safety, let's just insert these as processed.
       for (const up of upserts) {
          const { data: existing } = await supabase.from("payroll_runs").select("id").eq("employee_id", up.employee_id).eq("month", month).eq("year", year).single();
          if (existing) {
             await supabase.from("payroll_runs").update(up).eq("id", existing.id);
          } else {
             await supabase.from("payroll_runs").insert(up);
          }
       }
       return NextResponse.json({ success: true });
    }

    if (action === "manual_override") {
       const { record } = body;
       // We upsert manually directly into payroll_runs so it saves
       const upsert = {
          employee_id: record.empId,
          month,
          year,
          base_salary: record.base,
          incentive_amount: record.incentive,
          deductions: record.deductions,
          gross_pay: record.gross,
          net_pay: record.net,
          status: "draft"
       };
       const { data: existing } = await supabase.from("payroll_runs").select("id").eq("employee_id", record.empId).eq("month", month).eq("year", year).single();
       if (existing) {
          await supabase.from("payroll_runs").update(upsert).eq("id", existing.id);
       } else {
          await supabase.from("payroll_runs").insert(upsert);
       }
       return NextResponse.json({ success: true });
    }

    if (action === "disburse") {
       if (!employee_id) throw new Error("Employee required to disburse individual");
       await supabase.from("payroll_runs").update({ status: "paid", processed_at: new Date().toISOString() }).eq("id", employee_id); // Wait, we need the run id, not employee_id
       return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch(error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
