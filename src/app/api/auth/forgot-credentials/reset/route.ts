/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { updateZohoPassword } from "@/lib/zoho-provisioning";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, otp, newPassword } = body;

    if (!email || !otp || !newPassword) {
      return NextResponse.json({ error: "Missing required parameters (email, otp, newPassword)" }, { status: 400 });
    }

    // 1. Validate password policy
    if (!PASSWORD_REGEX.test(newPassword)) {
      return NextResponse.json({ 
        error: "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character/symbol." 
      }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();
    const supabase = getSupabaseAdmin();

    // 2. Fetch the verification OTP code
    const { data: record, error: otpErr } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (otpErr || !record) {
      return NextResponse.json({ error: "Invalid or expired verification code." }, { status: 400 });
    }

    // 3. Verify OTP code matches
    if (record.otp !== cleanOtp) {
      return NextResponse.json({ error: "Incorrect verification code. Please check your email." }, { status: 400 });
    }

    // 4. Verify OTP expiration
    const isExpired = new Date(record.expires_at) < new Date();
    if (isExpired) {
      await supabase.from("otp_codes").delete().eq("email", cleanEmail);
      return NextResponse.json({ error: "Verification code has expired. Please request a new one." }, { status: 400 });
    }

    // 5. Fetch employee details (to check user ID and Zoho account ID)
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, name, zoho_account_id, email, zoho_email, personal_email, status, is_active")
      .or(`email.ilike.${cleanEmail},personal_email.ilike.${cleanEmail},zoho_email.ilike.${cleanEmail}`)
      .maybeSingle();

    if (empErr || !emp) {
      return NextResponse.json({ error: "Employee profile not found." }, { status: 404 });
    }

    if (emp.status === "disabled" || emp.is_active === false) {
      return NextResponse.json({ error: "Account has been deactivated. Please contact your administrator." }, { status: 403 });
    }

    // 6. Delete OTP from DB to prevent reuse
    await supabase.from("otp_codes").delete().eq("email", cleanEmail);

    // 7. Update Supabase Auth password to match newPassword
    console.log(`[Forgot Credentials Reset] Updating Supabase Auth password for user ID: ${emp.id}`);
    const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(emp.id, {
      password: newPassword,
    });
    if (authUpdateErr) {
      console.error("[Forgot Credentials Reset] Supabase Auth password update failed:", authUpdateErr.message);
      return NextResponse.json({ error: "Failed to update portal password: " + authUpdateErr.message }, { status: 500 });
    }

    // 8. Sync password change with Zoho Mail if account is provisioned
    const zohoAccountId = emp.zoho_account_id;
    if (zohoAccountId) {
      console.log(`[Forgot Credentials Reset] Syncing new password to Zoho for account ID: ${zohoAccountId}`);
      const zohoSuccess = await updateZohoPassword(zohoAccountId, newPassword);
      if (!zohoSuccess) {
        console.warn(`[Forgot Credentials Reset] Zoho password sync failed for employee: ${emp.name}`);
      }
    }

    // 9. Write an entry into the audit logs
    await supabase.from("audit_logs").insert({
      user_id: emp.id,
      action: "PASSWORD_CHANGED",
      table_name: "employees",
      record_id: emp.id,
      new_values: { message: "Credentials reset successfully via OTP verification" }
    });

    return NextResponse.json({ success: true, message: "Your credentials have been successfully updated." });
  } catch (err: any) {
    console.error("[FORGOT-CREDENTIALS-RESET] Error:", err);
    return NextResponse.json({ error: "Internal server error: " + err.message }, { status: 500 });
  }
}
