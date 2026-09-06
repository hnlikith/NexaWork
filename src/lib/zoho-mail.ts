/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import {
  ZOHO_API,
  buildZohoOAuthUrl,
  exchangeCodeForTokens,
  getZohoToken,
  refreshAccessToken,
} from "@/lib/zoho-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const ZOHO_MAIL_API_URL = ZOHO_API.mail;

// ── Token management (unified — see zoho-auth.ts) ────────────
// Mail uses the single shared connection. These re-exports keep existing
// call sites working while the token/OAuth logic lives in one place.

export { exchangeCodeForTokens, refreshAccessToken };

/** @deprecated use getZohoToken() from "@/lib/zoho-auth" — kept for back-compat. */
export const getActiveToken = getZohoToken;

/** Mail connect URL — now requests the unified scope set (Mail + Calendar + …). */
export function buildOAuthUrl(clientId: string, redirectUri: string): string {
  return buildZohoOAuthUrl(clientId, redirectUri);
}

// ── HTTP helpers ─────────────────────────────────────────────

export async function zohoGet(token: string, path: string, params?: Record<string, string>) {
  const url = new URL(`${ZOHO_MAIL_API_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho GET ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export async function zohoPost(token: string, path: string, body: unknown) {
  const res = await fetch(`${ZOHO_MAIL_API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export async function zohoPatch(token: string, path: string, body: unknown) {
  const res = await fetch(`${ZOHO_MAIL_API_URL}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho PATCH ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export async function zohoDelete(token: string, path: string) {
  const res = await fetch(`${ZOHO_MAIL_API_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho DELETE ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── AI helpers (MoonshotAI Kimi K2.6 via OpenRouter with Gemma Fallback) ─────────────────

export function stripHtml(html: string): string {
  if (!html) return "";
  // Remove style blocks
  let clean = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Remove script blocks
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  // Remove HTML comments
  clean = clean.replace(/<!--[\s\S]*?-->/g, "");
  // Remove HTML tags
  clean = clean.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Normalize whitespace
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}

/**
 * System prompt enforcing English-only output, professional accuracy,
 * and strict structured response format.
 */
const AI_SYSTEM_PROMPT = `You are a highly accurate professional business AI assistant for NexaWork — a corporate HR and operations platform.

STRICT RULES — follow these without exception:
1. LANGUAGE: You MUST respond ONLY in English. Regardless of what language the input email is written in, your output MUST always be in English only. Never output any other language.
2. ACCURACY: Be precise, factual, and context-aware. Do not hallucinate or guess information not present in the input.
3. FORMAT: Always respond strictly in the exact JSON format requested. Do not add markdown code fences, explanations, or any text outside the JSON.
4. PROFESSIONALISM: Maintain a formal, corporate business tone at all times.
5. ENGLISH ONLY: If input contains non-English text, still respond fully in English.`;

export async function callGemma(
  prompt: string,
  opts?: { systemPrompt?: string; maxTokens?: number; temperature?: number; models?: string[]; preferLocal?: boolean }
): Promise<string> {
  const endpoint     = process.env.LOCAL_AI_ENDPOINT;
  const model        = process.env.LOCAL_AI_MODEL || "gemma4:e4b";
  const key          = process.env.AI_BRIDGE_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.MY_OPENROUTER_API_KEY;

  // ── Local-first fast path ────────────────────────────────────
  // When preferLocal is set and the local endpoint is configured, try it first
  // before touching the OpenRouter waterfall. Saves 5-60s of model-hopping.
  if (opts?.preferLocal && endpoint) {
    console.info(`[Gemma] preferLocal — hitting ${endpoint} directly`);
    try {
      const sysPrompt = opts?.systemPrompt ?? AI_SYSTEM_PROMPT;
      const localAbort = new AbortController();
      const localTimer = setTimeout(() => localAbort.abort(), 25_000);
      const localRes = await fetch(endpoint, {
        method: "POST",
        signal: localAbort.signal,
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model,
          system: sysPrompt,
          prompt,
          stream: false,
          options: {
            temperature: opts?.temperature ?? 0.4,
            num_predict: opts?.maxTokens   ?? 4096,
          },
        }),
      });
      clearTimeout(localTimer);
      if (localRes.ok) {
        const localData = await localRes.json();
        const localOut  = localData?.response || localData?.output || localData?.choices?.[0]?.message?.content || "";
        if (localOut) {
          console.info(`[Gemma] ✓ local fast-path (${localOut.length} chars)`);
          return localOut;
        }
      } else {
        console.warn(`[Gemma] local fast-path ${localRes.status} — falling back to OpenRouter`);
      }
    } catch (e: any) {
      console.warn(`[Gemma] local fast-path error: ${e.message} — falling back to OpenRouter`);
    }
  }

  if (openrouterKey) {
    // 18-model waterfall — each model has a 10s hard timeout so a queue-hung model
    // can never block the chain for more than 10s before we move on.
    const DEFAULT_CHAIN = [
      // Tier 1 — strongest, best for structured/writing tasks
      "moonshotai/kimi-k2.6:free",
      "deepseek/deepseek-r1-0528:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "qwen/qwen3-235b-a22b:free",
      "deepseek/deepseek-chat-v3-0324:free",
      // Tier 2 — large generalist models
      "meta-llama/llama-3.3-70b-instruct:free",
      "qwen/qwen2.5-72b-instruct:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "tngtech/deepseek-r1t-chimera:free",
      "thudm/glm-4-32b:free",
      // Tier 3 — mid-size reliable fallbacks
      "qwen/qwen3-14b:free",
      "google/gemma-3-27b-it:free",
      "meta-llama/llama-3.1-70b-instruct:free",
      "qwen/qwen2.5-7b-instruct:free",
      // Tier 4 — small but always available
      "google/gemma-3-12b-it:free",
      "google/gemma-2-9b-it:free",
      "mistralai/mistral-7b-instruct:free",
      "meta-llama/llama-3.1-8b-instruct:free",
    ];

    const modelChain = opts?.models ?? DEFAULT_CHAIN;

    for (const model of modelChain) {
      try {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 10_000); // 10s hard cap per model

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: abort.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openrouterKey}`,
            "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
            "X-Title": "NexaWork",
            "Accept-Language": "en",
          },
          body: JSON.stringify({
            model,
            temperature: opts?.temperature ?? 0.2,
            top_p: 0.9,
            max_tokens: opts?.maxTokens ?? 1024,
            messages: [
              { role: "system", content: opts?.systemPrompt ?? AI_SYSTEM_PROMPT },
              { role: "user",   content: prompt },
            ],
          }),
        });
        clearTimeout(timer);

        // 429 = rate-limited → skip instantly to next model, no wait
        if (res.status === 429) {
          console.warn(`[OpenRouter] ${model} → 429, trying next...`);
          continue;
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.warn(`[OpenRouter] ${model} → ${res.status}: ${errText.slice(0, 120)}`);
          continue;
        }

        const data    = await res.json();
        const content = data?.choices?.[0]?.message?.content || "";
        if (content) {
          console.info(`[OpenRouter] ✓ ${model}`);
          return content;
        }
        console.warn(`[OpenRouter] ${model} → empty response, trying next...`);

      } catch (e: any) {
        const label = e.name === "AbortError" ? "10s timeout" : e.message;
        console.warn(`[OpenRouter] ${model} → ${label}, trying next...`);
      }
    }

    console.warn("[OpenRouter] All 18 models exhausted.");
  }

  // ── Local Gemma fallback (Ollama/proxy /api/generate) ───────
  if (!endpoint) return "";

  console.info(`[Gemma] OpenRouter exhausted — using local model ${model}`);

  try {
    const sysPrompt = opts?.systemPrompt ?? AI_SYSTEM_PROMPT;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model,
        system: sysPrompt,
        prompt,
        stream: false,
        options: {
          temperature: opts?.temperature ?? 0.4,
          num_predict: opts?.maxTokens   ?? 4096,
        },
      }),
    });

    if (!res.ok) {
      console.warn(`[Gemma] ${res.status} from local endpoint`);
      return "";
    }
    const data = await res.json();
    const output = data?.response || data?.output || data?.choices?.[0]?.message?.content || "";
    if (output) console.info(`[Gemma] ✓ local response (${output.length} chars)`);
    return output;
  } catch (e: any) {
    console.warn("[Gemma] local endpoint error:", e.message);
    return "";
  }
}

export async function classifyEmail(subject: string, preview: string, fromName: string) {
  const cleanBody = stripHtml(preview);
  const prompt = `TASK: Classify the following business email into exactly one category and analyze its properties.

EMAIL DETAILS:
- From: ${fromName}
- Subject: ${subject}
- Content: ${cleanBody?.slice(0, 1200)}

CLASSIFICATION RULES:
- category: Choose EXACTLY ONE of: URGENT (requires immediate action within 24h), WORK (general work tasks, projects, meetings), FINANCE (invoices, payments, budgets, expenses), FOLLOW_UP (follow-ups, reminders, pending actions), GENERAL (newsletters, announcements, FYI)
- priority: Integer from 1 (highest urgency) to 5 (lowest urgency). URGENT = 1, most WORK = 2-3, GENERAL = 4-5
- sentiment: POSITIVE (good news, approvals, appreciation), NEGATIVE (complaints, rejections, issues, urgency), NEUTRAL (informational, routine)
- summary: One clear, concise English sentence summarizing the core message (max 100 chars)

OUTPUT: Respond with ONLY a valid JSON object. No markdown. No explanation. English only.
{"category":"...","priority":...,"sentiment":"...","summary":"..."}`;

  const raw = await callGemma(prompt);
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return { category: "GENERAL", priority: 3, sentiment: "NEUTRAL", summary: cleanBody?.slice(0, 100) || preview?.slice(0, 100) };
}

export async function generateReplySuggestions(subject: string, body: string): Promise<string[]> {
  const cleanBody = stripHtml(body);
  const prompt = `TASK: Generate exactly 3 professional email reply suggestions in English for the following received business email.

RECEIVED EMAIL:
- Subject: ${subject}
- Body: ${cleanBody?.slice(0, 2500)}

REPLY GUIDELINES:
- Each reply must be 1-2 sentences maximum
- Replies must be professional, polite, and directly relevant to the email content
- Cover different tones/approaches: e.g., one confirming/acknowledging, one requesting more info, one with a concrete next step
- ALL replies MUST be written in English only — never any other language
- Do NOT include greetings like "Dear..." or signatures — just the core reply body
- Make replies specific to the actual email content, not generic filler

OUTPUT: Respond with ONLY a valid JSON array of exactly 3 strings. No markdown. No explanation. English only.
["reply 1","reply 2","reply 3"]`;

  const raw = await callGemma(prompt);
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return [
    "Thank you for your email. I'll review the details and get back to you shortly.",
    "Noted. I will follow up on this within 24 hours.",
    "Appreciate you reaching out. Could you please provide any additional details so I can assist you better?",
  ];
}

// ── System mailer ────────────────────────────────────────────
// Sends a transactional/system email from the admin Zoho mailbox to one or more
// recipients. Uses the single shared admin token + admin account (same path the
// compose/send route uses), so it works for both the configured company domain and
// external personal addresses. Returns {ok} — callers should treat failure as
// non-fatal (log + continue), never throw into a login/activation flow.
export async function sendZohoMail(opts: {
  to: string[];
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const to = (opts.to || []).map((e) => e?.trim()).filter(Boolean) as string[];
  if (!to.length) return { ok: false, error: "No recipients" };

  const token = await getZohoToken();
  if (!token) return { ok: false, error: "Zoho not connected" };

  const supabase = getSupabaseAdmin();
  const { data: config } = await supabase
    .from("zoho_config")
    .select("admin_account_id")
    .maybeSingle();

  // Resolve the admin account id + sender address from the live Zoho session.
  let accountId: string | null = config?.admin_account_id || null;
  let fromAddress: string | null = null;
  try {
    const accountsRes = await zohoGet(token, "/accounts");
    if (accountsRes?.data?.length) {
      const target =
        accountsRes.data.find((a: any) => a.isDefaultAccount || a.isPrimary) ||
        accountsRes.data[0];
      if (!accountId) accountId = target.accountId;
      fromAddress =
        target.primaryEmailAddress ||
        target.mailboxAddress ||
        (Array.isArray(target.emailAddress) ? target.emailAddress[0]?.mailId : null);
    }
  } catch (e: any) {
    return { ok: false, error: `Could not resolve admin account: ${e.message}` };
  }

  if (!accountId || !fromAddress) {
    return { ok: false, error: "Could not resolve admin Zoho account/sender" };
  }

  try {
    const res = await zohoPost(token, `/accounts/${accountId}/messages`, {
      fromAddress,
      toAddress: to.join(","),
      subject: opts.subject,
      content: opts.html,
      mailFormat: "html",
    });
    if (res?.status?.code !== 200 && res?.status?.code !== 201) {
      return { ok: false, error: JSON.stringify(res?.status || res) };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// Branded HTML for the one-time "your Zoho mailbox is active" confirmation.
// Clean, light, theme-matched (dark "N" brand header, emerald success accents) —
// mirrors the in-app /auth/zoho-activated screen. All styling is inline (email clients).
export function buildActivationEmailHtml(name: string, zohoEmail: string): string {
  const firstName = (name || "there").split(" ")[0];
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const row = (label: string) => `
    <tr><td style="padding:6px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border:1px solid #e8ecf1;border-radius:12px;">
        <tr>
          <td width="44" align="center" style="padding:12px 0;">
            <span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:999px;background:#10b98122;color:#059669;font-size:13px;font-weight:700;">&#10003;</span>
          </td>
          <td style="padding:12px 14px 12px 0;font-family:${font};font-size:13px;font-weight:500;color:#0f172a;">${label}</td>
        </tr>
      </table>
    </td></tr>`;

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#eef1f5;font-family:${font};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef1f5;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border:1px solid #e3e8ef;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px -16px rgba(15,23,42,0.25);">

        <!-- Brand header (dark, matches the black 'N' logo) -->
        <tr><td style="background:#0b0f17;padding:26px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="40" style="vertical-align:middle;">
                <span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:#ffffff;color:#0b0f17;font-weight:800;font-size:16px;border-radius:9px;">N</span>
              </td>
              <td style="vertical-align:middle;padding-left:12px;">
                <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:-0.01em;">NexaWork</div>
                <div style="color:#8b95a7;font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;">Enterprise Operations Panel</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:30px 32px 8px;">
          <div style="display:inline-block;background:#10b98115;color:#059669;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:6px 12px;border-radius:999px;">Mailbox Activated</div>
          <h1 style="margin:16px 0 8px;font-size:21px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;">Your Zoho mailbox is now active</h1>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#475569;">
            Hi ${firstName}, your company mailbox has been activated and single sign-on (SAML) is configured for your account. You can now send and receive company email directly inside NexaWork.
          </p>

          <!-- Mailbox chip -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0b0f17;border-radius:12px;margin:0 0 20px;">
            <tr><td style="padding:16px 18px;">
              <div style="color:#8b95a7;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Activated mailbox</div>
              <div style="color:#ffffff;font-size:15px;font-weight:700;">${zohoEmail}</div>
            </td></tr>
          </table>

          <!-- Checklist -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${row("Company mailbox provisioned &amp; live")}
            ${row("SAML single sign-on active")}
            ${row("Sign-in recorded in your organization directory")}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 32px 26px;">
          <hr style="border:none;border-top:1px solid #eef1f5;margin:0 0 14px;" />
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
            This is an automated confirmation. If you did not expect this, please contact your administrator.
          </p>
        </td></tr>
      </table>

      <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">© NexaWork · Automated security notification</p>
    </td></tr>
  </table>
</body></html>`;
}

export async function summarizeThread(messages: { subject: string; from: string; body: string }[]): Promise<string> {
  const conversation = messages
    .slice(0, 5)
    .map((m) => `From: ${m.from}\nSubject: ${m.subject}\nContent: ${stripHtml(m.body)?.slice(0, 1200)}`)
    .join("\n---\n");

  const prompt = `TASK: Summarize the following email thread in 2-3 concise sentences in English.

EMAIL THREAD:
${conversation}

SUMMARY RULES:
- Be factual and concise — only include information present in the thread
- Identify the main topic, key decisions, and any pending action items
- Output in English only — regardless of the language the emails are written in
- Professional corporate tone

OUTPUT: Respond with ONLY the summary text in plain English. No JSON. No markdown.
Summary:`;
  return callGemma(prompt);
}

