/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, isAdmin } from "@/lib/onboarding/server";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/onboarding/[id]/reject  { note }
// Admin requests changes — sends the packet back to the submitter.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(actor)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { note } = await req.json().catch(() => ({}));

  const supabase = getSupabaseAdmin();
  const { data: packet } = await supabase
    .from("onboarding_packets")
    .select("id, status, created_by, candidate_name")
    .eq("id", id)
    .maybeSingle();
  if (!packet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (packet.status !== "pending_approval") {
    return NextResponse.json({ error: "Only pending submissions can be sent back." }, { status: 400 });
  }

  const { error } = await supabase
    .from("onboarding_packets")
    .update({
      status: "changes_requested",
      rejection_note: note?.trim() || "Changes requested.",
      approver_id: actor.userId,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    actorId: actor.userId, action: "onboarding.reject", section: "Onboarding",
    summary: `Requested changes on ${packet.candidate_name}'s onboarding`,
    targetType: "onboarding_packet", targetId: id,
    changes: { status: { from: packet.status, to: "changes_requested" } },
  });

  if (packet.created_by) {
    await supabase.from("system_notifications").insert({
      user_id: packet.created_by,
      title: `Onboarding Changes Requested — ${packet.candidate_name}`,
      message: note?.trim() || "The admin requested changes to this onboarding offer.",
      type: "warning",
      link: `/admin/onboarding/${id}`,
    });
  }

  return NextResponse.json({ ok: true, status: "changes_requested" });
}
