/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
/**
 * Shared Ollama AI helper — works with any Ollama-compatible endpoint.
 * Configured via env vars:
 *   LOCAL_AI_ENDPOINT  — e.g. https://ollama.your-domain.com/api/generate
 *   LOCAL_AI_MODEL     — e.g. gemma4:e4b  (default: gemma4:e4b)
 *   AI_BRIDGE_KEY      — Bearer token for your Ollama proxy
 */

export async function callAI(prompt: string, jsonMode = false): Promise<string> {
  const endpoint = process.env.LOCAL_AI_ENDPOINT;
  const model = process.env.LOCAL_AI_MODEL || "gemma4:e4b";
  const bridgeKey = process.env.AI_BRIDGE_KEY;

  if (!endpoint) throw new Error("LOCAL_AI_ENDPOINT is not set");
  if (!bridgeKey) throw new Error("AI_BRIDGE_KEY is not set");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${bridgeKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      ...(jsonMode && { format: "json" }),
      options: { temperature: 0.7, num_predict: 2048 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data?.response;
  if (!text) throw new Error("Empty response from Ollama");
  return text;
}

/** Parse JSON from Ollama response — strips markdown fences if present */
export function parseAIJSON<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(cleaned) as T;
}
