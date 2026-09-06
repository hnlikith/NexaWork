/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// POST /api/payslips/generate
// Auto-calculates a payslip from live DB data and upserts it.
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { employee_id, month, year, generated_by } = body;

  if (!employee_id || !month || !year) {
    return NextResponse.json({ error: "employee_id, month, year are required" }, { status: 400 });
  }

  const m = Number(month);
  const y = Number(year);

  // 1. Employee base data
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, name, employee_id, base_salary, commission_enabled, monthly_sales_target, salary_slab_id")
    .eq("id", employee_id)
    .single();

  if (empErr || !emp) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const baseSalary = Number(emp.base_salary ?? 0);

  // 2. Incentive grant for this month
  const { data: ig } = await supabase
    .from("incentive_grants")
    .select("id, amount")
    .eq("employee_id", employee_id)
    .eq("month", m)
    .eq("year", y)
    .maybeSingle();

  const incentiveAmount = Number(ig?.amount ?? 0);
  const incentiveRef    = ig?.id ?? null;

  // 3. Sales commission
  let salesCommission = 0;
  if (emp.commission_enabled) {
    const { data: sr } = await supabase
      .from("sales_records")
      .select("amount_achieved")
      .eq("employee_id", employee_id)
      .eq("month", m)
      .eq("year", y)
      .maybeSingle();

    if (sr) {
      const achieved = Number(sr.amount_achieved ?? 0);
      const { data: slabs } = await supabase
        .from("salary_slabs")
        .select("commission_percent")
        .lte("min_target", achieved)
        .eq("is_active", true)
        .order("min_target", { ascending: false })
        .limit(1);

      if (slabs && slabs.length > 0) {
        salesCommission = Math.round((achieved * slabs[0].commission_percent) / 100);
      }
    }
  }

  // 4. Earnings breakdown
  const hra             = Math.round(baseSalary * 0.4);   // 40% of basic
  const specialAllowance = Math.round(baseSalary * 0.2);  // 20% of basic
  const grossPay        = baseSalary + hra + specialAllowance + incentiveAmount + salesCommission;

  // 5. Deductions
  const pfDeduction     = Math.min(Math.round(baseSalary * 0.12), 1800); // 12% basic, cap ₹1800
  const professionalTax = grossPay > 15000 ? 200 : 0;
  const tdsDeduction    = 0; // simplified — extend later with tax bracket logic
  const totalDeductions = pfDeduction + professionalTax + tdsDeduction;
  const netPay          = Math.max(0, grossPay - totalDeductions);

  // 6. Upsert payslip
  const { data: payslip, error: psErr } = await supabase
    .from("payslips")
    .upsert(
      {
        employee_id,
        month:               m,
        year:                y,
        base_salary:         baseSalary,
        hra,
        special_allowance:   specialAllowance,
        incentive_amount:    incentiveAmount,
        sales_commission:    salesCommission,
        other_earnings:      0,
        gross_pay:           grossPay,
        pf_deduction:        pfDeduction,
        professional_tax:    professionalTax,
        tds_deduction:       tdsDeduction,
        other_deductions:    0,
        total_deductions:    totalDeductions,
        net_pay:             netPay,
        incentive_grant_ref: incentiveRef,
        status:              "draft",
        generated_by:        generated_by ?? null,
        updated_at:          new Date().toISOString(),
      },
      { onConflict: "employee_id,month,year" }
    )
    .select("*")
    .single();

  if (psErr) return NextResponse.json({ error: psErr.message }, { status: 500 });
  return NextResponse.json({ payslip });
}
