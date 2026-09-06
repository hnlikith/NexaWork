/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { z } from "zod";

const PreLoginSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = PreLoginSchema.parse(body);

    const supabase = getSupabaseAdmin();
    const cleanEmail = email.trim().toLowerCase();

    // 1. Look up the employee by any email (personal, professional, zoho).
    // Use array form — .maybeSingle() errors when multiple rows match (e.g. shared personal email).
    // Priority: exact match on the login (professional) email first, then personal, then zoho.
    const { data: rows, error: dbErr } = await supabase
      .from("employees")
      .select("id, name, email, zoho_email, zoho_user_id, personal_email, status, is_active, role, employee_id, department, designation, must_change_password")
      .or(`email.ilike.${cleanEmail},personal_email.ilike.${cleanEmail},zoho_email.ilike.${cleanEmail}`)
      .limit(10);

    if (dbErr) {
      return NextResponse.json({ error: "Database lookup failed: " + dbErr.message }, { status: 500 });
    }

    const emp =
      rows?.find(r => r.email?.toLowerCase() === cleanEmail) ??
      rows?.find(r => r.personal_email?.toLowerCase() === cleanEmail) ??
      rows?.find(r => r.zoho_email?.toLowerCase() === cleanEmail) ??
      null;

    if (!emp) {
      return NextResponse.json({ error: "You are not authorized in this company." }, { status: 403 });
    }

    if (emp.status === "disabled" || emp.is_active === false) {
      return NextResponse.json({ error: "Account has been deactivated. Please contact your administrator." }, { status: 403 });
    }

    const isPersonalEmail = cleanEmail === emp.personal_email?.toLowerCase();
    const isProfessionalEmail =
      cleanEmail === emp.email?.toLowerCase() ||
      (emp.zoho_email && cleanEmail === emp.zoho_email?.toLowerCase());
    const hasDistinctPersonalEmail =
      emp.personal_email && emp.personal_email.toLowerCase() !== emp.email?.toLowerCase();

    // 2. Personal email login AFTER password is already changed → block, must use professional
    if (isPersonalEmail && emp.must_change_password === false && hasDistinctPersonalEmail) {
      return NextResponse.json({
        error: `Personal email access is disabled. Please login with your company email: ${emp.email}`,
      }, { status: 403 });
    }

    // 3. Professional email login BEFORE password is changed → block, must do first login with personal
    if (isProfessionalEmail && hasDistinctPersonalEmail && emp.must_change_password === true) {
      return NextResponse.json({
        error: "Please login with your personal email first to set your password before switching to your company email.",
      }, { status: 403 });
    }

    // 4. Return the auth email (Supabase Auth account is always on professional email)
    return NextResponse.json({
      success: true,
      emailToAuth: emp.email,
      empId: emp.id,
      empRole: emp.role,
      zoho_email: emp.zoho_email || null,
      zoho_user_id: emp.zoho_user_id || null,
      isProfessionalLogin: isProfessionalEmail,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
    }
    console.error("[PRE-LOGIN]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
