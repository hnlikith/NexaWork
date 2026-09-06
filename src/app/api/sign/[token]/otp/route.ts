/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMailContext, sendRecruitmentMail, otpEmailHtml } from "@/lib/recruitment-mail";

type Ctx = { params: Promise<{ token: string }> };

const isExpired = (p: any) => !!p.token_expires_at && new Date(p.token_expires_at).getTime() < Date.now();
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// POST /api/sign/[token]/otp  — { action: "send" } | { action: "verify", otp }
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    const { action, otp } = await req.json().catch(() => ({}));

    const supabase = getSupabaseAdmin();
    const { data: packet } = await supabase
      .from("onboarding_packets")
      .select("*")
      .eq("sign_token", token)
      .maybeSingle();

    if (!packet) return NextResponse.json({ error: "Invalid signing link." }, { status: 404 });
    if (packet.status === "signed" || packet.status === "completed")
      return NextResponse.json({ error: "This offer has already been signed." }, { status: 400 });
    if (isExpired(packet)) return NextResponse.json({ error: "This signing link has expired." }, { status: 410 });

    if (action === "send") {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const expires = new Date(Date.now() + 60_000).toISOString(); // 1 minute
      const { error: upErr } = await supabase
        .from("onboarding_packets")
        .update({ sign_otp_hash: sha(code), sign_otp_expires_at: expires, sign_otp_attempts: 0 })
        .eq("id", packet.id);
      if (upErr) {
        // Almost always: the OTP columns aren't migrated yet (migration 105).
        console.error("[sign otp send] could not store code — is migration 105 applied?", upErr.message);
        return NextResponse.json({ error: "Verification is temporarily unavailable. Please contact your hiring coordinator." }, { status: 500 });
      }

      const ctx = await getMailContext();
      await sendRecruitmentMail(ctx, {
        to: packet.candidate_email,
        subject: `Your verification code — ${ctx.companyName}`,
        html: otpEmailHtml(code, ctx.companyName),
      });
      return NextResponse.json({ sent: true });
    }

    if (action === "verify") {
      if (!otp || !/^\d{6}$/.test(String(otp))) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
      if (!packet.sign_otp_hash || !packet.sign_otp_expires_at) return NextResponse.json({ error: "Request a code first." }, { status: 400 });
      if (new Date(packet.sign_otp_expires_at).getTime() < Date.now())
        return NextResponse.json({ error: "Code expired — request a new one." }, { status: 400 });
      if ((packet.sign_otp_attempts ?? 0) >= 5)
        return NextResponse.json({ error: "Too many attempts — request a new code." }, { status: 429 });

      if (sha(String(otp)) !== packet.sign_otp_hash) {
        await supabase
          .from("onboarding_packets")
          .update({ sign_otp_attempts: (packet.sign_otp_attempts ?? 0) + 1 })
          .eq("id", packet.id);
        return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
      }

      // Success — consume the code and record that OTP passed server-side. This
      // stamp is what /verify later requires before it will issue a proof token,
      // chaining OTP → face → sign so none can be skipped by calling the API direct.
      await supabase
        .from("onboarding_packets")
        .update({ sign_otp_hash: null, sign_otp_expires_at: null, sign_otp_verified_at: new Date().toISOString() })
        .eq("id", packet.id);
      return NextResponse.json({ verified: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    console.error("[sign otp]", e);
    return NextResponse.json({ error: e.message || "OTP request failed" }, { status: 500 });
  }
}
