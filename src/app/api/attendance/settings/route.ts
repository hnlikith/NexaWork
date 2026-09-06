/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("attendance_settings").select("*").eq("id", 1).maybeSingle();
  return NextResponse.json(data ?? {});
}

export async function PATCH(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: me } = await supabase.from("employees").select("role").eq("id", userId).maybeSingle();
  if (!["admin", "hr"].includes(me?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { error } = await supabase.from("attendance_settings").upsert(
    { ...body, id: 1, updated_at: new Date().toISOString(), updated_by: userId },
    { onConflict: "id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
