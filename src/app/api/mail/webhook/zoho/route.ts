/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveToken, zohoGet, classifyEmail } from "@/lib/zoho-mail";

// Zoho Mail pushes a POST here whenever a new email arrives in a watched mailbox.
// Register this URL via POST /api/mail/webhook/register (run once after deploying to prod).
// After insert the postgres_changes Realtime subscription in the inbox fires automatically.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate the shared secret so random callers can't inject fake mail events
    const webhookToken = process.env.ZOHO_WEBHOOK_TOKEN;
    if (webhookToken && body.token !== webhookToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const event = String(body.event || "").toUpperCase().replace(/_/g, "");
    if (!event.includes("NEWMAIL") && !event.includes("NEW")) {
      return NextResponse.json({ success: true, skipped: "irrelevant_event" });
    }

    const accountId = String(body.account?.accountId || body.accountId || "");
    const messageId = String(body.message?.messageId || body.messageId || "");
    const folderId  = String(body.message?.folderId  || body.folderId  || "");

    if (!accountId || !messageId) {
      return NextResponse.json({ error: "Missing accountId or messageId" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Find the employee who owns this Zoho account
    const { data: emp } = await supabase
      .from("employees")
      .select("id, zoho_email, zoho_account_id")
      .eq("zoho_account_id", accountId)
      .maybeSingle();

    const employeeId = emp?.id || null;
    const zohoMsgId  = `${employeeId || "admin"}_Inbox_${messageId}`;

    // Idempotency — skip if already synced
    const { data: existing } = await supabase
      .from("mail_messages")
      .select("id")
      .eq("zoho_message_id", zohoMsgId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, skipped: "already_exists" });
    }

    // Fetch full message details from Zoho
    const token = await getActiveToken();
    let msgData: any = body.message || null;

    if (token) {
      try {
        const detailPath = folderId
          ? `/accounts/${accountId}/folders/${folderId}/messages/${messageId}/details`
          : `/accounts/${accountId}/messages/${messageId}/details`;
        const res = await zohoGet(token, detailPath);
        if (res?.data) msgData = res.data;
      } catch (e: any) {
        console.warn("[Zoho Webhook] Detail fetch failed, using webhook payload:", e.message);
      }
    }

    if (!msgData) {
      return NextResponse.json({ error: "No message data available" }, { status: 404 });
    }

    const subject     = msgData.subject    || "(no subject)";
    const fromAddress = msgData.fromAddress || msgData.from_address || "";
    const fromName    = msgData.sender      || msgData.from_name    || fromAddress;
    const preview     = msgData.summary     || msgData.preview      || "";
    const toAddress   = msgData.toAddress
      ? (typeof msgData.toAddress === "string" ? msgData.toAddress.split(",").map((e: string) => e.trim()) : msgData.toAddress)
      : [];

    const receivedAt = msgData.receivedTime
      ? new Date(parseInt(msgData.receivedTime)).toISOString()
      : new Date().toISOString();

    let aiFields: Record<string, unknown> = {};
    try {
      const ai = await classifyEmail(subject, preview, fromName);
      aiFields = {
        ai_category:     ai.category,
        ai_priority:     ai.priority,
        ai_sentiment:    ai.sentiment,
        ai_summary:      ai.summary,
        ai_processed_at: new Date().toISOString(),
      };
    } catch {}

    await supabase.from("mail_messages").insert({
      zoho_message_id: zohoMsgId,
      zoho_account_id: accountId,
      employee_id:     employeeId,
      folder:          "Inbox",
      subject,
      from_address:    fromAddress,
      from_name:       fromName,
      to_address:      toAddress,
      preview,
      received_at:     receivedAt,
      is_read:         false,
      has_attachment:  msgData.hasAttachment === "1" || msgData.hasAttachment === true,
      updated_at:      new Date().toISOString(),
      ...aiFields,
    });

    // The postgres_changes subscription in the inbox page fires automatically after the insert above.
    console.log(`[Zoho Webhook] Inserted new mail ${messageId} for employee ${employeeId}`);
    return NextResponse.json({ success: true, messageId });

  } catch (err: any) {
    console.error("[Zoho Webhook] Error:", err.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Zoho sends a GET with ?challenge=<token> when you first register the webhook — echo it back
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge");
  if (challenge) {
    return new NextResponse(challenge, { headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ status: "webhook_active" });
}
