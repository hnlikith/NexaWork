/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Serve a single uploaded candidate document inline (opens in a new browser tab).
// The bytes live as a base64 data URL on the linked mail_file_shares row.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: doc } = await supabase
    .from("candidate_documents")
    .select("filename, file_type, file_share_id")
    .eq("id", id)
    .maybeSingle();

  if (!doc || !doc.file_share_id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: share } = await supabase
    .from("mail_file_shares")
    .select("storage_url")
    .eq("id", doc.file_share_id)
    .maybeSingle();

  const dataUrl = share?.storage_url || "";
  const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!m) return NextResponse.json({ error: "File unavailable" }, { status: 404 });

  const contentType = m[1] || doc.file_type || "application/octet-stream";
  const buffer = Buffer.from(m[2], "base64");

  // HTTP headers are Latin-1 only — strip non-ASCII (e.g. the em dash in the
  // stored name) for the plain filename, and use RFC 5987 for the real one.
  const rawName = doc.filename || "document";
  const asciiName = rawName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  const utf8Name = encodeURIComponent(rawName);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      "Cache-Control": "private, no-store",
    },
  });
}
