/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { encryptTemplate, decryptTemplate, euclidean, cosine, biometricKeyConfigured, FACE_MATCH_MAX_DISTANCE } from "@/lib/crypto/biometric";
import { faceMatchWorkerConfigured, matchViaWorker } from "@/lib/face-match-worker";

type Ctx = { params: Promise<{ token: string }> };

function toVec(x: unknown): number[] | null {
  if (!Array.isArray(x) || x.length < 64 || x.length > 1024) return null;
  const v = x.map(Number);
  return v.every((n) => Number.isFinite(n)) ? v : null;
}

// The biometric reference is the candidate's live selfie (face_photo) — fetch it as
// a data URL to forward to the face-match worker for true server-side extraction.
async function getSelfieDataUrl(supabase: any, email: string): Promise<string | null> {
  const { data: reqs } = await supabase
    .from("candidate_document_requests")
    .select("id")
    .ilike("candidate_email", email);
  const ids = (reqs || []).map((r: any) => r.id);
  if (!ids.length) return null;
  const { data: doc } = await supabase
    .from("candidate_documents")
    .select("file_share_id")
    .eq("document_type", "face_photo")
    .in("request_id", ids)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!doc?.file_share_id) return null;
  const { data: share } = await supabase
    .from("mail_file_shares")
    .select("storage_url")
    .eq("id", doc.file_share_id)
    .maybeSingle();
  return typeof share?.storage_url === "string" && share.storage_url.startsWith("data:") ? share.storage_url : null;
}

const isLinkExpired = (p: any) => !!p.token_expires_at && new Date(p.token_expires_at).getTime() < Date.now();

