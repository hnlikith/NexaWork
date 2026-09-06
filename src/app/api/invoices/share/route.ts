/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabaseAdmin } from "@/lib/supabase";

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
};

export async function POST(req: Request) {
  try {
    console.log("[Share API] Received request to send invoice email");
    const body = await req.json();
    const { to, subject, message, invoice, pdfBase64, pdfFileName } = body;

    console.log("[Share API] Request data:", { to, hasInvoice: !!invoice, hasPDF: !!pdfBase64 });

    if (!to || !invoice) {
      console.warn("[Share API] Missing required fields: to or invoice");
      return NextResponse.json({ error: "Recipient email and invoice are required" }, { status: 400 });
    }

    // ── Load SMTP config from DB ──────────────────────────────────────────────
    console.log("[Share API] Loading SMTP config from database...");
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("company_profile")
      .select("smtp_host,smtp_port,smtp_user,smtp_pass,smtp_secure,smtp_from_name,smtp_from_email,company_name,gstin,address,city,state,pincode,phone,email,bank_name,bank_account,bank_ifsc")
      .limit(1)
      .single();

    console.log("[Share API] SMTP config loaded:", { hasProfile: !!profile, smtpHost: profile?.smtp_host });

    const smtpHost      = profile?.smtp_host      || process.env.SMTP_HOST;
    const smtpPort      = Number(profile?.smtp_port || process.env.SMTP_PORT || 587);
    const smtpUser      = profile?.smtp_user      || process.env.SMTP_USER;
    const smtpPass      = profile?.smtp_pass      || process.env.SMTP_PASS;
    const smtpSecure    = profile?.smtp_secure    ?? false;
    const smtpFromName  = profile?.smtp_from_name || process.env.SMTP_FROM_NAME || "NexaWork";
    const smtpFromEmail = profile?.smtp_from_email || smtpUser;

    console.log("[Share API] SMTP Config Check:", { smtpHost: !!smtpHost, smtpUser: !!smtpUser, smtpPass: !!smtpPass });

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error("[Share API] SMTP not configured");
      return NextResponse.json(
        { error: "SMTP not configured. Open Invoice Settings → SMTP / Email tab and fill in your credentials." },
        { status: 400 }
      );
    }

    // ── Build helpers ─────────────────────────────────────────────────────────
    const companyName = profile?.company_name || smtpFromName;
    const companyAddr = [profile?.address, profile?.city, profile?.state, profile?.pincode]
      .filter(Boolean).join(", ");
    const fmtINR = (n: number) =>
      "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

    // ── Professional email HTML ───────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invoice ${invoice.invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Inter',Arial,sans-serif;color:#1e293b;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="660" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#3b82f6 100%);padding:36px 44px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">TAX INVOICE</p>
                  <p style="margin:6px 0 0;font-size:10px;color:#bfdbfe;font-weight:700;letter-spacing:3px;text-transform:uppercase;">GST Compliant · Original for Recipient</p>
                </td>
                <td align="right">
                  <p style="margin:0;font-size:22px;font-weight:900;color:#ffffff;">${invoice.invoiceNumber}</p>
                  <p style="margin:5px 0 0;font-size:11px;color:#bfdbfe;">Date of Issue: <strong>${fmtDate(invoice.issuedDate)}</strong></p>
                  <p style="margin:3px 0 0;font-size:11px;color:#bfdbfe;">Due Date: <strong>${fmtDate(invoice.dueDate)}</strong></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── GREETING ── -->
        <tr>
          <td style="padding:32px 44px 20px;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#1e293b;">Dear ${invoice.clientName || "Valued Client"},</p>
            <p style="margin:12px 0 0;font-size:13px;color:#475569;line-height:1.7;">
              Greetings from <strong>${companyName}</strong>!
            </p>
            <p style="margin:10px 0 0;font-size:13px;color:#475569;line-height:1.7;">
              ${message
                ? message
                : `We hope this message finds you well. Please find attached the GST Tax Invoice <strong>${invoice.invoiceNumber}</strong>${invoice.projectName ? ` for the project <strong>${invoice.projectName}</strong>` : ""} for your records.`}
            </p>
            <p style="margin:10px 0 0;font-size:13px;color:#475569;line-height:1.7;">
              Kindly ensure the payment is processed before the due date — <strong>${invoice.dueDate || "as agreed"}</strong> — to avoid any late payment charges. Should you have any queries regarding this invoice, please don't hesitate to reach out to us.
            </p>
          </td>
        </tr>

        <!-- ── INVOICE SUMMARY CARD ── -->
        <tr>
          <td style="padding:0 44px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #1d4ed8;border-radius:12px;overflow:hidden;">
              <!-- card header -->
              <tr>
                <td colspan="2" style="background:#1d4ed8;padding:10px 18px;">
                  <p style="margin:0;font-size:10px;font-weight:900;color:#bfdbfe;text-transform:uppercase;letter-spacing:2px;">Invoice Summary</p>
                </td>
              </tr>
              <!-- invoice no + date -->
              <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px 18px;font-size:12px;color:#64748b;width:50%;">Invoice Number</td>
                <td style="padding:10px 18px;font-size:12px;font-weight:700;color:#1e293b;text-align:right;">${invoice.invoiceNumber}</td>
              </tr>
              <tr style="border-bottom:1px solid #e2e8f0;background:#f8fafc;">
                <td style="padding:10px 18px;font-size:12px;color:#64748b;">Issue Date</td>
                <td style="padding:10px 18px;font-size:12px;font-weight:600;color:#1e293b;text-align:right;">${fmtDate(invoice.issuedDate)}</td>
              </tr>
              <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px 18px;font-size:12px;color:#64748b;">Due Date</td>
                <td style="padding:10px 18px;font-size:12px;font-weight:600;color:#dc2626;text-align:right;">${fmtDate(invoice.dueDate)}</td>
              </tr>
              ${invoice.projectName ? `<tr style="border-bottom:1px solid #e2e8f0;background:#f8fafc;">
                <td style="padding:10px 18px;font-size:12px;color:#64748b;">Project</td>
                <td style="padding:10px 18px;font-size:12px;font-weight:600;color:#1d4ed8;text-align:right;">${invoice.projectName}</td>
              </tr>` : ""}
              <!-- subtotal row -->
              <tr style="border-bottom:1px solid #e2e8f0;${invoice.projectName ? "" : "background:#f8fafc;"}">
                <td style="padding:10px 18px;font-size:12px;color:#64748b;">Subtotal</td>
                <td style="padding:10px 18px;font-size:12px;font-weight:600;color:#1e293b;text-align:right;">${fmtINR(invoice.subtotal)}</td>
              </tr>
              ${Number(invoice.cgst) > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:8px 18px;font-size:12px;color:#64748b;">CGST</td>
                <td style="padding:8px 18px;font-size:12px;color:#1e293b;text-align:right;">${fmtINR(invoice.cgst)}</td>
              </tr>` : ""}
              ${Number(invoice.sgst) > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;background:#f8fafc;">
                <td style="padding:8px 18px;font-size:12px;color:#64748b;">SGST</td>
                <td style="padding:8px 18px;font-size:12px;color:#1e293b;text-align:right;">${fmtINR(invoice.sgst)}</td>
              </tr>` : ""}
              ${Number(invoice.igst) > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:8px 18px;font-size:12px;color:#64748b;">IGST</td>
                <td style="padding:8px 18px;font-size:12px;color:#1e293b;text-align:right;">${fmtINR(invoice.igst)}</td>
              </tr>` : ""}
              <!-- grand total -->
              <tr style="background:#eff6ff;">
                <td style="padding:14px 18px;font-size:15px;font-weight:900;color:#1e293b;">Grand Total</td>
                <td style="padding:14px 18px;font-size:16px;font-weight:900;color:#1d4ed8;text-align:right;">${fmtINR(invoice.total)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── PDF NOTICE ── -->
        <tr>
          <td style="padding:0 44px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:12px;color:#1d4ed8;font-weight:700;">📎 Invoice PDF Attached</p>
                  <p style="margin:6px 0 0;font-size:11px;color:#3b82f6;line-height:1.6;">
                    The full GST invoice in PDF format is attached to this email. Please download and retain it for your records. If you face any issues viewing the attachment, contact us directly.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${invoice.bankDetails ? `
        <!-- ── BANK DETAILS ── -->
        <tr>
          <td style="padding:0 44px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:10px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Bank / Payment Details</p>
                  <p style="margin:8px 0 0;font-size:12px;color:#374151;line-height:1.7;white-space:pre-line;">${invoice.bankDetails}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ""}

        <!-- ── CLOSING MESSAGE ── -->
        <tr>
          <td style="padding:0 44px 28px;">
            <p style="margin:0;font-size:13px;color:#475569;line-height:1.7;">
              We sincerely appreciate your trust and continued partnership. If you require any clarification or supporting documents regarding this invoice, our team is always ready to assist.
            </p>
            <p style="margin:16px 0 0;font-size:13px;color:#475569;">Warm regards,</p>
            <p style="margin:6px 0 0;font-size:14px;font-weight:800;color:#1e293b;">${companyName}</p>
            ${companyAddr ? `<p style="margin:3px 0 0;font-size:11px;color:#94a3b8;">${companyAddr}</p>` : ""}
            ${profile?.phone ? `<p style="margin:3px 0 0;font-size:11px;color:#94a3b8;">📞 ${profile.phone}</p>` : ""}
            ${profile?.email ? `<p style="margin:3px 0 0;font-size:11px;color:#94a3b8;">✉ ${profile.email}</p>` : ""}
            ${profile?.gstin ? `<p style="margin:3px 0 0;font-size:11px;color:#94a3b8;">GSTIN: ${profile.gstin}</p>` : ""}
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);padding:18px 44px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#bfdbfe;">This is a computer-generated invoice and does not require a physical signature.</p>
            <p style="margin:5px 0 0;font-size:10px;color:#93c5fd;">Generated on ${today} · ${companyName}</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // ── Build attachments ─────────────────────────────────────────────────────
    const attachments: any[] = [];
    if (pdfBase64) {
      attachments.push({
        filename:    pdfFileName || `${invoice.invoiceNumber}.pdf`,
        content:     pdfBase64,
        encoding:    "base64",
        contentType: "application/pdf",
      });
    }

    // ── Send ──────────────────────────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   smtpPort,
      secure: smtpSecure === true,
      auth:   { user: smtpUser, pass: smtpPass },
    });

    console.log("[Share API] Sending email via SMTP...");
    await transporter.sendMail({
      from:        `"${smtpFromName}" <${smtpFromEmail}>`,
      to,
      subject:     subject || `Invoice ${invoice.invoiceNumber} from ${companyName}`,
      html,
      attachments,
    });

    console.log("[Share API] ✓ Email sent successfully");
    return NextResponse.json({ success: true, message: `Invoice emailed to ${to} with PDF attached` });
  } catch (error: any) {
    console.error("[Share API] ✗ ERROR:", {
      message: error?.message,
      code: error?.code,
      command: error?.command,
      response: error?.response,
      statusCode: error?.statusCode,
    });
    return NextResponse.json({
      error: error.message || "Failed to send email",
      details: error?.code || "Unknown error"
    }, { status: 500 });
  }
}
