/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, smtp_from_name, smtp_from_email, test_to } = await req.json();

  if (!smtp_host || !smtp_user || !smtp_pass) {
    return NextResponse.json({ error: "SMTP host, user and password are required" }, { status: 400 });
  }

  try {
    const fromName  = smtp_from_name  || "NexaWork";
    const fromEmail = smtp_from_email || smtp_user;
    const recipient = test_to || smtp_user;
    const today     = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const time      = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    // Remove spaces from app password (Gmail app passwords have spaces)
    const cleanPassword = smtp_pass.replace(/\s/g, "");

    console.log("SMTP Config:", {
      host: smtp_host,
      port: smtp_port,
      secure: smtp_secure,
      user: smtp_user,
      passLength: cleanPassword.length,
    });

    // Create transporter with proper Gmail configuration
    const transporter = nodemailer.createTransport({
      host:   smtp_host,
      port:   Number(smtp_port) || 587,
      secure: smtp_secure === true, // false for 587, true for 465
      auth: {
        user: smtp_user,
        pass: cleanPassword, // Use cleaned password
      },
      connectionTimeout: 5000,
      socketTimeout: 5000,
    } as any);

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Inter',Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#3b82f6 100%);padding:36px 44px;text-align:center;">
            <p style="margin:0;font-size:32px;">✅</p>
            <p style="margin:10px 0 0;font-size:22px;font-weight:900;color:#ffffff;">SMTP Configuration Verified</p>
            <p style="margin:6px 0 0;font-size:11px;color:#bfdbfe;font-weight:700;letter-spacing:2px;text-transform:uppercase;">NexaWork Panel · Invoice Settings</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 44px 20px;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#1e293b;">Hello, ${fromName}!</p>
            <p style="margin:12px 0 0;font-size:13px;color:#475569;line-height:1.7;">
              Great news — your SMTP email configuration has been verified and is working perfectly. Invoice emails will now be sent successfully.
            </p>
            <p style="margin:10px 0 0;font-size:13px;color:#475569;line-height:1.7;">
              Test email sent from <strong>${fromEmail}</strong> on ${today} at ${time}.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 44px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #1d4ed8;border-radius:12px;overflow:hidden;">
              <tr>
                <td colspan="2" style="background:#1d4ed8;padding:10px 18px;">
                  <p style="margin:0;font-size:10px;font-weight:900;color:#bfdbfe;text-transform:uppercase;letter-spacing:2px;">Configuration</p>
                </td>
              </tr>
              <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px 18px;font-size:12px;color:#64748b;width:40%;">SMTP Host</td>
                <td style="padding:10px 18px;font-size:12px;font-weight:700;color:#1e293b;">${smtp_host}</td>
              </tr>
              <tr style="border-bottom:1px solid #e2e8f0;background:#f8fafc;">
                <td style="padding:10px 18px;font-size:12px;color:#64748b;">SMTP Port</td>
                <td style="padding:10px 18px;font-size:12px;font-weight:700;color:#1e293b;">${smtp_port || 587}</td>
              </tr>
              <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px 18px;font-size:12px;color:#64748b;">Email Account</td>
                <td style="padding:10px 18px;font-size:12px;font-weight:700;color:#1e293b;">${smtp_user}</td>
              </tr>
              <tr style="background:#eff6ff;">
                <td style="padding:10px 18px;font-size:12px;color:#64748b;">From</td>
                <td style="padding:10px 18px;font-size:12px;font-weight:700;color:#1d4ed8;">${fromEmail}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 44px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">
              <tr>
                <td style="padding:16px 18px;">
                  <p style="margin:0;font-size:12px;font-weight:800;color:#15803d;">✅ Ready to Send Invoices</p>
                  <p style="margin:8px 0 0;font-size:11px;color:#166534;line-height:1.7;">
                    Your SMTP is configured correctly. GST invoices with 4K PDF attachments will be sent to clients automatically.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 44px 28px;">
            <p style="margin:0;font-size:13px;color:#475569;">Best regards,</p>
            <p style="margin:6px 0 0;font-size:14px;font-weight:800;color:#1e293b;">NexaWork Panel</p>
          </td>
        </tr>
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);padding:18px 44px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#bfdbfe;">Automated SMTP verification email</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    console.log("Sending test email to:", recipient);

    // Send the test email with proper error handling
    const info = await transporter.sendMail({
      from:    `"${fromName}" <${fromEmail}>`,
      to:      recipient,
      subject: `✅ SMTP Verified — NexaWork Panel (${today})`,
      html,
    });

    console.log("Test email sent successfully:", info.messageId);

    return NextResponse.json({
      success: true,
      message: `✅ SMTP Perfect! Test email sent to ${recipient}. Check inbox in 10-30 seconds.`
    });

  } catch (error: any) {
    console.error("SMTP Error Details:", {
      code: error.code,
      message: error.message,
      hostname: error.hostname,
      errno: error.errno,
    });

    let errorMsg = error.message;

    if (error.code === "ECONNREFUSED") {
      errorMsg = `Cannot connect to ${smtp_host}:${smtp_port}. Check host and port. For Gmail use: smtp.gmail.com:587`;
    } else if (error.code === "ENOTFOUND") {
      errorMsg = `Host "${smtp_host}" not found. Correct Gmail host: smtp.gmail.com`;
    } else if (error.message?.includes("Invalid login") || error.message?.includes("invalid user")) {
      errorMsg = `Invalid email or app password. For Gmail: Use your full email (you@example.com) and remove spaces from app password`;
    } else if (error.message?.includes("authentication failed")) {
      errorMsg = `Authentication failed. Gmail: Remove spaces from 16-char app password. Don't use regular Gmail password!`;
    } else if (error.message?.includes("ENOTFOUND") || error.message?.includes("getaddrinfo")) {
      errorMsg = `Cannot reach SMTP server. Check internet connection and that smtp.gmail.com is accessible`;
    } else if (error.message?.includes("timeout")) {
      errorMsg = `Connection timeout. Try: Host=smtp.gmail.com, Port=587, Secure=No`;
    }

    return NextResponse.json({
      error: errorMsg,
      code: error.code,
      details: error.message,
    }, { status: 500 });
  }
}
