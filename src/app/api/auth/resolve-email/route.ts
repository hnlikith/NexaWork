/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: emp } = await supabase
    .from("employees")
    .select("email, personal_email, zoho_email")
    .eq("zoho_email", email)
    .maybeSingle();

  if (!emp) return NextResponse.json({ error: "not found" }, { status: 404 });

  const personalEmail = (emp as any).personal_email || emp.email;
  return NextResponse.json({ personal_email: personalEmail });
}
