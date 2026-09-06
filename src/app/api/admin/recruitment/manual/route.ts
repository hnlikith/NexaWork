/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMailContext, sendRecruitmentMail, greetingHtml, requestDocsHtml } from "@/lib/recruitment-mail";
import { baseUrlFrom } from "@/lib/base-url";

const DOCS = ["profile_photo", "face_photo", "aadhaar", "pan"];

// Manual entry for candidates interviewed on a 3rd-party panel.
// Sends the accept/reject greeting and, if requested, a second document-request email.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = (body.name || "").trim();
    const email = (body.email || "").trim();
    const phone = (body.phone || "").trim() || null;
    const decision = body.decision === "rejected" ? "rejected" : "accepted";
    const requestDocuments = decision === "accepted" && !!body.requestDocuments;
    const created_by = body.created_by || null;

    if (!name || !email) {
      return NextResponse.json({ error: "Candidate name and email are required" }, { status: 400 });
    }

    // Email uniqueness guard:
    // Block only on ACTIVE employees and ACTIVE (non-completed/rejected) onboarding packets.
    // Historical records in candidate_document_requests/applications are NOT blocking —
    // once an employee is deleted, their email becomes free to reuse.
    const supabase = getSupabaseAdmin();
    const [{ data: inEmployees }, { data: inOnboarding }] = await Promise.all([
      supabase
        .from("employees")
        .select("name")
        .or(`email.ilike.${email},personal_email.ilike.${email},zoho_email.ilike.${email}`)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("onboarding_packets")
        .select("candidate_name, status")
        .ilike("candidate_email", email)
        .not("status", "in", '("completed","rejected")')
        .limit(1)
        .maybeSingle(),
    ]);

    if (inEmployees) {
      return NextResponse.json(
        { error: `An employee named "${inEmployees.name}" already exists with the email "${email}". Cannot create a duplicate candidate.` },
        { status: 409 }
      );
    }

    if (inOnboarding) {
      return NextResponse.json(
        { error: `"${inOnboarding.candidate_name}" has an active onboarding in progress (${inOnboarding.status}). Complete or cancel it before re-adding this candidate.` },
        { status: 409 }
      );
    }

    const ctx = await getMailContext();

    // 1) Greeting email (accept or reject) — same as the automated ATS flow.
    await sendRecruitmentMail(ctx, {
      to: email,
      subject:
        decision === "accepted"
          ? `Congratulations from ${ctx.companyName}`
          : `Application Status Update from ${ctx.companyName}`,
      html: greetingHtml(name, decision === "accepted", ctx.companyName),
    });

    // 2) Optional second email: secure document-upload link.
    let docRequestSent = false;
    if (requestDocuments) {
      const token = crypto.randomBytes(24).toString("hex");
      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 21).toISOString();

      const { error } = await supabase.from("candidate_document_requests").insert({
        application_id: null,
        candidate_name: name,
        candidate_email: email,
        candidate_phone: phone,
        source: "manual",
        required_docs: DOCS,
        token,
        token_expires_at: expires,
        created_by,
      });
      if (error) throw error;

      const link = `${baseUrlFrom(req)}/documents/${token}`;
      await sendRecruitmentMail(ctx, {
        to: email,
        subject: `Document Submission — ${ctx.companyName}`,
        html: requestDocsHtml(name, ctx.companyName, link, DOCS),
      });
      docRequestSent = true;
    }

    return NextResponse.json({ success: true, decision, docRequestSent });
  } catch (e: any) {
    console.error("[manual-decision]", e);
    return NextResponse.json({ error: e.message || "Failed to process" }, { status: 500 });
  }
}
