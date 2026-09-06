/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(req: Request) {
  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "Invoice ID and status are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("invoices")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    console.log(`[Update Status API] Invoice ${id} status updated to: ${status}`);
    return NextResponse.json({ success: true, invoice: data });
  } catch (error: any) {
    console.error("[Update Status API] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
