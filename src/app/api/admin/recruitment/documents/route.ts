/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// List the documents a candidate uploaded — by request_id, or by candidate email
// (the onboarding form uses email to surface a selected candidate's documents).
export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("request_id");
  const email = req.nextUrl.searchParams.get("email");
  const supabase = getSupabaseAdmin();

  let requestIds: string[] = [];
  if (requestId) {
    requestIds = [requestId];
  } else if (email) {
    const { data: reqs } = await supabase
      .from("candidate_document_requests")
      .select("id")
      .ilike("candidate_email", email)
      .eq("status", "submitted");
    requestIds = (reqs || []).map((r) => r.id);
  } else {
    return NextResponse.json({ error: "request_id or email required" }, { status: 400 });
  }

  if (!requestIds.length) return NextResponse.json({ documents: [] });

  const { data: docs, error } = await supabase
    .from("candidate_documents")
    .select("id, document_type, filename, file_type, file_size, created_at")
    .in("request_id", requestIds)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    documents: (docs || []).map((d) => ({
      ...d,
      url: `/api/admin/recruitment/documents/file?id=${d.id}`,
    })),
  });
}
