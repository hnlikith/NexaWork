/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// Resolve the public base URL for building magic links sent to candidates.
// Priority: env var (when pointing at a real public domain) → request origin → localhost.
// This ensures emails triggered from localhost dev still contain the real production links,
// not http://localhost:3000 links the candidate can never reach.
export function baseUrlFrom(req?: { headers: Headers } | null): string {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  // If the env var is set to a real public domain (not localhost/127.*), always
  // use it — overrides the request origin so candidate emails always link to
  // the production domain even when the admin triggers the send from localhost.
  if (envUrl && !envUrl.includes("localhost") && !/127\.\d+\.\d+/.test(envUrl)) {
    return envUrl.replace(/\/+$/, "");
  }

  // Env var is localhost (dev with local testing) — fall back to request headers
  // so the link at least works for the dev machine.
  if (req) {
    const h = req.headers;
    const origin = h.get("origin");
    if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/+$/, "");
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ||
        (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  }

  return envUrl?.replace(/\/+$/, "") || "http://localhost:3000";
}
