/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveToken, zohoGet, classifyEmail } from "@/lib/zoho-mail";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = req.nextUrl;
  const folder     = searchParams.get("folder")      || "Inbox";
  const limit      = parseInt(searchParams.get("limit")  || "50");
  const start      = parseInt(searchParams.get("start")  || "0");
  const employeeId = searchParams.get("employee_id");
  const sync       = searchParams.get("sync") === "true";

  const detailId = searchParams.get("detail_id");
  if (detailId) {
    const { data: cachedMsg, error: dbError } = await supabase
      .from("mail_messages")
      .select("*")
      .eq("id", detailId)
      .maybeSingle();

    if (dbError || !cachedMsg) {
      return NextResponse.json({ error: "Message not found in local cache." }, { status: 404 });
    }

    if (cachedMsg.body && (!cachedMsg.has_attachment || cachedMsg.body.includes("Attachments ("))) {
      return NextResponse.json({ success: true, message: cachedMsg });
    }

    const token = await getActiveToken();
    if (!token) {
      return NextResponse.json({ error: "Zoho Mail not connected." }, { status: 503 });
    }

    // Resolve authorized account IDs to prevent 404 Account invalid error for non-authorized employee accounts
    let activeAccountId = cachedMsg.zoho_account_id || "4180125000000002002";
    try {
      const accountsRes = await zohoGet(token, "/accounts");
      if (accountsRes?.data?.length) {
        const authorizedAccountIds = accountsRes.data.map((acc: any) => String(acc.accountId));
        const primaryAccount = accountsRes.data.find((acc: any) => acc.isDefaultAccount || acc.isPrimary) || accountsRes.data[0];
        const primaryAccountId = String(primaryAccount.accountId);
        
        if (cachedMsg.zoho_account_id && authorizedAccountIds.includes(String(cachedMsg.zoho_account_id))) {
          activeAccountId = cachedMsg.zoho_account_id;
        } else {
          activeAccountId = primaryAccountId;
        }
      }
    } catch (e: any) {
      console.error("Failed to check authorized Zoho accounts for details fetch:", e.message);
    }

    const accountId = activeAccountId;
    const parts = cachedMsg.zoho_message_id.split("_");
    const originalMessageId = parts[parts.length - 1];

    try {
      const foldersRes = await zohoGet(token, `/accounts/${accountId}/folders`);
      if (!foldersRes?.data?.length) {
        return NextResponse.json({ error: "Could not fetch Zoho folders." }, { status: 500 });
      }

      // Helper function to try fetching details for a given folder name
      const tryFetchForFolder = async (folderName: string) => {
        const matched = foldersRes.data.find(
          (f: any) => f.folderName?.toLowerCase() === folderName.toLowerCase()
        );
        const fId = matched?.folderId;
        if (!fId) return null;

        try {
          const detailsUrl = `/accounts/${accountId}/folders/${fId}/messages/${originalMessageId}/details`;
          const detailsRes = await zohoGet(token, detailsUrl);
          if (detailsRes?.data) {
            let attachments: any[] = [];
            const hasAtt = detailsRes.data.hasAttachment === "1" || detailsRes.data.hasAttachment === true || detailsRes.data.hasAttachment === 1 || detailsRes.data.hasAttachment === "true";
            if (hasAtt) {
              try {
                const attInfoRes = await zohoGet(token, `/accounts/${accountId}/folders/${fId}/messages/${originalMessageId}/attachmentinfo`);
                if (attInfoRes?.data?.attachments) {
                  attachments = attInfoRes.data.attachments.map((att: any) => ({
                    attachmentId: att.attachmentId,
                    fileName: att.attachmentName || att.fileName,
                    size: att.attachmentSize || att.size || 0
                  }));
                }
              } catch (attErr: any) {
                console.warn(`[Inbox Details] Failed to fetch attachmentinfo for message ${originalMessageId}:`, attErr.message || attErr);
              }
            }
            return { details: { ...detailsRes.data, attachments }, folderId: fId };
          }
        } catch (err: any) {
          console.warn(`[Inbox Details] Fetch failed for folder '${folderName}':`, err.message || err);
        }
        return null;
      };

      // 1. Try the primary cached folder first
      let result = await tryFetchForFolder(cachedMsg.folder);

      // 2. Fallback to trying alternate standard folders if the primary failed
      if (!result) {
        const fallbackFolders = cachedMsg.folder.toLowerCase() === "inbox" 
          ? ["sent", "drafts", "trash"] 
          : ["inbox", "sent", "drafts", "trash"];
        
        for (const fbFolder of fallbackFolders) {
          if (fbFolder.toLowerCase() === cachedMsg.folder.toLowerCase()) continue;
          result = await tryFetchForFolder(fbFolder);
          if (result) {
            console.log(`[Inbox Route] Fallback details fetch succeeded using folder: '${fbFolder}'`);
            break;
          }
        }
      }

      if (!result || !result.details) {
        return NextResponse.json({ error: "Message details not found in any Zoho folder." }, { status: 404 });
      }

      const detailData = result.details;
      const folderId = result.folderId;
      let finalBody = detailData.content || cachedMsg.preview || "";
      const attachmentsList = detailData.attachments || [];

      if (attachmentsList.length > 0) {
        const attachmentsHtml = attachmentsList
          .map((att: any) => {
            const downloadUrl = `/api/mail/attachments?accountId=${accountId}&folderId=${folderId}&messageId=${originalMessageId}&attachmentId=${att.attachmentId}&fileName=${encodeURIComponent(att.fileName)}&fileSize=${att.size || 0}`;
            const sizeStr = formatBytes(att.size || 0);
            return `
<a href="${downloadUrl}" 
   style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; text-decoration: none; color: #334155; margin-right: 8px; margin-bottom: 8px; font-size: 12px; font-weight: 600;"
   target="_blank" rel="noopener noreferrer">
  <span>${att.fileName}</span>
  <span style="font-size: 10px; color: #64748b; font-family: monospace;">(${sizeStr})</span>
</a>`;
          })
          .join("");

        const attachmentsSection = `
<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-family: sans-serif;">
  <p style="font-size: 13px; font-weight: bold; color: #1e293b; margin: 0 0 12px 0;">
     📎 Attachments (${attachmentsList.length})
  </p>
  <div style="display: flex; flex-wrap: wrap;">
    ${attachmentsHtml}
  </div>
</div>`;
        finalBody = finalBody + attachmentsSection;
        }

        const { data: updatedMsg, error: updateError } = await supabase
          .from("mail_messages")
          .update({ body: finalBody })
          .eq("id", detailId)
          .select("*")
          .maybeSingle();

        if (updateError) {
          console.error("Failed to update message details in DB:", updateError);
        }

        return NextResponse.json({ success: true, message: updatedMsg || { ...cachedMsg, body: finalBody } });
    } catch (e: any) {
      console.error("Failed to fetch message details from Zoho:", e.message);
      return NextResponse.json({ error: `Zoho fetch failed: ${e.message}` }, { status: 500 });
    }
  }

  // Fetch from cache first
  let query = supabase
    .from("mail_messages")
    .select("*")
    .eq("folder", folder)
    .order("received_at", { ascending: false })
    .range(start, start + limit - 1);

  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data: cached } = await query;

  // If sync requested or cache empty, fetch from Zoho
  if (sync || !cached?.length) {
    const token = await getActiveToken();
    if (token) {
      // Option A: read the logged-in employee's OWN mailbox via the org token.
      // Resolve their zoho_account_id; fall back to the org admin account only if unset.
      let accountId: string | null = null;
      if (employeeId) {
        const { data: emp } = await supabase
          .from("employees")
          .select("zoho_account_id")
          .eq("id", employeeId)
          .maybeSingle();
        accountId = emp?.zoho_account_id || null;
      }
      if (!accountId) {
        const { data: config } = await supabase
          .from("zoho_config")
          .select("admin_account_id")
          .maybeSingle();
        accountId = config?.admin_account_id || null;
      }

      if (accountId) {
        try {
          // Resolve folder name to folderId from Zoho
          const foldersRes = await zohoGet(token, `/accounts/${accountId}/folders`);
          let targetFolderId: string | null = null;
          if (foldersRes?.data?.length) {
            const matched = foldersRes.data.find(
              (f: any) => f.folderName?.toLowerCase() === folder.toLowerCase()
            );
            targetFolderId = matched?.folderId || null;
          }

          const queryParams: Record<string, string> = {
            limit:  String(limit),
            start:  String(start),
            sortby: "date",
            order:  "desc",
          };
          if (targetFolderId) {
            queryParams.folderId = targetFolderId;
          }

          const zohoRes = await zohoGet(token, `/accounts/${accountId}/messages/view`, queryParams);

          if (zohoRes?.data?.length) {
            const rows = zohoRes.data.map((m: any) => ({
              zoho_message_id: `${employeeId || "admin"}_${folder}_${m.messageId}`,
              zoho_account_id: accountId,
              employee_id:     employeeId || null,
              folder,
              subject:         m.subject || "(no subject)",
              from_address:    m.fromAddress || "",
              from_name:       m.sender      || m.fromAddress || "",
              to_address:      m.toAddress   ? [m.toAddress] : [],
              preview:         m.summary     || "",
              received_at:     m.receivedTime
                ? new Date(parseInt(m.receivedTime)).toISOString()
                : new Date().toISOString(),
              is_read:         m.status === "1",
              has_attachment:  m.hasAttachment === "1",
              thread_key:      m.threadId || null,
              updated_at:      new Date().toISOString(),
            }));

            await supabase
              .from("mail_messages")
              .upsert(rows, { onConflict: "zoho_message_id" });

            // Trigger AI classification for unclassified messages asynchronously
            rows
              .filter((r: any) => !r.ai_category || r.ai_category === "GENERAL")
              .slice(0, 10)
              .forEach(async (row: any) => {
                try {
                  const ai = await classifyEmail(row.subject, row.preview, row.from_name);
                  await supabase
                    .from("mail_messages")
                    .update({
                      ai_category:     ai.category,
                      ai_priority:     ai.priority,
                      ai_sentiment:    ai.sentiment,
                      ai_summary:      ai.summary,
                      ai_processed_at: new Date().toISOString(),
                    })
                    .eq("zoho_message_id", row.zoho_message_id);
                } catch {}
              });

            const { data: fresh } = await supabase
              .from("mail_messages")
              .select("*")
              .eq("folder", folder)
              .order("received_at", { ascending: false })
              .range(start, start + limit - 1);

            return NextResponse.json({ data: fresh || rows, source: "zoho", connected: true });
          }
        } catch (e: any) {
          console.error("Zoho inbox fetch error:", e.message);
        }
      }
    }

    const { data: config } = await supabase
      .from("zoho_config")
      .select("is_connected")
      .maybeSingle();

    if (!config?.is_connected) {
      return NextResponse.json({ data: [], source: "cache", connected: false });
    }
  }

  return NextResponse.json({ data: cached || [], source: "cache", connected: true });
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { messageId, is_read, is_starred } = await req.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (is_read    !== undefined) updates.is_read    = is_read;
  if (is_starred !== undefined) updates.is_starred = is_starred;

  const { error } = await supabase
    .from("mail_messages")
    .update(updates)
    .eq("id", messageId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
