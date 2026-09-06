/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";

// Only these personal email domains are accepted
const PERSONAL_EMAIL_DOMAINS = new Set([
  // Gmail
  "gmail.com",
  // Yahoo
  "yahoo.com", "yahoo.in", "yahoo.co.in", "yahoo.co.uk",
  // Zoho personal
  "zoho.com", "zoho.in",
  // Outlook / Microsoft
  "outlook.com", "outlook.in", "hotmail.com", "live.com",
]);

// The deployer's own company domain(s) — used as the login identity when a
// Zoho mailbox isn't auto-created (the person logs in with this until one is
// provisioned). Derived from ZOHO_MAIL_DOMAIN, never hardcoded: if it isn't
// configured, no company domain is allowed here rather than guessing one.
function getAllowedDomains(): Set<string> {
  const domains = new Set(PERSONAL_EMAIL_DOMAINS);
  const zohoMailDomain = process.env.ZOHO_MAIL_DOMAIN;
  if (zohoMailDomain) {
    domains.add(zohoMailDomain);
    domains.add(zohoMailDomain.replace(/^mail\./, ""));
  }
  return domains;
}

// Common typo → correct domain
const TYPO_MAP: Record<string, string> = {
  "gmali.com": "gmail.com", "gmai.com": "gmail.com", "gmial.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.cm": "gmail.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com",
  "outloo.com": "outlook.com", "outlok.com": "outlook.com",
};

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ valid: false, reason: "Invalid email format." });
  }

  const domain = email.split("@")[1];

  // Typo correction first
  if (TYPO_MAP[domain]) {
    const corrected = email.replace(`@${domain}`, `@${TYPO_MAP[domain]}`);
    return NextResponse.json({
      valid: false,
      reason: `Looks like a typo — did you mean ${corrected}?`,
      suggestion: corrected,
    });
  }

  // Domain allowlist check
  const allowedDomains = getAllowedDomains();
  if (!allowedDomains.has(domain)) {
    const companyDomain = process.env.ZOHO_MAIL_DOMAIN;
    const companyNote = companyDomain ? `, or a company (${companyDomain}) email` : "";
    return NextResponse.json({
      valid: false,
      reason: `Only Gmail, Yahoo, Zoho, Outlook${companyNote} is allowed. "${domain}" is not accepted.`,
    });
  }

  return NextResponse.json({ valid: true });
}
