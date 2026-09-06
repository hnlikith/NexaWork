/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, loadSettings, resolveSchema } from "@/lib/onboarding/server";
import { defaultConfig, DEFAULT_SCHEMA } from "@/lib/onboarding/schema";
import { logAudit } from "@/lib/audit";

// POST /api/onboarding/manual
//   { candidate_name, candidate_email, candidate_phone?, candidate_address? }
// Creates a draft onboarding packet WITHOUT a recruitment application — for
// candidates interviewed outside this workspace (other platforms / offline).
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = (body.candidate_name || "").trim();
  const email = (body.candidate_email || "").trim();
  const phone = (body.candidate_phone || "").trim();
  const address = (body.candidate_address || "").trim();

  if (!name) return NextResponse.json({ error: "Candidate name is required." }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid candidate email is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Block if any onboarding already exists for this email (unique email + one process per candidate).
  const { data: dupe } = await supabase
    .from("onboarding_packets")
    .select("id, status, candidate_name")
    .eq("candidate_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dupe) {
    return NextResponse.json({
      error: `An onboarding for ${email} already exists (${dupe.candidate_name} — ${dupe.status}). Each candidate can only have one onboarding.`,
    }, { status: 409 });
  }

  const settings = await loadSettings();
  const schema = resolveSchema(settings) ?? DEFAULT_SCHEMA;

  const { data: created, error } = await supabase
    .from("onboarding_packets")
    .insert({
      application_id: null,
      candidate_name: name,
      candidate_email: email,
      candidate_phone: phone || null,
      candidate_address: address || null,
      config: defaultConfig(schema),
      status: "draft",
      created_by: actor.userId,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    actorId: actor.userId, action: "onboarding.create_manual", section: "Onboarding",
    summary: `Created a manual onboarding for ${name} (${email})`,
    targetType: "onboarding_packet", targetId: created.id,
  });

  return NextResponse.json({ id: created.id });
}
