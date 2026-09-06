/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { zohoPost, zohoGet } from "@/lib/zoho-mail";
import { getZohoToken } from "@/lib/zoho-auth";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body     = await req.json();
  const { to, cc, bcc, subject, content, fromName, employeeId, draftId, attachments } = body;

  if (!to?.length || !subject || !content) {
    return NextResponse.json({ error: "To, subject, and content are required." }, { status: 400 });
  }

  // Company mail domain, derived from configuration rather than hardcoded —
  // ZOHO_MAIL_DOMAIN is expected to be the mail-sending subdomain (e.g.
  // "mail.yourcompany.com"); the bare root domain is that with any "mail."
  // prefix stripped. Both stay empty (matching nothing) when unconfigured,
  // which is safer than matching a domain the deployer doesn't own.
  const zohoMailDomain = process.env.ZOHO_MAIL_DOMAIN || "";
  const companyRootDomain = zohoMailDomain.replace(/^mail\./, "");

  const token = await getZohoToken();
  if (!token) {
    return NextResponse.json({ error: "Zoho Mail not connected. Please configure in Mail Config." }, { status: 503 });
  }

  const { data: config } = await supabase
    .from("zoho_config")
    .select("admin_account_id")
    .maybeSingle();

  // Resolve Zoho fromAddress and accountId
  let fromAddress: string | null = null;
  let accountId: string | null = null;
  let hasEmployeeAccount = false; // true when both zoho_email + zoho_account_id are provisioned

  if (employeeId) {
    const { data: emp } = await supabase
      .from("employees")
      .select("zoho_email, zoho_account_id")
      .eq("id", employeeId)
      .maybeSingle();
    fromAddress = emp?.zoho_email || null;
    accountId = emp?.zoho_account_id || null;
    hasEmployeeAccount = !!(fromAddress && accountId);
  }

  // Fallback to config admin_account_id if employee details not resolved
  if (!accountId) {
    accountId = config?.admin_account_id || null;
  }

  // If we still don't have a fromAddress, fetch all accounts from Zoho using the active token
  if (!fromAddress && token) {
    try {
      const accountsRes = await zohoGet(token, "/accounts");
      if (accountsRes?.data?.length) {
        // Match the target accountId if resolved, otherwise default to primary/first
        const matched = accountId 
          ? accountsRes.data.find((acc: any) => String(acc.accountId) === String(accountId))
          : null;
        const target = matched || accountsRes.data.find((acc: any) => acc.isPrimary) || accountsRes.data[0];
        
        fromAddress = target.primaryEmailAddress || target.mailboxAddress || (Array.isArray(target.emailAddress) ? target.emailAddress[0]?.mailId : null);
        if (!accountId) {
          accountId = target.accountId;
        }
      }
    } catch (e: any) {
      console.error("Failed to dynamically fetch Zoho accounts details:", e.message);
    }
  }

  // Query Zoho to check which email addresses are confirmed/authorized for the active token session
  let authorizedEmails: string[] = [];
  let primaryEmail = zohoMailDomain ? `admin@${zohoMailDomain}` : "admin@your-company.com";
  let activeAccountId = config?.admin_account_id || "4180125000000002002";

  if (token) {
    try {
      const accountsRes = await zohoGet(token, "/accounts");
      if (accountsRes?.data?.length) {
        const target = accountsRes.data.find((acc: any) => acc.isDefaultAccount || acc.isPrimary) || accountsRes.data[0];
        activeAccountId = target.accountId;
        primaryEmail = target.primaryEmailAddress || target.mailboxAddress;
        
        accountsRes.data.forEach((acc: any) => {
          if (acc.emailAddress) {
            acc.emailAddress.forEach((emailObj: any) => {
              if (emailObj.mailId && emailObj.isConfirmed) {
                authorizedEmails.push(emailObj.mailId.toLowerCase());
              }
            });
          }
        });
      }
    } catch (e: any) {
      console.error("Failed to fetch authorized Zoho accounts:", e.message);
    }
  }

  // Determine final sender email and account ID for the Zoho Mail API request
  const targetFrom = fromAddress ? fromAddress.toLowerCase() : "";
  const isAuthorized = authorizedEmails.includes(targetFrom);

  let finalFromAddress = primaryEmail;
  let finalAccountId = activeAccountId;
  let bodyNotice = "";

  if (fromAddress && (hasEmployeeAccount || isAuthorized)) {
    // Employee has a provisioned Zoho account (zoho_email + zoho_account_id both set),
    // OR their address is in the admin's authorized list — send directly from their mailbox.
    finalFromAddress = fromAddress;
    if (accountId) {
      finalAccountId = accountId;
    }
  } else if (fromAddress) {
    // No provisioned account and not in admin's authorized list — fall back to admin sender + banner.
    bodyNotice = `
<div style="font-family: sans-serif; font-size: 11px; color: #475569; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 20px; max-width: 600px;">
  This message was sent by <strong>${fromName || "an employee"}</strong> (${fromAddress}) via NexaWork.
</div>`;
  }

  // Final validation
  if (!finalFromAddress) {
    return NextResponse.json({ error: "Could not resolve a valid sender Zoho email address." }, { status: 400 });
  }

  if (!finalAccountId) {
    return NextResponse.json({ error: "Could not resolve a valid Zoho account ID." }, { status: 500 });
  }

  const nativeAttachments = attachments?.filter((att: any) => att.storeName !== "supabase") || [];
  const supabaseAttachments = attachments?.filter((att: any) => att.storeName === "supabase") || [];

  let finalContent = content;
  if (supabaseAttachments.length > 0) {
    const linksHtml = supabaseAttachments
      .map((att: any) => {
        const sizeStr = formatBytes(att.attachmentSize || 0);
        return `<li><a href="${att.attachmentPath}" style="color: #4f46e5; text-decoration: underline; font-weight: 600;" target="_blank" rel="noopener noreferrer">${att.attachmentName}</a> (${sizeStr})</li>`;
      })
      .join("");

    const fallbackSection = `
<div style="margin-top: 24px; padding: 16px; border-top: 1px solid #e2e8f0; background: #f8fafc; border-radius: 8px; font-family: sans-serif;">
  <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; color: #64748b;">Cloud Attachments (via NexaWork Secure Storage)</p>
  <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #1e293b; line-height: 1.6;">
    ${linksHtml}
  </ul>
</div>`;
    finalContent = finalContent + fallbackSection;
  }

  // Check if any native attachments were renamed to bypass Zoho security rules (extension ends in "_")
  const renamedAttachments = nativeAttachments.filter((att: any) => {
    const ext = att.attachmentName.split(".").pop()?.toLowerCase();
    return ext && ext.endsWith("_") && ext.length > 1;
  });

  if (renamedAttachments.length > 0) {
    const noticeHtml = `
<div style="margin-top: 24px; padding: 16px; border-top: 1px solid #fee2e2; background: #fff5f5; border-radius: 8px; font-family: sans-serif;">
  <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #dc2626;">⚠️ Attachment Renamed for Security</p>
  <p style="margin: 0 0 8px 0; font-size: 12px; color: #7f1d1d; line-height: 1.5;">
    The following executable/system file(s) have been renamed to bypass email server security restrictions. Please download and rename them back to their original extension:
  </p>
  <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #7f1d1d; line-height: 1.5;">
    ${renamedAttachments
      .map((att: any) => {
        const currentName = att.attachmentName;
        const ext = currentName.split(".").pop()?.toLowerCase();
        let originalExt = "";
        if (ext === "ex_") originalExt = "exe";
        else if (ext === "ba_") originalExt = "bat";
        else if (ext === "cm_") originalExt = "cmd";
        else if (ext === "co_") originalExt = "com";
        else if (ext === "ms_") originalExt = "msi";
        else if (ext === "sc_") originalExt = "scr";
        else if (ext === "vb_") originalExt = "vbs";
        else if (ext === "pi_") originalExt = "pif";
        else if (ext === "cp_") originalExt = "cpl";
        else if (ext === "ht_") originalExt = "hta";
        else originalExt = ext ? ext.substring(0, ext.length - 1) + "e" : "exe"; // fallback
        const originalName = currentName.substring(0, currentName.lastIndexOf(".")) + "." + originalExt;
        return `<li><strong>${currentName}</strong> → rename to <strong>${originalName}</strong></li>`;
      })
      .join("")}
  </ul>
</div>`;
    finalContent = finalContent + noticeHtml;
  }

  // Prepend the notice banner to content if sent on behalf of employee
  if (bodyNotice) {
    finalContent = bodyNotice + finalContent;
  }

  const payload: Record<string, unknown> = {
    fromAddress: finalFromAddress,
    toAddress:   Array.isArray(to) ? to.join(",") : to,
    subject,
    content:     finalContent,
    mailFormat: "html",
  };
  if (cc?.length)  payload.ccAddress  = Array.isArray(cc)  ? cc.join(",")  : cc;
  if (bcc?.length) payload.bccAddress = Array.isArray(bcc) ? bcc.join(",") : bcc;
  if (nativeAttachments.length > 0) {
    payload.attachments = nativeAttachments.map((att: any) => ({
      storeName: att.storeName,
      attachmentName: att.attachmentName,
      attachmentPath: att.attachmentPath,
    }));
  }

  // ── Choose the sending account ──────────────────────────────────────────────
  // Attachments are now stored in Supabase (not Zoho native storage), so there
  // is no storeName/account conflict. Always try the employee's own account
  // first — the admin token has ZohoMail.organization.accounts.ALL scope which
  // allows it to send on behalf of any org member, showing their email in From.
  const primarySendAccountId =
    hasEmployeeAccount && accountId
      ? String(accountId)   // employee's own account → From shows their email
      : activeAccountId;    // admin account (fallback)

  // When we must use admin's account but the logical sender is an employee,
  // send from admin's address with a subtle banner so the recipient knows who sent it.
  if (primarySendAccountId === activeAccountId && finalFromAddress !== primaryEmail) {
    payload.fromAddress = primaryEmail;   // Zoho requires admin's address
    // Add sender notice banner so recipient knows this came from the employee
    if (!bodyNotice && fromAddress) {
      bodyNotice = `
<div style="font-family: sans-serif; font-size: 11px; color: #475569; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 20px; max-width: 600px;">
  This message was sent by <strong>${fromName || "an employee"}</strong> (${fromAddress}) via NexaWork.
</div>`;
      payload.content = bodyNotice + finalContent;
    }
  }

  let zohoRes: any;
  try {
    zohoRes = await zohoPost(token, `/accounts/${primarySendAccountId}/messages`, payload);
  } catch (sendErr: any) {
    if (primarySendAccountId !== activeAccountId) {
      // Employee account rejected (org scope may not be active yet) — fall back to admin.
      console.warn(`[Mail Send] Employee account ${primarySendAccountId} rejected, retrying via admin: ${sendErr.message.slice(0, 120)}`);
      payload.fromAddress = primaryEmail;
      // Add sender notice so recipient knows who sent this (Zoho API has no replyTo field)
      const fallbackNotice = fromAddress ? `
<div style="font-family: sans-serif; font-size: 11px; color: #475569; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 20px; max-width: 600px;">
  This message was sent by <strong>${fromName || "an employee"}</strong> (${fromAddress}) via NexaWork.
</div>` : "";
      payload.content = fallbackNotice + finalContent;
      try {
        zohoRes = await zohoPost(token, `/accounts/${activeAccountId}/messages`, payload);
      } catch (retryErr: any) {
        console.error("[Mail Send] Admin fallback also failed:", retryErr.message);
        return NextResponse.json({ error: "Failed to send email", details: retryErr.message }, { status: 500 });
      }
    } else {
      console.error("[Mail Send] Admin send failed:", sendErr.message);
      return NextResponse.json({ error: "Failed to send via Zoho", details: sendErr.message }, { status: 500 });
    }
  }

  if (zohoRes?.status?.code !== 200 && zohoRes?.status?.code !== 201) {
    return NextResponse.json({ error: "Failed to send via Zoho", details: zohoRes }, { status: 500 });
  }

  const recipientEmails = Array.isArray(to) ? to : (to as string).split(",").map(e => e.trim());
  const ccEmails = cc ? (Array.isArray(cc) ? cc : (cc as string).split(",").map(e => e.trim())) : [];
  const messageId = zohoRes?.data?.messageId;
  const insertedRecipients: { id: string; employee_id: string; is_internal: boolean }[] = [];

  // Build an attachment listing HTML section for native Zoho attachments.
  // This is embedded in the stored body so receivers can see attachment names
  // without requiring a separate Zoho detail-fetch (which may fail for non-primary accounts).
  let nativeAttachmentSection = "";
  if (nativeAttachments.length > 0) {
    const attLinksHtml = nativeAttachments
      .map((att: any) => {
        const name = att.attachmentName || "Attachment";
        // Provide a best-effort download URL using the sender's account + the new messageId (resolved post-send)
        const downloadUrl = messageId
          ? `/api/mail/attachments/download?accountId=${finalAccountId}&messageId=${messageId}&attachmentName=${encodeURIComponent(name)}&fileName=${encodeURIComponent(name)}`
          : "#";
        return `
<a href="${downloadUrl}"
   style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; text-decoration: none; color: #334155; margin-right: 8px; margin-bottom: 8px; font-size: 12px; font-weight: 600;"
   target="_blank" rel="noopener noreferrer">
  <span>${name}</span>
</a>`;
      })
      .join("");
    nativeAttachmentSection = `
<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-family: sans-serif;">
  <p style="font-size: 13px; font-weight: bold; color: #1e293b; margin: 0 0 12px 0;">
     📎 Attachments (${nativeAttachments.length})
  </p>
  <div style="display: flex; flex-wrap: wrap;">
    ${attLinksHtml}
  </div>
</div>`;
  }

  // Body to store in DB — includes native attachment listing so receivers see it immediately
  const bodyForDb = nativeAttachmentSection ? finalContent + nativeAttachmentSection : finalContent;

  if (messageId) {
    // 1. Insert sent message into sender's local Sent folder cache
    // Use {accountId}_{messageId} to satisfy UNIQUE constraint across multiple employee mailboxes
    await supabase.from("mail_messages").insert({
      zoho_message_id: `${employeeId || "admin"}_Sent_${messageId}`,
      zoho_account_id: finalAccountId,
      employee_id:     employeeId || null,
      folder:          "Sent",
      subject:         subject,
      from_address:    fromAddress,
      from_name:       fromName || "NexaWork",
      to_address:      recipientEmails,
      cc_address:      ccEmails,
      preview:         content.slice(0, 150),
      body:            bodyForDb,
      received_at:     new Date().toISOString(),
      is_read:         true,
      has_attachment:  (attachments?.length || 0) > 0,
    });

    // 2. Insert into recipient's Inbox if the recipient is an employee in our DB
    for (const recEmail of recipientEmails) {
      // Normalize email for lookup to allow matching employee records across subdomain boundaries
      // (e.g. yourcompany.com vs mail.yourcompany.com), driven by ZOHO_MAIL_DOMAIN configuration.
      const alternateEmail = (zohoMailDomain && recEmail.toLowerCase().includes(`@${zohoMailDomain}`))
        ? recEmail.toLowerCase().replace(`@${zohoMailDomain}`, `@${companyRootDomain}`)
        : (companyRootDomain && recEmail.toLowerCase().includes(`@${companyRootDomain}`)
            ? recEmail.toLowerCase().replace(`@${companyRootDomain}`, `@${zohoMailDomain}`)
            : recEmail);

      const { data: recipientEmp } = await supabase
        .from("employees")
        .select("id, zoho_account_id")
        .or(`zoho_email.eq.${recEmail},email.eq.${recEmail},zoho_email.eq.${alternateEmail},email.eq.${alternateEmail}`)
        .maybeSingle();

      if (recipientEmp?.id) {
        const recipientAccountId = recipientEmp.zoho_account_id || "4180125000000002002";
        const { data: insertedMsg } = await supabase
          .from("mail_messages")
          .insert({
            zoho_message_id: `${recipientEmp.id}_Inbox_${messageId}`,
            zoho_account_id: recipientAccountId,
            employee_id:     recipientEmp.id,
            folder:          "Inbox",
            subject:         subject,
            from_address:    fromAddress,
            from_name:       fromName || "NexaWork",
            to_address:      recipientEmails,
            cc_address:      ccEmails,
            preview:         content.slice(0, 150),
            body:            bodyForDb,
            received_at:     new Date().toISOString(),
            is_read:         false,
            has_attachment:  (attachments?.length || 0) > 0,
          })
          .select("id, employee_id")
          .maybeSingle();

        if (insertedMsg) {
          // Check if sender and recipients all belong to the organization
          const fromAddressLower = fromAddress ? fromAddress.toLowerCase() : "";
          const isFromCompany = !!companyRootDomain && (fromAddressLower.endsWith(`@${companyRootDomain}`) || fromAddressLower.endsWith(`@${zohoMailDomain}`));
          const isAllToCompany = !!companyRootDomain && recipientEmails.every(email => {
            const clean = email.toLowerCase();
            return clean.endsWith(`@${companyRootDomain}`) || clean.endsWith(`@${zohoMailDomain}`);
          });
          const isInternal = isFromCompany && isAllToCompany;

          insertedRecipients.push({
            id: insertedMsg.id,
            employee_id: insertedMsg.employee_id,
            is_internal: isInternal,
          });
        }
      }
    }
  }

  // Log in audit
  await supabase.from("mail_audit_log").insert({
    actor_id: employeeId || null,
    action:   "send",
    metadata: { to, subject, attachmentCount: attachments?.length || 0 },
  });

  // Delete draft if it was sent from one
  if (draftId) {
    await supabase.from("mail_drafts").delete().eq("id", draftId);
  }

  return NextResponse.json({ success: true, messageId, recipients: insertedRecipients });
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

