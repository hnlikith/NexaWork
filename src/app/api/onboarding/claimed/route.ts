/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor } from "@/lib/onboarding/server";

// GET /api/onboarding/claimed — workspace-wide list of candidates that already have
// an onboarding packet, with who created it. Visible to ALL roles (minimal fields)
// so the "Start New Onboarding → From Interview" picker can disable them everywhere,
// regardless of which staff member started the onboarding.
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("onboarding_packets")
    .select("application_id, candidate_email, status, creator:created_by(name, employee_id)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claimed: data ?? [] });
}
