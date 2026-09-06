/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor } from "@/lib/onboarding/server";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { application_id, decision, reason } = body;

    if (!application_id || !decision) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1. Fetch Candidate Data
    const { data: application, error: fetchErr } = await supabase
      .from("applications")
      .select("*, talent_analysis(*)")
      .eq("application_id", application_id)
      .single();

    if (fetchErr || !application) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // 2. Fetch SMTP Config
    const { data: profile } = await supabase
      .from("company_profile")
      .select("smtp_host,smtp_port,smtp_user,smtp_pass,smtp_secure,smtp_from_name,smtp_from_email,company_name")
      .limit(1)
      .single();

    const smtpHost      = profile?.smtp_host;
    const smtpPort      = Number(profile?.smtp_port || 587);
    const smtpUser      = profile?.smtp_user;
    const smtpPass      = profile?.smtp_pass;
    const smtpSecure    = profile?.smtp_secure ?? false;
    const smtpFromName  = profile?.smtp_from_name || "NexaWork Recruitment";
    const smtpFromEmail = profile?.smtp_from_email || smtpUser;
    const companyName   = profile?.company_name || smtpFromName;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json({ error: "SMTP not configured" }, { status: 400 });
    }

    // 3. Update Database Status (Decision Column)
    const { error: updateErr } = await supabase
      .from("applications")
      .update({ decision: decision })
      .eq("application_id", application_id);

    if (updateErr) throw updateErr;

    // 4. Send Email
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure === true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const isAccepted = decision === "accepted";
    const subject = isAccepted 
      ? `Congratulations! Interview Scheduled at ${companyName}`
      : `Application Status Update from ${companyName}`;

    const greeting = isAccepted
      ? `
        <div style="background:#f0f9ff; padding:20px; border-radius:12px; border:1px solid #bae6fd;">
          <h2 style="color:#0369a1; margin-top:0;">You are Selected!</h2>
          <p style="color:#0c4a6e; font-size:14px; line-height:1.6;">
            We are pleased to inform you that your profile has been successfully audited by our Recruitment Intelligence Engine and we would like to proceed with an interview for the <b>${application.applied_cluster_id}</b> role.
          </p>
          <div style="background:white; padding:15px; border-radius:8px; margin-top:15px;">
            <p style="margin:0; font-size:12px; color:#64748b; text-transform:uppercase; font-weight:700;">Next Steps</p>
            <p style="margin:5px 0 0; color:#1e293b; font-size:14px;">Our HR team will reach out to you shortly to schedule your live interview session. Please keep your resume and portfolio ready.</p>
          </div>
        </div>
      `
      : `
        <div style="background:#fff1f2; padding:20px; border-radius:12px; border:1px solid #fecdd3;">
          <h2 style="color:#be123c; margin-top:0;">Application Update</h2>
          <p style="color:#881337; font-size:14px; line-height:1.6;">
            Thank you for your interest in the <b>${application.applied_cluster_id}</b> position at ${companyName}.
          </p>
          <p style="color:#881337; font-size:14px; line-height:1.6;">
            After careful consideration of your qualifications against our current needs, we have decided not to move forward with your application at this time.
          </p>
          <p style="color:#475569; font-size:13px; margin-top:15px; font-style:italic;">
            We encourage you to apply for other suitable positions that match your profile in the future.
          </p>
        </div>
      `;

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: 'Inter', Arial, sans-serif; color: #1e293b; line-height:1.5;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <p style="font-size:16px;">Dear <b>${application.applicant_name}</b>,</p>
          ${greeting}
          <p style="margin-top:25px; font-size:13px; color:#64748b;">
            Warm regards,<br/>
            <b>${companyName} Talent Acquisition Team</b>
          </p>
          <hr style="border:0; border-top:1px solid #e2e8f0; margin:20px 0;"/>
          <p style="font-size:10px; color:#94a3b8; text-align:center;">
            This is an automated notification from the ${companyName} Recruitment Portal.
          </p>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: `"${smtpFromName}" <${smtpFromEmail}>`,
      to: application.applicant_email,
      subject,
      html,
    });

    const actor = await getActor();
    await logAudit({
      actorId: actor?.userId ?? null,
      action: `recruitment.${decision}`, section: "Recruitment",
      summary: `${isAccepted ? "Accepted" : "Rejected"} ${application.applicant_name}'s application`,
      targetType: "application", targetId: application_id,
      changes: { decision: { from: "pending", to: decision } },
    });

    return NextResponse.json({ success: true, message: `Decision: ${decision}. Email sent to ${application.applicant_email}` });

  } catch (error: any) {
    console.error("[Decision API] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process decision" }, { status: 500 });
  }
}
