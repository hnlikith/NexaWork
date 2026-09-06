/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const room     = req.nextUrl.searchParams.get("room");
  const username = req.nextUrl.searchParams.get("username");
  const userId   = req.nextUrl.searchParams.get("userId");
  const canPublish = req.nextUrl.searchParams.get("canPublish") !== "false";

  if (!room || !username) {
    return NextResponse.json({ error: "Missing room or username" }, { status: 400 });
  }

  const apiKey    = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl     = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json({ error: "Livekit not configured — add LIVEKIT_API_KEY, LIVEKIT_API_SECRET, NEXT_PUBLIC_LIVEKIT_URL to .env.local" }, { status: 503 });
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: userId || username,
    name: username,
    ttl: "4h",
  });

  at.addGrant({
    roomJoin:       true,
    room,
    canPublish,
    canSubscribe:   true,
    canPublishData: true,
  });

  // Mark meeting as active when first token is issued
  if (userId) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("meetings")
        .update({ status: "active", started_at: new Date().toISOString() })
        .eq("room_name", room)
        .eq("status", "scheduled");

      await supabase.from("meeting_participants")
        .update({ joined_at: new Date().toISOString() })
        .eq("employee_id", userId)
        .is("joined_at", null);
    } catch (_) {}
  }

  return NextResponse.json({ token: await at.toJwt(), wsUrl });
}
