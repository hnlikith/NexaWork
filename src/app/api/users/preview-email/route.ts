/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Returns the actual email that will be assigned when creating an employee with the given name.
// Applies the same dedup logic as POST /api/users so the form preview is accurate.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ email: "" });

  const supabase = getSupabaseAdmin();

  let mailDomain = process.env.ZOHO_MAIL_DOMAIN || "your-company.com";
  const { data: orgCfg } = await supabase.from("zoho_config").select("org_domain").maybeSingle();
  if (orgCfg?.org_domain) mailDomain = orgCfg.org_domain;

  const parts     = name.toLowerCase().split(/\s+/);
  const baseLocal = parts.length >= 2 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0];

  let localPart = baseLocal;
  let isDuplicate = false;
  let attempt = 0;

  while (true) {
    const candidate = `${localPart}@${mailDomain}`;
    const { data: existing } = await supabase
      .from("employees")
      .select("id")
      .or(`email.ilike.${candidate},zoho_email.ilike.${candidate}`)
      .maybeSingle();
    if (!existing) break;
    isDuplicate = true;
    // Use a deterministic-looking suffix for the preview (actual creation uses random)
    const suffix = 1000 + (name.length * 317 + attempt * 97) % 9000;
    localPart = `${baseLocal}${suffix}`;
    attempt++;
    if (attempt > 10) break;
  }

  return NextResponse.json({
    email: `${localPart}@${mailDomain}`,
    isDuplicate,
  });
}
