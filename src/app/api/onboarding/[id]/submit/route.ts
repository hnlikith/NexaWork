/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor } from "@/lib/onboarding/server";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/onboarding/[id]/submit — send a draft for admin approval.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: packet } = await supabase
    .from("onboarding_packets")
    .select("id, status, created_by, candidate_name, candidate_email")
    .eq("id", id)
    .maybeSingle();
  if (!packet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (packet.created_by !== actor.userId && actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["draft", "changes_requested"].includes(packet.status)) {
    return NextResponse.json({ error: "This onboarding is not in a submittable state." }, { status: 400 });
  }
  if (!packet.candidate_email) {
    return NextResponse.json({ error: "Candidate email is required before submitting." }, { status: 400 });
  }

  const { error } = await supabase
    .from("onboarding_packets")
    .update({ status: "pending_approval", submitted_at: new Date().toISOString(), rejection_note: null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify all admins.
  const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
  if (admins?.length) {
    await supabase.from("system_notifications").insert(
      admins.map((a) => ({
        user_id: a.id,
        title: `Onboarding Approval — ${packet.candidate_name}`,
        message: `${actor.name} submitted an onboarding offer for ${packet.candidate_name} (${packet.candidate_email}). Review and approve.`,
        type: "warning",
        link: "/admin/onboarding",
      }))
    );
  }

  return NextResponse.json({ ok: true, status: "pending_approval" });
}
