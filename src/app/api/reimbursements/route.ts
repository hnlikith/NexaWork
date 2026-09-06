/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = supabase.from("reimbursements").select(`
      *,
      employee:employees(name, employee_id, department)
    `);
    
    if (status && status !== "all") query = query.eq("status", status);

    const { data: claims, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ claims });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    if (body.action === "approve") {
       await supabase.from("reimbursements").update({ status: "approved" }).eq("id", body.reimbursementId);
       return NextResponse.json({ message: "Reimbursement approved" });
    }
    if (body.action === "reject") {
       await supabase.from("reimbursements").update({ status: "rejected", reason: body.reason }).eq("id", body.reimbursementId);
       return NextResponse.json({ message: "Reimbursement rejected" });
    }
    if (body.action === "pay") {
       await supabase.from("reimbursements").update({ status: "paid" }).eq("id", body.reimbursementId);
       return NextResponse.json({ message: "Reimbursement paid" });
    }

    const { employeeId, amount, reason, receipt_url } = body;
    const { data } = await supabase.from("reimbursements").insert({
       employee_id: employeeId,
       amount, reason, receipt_url, status: "pending"
    }).select().single();

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
