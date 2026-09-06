/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get("room");

  if (!room) {
    return NextResponse.json({ error: "Missing room" }, { status: 400 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json({ error: "Livekit not configured" }, { status: 503 });
  }

  // RoomServiceClient needs the HTTPS host, not the wss:// websocket URL
  const httpUrl = wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

  try {
    const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    const participants = await svc.listParticipants(room);

    return NextResponse.json({
      participants: participants.map((p) => ({
        identity: p.identity,
        name: p.name || p.identity,
        joinedAt: Number(p.joinedAt) * 1000,
        isPublishing: (p.tracks || []).length > 0,
      })),
    });
  } catch (err: any) {
    // LiveKit throws when the room doesn't exist yet (nobody has joined) — treat as empty
    return NextResponse.json({ participants: [] });
  }
}
