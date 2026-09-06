/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { authenticate } from "@/middleware/auth";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = supabase.from("priority_payouts").select(`
      *,
      employee:employees(name, employee_id, department)
    `);
    
    if (status && status !== "all") query = query.eq("status", status);

    const { data: requests, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ requests });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    if (body.action === "review") {
       await supabase.from("priority_payouts").update({ 
         status: body.decision,
         reason: body.decision === "rejected" ? body.rejectReason : undefined 
       }).eq("id", body.requestId);
       return NextResponse.json({ message: `Payout ${body.decision}` });
    }

    const { employee, amount, urgency, reason } = body;
    const { data } = await supabase.from("priority_payouts").insert({
       employee_id: employee,
       amount, urgency, reason, status: "pending"
    }).select().single();

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
