/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { classifyEmail, generateReplySuggestions, summarizeThread, callGemma } from "@/lib/zoho-mail";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body     = await req.json();
  const { type, messageId, subject, preview, fromName, body: emailBody, messages } = body;

  try {
    if (type === "classify") {
      // Check AI cache first
      if (messageId) {
        const { data: cached } = await supabase
          .from("mail_ai_cache")
          .select("*")
          .eq("zoho_message_id", messageId)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        if (cached) {
          return NextResponse.json({
            category:         cached.category,
            priority:         cached.priority,
            sentiment:        cached.sentiment,
            summary:          cached.summary,
            replySuggestions: cached.reply_suggestions,
            source:           "cache",
          });
        }
      }

      const ai = await classifyEmail(subject || "", preview || emailBody || "", fromName || "");
      const suggestions = emailBody
        ? await generateReplySuggestions(subject || "", emailBody)
        : [];

      if (messageId) {
        await supabase.from("mail_ai_cache").upsert({
          zoho_message_id:  messageId,
          category:         ai.category,
          priority:         ai.priority,
          sentiment:        ai.sentiment,
          summary:          ai.summary,
          reply_suggestions: suggestions,
          processed_at:     new Date().toISOString(),
          expires_at:       new Date(Date.now() + 3600 * 1000).toISOString(),
        }, { onConflict: "zoho_message_id" });

        await supabase.from("mail_messages").update({
          ai_category:     ai.category,
          ai_priority:     ai.priority,
          ai_sentiment:    ai.sentiment,
          ai_summary:      ai.summary,
          ai_processed_at: new Date().toISOString(),
        }).eq("zoho_message_id", messageId);
      }

      return NextResponse.json({ ...ai, replySuggestions: suggestions, source: "gemma" });
    }

    if (type === "reply_suggest") {
      if (messageId) {
        const { data: cached } = await supabase
          .from("mail_ai_cache")
          .select("*")
          .eq("zoho_message_id", messageId)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        if (cached && Array.isArray(cached.reply_suggestions) && cached.reply_suggestions.length > 0) {
          return NextResponse.json({ suggestions: cached.reply_suggestions });
        }
      }

      const suggestions = await generateReplySuggestions(subject || "", emailBody || "");

      if (messageId && suggestions.length > 0) {
        await supabase.from("mail_ai_cache").upsert({
          zoho_message_id: messageId,
          reply_suggestions: suggestions,
          processed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        }, { onConflict: "zoho_message_id" });
      }

      return NextResponse.json({ suggestions });
    }

    if (type === "summarize_thread") {
      const summary = await summarizeThread(messages || []);
      return NextResponse.json({ summary });
    }

    if (type === "digest") {
      const list = (messages || [])
        .slice(0, 10)
        .map((m: any) => `• From ${m.from_name}: ${m.subject} — ${m.preview}`)
        .join("\n");

      const prompt = `You are an executive assistant. Summarize these unread priority emails in 3 sentences for a busy executive:\n\n${list}\n\nBrief summary:`;
      const digest = await callGemma(prompt);
      return NextResponse.json({ digest: digest || "No priority emails at the moment." });
    }

    if (type === "improve_tone") {
      const IMPROVE_SYSTEM = `You are a senior professional email writer for NexaWork, a corporate HR platform. You rewrite emails to be polished, well-structured, and highly professional. You always produce HTML with inline CSS for email formatting. You follow the exact delimited output format given — no deviations.`;

      const prompt = `You are rewriting a business email to be professional. Study the example output below, then produce the same format for the ACTUAL EMAIL at the bottom.

EXAMPLE OUTPUT (study this format carefully):
===SUBJECT===
Interview Invitation — Data Science Role
===BODY===
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.75;color:#1a202c;max-width:600px;">
<p style="margin:0 0 14px 0;">Dear Rahul,</p>
<p style="margin:0 0 14px 0;">We are pleased to inform you that your application has been shortlisted for the <strong style="font-weight:700;color:#111827;">Data Science</strong> role at NexaWork.</p>
<p style="margin:0 0 14px 0;padding:10px 16px;background:#eff6ff;border-left:3px solid #3b82f6;border-radius:0 6px 6px 0;font-size:14px;"><strong style="font-weight:700;">Date:</strong> 12 June 2026 &nbsp;|&nbsp; <strong style="font-weight:700;">Time:</strong> 10:00 AM &nbsp;|&nbsp; <strong style="font-weight:700;">Venue:</strong> Jayanagar, Bengaluru</p>
<p style="margin:0 0 14px 0;">Please confirm your attendance by replying to this email at your earliest convenience.</p>
<p style="margin:14px 0 4px 0;">Best regards,</p>
<p style="margin:0;font-weight:600;color:#111827;">HR Team, NexaWork</p>
</div>
===END===

NOW PRODUCE THE SAME FORMAT FOR THIS ACTUAL EMAIL:
Subject: ${subject || "(no subject)"}
Body: ${emailBody || "(empty)"}

Rules:
- Use the exact same delimiter lines: ===SUBJECT=== and ===BODY=== and ===END===
- Write a real professional subject line after ===SUBJECT===
- Write real HTML after ===BODY=== using the same inline CSS style as the example
- Bold important names, dates, application numbers with <strong style="font-weight:700;color:#111827;">
- Put key details (dates, times, locations) in the blue callout block
- Start with Dear [name], and end with Best regards,
- Keep the exact same meaning as the original — only improve the tone and formatting
- Any text matching **@filename** (double asterisks with @ inside) is a file attachment mention — render it as <strong style="color:#6366f1;font-weight:700;">@filename</strong> in the HTML — never omit or alter it`;

      const raw = await callGemma(prompt, { systemPrompt: IMPROVE_SYSTEM, maxTokens: 4096, temperature: 0.4 });

      if (!raw) {
        return NextResponse.json({ error: "All AI models are currently busy. Please try again in 30 seconds." }, { status: 503 });
      }

      // Parse delimited response — works for OpenRouter AND local Gemma
      const subjectMatch = raw.match(/===SUBJECT===\s*([\s\S]*?)(?:===BODY===|===END===|$)/);
      const bodyMatch    = raw.match(/===BODY===\s*([\s\S]*?)(?:===END===|$)/);
      let improvedSubject = (subjectMatch?.[1] ?? "").trim() || subject || "";
      let improved        = (bodyMatch?.[1]    ?? "").trim();

      // Fallback 1: JSON parse (model wrapped in ```json```)
      if (!improved) {
        try {
          const jsonStr = raw.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
          const parsed  = JSON.parse(jsonStr);
          improved        = parsed.body    || "";
          improvedSubject = parsed.subject || subject || "";
        } catch {}
      }
      // Fallback 2: if model returned plain HTML directly (Gemma sometimes skips delimiters)
      if (!improved && (raw.includes("<div") || raw.includes("<p "))) {
        improved = raw.trim();
      }
      // Fallback 3: wrap plain text in basic HTML so it at least looks clean
      if (!improved) {
        const lines = raw.trim().split("\n").filter(Boolean);
        improved = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.75;color:#1a202c;max-width:600px;">${
          lines.map(l => `<p style="margin:0 0 14px 0;">${l}</p>`).join("")
        }</div>`;
      }

      return NextResponse.json({ improved, improvedSubject, isHtml: true });
    }

    if (type === "shorten") {
      const SHORTEN_SYSTEM = `You are a senior professional email editor at a corporate HR platform. You rewrite emails to be concise, tight, and highly professional — cutting filler words, redundant phrases, and unnecessary padding, but always preserving every piece of important information and keeping the email complete (greeting, full content, sign-off). You produce clean HTML with inline CSS. You follow the exact delimited output format given.`;

      const prompt = `You are rewriting a business email to be shorter and more professional. Study the example output below, then produce the same format for the ACTUAL EMAIL at the bottom.

EXAMPLE — original was verbose with repeated phrases. Shortened version below:
===SUBJECT===
Interview Confirmed — 12 June, 10 AM
===BODY===
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.75;color:#1a202c;max-width:600px;">
<p style="margin:0 0 14px 0;">Dear Rahul,</p>
<p style="margin:0 0 14px 0;">Your interview for the <strong style="font-weight:700;color:#111827;">Data Science</strong> role is confirmed for <strong style="font-weight:700;color:#111827;">12 June 2026 at 10:00 AM</strong> at our Jayanagar office, Bengaluru.</p>
<p style="margin:0 0 14px 0;">Please bring a copy of your resume and any relevant documents. Kindly reply to confirm your attendance.</p>
<p style="margin:14px 0 4px 0;">Best regards,</p>
<p style="margin:0;font-weight:600;color:#111827;">HR Team, NexaWork</p>
</div>
===END===

NOW PRODUCE THE SAME FORMAT FOR THIS ACTUAL EMAIL:
Subject: ${subject || "(no subject)"}
Body: ${emailBody || "(empty)"}

Rules:
- Use the exact same delimiter lines: ===SUBJECT=== and ===BODY=== and ===END===
- Write a sharp, concise subject line after ===SUBJECT===
- Write real HTML after ===BODY=== using the same inline CSS style as the example
- Keep the FULL email structure: greeting (Dear …), all important content, clear call-to-action, sign-off (Best regards, …)
- Remove ONLY filler words, redundant phrases, and unnecessary repetition — never drop key facts, dates, names, or action items
- Reduce length by 30–50% through tighter language, not by omitting content
- Bold important names, dates, numbers, and key terms with <strong style="font-weight:700;color:#111827;">
- If the original has multiple points, keep them all — just say each one more concisely
- Any text matching **@filename** (double asterisks with @ inside) is a file attachment mention — render it as <strong style="color:#6366f1;font-weight:700;">@filename</strong> in the HTML — never omit or alter it`;

      const raw = await callGemma(prompt, { systemPrompt: SHORTEN_SYSTEM, maxTokens: 2048, temperature: 0.4 });

      if (!raw) {
        return NextResponse.json({ error: "All AI models are currently busy. Please try again in 30 seconds." }, { status: 503 });
      }

      const subjectMatch  = raw.match(/===SUBJECT===\s*([\s\S]*?)(?:===BODY===|===END===|$)/);
      const bodyMatch     = raw.match(/===BODY===\s*([\s\S]*?)(?:===END===|$)/);
      let shortenedSubject = (subjectMatch?.[1] ?? "").trim() || subject || "";
      let shortened        = (bodyMatch?.[1]    ?? "").trim();

      if (!shortened) {
        try {
          const jsonStr = raw.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
          const parsed  = JSON.parse(jsonStr);
          shortened        = parsed.body    || "";
          shortenedSubject = parsed.subject || subject || "";
        } catch {}
      }
      if (!shortened && (raw.includes("<div") || raw.includes("<p "))) {
        shortened = raw.trim();
      }
      if (!shortened) {
        const lines = raw.trim().split("\n").filter(Boolean);
        shortened = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.75;color:#1a202c;max-width:600px;">${
          lines.map(l => `<p style="margin:0 0 12px 0;">${l}</p>`).join("")
        }</div>`;
      }

      return NextResponse.json({ shortened, shortenedSubject, isHtml: true });
    }

    if (type === "suggest_subject") {
      const prompt = `TASK: Suggest a concise, professional email subject line.

EMAIL BODY:
${emailBody}

RULES:
- Subject must be clear, specific, and professional
- Maximum 60 characters
- No markdown, no punctuation at end
- English only

OUTPUT: Respond with ONLY the subject line text — no JSON, no quotes, no explanation.`;
      const suggested = await callGemma(prompt);
      const cleanSubject = (suggested || "")
        .replace(/^Subject:\s*/i, "")
        .replace(/^["']|["']$/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .trim();
      return NextResponse.json({ subject: cleanSubject });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
