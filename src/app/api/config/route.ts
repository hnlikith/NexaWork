/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    // System Config is a pure singleton, always fetch strictly the first row safely.
    const { data: config, error } = await supabase.from("system_config").select("*").limit(1).single();
    
    if (error) {
      // If no row exists, create the structural blank slate
      if (error.code === 'PGRST116') {
        const { data: newConfig } = await supabase.from("system_config").insert({ revenue: 0 }).select().single();
        return NextResponse.json({ config: newConfig });
      }
      return NextResponse.json({ error: "System Registry Fault: " + error.message }, { status: 500 });
    }

    return NextResponse.json({ config });
  } catch (error: any) {
    return NextResponse.json({ error: "Internal Exception: " + error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const { data: existing, error: findError } = await supabase.from("system_config").select("id").limit(1).single();

    if (findError && findError.code !== 'PGRST116') {
      return NextResponse.json({ error: "System Verification Fault" }, { status: 500 });
    }

    let result;
    if (!existing) {
      const { data, error } = await supabase.from("system_config").insert(body).select().single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase.from("system_config").update(body).eq("id", existing.id).select().single();
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ config: result });
  } catch (error: any) {
    return NextResponse.json({ error: "Configuration Deployment Fault: " + error.message }, { status: 500 });
  }
}
