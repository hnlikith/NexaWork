/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import nodemailer from "nodemailer";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  try {
    const body = await req.json();
    const { assignment_ids, sent_by_emp_id, sent_by_name } = body as {
      assignment_ids: string[];
      sent_by_emp_id?: string;
      sent_by_name?: string;
    };

    if (!assignment_ids?.length) {
      return NextResponse.json({ error: "No assignments selected" }, { status: 400 });
    }

    // Load subscription
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", id)
      .single();
    if (subErr || !sub) throw new Error("Subscription not found");

    // Load assignments
    const { data: assignments, error: aErr } = await supabase
      .from("subscription_assignments")
      .select(`*, employees ( name, email )`)
      .in("id", assignment_ids);
    if (aErr) throw aErr;

    // Load company profile for SMTP
    const { data: profile } = await supabase
      .from("company_profile")
      .select("*")
      .limit(1)
      .single();

    const smtpHost = profile?.smtp_host;
    const smtpUser = profile?.smtp_user;
    const smtpPass = profile?.smtp_pass;
    const smtpPort = profile?.smtp_port || 587;
    const fromName = profile?.smtp_from_name || profile?.company_name || "NexaWork";
    const fromEmail = profile?.smtp_from_email || smtpUser;
    const companyName = profile?.company_name || "Your Organisation";

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json({ error: "SMTP not configured. Go to Config → Company Profile." }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const renewalText = sub.renewal_date
      ? new Date(sub.renewal_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      : "N/A";

    const results: { id: string; email: string; success: boolean; error?: string }[] = [];

    for (const assignment of assignments || []) {
      const toEmail = assignment.access_email || assignment.employees?.email;
      if (!toEmail) {
        results.push({ id: assignment.id, email: "", success: false, error: "No email address" });
        continue;
      }

      const recipientName = assignment.employees?.name || assignment.department_name || "Team Member";
      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Access Granted — ${sub.name}</title></head>
<body style="margin:0;padding:0;font-family:'Inter',Arial,sans-serif;background:#f5f5f5">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr>
          <td style="background:#111827;padding:32px 40px">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#6b7280">Access Credentials</p>
            <h1 style="margin:8px 0 0;font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.5px">${sub.name}</h1>
            <p style="margin:6px 0 0;font-size:12px;color:#9ca3af">${sub.provider || sub.category} &bull; ${sub.billing_cycle}</p>
          </td>
        </tr>
        <!-- Greeting -->
        <tr>
          <td style="padding:32px 40px 0">
            <p style="margin:0;font-size:15px;color:#374151">Hi <strong>${recipientName}</strong>,</p>
            <p style="margin:12px 0 0;font-size:14px;color:#6b7280;line-height:1.6">
              You have been granted access to <strong>${sub.name}</strong> by <strong>${companyName}</strong>.
              Please find your access details below.
            </p>
          </td>
        </tr>
        <!-- Credentials box -->
        <tr>
          <td style="padding:24px 40px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
              ${assignment.access_login ? `
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb">
                  <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af">Login / Username</p>
                  <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#111827;font-family:monospace">${assignment.access_login}</p>
                </td>
              </tr>` : ""}
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb">
                  <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af">Access Email</p>
                  <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#111827;font-family:monospace">${toEmail}</p>
                </td>
              </tr>
              ${assignment.access_note ? `
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb">
                  <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af">Notes</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#374151">${assignment.access_note}</p>
                </td>
              </tr>` : ""}
              <tr>
                <td style="padding:14px 20px">
                  <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af">Renewal Date</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#374151">${renewalText}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${sub.website_url ? `
        <tr>
          <td style="padding:0 40px 24px" align="center">
            <a href="${sub.website_url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700">
              Open ${sub.name} →
            </a>
          </td>
        </tr>` : ""}
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">
              Sent by <strong>${sent_by_name || "Admin"}</strong> via <strong>${companyName}</strong> &bull;
              Please keep your credentials secure and do not share them.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      try {
        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: toEmail,
          subject: `Access Granted — ${sub.name} | ${companyName}`,
          html,
        });

        // Mark as sent
        await supabase
          .from("subscription_assignments")
          .update({ credentials_sent: true, sent_at: new Date().toISOString(), sent_by_emp_id, sent_by_name })
          .eq("id", assignment.id);

        results.push({ id: assignment.id, email: toEmail, success: true });
      } catch (mailErr: unknown) {
        const errMsg = mailErr instanceof Error ? mailErr.message : "Mail error";
        results.push({ id: assignment.id, email: toEmail, success: false, error: errMsg });
      }
    }

    const sent = results.filter(r => r.success).length;
    return NextResponse.json({ results, sent, total: results.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("SEND ACCESS ERROR:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
