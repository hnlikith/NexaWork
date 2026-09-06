/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { ZOHO_API, getZohoToken } from "@/lib/zoho-auth";
import { zohoGet, zohoPost } from "@/lib/zoho-mail";

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface MailContext {
  token: string;
  accountId: string;
  fromAddress: string;
  companyName: string;
}

/** Document-type → human label, used in emails and the upload page. */
export const DOC_LABELS: Record<string, string> = {
  profile_photo: "Profile Photo (for ID Card)",
  face_photo: "Face Verification Selfie",
  aadhaar: "Aadhaar Card",
  pan: "PAN Card",
  other: "Supporting Document",
};

/** Company name for display (no Zoho call needed). */
export async function getCompanyName(): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("company_profile").select("company_name").limit(1).maybeSingle();
    return data?.company_name || "NexaWork";
  } catch {
    return "NexaWork";
  }
}

/**
 * Resolve the company Zoho mailbox (same path the onboarding dispatch + system
 * mailer use): the shared admin token + admin/default account. All recruitment
 * mail sends from this professional mailbox — never raw SMTP.
 */
export async function getMailContext(): Promise<MailContext> {
  const token = await getZohoToken();
  if (!token) throw new Error("Zoho Mail is not connected. Connect it in Mail Config first.");

  const supabase = getSupabaseAdmin();
  const { data: config } = await supabase.from("zoho_config").select("admin_account_id").maybeSingle();

  let accountId: string | null = config?.admin_account_id ? String(config.admin_account_id) : null;
  let fromAddress: string | null = null;
  try {
    const accts = await zohoGet(token, "/accounts");
    const list: any[] = accts?.data || [];
    const target =
      (accountId && list.find((a) => String(a.accountId) === accountId)) ||
      list.find((a) => a.isDefaultAccount || a.isPrimary) ||
      list[0];
    if (target) {
      accountId = String(target.accountId);
      fromAddress =
        target.primaryEmailAddress ||
        target.mailboxAddress ||
        (Array.isArray(target.emailAddress) ? target.emailAddress[0]?.mailId : null);
    }
  } catch (e: any) {
    throw new Error(`Could not resolve the Zoho sender mailbox: ${e.message}`);
  }
  if (!accountId || !fromAddress) throw new Error("Could not resolve the company Zoho mailbox.");

  return { token, accountId, fromAddress, companyName: await getCompanyName() };
}

interface ZohoAttachmentDescriptor { storeName: string; attachmentName: string; attachmentPath: string; }

async function uploadAttachment(ctx: MailContext, att: MailAttachment): Promise<ZohoAttachmentDescriptor> {
  const url = `${ZOHO_API.mail}/accounts/${ctx.accountId}/messages/attachments?uploadType=multipart`;
  const fd = new FormData();
  fd.append("attach", new Blob([new Uint8Array(att.content)], { type: att.contentType || "application/octet-stream" }), att.filename);
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Zoho-oauthtoken ${ctx.token}` }, body: fd });
  if (!res.ok) throw new Error(`Zoho attachment upload failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  const d = Array.isArray(json?.data) ? json.data[0] : json?.data;
  if (!d?.storeName || !d?.attachmentPath) throw new Error("Zoho attachment upload returned no descriptor");
  return { storeName: d.storeName, attachmentName: d.attachmentName || att.filename, attachmentPath: d.attachmentPath };
}

export async function sendRecruitmentMail(
  ctx: MailContext,
  opts: { to: string; subject: string; html: string; replyTo?: string; attachments?: MailAttachment[] }
): Promise<void> {
  const payload: Record<string, unknown> = {
    fromAddress: ctx.fromAddress,
    toAddress: opts.to,
    subject: opts.subject,
    content: opts.html,
    mailFormat: "html",
  };
  if (opts.attachments?.length) {
    const descriptors: ZohoAttachmentDescriptor[] = [];
    for (const a of opts.attachments) descriptors.push(await uploadAttachment(ctx, a));
    payload.attachments = descriptors;
  }
  // Note: Zoho's send API doesn't carry a Reply-To header; the candidate's
  // address is surfaced in the subject + body instead so HR can reply directly.

  const res = await zohoPost(ctx.token, `/accounts/${ctx.accountId}/messages`, payload);
  if (res?.status?.code !== 200 && res?.status?.code !== 201) {
    throw new Error(`Zoho send failed: ${JSON.stringify(res?.status ?? res)}`);
  }
}

