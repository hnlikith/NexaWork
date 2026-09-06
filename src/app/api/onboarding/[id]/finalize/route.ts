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

// POST /api/onboarding/[id]/finalize
// After the candidate e-signs, the onboarder (form creator) — or an admin —
// accepts, which emails the final counter-signed PDFs to the candidate and
// marks the onboarding completed.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: packet } = await supabase
    .from("onboarding_packets")
    .select("id, status, created_by, signature")
    .eq("id", id)
    .maybeSingle();
  if (!packet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the onboarder who filled it (or an admin) can accept.
  if (!isAdmin(actor) && packet.created_by !== actor.userId) {
    return NextResponse.json({ error: "Only the onboarder or an admin can accept this." }, { status: 403 });
  }
  if (packet.status !== "signed") {
    return NextResponse.json({ error: "This onboarding is not awaiting acceptance." }, { status: 400 });
  }
  if (!packet.signature) {
    return NextResponse.json({ error: "The candidate has not signed yet." }, { status: 400 });
  }

  try {
    const result = await dispatchOnboarding(id, { final: true, req });
    await logAudit({
      actorId: actor.userId, action: "onboarding.finalize", section: "Onboarding",
      summary: `Accepted the signed offer and emailed the counter-signed documents`,
      targetType: "onboarding_packet", targetId: id, changes: { status: { from: "signed", to: "completed" } },
    });
    return NextResponse.json({ status: "completed", ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to send signed documents" }, { status: 502 });
  }
}
