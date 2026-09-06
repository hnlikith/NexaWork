/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor } from "@/lib/onboarding/server";

// Serve a candidate's display picture by email for internal onboarding views.
// Prefers the dedicated profile_photo; falls back to the verification selfie so
// existing candidates (uploaded before profile_photo existed) still show a DP.
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: reqs } = await supabase
    .from("candidate_document_requests")
    .select("id")
    .ilike("candidate_email", email);
  const ids = (reqs || []).map((r) => r.id);
  if (!ids.length) return NextResponse.json({ error: "No documents" }, { status: 404 });

  // Try the profile photo first, then fall back to the face selfie.
  let fileShareId: string | null = null;
  for (const type of ["profile_photo", "face_photo"]) {
    const { data: doc } = await supabase
      .from("candidate_documents")
      .select("file_share_id")
      .eq("document_type", type)
      .in("request_id", ids)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (doc?.file_share_id) { fileShareId = doc.file_share_id; break; }
  }
  if (!fileShareId) return NextResponse.json({ error: "No photo" }, { status: 404 });

  const { data: share } = await supabase
    .from("mail_file_shares")
    .select("storage_url")
    .eq("id", fileShareId)
    .maybeSingle();

  const m = (share?.storage_url || "").match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!m) return NextResponse.json({ error: "Unavailable" }, { status: 404 });

  const buffer = Buffer.from(m[2], "base64");
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": m[1] || "image/jpeg", "Cache-Control": "private, max-age=300" },
  });
}