// ── Email layout — clean, professional, transactional (table-based for clients) ──
function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shell(companyName: string, inner: string): string {
  const year = new Date().getFullYear();
  const co = esc(companyName);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e6e8eb;border-radius:10px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:22px 36px 18px;border-bottom:1px solid #eef0f2;">
          <span style="font-size:17px;font-weight:700;color:#0f172a;letter-spacing:.2px;">${co}</span>
        </td></tr>
        <tr><td style="padding:30px 36px;color:#374151;font-size:15px;line-height:1.7;">${inner}</td></tr>
        <tr><td style="padding:18px 36px 22px;border-top:1px solid #eef0f2;background:#fafbfc;">
          <p style="margin:0;font-size:11px;color:#9aa3af;line-height:1.6;">This is an automated message from ${co}. Please do not share verification codes or personal links with anyone. If you received this email in error, kindly disregard it.</p>
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:#b4bac2;">© ${year} ${co}. All rights reserved.</p>
    </td></tr>
  </table>
</body></html>`;
}

function signoff(team: string, companyName: string): string {
  return `<p style="margin:26px 0 0;font-size:15px;line-height:1.6;color:#374151;">Warm regards,<br/><strong style="color:#0f172a;">${esc(team)}</strong><br/><span style="color:#6b7280;">${esc(companyName)}</span></p>`;
}

function button(link: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
    <td style="border-radius:8px;background:#0f172a;">
      <a href="${link}" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td></tr></table>`;
}

/** Accept / reject greeting (manual flow — role-agnostic). */
export function greetingHtml(name: string, accepted: boolean, companyName: string): string {
  const n = esc(name);
  const co = esc(companyName);
  const inner = accepted
    ? `<p style="margin:0 0 16px;">Dear ${n},</p>
       <p style="margin:0 0 16px;">Thank you for taking the time to interview with us. We are delighted to inform you that you have been <strong>selected for an internship</strong> with ${co}.</p>
       <p style="margin:0 0 16px;">Your skills and the conversations we had stood out to our team, and we're genuinely excited about the contribution you'll make. Our HR team will reach out shortly with your onboarding details and the next steps to get you started.</p>
       <p style="margin:0 0 16px;">If you have any questions in the meantime, simply reply to this email — we're glad to help.</p>
       <p style="margin:0;">Once again, congratulations and welcome aboard.</p>
       ${signoff("Talent Acquisition Team", companyName)}`
    : `<p style="margin:0 0 16px;">Dear ${n},</p>
       <p style="margin:0 0 16px;">Thank you for your interest in ${co} and for taking the time to interview with us. We truly appreciate the effort you invested throughout the process.</p>
       <p style="margin:0 0 16px;">After careful consideration, we have decided not to move forward with your application at this time. This was a difficult decision given the strength of applicants, and it is in no way a reflection of your abilities or potential.</p>
       <p style="margin:0 0 16px;">We sincerely encourage you to apply for future opportunities that match your profile, and we wish you great success in the road ahead.</p>
       <p style="margin:0;">Thank you again, and we wish you all the very best.</p>
       ${signoff("Talent Acquisition Team", companyName)}`;
  return shell(companyName, inner);
}

