/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

type Ctx = { params: Promise<{ token: string }> };

// Serve the candidate's uploaded profile (face) photo for the e-sign face match.
// Matched by the packet's candidate_email → their submitted face_photo document.
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();

  const { data: packet } = await supabase
    .from("onboarding_packets")
    .select("candidate_email")
    .eq("sign_token", token)
    .maybeSingle();
  if (!packet?.candidate_email) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: reqs } = await supabase
    .from("candidate_document_requests")
    .select("id")
    .ilike("candidate_email", packet.candidate_email);
  const ids = (reqs || []).map((r) => r.id);
  if (!ids.length) return NextResponse.json({ error: "No documents" }, { status: 404 });

  const { data: doc } = await supabase
    .from("candidate_documents")
    .select("file_share_id")
    .eq("document_type", "face_photo")
    .in("request_id", ids)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!doc?.file_share_id) return NextResponse.json({ error: "No photo" }, { status: 404 });

  const { data: share } = await supabase
    .from("mail_file_shares")
    .select("storage_url")
    .eq("id", doc.file_share_id)
    .maybeSingle();

  const m = (share?.storage_url || "").match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!m) return NextResponse.json({ error: "Unavailable" }, { status: 404 });

  const buffer = Buffer.from(m[2], "base64");
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": m[1] || "image/jpeg", "Cache-Control": "private, no-store" },
  });
}
