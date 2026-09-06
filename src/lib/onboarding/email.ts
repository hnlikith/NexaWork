/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// Professional onboarding emails (inline-CSS HTML for broad email-client support).

// Final email — sent after the candidate e-signs AND the onboarder accepts.
// Carries the fully counter-signed PDFs (no signing link).
export function onboardingFinalEmailHtml(opts: {
  candidateName: string;
  companyName: string;
  senderName: string;
}): string {
  const firstName = opts.candidateName?.split(" ")[0] || opts.candidateName || "there";
  return `
<div style="background:#f4f5f7;padding:32px 0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="border-top:4px solid #111827;padding:24px 32px 20px;background:#ffffff;">
      <p style="margin:0;color:#111827;font-size:18px;font-weight:700;letter-spacing:.2px;">${opts.companyName}</p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em;">Onboarding Complete</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">Dear ${firstName},</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#374151;">
        Thank you for signing your internship offer. Your onboarding has now been reviewed and confirmed by ${opts.companyName}.
        Please find your <strong>fully signed Offer Letter</strong>, <strong>Non-Disclosure Agreement</strong>, and
        <strong>Internship Handbook</strong> attached for your records.
      </p>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#374151;">
        Welcome aboard — we look forward to working with you!
      </p>
      <div style="border-top:1px solid #e5e7eb;padding-top:18px;">
        <p style="margin:0;font-size:13px;color:#374151;">Warm regards,</p>
        <p style="margin:2px 0 0;font-size:13px;font-weight:600;color:#111827;">${opts.senderName}</p>
        <p style="margin:0;font-size:12px;color:#6b7280;">${opts.companyName}</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
        These are your final signed onboarding documents. Please retain them for your records.
      </p>
    </div>
  </div>
</div>`;
}

export function onboardingEmailHtml(opts: {
  candidateName: string;
  signUrl: string;
  companyName: string;
  senderName: string;
  role?: string;
}): string {
  const firstName = opts.candidateName?.split(" ")[0] || opts.candidateName || "there";
  const roleLine = opts.role ? ` for the position of <strong>${opts.role}</strong>` : "";
  return `
<div style="background:#f4f5f7;padding:32px 0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="border-top:4px solid #111827;padding:24px 32px 20px;background:#ffffff;">
      <p style="margin:0;color:#111827;font-size:18px;font-weight:700;letter-spacing:.2px;">${opts.companyName}</p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em;">Internship Onboarding</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">Dear ${firstName},</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#374151;">
        Congratulations! We are pleased to extend an internship offer${roleLine} at <strong>${opts.companyName}</strong>.
        Your <strong>Internship Offer Letter</strong>, <strong>Non-Disclosure Agreement</strong>, and
        <strong>Internship Handbook</strong> are ready for you to review securely online.
      </p>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#374151;">
        To accept your offer, please open the secure link below to read all three documents and complete your electronic signature. Your fully signed copies will be emailed to you the moment the offer is countersigned.
      </p>
      <div style="text-align:center;margin:0 0 26px;">
        <a href="${opts.signUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 30px;border-radius:10px;">
          Review &amp; Sign Your Offer
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;line-height:1.6;">
        If the button doesn't work, copy and paste this link into your browser:<br />
        <a href="${opts.signUrl}" style="color:#4f46e5;word-break:break-all;">${opts.signUrl}</a>
      </p>
      <div style="border-top:1px solid #e5e7eb;margin:24px 0 0;padding-top:18px;">
        <p style="margin:0;font-size:13px;color:#374151;">Warm regards,</p>
        <p style="margin:2px 0 0;font-size:13px;font-weight:600;color:#111827;">${opts.senderName}</p>
        <p style="margin:0;font-size:12px;color:#6b7280;">${opts.companyName}</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
        This is an official onboarding communication. The signing link is unique to you — please do not forward it.
      </p>
    </div>
  </div>
</div>`;
}
