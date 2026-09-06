/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getZohoToken } from "@/lib/zoho-auth";
import { zohoGet } from "@/lib/zoho-mail";

// POST /api/mail/files/size
// Body: { messages: [{ accountId, folderId, messageId }] }
// Returns: { sizes: { "${messageId}_${attachmentId}": bytes } }
//
// Groups by message so one call returns sizes for ALL attachments in that message.
export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || !messages.length) {
      return NextResponse.json({ sizes: {} });
    }

    const token = await getZohoToken();
    if (!token) return NextResponse.json({ sizes: {} });

    const sizes: Record<string, number> = {};

    // Deduplicate by messageId, cap at 20 messages
    const seen = new Set<string>();
    const unique = messages.filter(m => {
      if (!m?.messageId || seen.has(m.messageId)) return false;
      seen.add(m.messageId);
      return true;
    }).slice(0, 20);

    await Promise.allSettled(
      unique.map(async ({ accountId, folderId, messageId }: any) => {
        if (!accountId || !folderId || !messageId) return;
        try {
          const res = await zohoGet(
            token,
            `/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachmentinfo`
          );
          for (const att of res?.data?.attachments || []) {
            const size = att.attachmentSize || att.size || 0;
            if (size > 0) {
              sizes[`${messageId}_${att.attachmentId}`] = size;
            }
          }
        } catch (_) {
          // silently skip failed messages
        }
      })
    );

    return NextResponse.json({ sizes });
  } catch (e: any) {
    return NextResponse.json({ sizes: {} });
  }
}
