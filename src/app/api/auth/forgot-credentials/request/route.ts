/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email parameter is required." }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const supabase = getSupabaseAdmin();

    // 1. Look up the employee profile in database by email (personal, professional, or zoho)
    const { data: emp, error: dbErr } = await supabase
      .from("employees")
      .select("id, name, email, zoho_email, personal_email, status, is_active")
      .or(`email.ilike.${cleanEmail},personal_email.ilike.${cleanEmail},zoho_email.ilike.${cleanEmail}`)
      .maybeSingle();

    if (dbErr) {
      return NextResponse.json({ error: "Database lookup failed: " + dbErr.message }, { status: 500 });
    }

    if (!emp) {
      return NextResponse.json({ error: "You are not registered in the system." }, { status: 404 });
    }

    if (emp.status === "disabled" || emp.is_active === false) {
      return NextResponse.json({ error: "Account has been deactivated. Please contact your administrator." }, { status: 403 });
    }

    // 2. Generate a secure 6-digit numeric OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes validation

    // 3. Delete any existing OTP codes for this email and insert the new one
    await supabase
      .from("otp_codes")
      .delete()
      .eq("email", cleanEmail);

    const { error: insertErr } = await supabase
      .from("otp_codes")
      .insert({
        email: cleanEmail,
        otp,
        expires_at: expiresAt
      });

    if (insertErr) {
      return NextResponse.json({ error: "Failed to store verification code: " + insertErr.message }, { status: 500 });
    }

    // 4. Send the OTP code to BOTH personal and professional/Zoho emails
    const smtpConfig = await supabase
      .from("system_config")
      .select("smtp_host, smtp_port, smtp_user, smtp_pass, company_name")
      .maybeSingle();

    const officialEmail = emp.zoho_email || emp.email;
    const recipientsList = [emp.personal_email, officialEmail].filter(
      (m, idx, self) => m && self.indexOf(m) === idx
    );

    let emailSent = false;

    if (smtpConfig.data?.smtp_host && smtpConfig.data?.smtp_user && smtpConfig.data?.smtp_pass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpConfig.data.smtp_host,
          port: smtpConfig.data.smtp_port || 587,
          secure: smtpConfig.data.smtp_port === 465,
          auth: {
            user: smtpConfig.data.smtp_user,
            pass: smtpConfig.data.smtp_pass
          }
        });

        const companyName = smtpConfig.data.company_name || "NexaWork";
        const recipients = recipientsList.join(",");

        const mailHtml = `
          <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
            <div style="background-color: #0b0f19; color: #ffffff; padding: 32px 20px; text-align: center;">
              <h1 style="margin:0; letter-spacing: 4px; font-size: 24px; font-weight: 900; text-transform: uppercase;">${companyName}</h1>
              <p style="margin-top: 8px; opacity: 0.8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">Security Verification Center</p>
            </div>
            <div style="padding: 40px; color: #1e293b; line-height: 1.6;">
              <h2 style="margin-top: 0; font-size: 20px; font-weight: 700; color: #0b0f19;">Verification Code Requested</h2>
              <p>Hi <b>${emp.name}</b>,</p>
              <p>We received a request to access or reset your credentials for the ${companyName} Command Center. Use the one-time verification code below to authorize your request:</p>
              
              <div style="background: #f8fafc; border: 1px dashed #cbd5e1; padding: 24px; border-radius: 12px; margin: 32px 0; text-align: center;">
                <p style="margin: 0 0 8px 0; color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 800; letter-spacing: 2px;">One-Time Verification OTP</p>
                <div style="font-size: 36px; font-weight: 900; color: #3b82f6; letter-spacing: 8px; font-family: monospace; user-select: all;">${otp}</div>
                <p style="margin: 12px 0 0 0; color: #94a3b8; font-size: 11px; font-weight: 500;">Valid for 10 minutes. Do not share this code with anyone.</p>
              </div>

              <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">This code has been dispatched to all contact endpoints registered under your identity to ensure maximum security.</p>

              <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 12px; color: #94a3b8;">
                <p style="margin: 0; font-weight: 700; color: #0b0f19;">Identity & Access Governance</p>
                <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px;">Automated Security Dispatcher · ${companyName}</p>
              </div>
            </div>
          </div>
        `;

        await transporter.sendMail({
          from: `"${companyName} Security" <${smtpConfig.data.smtp_user}>`,
          to: recipients,
          subject: `${otp} is your ${companyName} verification code`,
          html: mailHtml
        });

        emailSent = true;
        console.log(`[Forgot Credentials OTP] Successfully dispatched code to endpoints: ${recipients}`);
      } catch (mailErr: any) {
        console.error("[Forgot Credentials SMTP Error] Failed to send email:", mailErr);
        return NextResponse.json({ error: "Failed to send verification email: " + mailErr.message }, { status: 500 });
      }
    } else {
      console.warn("[Forgot Credentials OTP] SMTP settings are not configured. Falling back to log-based verification.");
      return NextResponse.json({ error: "SMTP Server is not configured. Please contact support." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "One-time verification code has been dispatched to your registered email addresses.",
      recipients: recipientsList.map(email => {
        const parts = email.split("@");
        const host = parts[1];
        const local = parts[0];
        const obscured = local.slice(0, 2) + "•••" + local.slice(-1);
        return `${obscured}@${host}`;
      })
    });

  } catch (err: any) {
    console.error("[FORGOT-CREDENTIALS-REQUEST] Error:", err);
    return NextResponse.json({ error: "Internal server error: " + err.message }, { status: 500 });
  }
}
