/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "Missing required parameters (userId)" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1. Fetch employee details
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, name, zoho_account_id, email, zoho_email, personal_email")
      .eq("id", userId)
      .maybeSingle();

    if (empErr || !emp) {
      return NextResponse.json({ error: "Employee profile not found." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const TASKS = [
      "Join the Department Slack/Discord",
      "Setup your Profile Avatar",
      "Complete 'Culture & Ethics' Video",
      "Sync your Google Calendar"
    ];

    // 2. Complete onboarding database status
    const { error: onboardErr } = await supabase
      .from("user_onboarding")
      .update({ 
        status: "completed", 
        completed_at: now,
        nda_signed_at: now,
        completed_steps: TASKS
      })
      .eq("user_id", userId);

    if (onboardErr) {
      return NextResponse.json({ error: "Failed to update onboarding record: " + onboardErr.message }, { status: 500 });
    }

    // 3. Update Employee Profile status to active
    const { error: empUpdateErr } = await supabase
      .from("employees")
      .update({ 
        status: "active",
        updated_at: now 
      })
      .eq("id", userId);
    
    if (empUpdateErr) {
      console.warn("Could not update employee status:", empUpdateErr);
    }

    // 4. Audit Log entry
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "CONSULTANT_ONBOARDING_COMPLETED",
      table_name: "employees",
      record_id: userId,
      new_values: { message: "Onboarding checklist and NDA completed successfully" }
    });

    // 5. Send Onboarding and Registration Confirmation Email via SMTP
    try {
      const { data: config } = await supabase
        .from("system_config")
        .select("smtp_host, smtp_port, smtp_user, smtp_pass, company_name")
        .maybeSingle();

      if (config?.smtp_host && config?.smtp_user && config?.smtp_pass) {
        const transporter = nodemailer.createTransport({
          host: config.smtp_host,
          port: config.smtp_port || 587,
          secure: config.smtp_port === 465,
          auth: {
            user: config.smtp_user,
            pass: config.smtp_pass
          }
        });

        const officialEmail = emp.zoho_email || emp.email;
        const recipients = [emp.personal_email, officialEmail].filter(Boolean).join(",");

        const mailHtml = `
          <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
            <div style="background-color: #0f172a; color: #ffffff; padding: 32px 20px; text-align: center;">
              <h1 style="margin:0; letter-spacing: 4px; font-size: 24px; font-weight: 800; text-transform: uppercase;">${config.company_name || "NEXAWORK"}</h1>
              <p style="margin-top: 8px; opacity: 0.8; font-size: 14px;">Onboarding Registration Completed Successfully</p>
            </div>
            <div style="padding: 40px; color: #1e293b; line-height: 1.6;">
              <h2 style="margin-top: 0; font-size: 20px; font-weight: 700; color: #0f172a;">Welcome to the Team!</h2>
              <p>Hi <b>${emp.name}</b>,</p>
              <p>Congratulations! Your onboarding profile has been finalized, and you have registered successfully at ${config.company_name || "NexaWork"}.</p>
              <p>Your password has been updated and synchronized with your professional email account. You are now ready to access the command center panel.</p>
              
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; margin: 24px 0;">
                <div style="margin-bottom: 12px; display: flex; align-items: center;">
                  <strong style="width: 180px; color: #64748b; font-size: 11px; text-transform: uppercase;">Official Login Email</strong>
                  <span style="color: #0f172a; font-weight: bold; font-family: monospace; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">${officialEmail}</span>
                </div>
                <div style="margin-bottom: 12px; display: flex; align-items: center;">
                  <strong style="width: 180px; color: #64748b; font-size: 11px; text-transform: uppercase;">Personal Email Status</strong>
                  <span style="color: #ef4444; font-weight: 700; text-transform: uppercase; font-size: 11px;">⚠️ BLOCKED (For Login Access)</span>
                </div>
                <div style="display: flex; align-items: center;">
                  <strong style="width: 180px; color: #64748b; font-size: 11px; text-transform: uppercase;">Registration Status</strong>
                  <span style="color: #10b981; font-weight: 700; text-transform: uppercase; font-size: 11px;">✓ ACTIVE & COMPLETED</span>
                </div>
              </div>

              <div style="margin: 24px 0; padding: 16px; border-left: 4px solid #f59e0b; background-color: #fefbeb; border-radius: 8px; font-size: 13px;">
                <strong style="color: #b45309; display: block; margin-bottom: 4px;">Important Login Note:</strong>
                From now on, login access using your personal email is permanently disabled. You must log in using your official <b>company email address</b> (<a href="mailto:${officialEmail}" style="color: #0f172a; text-decoration: underline; font-weight: 700;">${officialEmail}</a>) with your newly updated password.
              </div>

              <div style="text-align: center; margin-top: 32px;">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login" style="background-color: #0f172a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">Access Command Center</a>
              </div>

              <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 12px; color: #94a3b8;">
                <p style="margin: 0; font-weight: 700; color: #0f172a;">Identity & Workspace Management</p>
                <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px;">Automated Provisioning Engine · ${config.company_name || "NexaWork"}</p>
              </div>
            </div>
          </div>
        `;

        await transporter.sendMail({
          from: `"${config.company_name || "NexaWork"}" <${config.smtp_user}>`,
          to: recipients,
          subject: `Onboarding Successful - Account Registered & Active`,
          html: mailHtml
        });
        console.log(`[SMTP] Successfully sent onboarding completion confirmation to ${recipients}`);
      }
    } catch (mailErr) {
      console.error("[SMTP Error] Onboarding completion notification delivery failure:", mailErr);
    }

    return NextResponse.json({ success: true, message: "Onboarding completed successfully." });
  } catch (err: any) {
    console.error("[ONBOARD-COMPLETE] Error:", err);
    return NextResponse.json({ error: "Internal server error: " + err.message }, { status: 500 });
  }
}