// How recently the OTP must have been verified for a proof token to be issued.
const OTP_FRESHNESS_MS = 30 * 60 * 1000; // 30 minutes
// Backstop lifetime of the proof token. This is NOT a countdown that rushes the
// candidate while they read — session presence is enforced by the client exit
// guard. It only bounds replay if the token were ever to leak.
const PROOF_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// POST /api/sign/[token]/verify
// Called by the client AFTER OTP + live liveness + face match all pass. The server
// re-checks that OTP was verified recently, records the biometric evidence (no raw
// images), and issues a single-use proof token that the sign POST will require.
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    const body = await req.json().catch(() => ({}));
    const ev = body?.evidence ?? {};

    const supabase = getSupabaseAdmin();
    const { data: packet } = await supabase
      .from("onboarding_packets")
      .select("*")
      .eq("sign_token", token)
      .maybeSingle();

    if (!packet) return NextResponse.json({ error: "Invalid signing link." }, { status: 404 });
    if (packet.status === "signed" || packet.status === "completed")
      return NextResponse.json({ error: "This offer has already been signed." }, { status: 400 });
    if (isLinkExpired(packet)) return NextResponse.json({ error: "This signing link has expired." }, { status: 410 });

    // OTP must have been verified in this session, recently.
    const otpAt = packet.sign_otp_verified_at ? new Date(packet.sign_otp_verified_at).getTime() : 0;
    if (!otpAt || Date.now() - otpAt > OTP_FRESHNESS_MS) {
      return NextResponse.json({ error: "otp_required", message: "Please verify your email again." }, { status: 403 });
    }

    const refPresent = ev.refPresent !== false; // default: a reference photo exists
    const livenessPass = ev.livenessPass === true;
    const qualityPass = ev.qualityPass === true;

    // Liveness + quality are asserted by the client (they depend on the live camera
    // stream, which only exists in the browser). The server refuses to mint a token
    // unless they're green.
    if (!livenessPass || !qualityPass) {
      return NextResponse.json({ error: "biometric_failed", message: "Face verification did not pass. Please try again." }, { status: 403 });
    }

    // ── Server-side face verification ───────────────────────────────────────────
    // Two tiers, best-available wins:
    //  1) Dedicated worker (worker/face-match) — TRUE server-side extraction: the CNN
    //     runs on the worker over the reference selfie + live image. Non-forgeable.
    //  2) In-app comparison — the reference 128-D embedding is frozen on first verify
    //     and stored AES-256-GCM encrypted (never a raw image); distance + threshold
    //     are computed HERE against the client-extracted live descriptor.
    // If neither can run (no worker, no key/descriptors) we fall back to the client's
    // claim. No raw image is persisted in any tier.
    const refVec = toVec(body?.refDescriptor);
    const liveVec = toVec(body?.liveDescriptor);
    const liveImage = typeof body?.liveImage === "string" ? body.liveImage : null;
    let faceTemplate: string | null = packet.sign_face_template ?? null;
    let serverMatched = false;
    let serverCompared = false;
    let faceMatchSource: "server_worker" | "server" | "client" | "n/a" = "n/a";
    let similarity: number | null = typeof ev.similarity === "number" ? Math.round(ev.similarity * 1000) / 1000 : null;

    if (refPresent) {
      // Tier 1: dedicated worker — the only tier that also extracts the live face server-side.
      if (faceMatchWorkerConfigured() && liveImage) {
        const refImg = await getSelfieDataUrl(supabase, packet.candidate_email);
        if (refImg) {
          const v = await matchViaWorker(refImg, liveImage);
          if (v) {
            serverCompared = true;
            serverMatched = v.matched;
            similarity = v.similarity;
            faceMatchSource = "server_worker";
          }
        }
      }
      // Tier 2: in-app encrypted-template descriptor comparison.
      if (!serverCompared && biometricKeyConfigured()) {
        if (!faceTemplate && refVec) faceTemplate = encryptTemplate(refVec); // freeze on first enrolment
        const reference = decryptTemplate(faceTemplate) ?? (refVec ? Float32Array.from(refVec) : null);
        if (reference && liveVec) {
          const dist = euclidean(reference, liveVec);
          serverCompared = true;
          serverMatched = dist <= FACE_MATCH_MAX_DISTANCE;
          similarity = Math.round(cosine(reference, liveVec) * 1000) / 1000;
          faceMatchSource = "server";
        }
      }
      if (!serverCompared) faceMatchSource = "client";
    }

    // Authoritative face decision: prefer whichever server tier ran; fall back to the
    // client's claim only when neither could (no worker + no key/descriptors).
    const faceMatched = !refPresent ? true : serverCompared ? serverMatched : ev.faceMatched === true;
    if (refPresent && !faceMatched) {
      return NextResponse.json({ error: "biometric_failed", message: "Face verification did not pass. Please try again." }, { status: 403 });
    }

    const now = new Date();
    const proof = crypto.randomBytes(24).toString("hex");
    const verification = {
      liveness_pass: livenessPass,
      quality_pass: qualityPass,
      ref_present: refPresent,
      face_matched: refPresent ? faceMatched : null,
      face_match_source: faceMatchSource,
      similarity,
      risk_score: typeof ev.riskScore === "number" ? ev.riskScore : null,
      risk_max: typeof ev.riskMax === "number" ? ev.riskMax : null,
      device_fp: typeof ev.deviceFingerprint === "string" ? ev.deviceFingerprint.slice(0, 128) : null,
      checks: Array.isArray(ev.checks) ? ev.checks.slice(0, 20).map((c: any) => ({ label: String(c?.label ?? "").slice(0, 80), pass: !!c?.pass })) : [],
      verified_at: now.toISOString(),
    };

    const { error: upErr } = await supabase
      .from("onboarding_packets")
      .update({
        sign_face_verified_at: now.toISOString(),
        sign_face_template: faceTemplate,
        sign_verification: verification,
        sign_verify_token: proof,
        sign_verify_expires_at: new Date(now.getTime() + PROOF_TTL_MS).toISOString(),
      })
      .eq("id", packet.id);
    if (upErr) {
      // Almost always: migration 111 not applied yet.
      console.error("[sign verify] could not store proof — is migration 111 applied?", upErr.message);
      return NextResponse.json({ error: "Verification is temporarily unavailable. Please contact your hiring coordinator." }, { status: 500 });
    }

    await logAudit({
      actorId: null, actorName: packet.candidate_name, actorRole: "candidate",
      action: "esign.identity_verified", section: "E-Sign",
      summary: `${packet.candidate_name} passed identity verification (liveness${refPresent ? " + face match" : ""}) before signing`,
      targetType: "onboarding_packet", targetId: packet.id,
    });

    return NextResponse.json({ token: proof });
  } catch (e: any) {
    console.error("[sign verify]", e);
    return NextResponse.json({ error: e.message || "Verification failed" }, { status: 500 });
  }
}