/** Request-documents email with the candidate's unique upload link. */
export function requestDocsHtml(name: string, companyName: string, link: string, docs: string[]): string {
  const list = docs.map((d) => `<li style="margin:6px 0;">${esc(DOC_LABELS[d] || d)}</li>`).join("");
  const inner = `
    <p style="margin:0 0 16px;">Dear ${esc(name)},</p>
    <p style="margin:0 0 16px;">Congratulations once again on joining ${esc(companyName)}. To complete your onboarding, we kindly request you to submit the following documents:</p>
    <ul style="margin:0;padding-left:20px;color:#374151;">${list}</ul>
    <p style="margin:16px 0 0;">Please use your secure personal link below to upload them:</p>
    ${button(link, "Upload My Documents")}
    <p style="margin:0 0 10px;font-size:13px;color:#6b7280;">Kindly ensure each document is clear and legible. Your information is transmitted securely and used solely for onboarding and verification purposes.</p>
    <p style="margin:0;font-size:13px;color:#6b7280;">If the button doesn't work, copy and paste this link into your browser:<br/><span style="color:#1d4ed8;word-break:break-all;">${link}</span></p>
    <p style="margin:12px 0 0;font-size:13px;color:#6b7280;">This link is unique to you — please do not share it with anyone.</p>
    ${signoff("HR Team", companyName)}`;
  return shell(companyName, inner);
}

/** Reminder email — same upload link, optionally with a custom note from HR. */
export function reminderDocsHtml(name: string, companyName: string, link: string, docs: string[], customMessage?: string | null): string {
  const list = docs.map((d) => `<li style="margin:6px 0;">${esc(DOC_LABELS[d] || d)}</li>`).join("");
  const custom = customMessage
    ? `<p style="margin:16px 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #cbd5e1;color:#374151;white-space:pre-wrap;">${esc(customMessage)}</p>`
    : "";
  const inner = `
    <p style="margin:0 0 16px;">Dear ${esc(name)},</p>
    <p style="margin:0 0 16px;">We hope you're doing well. This is a gentle reminder to complete your onboarding with ${esc(companyName)} — we haven't yet received the following documents:</p>
    <ul style="margin:0;padding-left:20px;color:#374151;">${list}</ul>
    ${custom}
    ${button(link, "Upload My Documents")}
    <p style="margin:0;font-size:13px;color:#6b7280;">Your secure link (unique to you):<br/><span style="color:#1d4ed8;word-break:break-all;">${link}</span></p>
    ${signoff("HR Team", companyName)}`;
  return shell(companyName, inner);
}

/** One-time verification code for the e-sign identity gate. */
export function otpEmailHtml(code: string, companyName: string): string {
  const inner = `
    <p style="margin:0 0 14px;">Hello,</p>
    <p style="margin:0 0 4px;">Please use the verification code below to confirm your identity and sign your documents. For your security, this code expires in <strong>1 minute</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>
      <td style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:16px 28px;">
        <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:12px;color:#0f172a;">${esc(code)}</span>
      </td></tr></table>
    <p style="margin:0;font-size:13px;color:#6b7280;">If you didn't request this code, you can safely ignore this email — no action is needed.</p>
    ${signoff("Onboarding Team", companyName)}`;
  return shell(companyName, inner);
}

/** Email sent back to HR with the candidate's submitted documents attached. */
export function hrReturnHtml(opts: {
  name: string; email: string; phone?: string | null; message?: string | null; docs: string[]; companyName: string;
}): string {
  const list = opts.docs.map((d) => `<li style="margin:6px 0;">${esc(DOC_LABELS[d] || d)}</li>`).join("");
  const msg = opts.message
    ? `<p style="margin:16px 0 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #cbd5e1;color:#374151;white-space:pre-wrap;"><span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9aa3af;margin-bottom:4px;">Message from candidate</span>${esc(opts.message)}</p>`
    : "";
  const inner = `
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a;"><strong>Documents received</strong></p>
    <p style="margin:0 0 16px;"><strong>${esc(opts.name)}</strong> has submitted their onboarding documents, attached to this email.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;margin:0 0 16px;">
      <tr><td style="padding:3px 14px 3px 0;color:#6b7280;">Email</td><td>${esc(opts.email)}</td></tr>
      ${opts.phone ? `<tr><td style="padding:3px 14px 3px 0;color:#6b7280;">Phone</td><td>${esc(opts.phone)}</td></tr>` : ""}
    </table>
    <p style="margin:0 0 6px;font-weight:600;color:#0f172a;">Attached documents</p>
    <ul style="margin:0;padding-left:20px;color:#374151;">${list}</ul>
    ${msg}
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">To reach the candidate, reply to ${esc(opts.email)}. The files are also available in the File Share module.</p>`;
  return shell(opts.companyName, inner);
}
