/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor } from "@/lib/onboarding/server";
import { defaultConfig, DEFAULT_SCHEMA } from "@/lib/onboarding/schema";
import { loadSettings, resolveSchema } from "@/lib/onboarding/server";
import { logAudit } from "@/lib/audit";

// POST /api/onboarding/push  { application_id }
// Creates a draft onboarding packet for an accepted candidate (interview handoff).
// Re-uses an existing non-terminal packet if one already exists for the application.
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { application_id } = await req.json().catch(() => ({}));
  if (!application_id) return NextResponse.json({ error: "application_id is required" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Pull candidate details from the application.
  const { data: app } = await supabase
    .from("applications")
    .select("application_id, applicant_name, applicant_email, applicant_phone, applicant_location, decision")
    .eq("application_id", application_id)
    .maybeSingle();

  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // If a live packet already exists for this application, return it (idempotent push).
  const { data: existing } = await supabase
    .from("onboarding_packets")
    .select("id, status")
    .eq("application_id", application_id)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (existing) return NextResponse.json({ id: existing.id, reused: true });

  // Block if any onboarding already exists for this email (unique email + one process per candidate).
  if (app.applicant_email) {
    const { data: dupe } = await supabase
      .from("onboarding_packets")
      .select("id, status, candidate_name")
      .eq("candidate_email", app.applicant_email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dupe) {
      return NextResponse.json({
        error: `An onboarding for ${app.applicant_email} already exists (${dupe.candidate_name} — ${dupe.status}). Each candidate can only have one onboarding.`,
      }, { status: 409 });
    }
  }

  const settings = await loadSettings();
  const schema = resolveSchema(settings) ?? DEFAULT_SCHEMA;

  const { data: created, error } = await supabase
    .from("onboarding_packets")
    .insert({
      application_id: app.application_id,
      candidate_name: app.applicant_name,
      candidate_email: app.applicant_email,
      candidate_phone: app.applicant_phone ?? null,
      candidate_address: app.applicant_location ?? null,
      config: defaultConfig(schema),
      status: "draft",
      created_by: actor.userId,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    actorId: actor.userId, action: "onboarding.create", section: "Onboarding",
    summary: `Started onboarding for ${app.applicant_name} (${app.applicant_email})`,
    targetType: "onboarding_packet", targetId: created.id,
  });

  return NextResponse.json({ id: created.id, reused: false });
}
