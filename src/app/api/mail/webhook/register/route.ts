/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveToken, zohoGet, zohoPost } from "@/lib/zoho-mail";

// POST /api/mail/webhook/register
// Call this ONCE after deploying to production to register the Zoho webhook.
// Zoho will then push new-mail events to /api/mail/webhook/zoho in real-time.
export async function POST(req: NextRequest) {
  try {
    const token = await getActiveToken();
    if (!token) {
      return NextResponse.json({ error: "Zoho Mail not connected" }, { status: 503 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
    if (!siteUrl || siteUrl.includes("localhost")) {
      return NextResponse.json({
        error: "Zoho webhooks require a public HTTPS URL. Deploy to production first.",
        hint:  "Set NEXT_PUBLIC_SITE_URL=https://your-domain.com in Vercel, then call this endpoint.",
      }, { status: 400 });
    }

    const webhookUrl   = `${siteUrl}/api/mail/webhook/zoho`;
    const secretToken  = process.env.ZOHO_WEBHOOK_TOKEN || "";

    const accountsRes = await zohoGet(token, "/accounts");
    const accounts: any[] = accountsRes?.data || [];

    if (!accounts.length) {
      return NextResponse.json({ error: "No Zoho accounts found" }, { status: 404 });
    }

    const results: any[] = [];
    for (const account of accounts) {
      const accountId = account.accountId;
      try {
        const payload: Record<string, unknown> = {
          notificationURL: webhookUrl,
          events:          ["NEW_MAIL"],
        };
        if (secretToken) payload.token = secretToken;

        const res = await zohoPost(token, `/accounts/${accountId}/webhooks`, payload);
        results.push({ accountId, email: account.primaryEmailAddress, success: true, response: res });
      } catch (e: any) {
        results.push({ accountId, email: account.primaryEmailAddress, success: false, error: e.message });
      }
    }

    const allOk = results.every(r => r.success);
    return NextResponse.json({
      success: allOk,
      webhookUrl,
      registeredFor: results.length,
      results,
    });

  } catch (err: any) {
    console.error("[Webhook Register] Error:", err.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
