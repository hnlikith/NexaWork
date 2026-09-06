/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, isAdmin, loadSettings } from "@/lib/onboarding/server";
import { dispatchOnboarding } from "@/lib/onboarding/dispatch";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// POST /api/onboarding/[id]/direct-send
// Send the offer for e-signature WITHOUT a separate approval step.
// Allowed when the actor is an admin, OR when require_approval is off (any role
// with onboarding access). Used instead of "Submit for Approval".
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: packet } = await supabase
    .from("onboarding_packets")
    .select("id, status, created_by, candidate_email")
    .eq("id", id)
    .maybeSingle();
  if (!packet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isAdmin(actor) && packet.created_by !== actor.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["draft", "changes_requested"].includes(packet.status)) {
    return NextResponse.json({ error: "This onboarding can no longer be sent directly." }, { status: 400 });
  }
  if (!packet.candidate_email) {
    return NextResponse.json({ error: "Candidate email is required." }, { status: 400 });
  }

  const settings = await loadSettings();
  const requireApproval = settings?.require_approval ?? true;
  // Non-admins may only send directly when approval is not required.
  if (!isAdmin(actor) && requireApproval) {
    return NextResponse.json({ error: "Admin approval is required before sending." }, { status: 403 });
  }

  const now = new Date().toISOString();
  await supabase
    .from("onboarding_packets")
    .update({ status: "approved", approver_id: actor.userId, approved_at: now, submitted_at: now, rejection_note: null })
    .eq("id", id);

  try {
    const result = await dispatchOnboarding(id, { req });
    await logAudit({
      actorId: actor.userId, action: "onboarding.send", section: "Onboarding",
      summary: `Sent the onboarding offer for e-signature to ${packet.candidate_email}`,
      targetType: "onboarding_packet", targetId: id,
    });
    return NextResponse.json({ status: "sent", ...result });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Sending failed: ${e.message}. You can retry.`, status: "approved" },
      { status: 502 }
    );
  }
}
