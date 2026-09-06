/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, isAdmin } from "@/lib/onboarding/server";
import { dispatchOnboarding } from "@/lib/onboarding/dispatch";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// POST /api/onboarding/[id]/send — (re)dispatch the onboarding e-sign email.
// Used to RETRY delivery after a send failed (e.g. the PDF/Chrome error left the
// packet "approved" with no sent_at) or to re-send the magic link to the candidate.
// Allowed for an admin OR the packet's creator (owner).
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
  if (!["approved", "sent", "viewed"].includes(packet.status)) {
    return NextResponse.json({ error: "Approve the onboarding before sending." }, { status: 400 });
  }

  try {
    const result = await dispatchOnboarding(id, { req });
    await logAudit({
      actorId: actor.userId, action: "onboarding.resend", section: "Onboarding",
      summary: `Re-sent the onboarding e-sign email to ${packet.candidate_email}`,
      targetType: "onboarding_packet", targetId: id,
    });
    return NextResponse.json({ status: "sent", ...result });
  } catch (e: any) {
    return NextResponse.json({ error: `Sending failed: ${e.message}. You can retry.` }, { status: 502 });
  }
}
