/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, isAdmin } from "@/lib/onboarding/server";

// GET /api/onboarding — list packets. Admin sees all; others see their own + ones they approve.
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("onboarding_packets")
    .select(
      "id, application_id, candidate_name, candidate_email, candidate_phone, status, created_by, approver_id, created_at, updated_at, submitted_at, approved_at, sent_at, viewed_at, signed_at, config, creator:created_by(name,email), approver:approver_id(name,email)"
    )
    .order("created_at", { ascending: false });

  if (!isAdmin(actor)) q = q.eq("created_by", actor.userId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ packets: data ?? [], isAdmin: isAdmin(actor) });
}
