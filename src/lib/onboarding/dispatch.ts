/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ZOHO_API, getZohoToken } from "@/lib/zoho-auth";
import { zohoGet, zohoPost } from "@/lib/zoho-mail";
import { generateAndStorePdfs, downloadPdf } from "./pdf";
import { buildTemplateData } from "./templateData";
import { loadSettings, resolveSchema } from "./server";
import { onboardingEmailHtml, onboardingFinalEmailHtml } from "./email";
import { baseUrlFrom } from "@/lib/base-url";

interface ZohoAttachment { storeName: string; attachmentName: string; attachmentPath: string; }

/** Upload a file to a Zoho mailbox and return the attachment descriptor for the send payload. */
async function uploadZohoAttachment(
  token: string, accountId: string, filename: string, buffer: Buffer
): Promise<ZohoAttachment> {
  const url = `${ZOHO_API.mail}/accounts/${accountId}/messages/attachments?uploadType=multipart`;
  const fd = new FormData();
  fd.append("attach", new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), filename);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Zoho attachment upload failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  const d = Array.isArray(json?.data) ? json.data[0] : json?.data;
  if (!d?.storeName || !d?.attachmentPath) throw new Error("Zoho attachment upload returned no descriptor");
  return { storeName: d.storeName, attachmentName: d.attachmentName || filename, attachmentPath: d.attachmentPath };
}

interface Sender { accountId: string; fromAddress: string; viaAdmin: boolean; }

/** Resolve the sending mailbox: the form creator's professional Zoho mailbox, else the admin mailbox. */
async function resolveSender(
  token: string,
  creator: { zoho_email: string | null; zoho_account_id: string | null } | null
): Promise<Sender> {
  if (creator?.zoho_account_id && creator?.zoho_email) {
    return { accountId: String(creator.zoho_account_id), fromAddress: creator.zoho_email, viaAdmin: false };
  }
  // Fallback to the admin/default mailbox.
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
      fromAddress = target.primaryEmailAddress || target.mailboxAddress ||
        (Array.isArray(target.emailAddress) ? target.emailAddress[0]?.mailId : null);
    }
  } catch { /* ignore */ }
  if (!accountId || !fromAddress) throw new Error("Could not resolve a Zoho sender mailbox.");
  return { accountId, fromAddress, viaAdmin: true };
}

/**
 * Generate the 3 onboarding PDFs, store them, and email them to the candidate
 * from the form creator's Zoho mailbox with a unique e-signature magic link.
 * Sets the packet to "sent" on success. Throws on failure (status stays "approved").
 */
