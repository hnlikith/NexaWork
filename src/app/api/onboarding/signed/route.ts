/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor } from "@/lib/onboarding/server";

// GET /api/onboarding/signed — candidates whose onboarding is signed/completed,
// for the "Add Employee → from onboarding" picker.
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("onboarding_packets")
    .select("id, candidate_name, candidate_email, candidate_phone, candidate_address, config, status, signed_at")
    .in("status", ["signed", "completed"])
    .order("signed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.candidate_name,
    email: p.candidate_email,
    phone: p.candidate_phone ?? "",
    address: p.candidate_address ?? "",
    role: typeof p.config?.position === "string" ? p.config.position : "",
    status: p.status,
  }));

  return NextResponse.json({ candidates });
}
