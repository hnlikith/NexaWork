/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMailContext, getCompanyName, sendRecruitmentMail, hrReturnHtml, DOC_LABELS, type MailAttachment } from "@/lib/recruitment-mail";
import { logAudit } from "@/lib/audit";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per document

function isExpired(r: { token_expires_at?: string | null }): boolean {
  return !!r.token_expires_at && new Date(r.token_expires_at).getTime() < Date.now();
}

// Validate the token and tell the page what to collect.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();
  const { data: r } = await supabase
    .from("candidate_document_requests")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!r) return NextResponse.json({ error: "invalid" }, { status: 404 });

  // Stamp the first view so HR can see the candidate opened the link.
  if (r.status !== "submitted" && !r.viewed_at && !isExpired(r)) {
    await supabase.from("candidate_document_requests").update({ viewed_at: new Date().toISOString() }).eq("id", r.id);
  }

  // Capture candidate IP address and log view event
  const forwarded = _req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : _req.headers.get("x-real-ip") || null;
  await logAudit({
    actorId: null,
    actorName: r.candidate_name,
    actorRole: "candidate",
    action: "documents.view",
    section: "Documents",
    summary: `${r.candidate_name} opened document request link`,
    targetType: "candidate_document_request",
    targetId: r.id,
    ip,
  });

  const companyName = await getCompanyName();

  return NextResponse.json({
    candidateName: r.candidate_name,
    candidateEmail: r.candidate_email,
    requiredDocs: r.required_docs,
    docLabels: DOC_LABELS,
    companyName,
    alreadySubmitted: r.status === "submitted",
    expired: isExpired(r),
  });
}

// Receive the uploaded documents, surface them in File Share, and email them back to HR.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const supabase = getSupabaseAdmin();
    const { data: r } = await supabase
      .from("candidate_document_requests")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!r) return NextResponse.json({ error: "This link is invalid." }, { status: 404 });
    if (r.status === "submitted") return NextResponse.json({ error: "Your documents were already submitted." }, { status: 400 });
    if (isExpired(r)) return NextResponse.json({ error: "This link has expired. Please ask HR for a new one." }, { status: 410 });

    const form = await req.formData();
    const message = ((form.get("message") as string) || "").trim() || null;

    const required: string[] = r.required_docs || [];
    const attachments: MailAttachment[] = [];
    const submittedTypes: string[] = [];

    for (const docType of required) {
      const file = form.get(docType) as File | null;
      const label = DOC_LABELS[docType] || docType;
      if (!file || file.size === 0) {
        return NextResponse.json({ error: `Please upload your ${label}.` }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: `${label} is too large (max 8 MB).` }, { status: 413 });
      }

      const mime = file.type || "application/octet-stream";
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const filename = `${label} — ${r.candidate_name}.${ext}`;
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

      // Surface in the File Share module (same base64 data-URL approach as manual uploads).
      const { data: share } = await supabase
        .from("mail_file_shares")
        .insert({
          shared_by: r.created_by || null,
          filename,
          file_size: file.size,
          file_type: mime,
          storage_path: "",
          storage_url: dataUrl,
          shared_with: null,
          external_from: r.candidate_email,
        })
        .select("id")
        .single();

      await supabase.from("candidate_documents").insert({
        request_id: r.id,
        document_type: docType,
        file_share_id: share?.id || null,
        filename,
        file_size: file.size,
        file_type: mime,
      });

      attachments.push({ filename, content: buffer, contentType: mime });
      submittedTypes.push(docType);
    }

    // Email the files back to the HR mailbox that sent the invite, with the
    // candidate set as Reply-To so a reply reaches them directly.
    const ctx = await getMailContext();
    await sendRecruitmentMail(ctx, {
      to: ctx.fromAddress,
      replyTo: r.candidate_email,
      subject: `Documents from ${r.candidate_name} <${r.candidate_email}>`,
      html: hrReturnHtml({
        name: r.candidate_name,
        email: r.candidate_email,
        phone: r.candidate_phone,
        message,
        docs: submittedTypes,
        companyName: ctx.companyName,
      }),
      attachments,
    });

    await supabase
      .from("candidate_document_requests")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), candidate_message: message })
      .eq("id", r.id);

    // Capture candidate IP address and log submit event
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || null;
    await logAudit({
      actorId: null,
      actorName: r.candidate_name,
      actorRole: "candidate",
      action: "documents.submit",
      section: "Documents",
      summary: `${r.candidate_name} uploaded requested documents`,
      targetType: "candidate_document_request",
      targetId: r.id,
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[documents submit]", e);
    return NextResponse.json({ error: e.message || "Failed to submit your documents." }, { status: 500 });
  }
}