export async function dispatchOnboarding(
  packetId: string,
  opts: { final?: boolean; req?: Request } = {}
): Promise<{ ok: true; messageId?: string; from: string }> {
  const final = !!opts.final;
  const supabase = getSupabaseAdmin();

  const { data: packet } = await supabase.from("onboarding_packets").select("*").eq("id", packetId).maybeSingle();
  if (!packet) throw new Error("Onboarding not found");
  if (!packet.candidate_email) throw new Error("Candidate email is missing");
  if (final && !packet.signature) throw new Error("Candidate has not signed yet.");

  const settings = await loadSettings();
  const schema = resolveSchema(settings);
  const signatory = {
    name: settings?.signatory_name ?? "YOUR NAME",
    designation: settings?.signatory_designation ?? "Founder, Executive Chairman & Managing Director",
    companyName: settings?.company_name ?? "YOUR COMPANY",
    signatureUrl: settings?.signatory_signature_url ?? null,
    sealUrl: settings?.company_seal_url ?? null,
  };

  // Unique magic-link token (kept stable across re-sends).
  const signToken = packet.sign_token || crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 21).toISOString(); // 21 days

  const data = buildTemplateData({
    candidate: packet,
    config: packet.config,
    schema,
    signatory,
    // Final send embeds the candidate's signature; offer send is unsigned.
    signature: final ? packet.signature : null,
    offerDateISO: final ? (packet.sent_at || packet.approved_at || null) : new Date().toISOString(),
  });

  // 1. PDFs are only generated for the FINAL send (the countersigned copies that
  //    get attached). The OFFER send is link-only: the candidate reviews the docs
  //    live on the /sign page (which renders from template data, not stored PDFs),
  //    so we skip Chromium entirely here. That makes the offer send instant and
  //    reliable, and a link-only email lands in the inbox instead of Spam/Promotions.
  let paths: Partial<Record<"offer" | "nda" | "handbook", string>> = {};
  if (final) {
    paths = await generateAndStorePdfs(packet.id, data);
    await supabase
      .from("onboarding_packets")
      .update({
        offer_pdf_url: paths.offer ?? null,
        nda_pdf_url: paths.nda ?? null,
        handbook_pdf_url: paths.handbook ?? null,
      })
      .eq("id", packet.id);
  } else {
    await supabase
      .from("onboarding_packets")
      .update({ sign_token: signToken, token_expires_at: expires })
      .eq("id", packet.id);
  }

  // 2. Resolve Zoho token + sending mailbox (form creator's, else admin).
  const token = await getZohoToken();
  if (!token) throw new Error("Zoho Mail is not connected. Configure it in Mail Config.");

  let creator: { name: string | null; email: string | null; zoho_email: string | null; zoho_account_id: string | null } | null = null;
  if (packet.created_by) {
    const { data: emp } = await supabase
      .from("employees")
      .select("name, email, zoho_email, zoho_account_id")
      .eq("id", packet.created_by)
      .maybeSingle();
    creator = (emp as any) ?? null;
  }
  const sender = await resolveSender(token, creator);

  // 3. Attach the signed PDFs — ONLY on the final send. The offer send carries no
  //    attachments (link-only). Download from Storage + upload to Zoho in parallel.
  const files = final
    ? ([
        { name: `Offer Letter - ${packet.candidate_name}.pdf`, path: paths.offer },
        { name: `NDA - ${packet.candidate_name}.pdf`, path: paths.nda },
        { name: `Internship Handbook.pdf`, path: paths.handbook },
      ].filter((f) => f.path) as { name: string; path: string }[])
    : [];

  const descriptors: ZohoAttachment[] = await Promise.all(
    files.map(async (f) => {
      const buf = await downloadPdf(f.path);
      return uploadZohoAttachment(token, sender.accountId, f.name, buf);
    })
  );

  // 4. Compose + send.
  const signUrl = `${baseUrlFrom(opts.req)}/sign/${signToken}`;
  let content = final
    ? onboardingFinalEmailHtml({
        candidateName: packet.candidate_name,
        companyName: signatory.companyName,
        senderName: creator?.name || signatory.name,
      })
    : onboardingEmailHtml({
        candidateName: packet.candidate_name,
        signUrl,
        companyName: signatory.companyName,
        senderName: creator?.name || signatory.name,
        role: typeof packet.config?.position === "string" ? packet.config.position : undefined,
      });
  if (sender.viaAdmin && creator?.name) {
    content =
      `<div style="font-family:sans-serif;font-size:11px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:16px;max-width:600px;">This message was sent by <strong>${creator.name}</strong>${creator.email ? ` (${creator.email})` : ""} via ${signatory.companyName}.</div>` +
      content;
  }

  const payload: Record<string, unknown> = {
    fromAddress: sender.fromAddress,
    toAddress: packet.candidate_email,
    subject: final
      ? `Your Signed Internship Offer & Documents — ${signatory.companyName}`
      : `Your Internship Offer — Action Required to Accept`,
    content,
    mailFormat: "html",
  };
  if (descriptors.length) payload.attachments = descriptors;

  const res = await zohoPost(token, `/accounts/${sender.accountId}/messages`, payload);
  if (res?.status?.code !== 200 && res?.status?.code !== 201) {
    throw new Error(`Zoho send failed: ${JSON.stringify(res?.status ?? res)}`);
  }

  await supabase
    .from("onboarding_packets")
    .update(final ? { status: "completed" } : { status: "sent", sent_at: new Date().toISOString() })
    .eq("id", packet.id);

  return { ok: true, messageId: res?.data?.messageId, from: sender.fromAddress };
}
