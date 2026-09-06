/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/interns/cycles/history?intern_id=<uuid?>&status=<pending|paid|failed?>&limit=<number?>
//
// Chronological feed of cycles across all months. Default order: most recent
// payment_date first, then created_at desc as a tie-breaker.
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const intern_id = req.nextUrl.searchParams.get("intern_id");
  const status    = req.nextUrl.searchParams.get("status");
  const limit     = Math.min(500, Number(req.nextUrl.searchParams.get("limit") ?? 100));

  let query = supabase
    .from("intern_stipend_cycles_view")
    .select("*")
    .order("payment_date", { ascending: false, nullsFirst: false })
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(limit);

  if (intern_id) query = query.eq("intern_id", intern_id);
  if (status)    query = query.eq("payment_status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ history: data ?? [] });
}
