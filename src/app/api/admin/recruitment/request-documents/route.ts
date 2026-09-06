/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMailContext, sendRecruitmentMail, requestDocsHtml } from "@/lib/recruitment-mail";
import { baseUrlFrom } from "@/lib/base-url";
import { getActor } from "@/lib/onboarding/server";
import { logAudit } from "@/lib/audit";

const DOCS = ["profile_photo", "face_photo", "aadhaar", "pan"];

// Send a candidate (already in the system as an accepted application) a secure
// link to upload their KYC documents.
export async function POST(req: Request) {
  try {
    const { application_id, created_by } = await req.json();
    if (!application_id) return NextResponse.json({ error: "application_id required" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: app } = await supabase
      .from("applications")
      .select("application_id, applicant_name, applicant_email, applicant_phone")
      .eq("application_id", application_id)
      .maybeSingle();

    if (!app) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (!app.applicant_email) return NextResponse.json({ error: "Candidate has no email on file" }, { status: 400 });

    const token = crypto.randomBytes(24).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 21).toISOString();

    const { data: reqRow, error } = await supabase
      .from("candidate_document_requests")
      .insert({
        application_id: app.application_id,
        candidate_name: app.applicant_name,
        candidate_email: app.applicant_email,
        candidate_phone: app.applicant_phone ?? null,
        source: "interview",
        required_docs: DOCS,
        token,
        token_expires_at: expires,
        created_by: created_by || null,
      })
      .select("id")
      .single();
    if (error) throw error;

    const ctx = await getMailContext();
    const link = `${baseUrlFrom(req)}/documents/${token}`;
    await sendRecruitmentMail(ctx, {
      to: app.applicant_email,
      subject: `Document Submission — ${ctx.companyName}`,
      html: requestDocsHtml(app.applicant_name, ctx.companyName, link, DOCS),
    });

    const actor = await getActor();
    await logAudit({
      actorId: actor?.userId ?? created_by ?? null,
      action: "recruitment.request_documents", section: "Recruitment",
      summary: `Requested documents from ${app.applicant_name} (${app.applicant_email})`,
      targetType: "candidate_document_request", targetId: reqRow.id,
    });

    return NextResponse.json({ success: true, request_id: reqRow.id });
  } catch (e: any) {
    console.error("[request-documents]", e);
    return NextResponse.json({ error: e.message || "Failed to send document request" }, { status: 500 });
  }
}
