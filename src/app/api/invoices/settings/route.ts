/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from("company_profile")
      .select("*")
      .limit(1)
      .single();

    if (error && error.code === "PGRST116") {
      // No row yet — create blank singleton
      const { data: created, error: cErr } = await supabase
        .from("company_profile")
        .insert({ company_name: "", gstin: "" })
        .select()
        .single();
      if (cErr) throw cErr;
      return NextResponse.json({ settings: created });
    }

    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const supabase = getSupabaseAdmin();
  try {
    const body = await req.json();

    const { data: existing } = await supabase
      .from("company_profile")
      .select("id")
      .limit(1)
      .single();

    let result;
    if (!existing) {
      const { data, error } = await supabase
        .from("company_profile")
        .insert({ ...body })
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from("company_profile")
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ settings: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
