/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * REAL WALLET SERVICE
 * Fetches actual data from payroll_runs and incentives tables.
 */

export async function getWalletSummary(employeeId: string) {
  const supabase = getSupabaseAdmin();
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  // 1. Fetch Wallet Totals (aggregating from incentives/payroll)
  // Note: If you have a dedicated 'wallets' table, you would query that here.
  // For now, we calculate from payroll_runs and incentives status.
  
  const { data: payrollData } = await supabase
    .from("payroll_runs")
    .select("net_pay, status, month, year")
    .eq("employee_id", employeeId);

  const { data: incentiveData } = await supabase
    .from("incentives")
    .select("total_amount, status")
    .eq("employee_id", employeeId);

  const payrollTotal = (payrollData || []).reduce((acc, p) => acc + (Number(p.net_pay) || 0), 0);
  const incentiveTotal = (incentiveData || []).reduce((acc, i) => acc + (Number(i.total_amount) || 0), 0);
  const earned_total = payrollTotal + incentiveTotal;
  
  const claimable_amount = (incentiveData || [])
    .filter(i => i.status === 'claimable')
    .reduce((acc, i) => acc + Number(i.total_amount), 0);

  const locked_amount = (incentiveData || [])
    .filter(i => i.status === 'locked')
    .reduce((acc, i) => acc + Number(i.total_amount), 0);

  // 2. Calculate "This Month's Salary"
  const this_month_payout = (payrollData || [])
    .filter(p => p.month === currentMonth && p.year === currentYear)
    .reduce((acc, p) => acc + Number(p.net_pay), 0);

  // 3. Get Recent Transactions
  const { data: recentPayouts } = await supabase
    .from("payroll_runs")
    .select("id, net_pay, status, month, year, created_at")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(3);

  const transactions = (recentPayouts || []).map(p => ({
    id: p.id,
    type: "payroll_payout",
    amount: Number(p.net_pay),
    description: `Salary Payout - ${new Date(p.year, p.month - 1).toLocaleString('default', { month: 'long' })} ${p.year}`,
    status: p.status,
    created_at: p.created_at
  }));

  return {
    wallet: {
      id: employeeId,
      employee_id: employeeId,
      earned_total: earned_total || 0,
      locked_amount: locked_amount || 0,
      claimable_amount: claimable_amount || 0,
      this_month_payout: this_month_payout || 0,
      updated_at: new Date().toISOString()
    },
    transactions
  };
}
