/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadSettings, resolveSchema } from "@/lib/onboarding/server";
import { buildTemplateData } from "@/lib/onboarding/templateData";
import { dispatchOnboarding } from "@/lib/onboarding/dispatch";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ token: string }> };

function isExpired(packet: any): boolean {
  return !!packet.token_expires_at && new Date(packet.token_expires_at).getTime() < Date.now();
}

// GET /api/sign/[token] — fetch the offer for the candidate (marks it "viewed").
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();

  const { data: packet } = await supabase
    .from("onboarding_packets")
    .select("*")
    .eq("sign_token", token)
    .maybeSingle();

  if (!packet) return NextResponse.json({ error: "This signing link is invalid." }, { status: 404 });

  const settings = await loadSettings();
  const schema = resolveSchema(settings);
  const signatory = {
    name: settings?.signatory_name ?? "YOUR NAME",
    designation: settings?.signatory_designation ?? "Founder, Executive Chairman & Managing Director",
    companyName: settings?.company_name ?? "YOUR COMPANY",
    signatureUrl: settings?.signatory_signature_url ?? null,
    sealUrl: settings?.company_seal_url ?? null,
  };

  const alreadySigned = packet.status === "signed" || packet.status === "completed";

  // First open → mark viewed.
  if (packet.status === "sent") {
    await supabase
      .from("onboarding_packets")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", packet.id);
  }

  // Capture candidate IP address and log view event
  const forwarded = _req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : _req.headers.get("x-real-ip") || null;
  await logAudit({
    actorId: null,
    actorName: packet.candidate_name,
    actorRole: "candidate",
    action: "esign.view",
    section: "E-Sign",
    summary: `${packet.candidate_name} viewed their offer letter & NDA`,
    targetType: "onboarding_packet",
    targetId: packet.id,
    ip,
  });

  const data = buildTemplateData({
    candidate: packet,
    config: packet.config,
    schema,
    signatory,
    signature: packet.signature ?? null,
    offerDateISO: packet.sent_at || packet.approved_at || null,
  });

  return NextResponse.json({
    companyName: signatory.companyName,
    candidateName: packet.candidate_name,
    candidateEmail: packet.candidate_email,
    status: packet.status,
    alreadySigned,
    expired: isExpired(packet),
    signedAt: packet.signed_at,
    data,
  });
}

// POST /api/sign/[token] — submit the candidate's e-signature.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const { image_base64, typed_name, agreed, verify_token } = await req.json().catch(() => ({}));

  if (!agreed) return NextResponse.json({ error: "Please confirm the acknowledgement." }, { status: 400 });
  if (!typed_name?.trim()) return NextResponse.json({ error: "Please type your full name." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: packet } = await supabase
    .from("onboarding_packets")
    .select("*")
    .eq("sign_token", token)
    .maybeSingle();

  if (!packet) return NextResponse.json({ error: "Invalid signing link." }, { status: 404 });
  if (packet.status === "signed" || packet.status === "completed") {
    return NextResponse.json({ error: "This offer has already been signed." }, { status: 400 });
  }
  if (isExpired(packet)) return NextResponse.json({ error: "This signing link has expired." }, { status: 410 });

  // ── Server-side identity enforcement ────────────────────────────────────────
  // A signature is only accepted with a valid, unexpired, single-use proof token
  // that /verify issued AFTER server-checked OTP + passed liveness/face. Without
  // this, the client-side gate could be skipped by POSTing here directly.
  const proofOk =
    !!verify_token &&
    !!packet.sign_verify_token &&
    verify_token === packet.sign_verify_token &&
    !!packet.sign_verify_expires_at &&
    new Date(packet.sign_verify_expires_at).getTime() > Date.now() &&
    !!packet.sign_otp_verified_at &&
    !!packet.sign_face_verified_at;
  if (!proofOk) {
    return NextResponse.json(
      { error: "verification_required", message: "Please verify your identity again before signing." },
      { status: 403 }
    );
  }

  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "").trim();
  const signature = {
    image_base64: image_base64 || undefined,
    typed_name: typed_name.trim(),
    signed_at: new Date().toISOString(),
    ip: ip || undefined,
    user_agent: req.headers.get("user-agent") || undefined,
    // Bind the recorded identity-verification evidence to the signature itself.
    verification: packet.sign_verification ?? undefined,
  };

  await supabase
    .from("onboarding_packets")
    .update({
      signature,
      status: "signed",
      signed_at: signature.signed_at,
      // Consume the proof (single-use) and clear the OTP stamp so a fresh
      // verification is required for any future action on this packet.
      sign_verify_token: null,
      sign_verify_expires_at: null,
      sign_otp_verified_at: null,
    })
    .eq("id", packet.id);

  await logAudit({
    actorId: null, actorName: packet.candidate_name, actorRole: "candidate",
    action: "esign.signed", section: "E-Sign",
    summary: `${packet.candidate_name} e-signed their offer letter & NDA`,
    targetType: "onboarding_packet", targetId: packet.id, ip: ip || null,
  });

  // Regenerate all 3 signed PDFs + email them to the candidate (best-effort; signing succeeds regardless).
  try {
    await dispatchOnboarding(packet.id, { final: true });
  } catch (e: any) {
    console.error("[sign] post-sign final dispatch (signed PDF email) failed:", e.message);
  }

  // Notify the creator + admins.
  const recipients = new Set<string>();
  if (packet.created_by) recipients.add(packet.created_by);
  const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
  admins?.forEach((a) => recipients.add(a.id));
  if (recipients.size) {
    await supabase.from("system_notifications").insert(
      [...recipients].map((uid) => ({
        user_id: uid,
        title: `Offer Signed — ${packet.candidate_name}`,
        message: `${packet.candidate_name} has e-signed their internship offer and NDA.`,
        type: "success",
        link: `/admin/onboarding/${packet.id}`,
      }))
    );
  }

  return NextResponse.json({ ok: true });
}
