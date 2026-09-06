/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import nodemailer from "nodemailer";
import { provisionZohoMailbox, generateTempPassword } from "@/lib/zoho-provisioning";
import { getActiveToken } from "@/lib/zoho-mail";
import { getActor } from "@/lib/onboarding/server";
import { requireModule } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto/secretbox";

// Resolve a candidate's uploaded Profile Photo (falls back to the verification
// selfie) as a data URL, so it can be copied onto the new employee's record.
async function resolveProfilePhotoDataUrl(supabase: any, email: string): Promise<string | null> {
  const { data: reqs } = await supabase
    .from("candidate_document_requests")
    .select("id")
    .ilike("candidate_email", email);
  const ids = (reqs || []).map((r: any) => r.id);
  if (!ids.length) return null;
  for (const type of ["profile_photo", "face_photo"]) {
    const { data: doc } = await supabase
      .from("candidate_documents")
      .select("file_share_id")
      .eq("document_type", type)
      .in("request_id", ids)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (doc?.file_share_id) {
      const { data: share } = await supabase
        .from("mail_file_shares")
        .select("storage_url")
        .eq("id", doc.file_share_id)
        .maybeSingle();
      if (typeof share?.storage_url === "string" && share.storage_url.startsWith("data:")) return share.storage_url;
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    // Only admin (bypass) or a role granted the Employees module may create staff.
    const gate = await requireModule("employees", "can_create");
    if (!gate.ok) return gate.response;

    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const { name, email, role, department, designation, matrix_role, team_id, shift_id, monthly_leave_quota, joining_date, employment_type, salary_structure, base_salary, salary_min, salary_max, kpi_weight, kra_weight, behavioral_weight, enable_salary_linkage, commission_enabled, monthly_sales_target, salary_slab_id, create_zoho_mail, source } = body;

    if (!name || !email || !role) {
      return NextResponse.json({ error: "Missing highly critical parameters (Name, Email, Role)" }, { status: 400 });
    }

    const VALID_ROLES = ["admin", "hr", "accounts", "employee", "intern", "dept_lead", "team_lead"];
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }

    // When "Auto-create Zoho Mail" is OFF, NO company address is generated — the
    // person logs in with their PERSONAL email and works from it until (if ever) a
    // mailbox is provisioned later. When ON, we mint firstname.lastname@domain.
    const wantsCompanyEmail = !!create_zoho_mail;

    // Build professional email address: firstname.lastname@domain
    const parts       = name.trim().toLowerCase().split(/\s+/);
    const baseLocal   = parts.length >= 2
      ? `${parts[0]}.${parts[parts.length - 1]}`
      : parts[0];

    // Prefer env var, then a clearly-generic placeholder, then dynamically query configuration
    let mailDomain = process.env.ZOHO_MAIL_DOMAIN || "your-company.com";
    const { data: orgCfg } = await supabase.from("zoho_config").select("org_domain").maybeSingle();
    if (orgCfg?.org_domain) {
      mailDomain = orgCfg.org_domain;
    }

    // Deduplicate: if firstname.lastname already exists, append random 4-digit suffix
    // (only when we're actually assigning a company address).
    let localPart = baseLocal;
    let attempt = 0;
    while (wantsCompanyEmail) {
      const candidate = `${localPart}@${mailDomain}`;
      const { data: existing } = await supabase
        .from("employees")
        .select("id")
        .or(`email.ilike.${candidate},zoho_email.ilike.${candidate}`)
        .maybeSingle();
      if (!existing) break; // candidate is free
      // Append a fresh 4-digit random number and retry
      const suffix = Math.floor(1000 + Math.random() * 9000);
      localPart = `${baseLocal}${suffix}`;
      attempt++;
      if (attempt > 10) break; // safety — extremely unlikely to need more than 10 tries
    }

    const professionalEmail = `${localPart}@${mailDomain}`;
    // The canonical login identity + Supabase Auth email. Personal until provisioned.
    const loginEmail = wantsCompanyEmail ? professionalEmail : email;

    // 1. Generate an automated temporary password (avoid sequential characters)
    const generatedPassword = generateTempPassword();

    // 2. Map robust Auth user via Backend Service Role
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: loginEmail,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: { role, full_name: name, department }
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Active Auth Link Failed: " + (authError?.message || "Unknown Failure") }, { status: 500 });
    }

    const { user } = authData;

    // 3. Systematically link the created User ID structurally to employee DB table
    const employee_id_gen = `NP-${Math.floor(1000 + Math.random() * 9000)}`;

    const insertData: any = {
      id: user.id,   // Mapped to strict auth.user (RLS)
      name,
      email: loginEmail, // Primary login identity (company address, or personal until a mailbox is provisioned)
      personal_email: email, // Store personal email in personal_email column
      zoho_email: wantsCompanyEmail ? professionalEmail : null, // No company address until a mailbox is created
      employee_id: body.employee_id || employee_id_gen,
      role,
      department,
      designation,
      matrix_role: matrix_role || null,
      team_id: team_id || null,
      shift_id: shift_id || null,
      monthly_leave_quota: monthly_leave_quota || 1.5,
      leave_balance: monthly_leave_quota || 1.5,
      joining_date: joining_date || new Date().toISOString(),
      employment_type: employment_type || 'full_time',
      salary_structure: salary_structure || 'fixed_monthly',
      base_salary: base_salary ? Number(base_salary) : 0,
      must_change_password: true,
    };

    // Add salary fields only if they're provided (migration may not be applied yet)
    if (salary_min !== undefined) insertData.salary_min = salary_min ? Number(salary_min) : null;
    if (salary_max !== undefined) insertData.salary_max = salary_max ? Number(salary_max) : null;
    if (kpi_weight !== undefined) insertData.kpi_weight = kpi_weight ? Number(kpi_weight) : 40;
    if (kra_weight !== undefined) insertData.kra_weight = kra_weight ? Number(kra_weight) : 40;
    if (behavioral_weight !== undefined) insertData.behavioral_weight = behavioral_weight ? Number(behavioral_weight) : 20;
    if (enable_salary_linkage !== undefined) insertData.enable_salary_linkage = enable_salary_linkage || false;
    // Sales commission fields
    if (commission_enabled !== undefined) insertData.commission_enabled = commission_enabled || false;
    if (monthly_sales_target !== undefined) insertData.monthly_sales_target = monthly_sales_target ? Number(monthly_sales_target) : null;
    if (salary_slab_id !== undefined) insertData.salary_slab_id = salary_slab_id || null;

    const { error: dbError } = await supabase
      .from("employees")
      .insert(insertData);

    if (dbError) {
      // Revert if insertion failed
      await supabase.auth.admin.deleteUser(user.id);
      return NextResponse.json({ error: "Database Reference Matrix Failed: " + dbError.message }, { status: 500 });
    }

    // Set source separately — column added by migration 20260702100000; non-fatal if column not yet applied
    const empSource = source === "onboarding" ? "onboarding" : "direct";
    try { await supabase.from("employees").update({ source: empSource }).eq("id", user.id); } catch { /* column not yet migrated */ }

    // Vault the current password (encrypted) so a mailbox provisioned LATER can be
    // created with this same password. Non-fatal if the column/key isn't available.
    try {
      const enc = encryptSecret(generatedPassword);
      if (enc) await supabase.from("employees").update({ pwd_vault: enc }).eq("id", user.id);
    } catch { /* column not yet migrated / no key — non-fatal */ }

    // Copy the candidate's onboarding Profile Photo onto the employee record as their
    // display picture (migration 113). Non-fatal if the column/photo is unavailable.
    try {
      let avatarUrl: string | null = typeof body.avatar_url === "string" && body.avatar_url.startsWith("data:") ? body.avatar_url : null;
      if (!avatarUrl && typeof body.avatar_from_email === "string" && body.avatar_from_email) {
        avatarUrl = await resolveProfilePhotoDataUrl(supabase, body.avatar_from_email);
      }
      if (avatarUrl) await supabase.from("employees").update({ avatar_url: avatarUrl }).eq("id", user.id);
    } catch { /* column not yet migrated / no photo — non-fatal */ }

    {
      const actor = await getActor();
      await logAudit({
        actorId: actor?.userId ?? null,
        action: "user.create", section: "Users",
        summary: `Created employee ${name} (${role}) — ${professionalEmail}`,
        targetType: "employee", targetId: user.id,
        changes: {
          role: { from: null, to: role },
          email: { from: null, to: professionalEmail },
          department: { from: null, to: department ?? null },
        },
      });
    }

    // ── Zoho Mail Auto-Provisioning Gate ──────────────────────────────────────
    // The SERVER is the single source of truth for connectivity: we re-check the
    // live Zoho token here instead of trusting the client's zohoConnected flag
    // (which starts false and can race the async connect-status fetch). Provisioning
    // stays non-fatal — the employee is created either way — but the warning message
    // distinguishes "not connected" from "Zoho returned no account id" so the admin
    // knows whether to reconnect or just retry from the profile page.
    let zohoWarning: string | null = null;
    if (create_zoho_mail) {
      const liveToken = await getActiveToken();
      if (!liveToken) {
        zohoWarning = "Employee created, but Zoho is not connected on the server. Reconnect in Admin → Mail Config, then click \"Re-run setup\" on the employee's profile.";
        console.warn("[Users API] create_zoho_mail requested but no live Zoho token — skipping provisioning.");
      } else {
        try {
          const zohoResult = await provisionZohoMailbox({
            employeeId:  user.id,
            name,
            designation: designation || "",
            department:  department  || "",
            tempPassword: generatedPassword,
          });

          if (!zohoResult?.zoho_account_id) {
            const reason = zohoResult?.error ? ` Zoho said: ${zohoResult.error}.` : "";
            zohoWarning = `Employee created, but the Zoho mailbox could not be created.${reason} Retry with "Re-run setup" on the employee's profile once resolved.`;
            console.warn("[Users API] Zoho provisioning returned no account ID:", zohoResult?.error || "unknown");
          }
        } catch (zohoErr: any) {
          zohoWarning = `Employee created, but Zoho mailbox provisioning failed: ${zohoErr.message}`;
          console.warn("[Users API] Zoho provisioning exception:", zohoErr.message);
        }
      }
    }

    // 4. Fetch the dynamic SMTP overrides from the active System Config node
    const { data: config } = await supabase.from("system_config").select("smtp_host, smtp_port, smtp_user, smtp_pass, company_name").single();

    if (config?.smtp_host && config?.smtp_user && config?.smtp_pass) {
      // 5. Fire Transport to absolute designated Employee Inbox
      const transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port || 587,
        secure: config.smtp_port === 465, 
        auth: {
          user: config.smtp_user,
          pass: config.smtp_pass
        }
      });

      // The "future login" guidance differs when no company mailbox is created:
      // the person simply keeps using their personal email until (if ever) one is
      // provisioned — at which point the same password carries over automatically.
      const step3Html = wantsCompanyEmail
        ? `<div style="margin-bottom: 16px; padding: 16px; border-left: 4px solid #10b981; background-color: #ecfdf5; border-radius: 8px;">
                  <strong style="color: #047857; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 6px; letter-spacing: 1px;">Step 3: Future Logins (Professional Email Only)</strong>
                  After completing onboarding, access using your personal email will be permanently blocked. Moving forward, you must log in using your official <b>Professional Email</b>: <span style="font-family: monospace; font-weight: bold; color: #0f172a; background: #d1fae5; padding: 2px 6px; border-radius: 4px;">${professionalEmail}</span> with your newly updated password.
                </div>`
        : `<div style="margin-bottom: 16px; padding: 16px; border-left: 4px solid #10b981; background-color: #ecfdf5; border-radius: 8px;">
                  <strong style="color: #047857; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 6px; letter-spacing: 1px;">Step 3: Keep Using This Email</strong>
                  Continue logging in with your <b>personal email</b> above and your new password. If the company later assigns you an official mailbox, we'll notify you — and your <b>same password will work there automatically</b>, no reset needed.
                </div>`;
      const futureLoginRow = wantsCompanyEmail
        ? `<div style="margin-bottom: 12px; display: flex; align-items: center;">
                  <strong style="width: 180px; color: #64748b; font-size: 12px; text-transform: uppercase;">Future Login Email</strong>
                  <span style="color: #0f172a; font-weight: 600;">${professionalEmail}</span>
                </div>`
        : "";

      const mailOptions = {
        from: `"${config.company_name || "NexaWork"}" <${config.smtp_user}>`,
        to: email,
        subject: `Welcome to ${config.company_name || "NexaWork"} - Onboarding Initiated`,
        html: `
          <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
            <div style="background-color: #0f172a; color: #ffffff; padding: 32px 20px; text-align: center;">
              <h1 style="margin:0; letter-spacing: 4px; font-size: 24px; font-weight: 800; text-transform: uppercase;">${config.company_name || "NEXAWORK"}</h1>
              <p style="margin-top: 8px; opacity: 0.8; font-size: 14px;">Onboarding Portal & Identity Management</p>
            </div>
            <div style="padding: 40px; color: #1e293b; line-height: 1.6;">
              <h2 style="margin-top: 0; font-size: 20px; font-weight: 700;">Welcome Onboard, ${name}!</h2>
              <p>Your professional account at <b>${config.company_name || "NexaWork"}</b> has been successfully initialized. Please follow these step-by-step instructions to connect to your workspace:</p>
              
              <div style="margin: 24px 0; font-size: 13px;">
                <div style="margin-bottom: 16px; padding: 16px; border-left: 4px solid #3b82f6; background-color: #f0f9ff; border-radius: 8px;">
                  <strong style="color: #1d4ed8; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 6px; letter-spacing: 1px;">Step 1: First-Time Login (Personal Email)</strong>
                  Log in to the portal using your <b>Personal Email</b>: <span style="font-family: monospace; font-weight: bold; color: #0f172a; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">${email}</span> and the Temporary Password below.
                </div>

                <div style="margin-bottom: 16px; padding: 16px; border-left: 4px solid #f59e0b; background-color: #fefbeb; border-radius: 8px;">
                  <strong style="color: #b45309; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 6px; letter-spacing: 1px;">Step 2: Password Reset & Onboarding</strong>
                  Once logged in, a <b>Change Password</b> modal will prompt you. Enter your new password and sign the Onboarding Consent Form to initialize your identity profile.
                </div>

                ${step3Html}
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; margin: 24px 0;">
                <div style="margin-bottom: 12px; display: flex; align-items: center;">
                  <strong style="width: 180px; color: #64748b; font-size: 12px; text-transform: uppercase;">Portal Role</strong>
                  <span style="color: #0f172a; font-weight: 600; text-transform: capitalize;">${role}</span>
                </div>
                <div style="margin-bottom: 12px; display: flex; align-items: center;">
                  <strong style="width: 180px; color: #64748b; font-size: 12px; text-transform: uppercase;">1st Login Email</strong>
                  <span style="color: #0f172a; font-weight: 600;">${email}</span>
                </div>
                ${futureLoginRow}
                <div style="display: flex; align-items: center;">
                  <strong style="width: 180px; color: #64748b; font-size: 12px; text-transform: uppercase;">Temporary Pass</strong>
                  <code style="background:#e2e8f0; color: #0f172a; padding:4px 8px; border-radius:4px; font-family: monospace; font-size: 14px; font-weight: 700;">${generatedPassword}</code>
                </div>
              </div>
              
              <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px;">
                <p style="margin: 0; font-weight: 700; color: #0f172a;">Identity Management System</p>
                <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px;">Automated Onboarding Engine · ${config.company_name || "NexaWork"}</p>
              </div>
            </div>
          </div>
        `
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`[SMTP] Successfully executed key handover to ${email}`);
      } catch (err) {
        console.error("[SMTP Error] Email Relay Failure:", err);
      }
    }

    return NextResponse.json({
      success: true,
      id: user.id,
      message: "Employee registered & Auth linked successfully.",
      ...(zohoWarning ? { zoho_warning: zohoWarning } : {}),
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ error: "Internal Relay Fault: " + error.message }, { status: 500 });
  }
}

// Automatically resolve Dashboard Active Sync requirements for fetching mapped Accounts
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const role = searchParams.get("role");

    let query = supabase.from("employees").select("*", { count: 'exact' });

    if (role) {
      query = query.eq("role", role);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,employee_id.ilike.%${search}%`);
    }

    // Always sort by joined_at or created_at natively to display newest first
    query = query.order("created_at", { ascending: false });

    let { data, count, error } = await query;

    // If select(*) fails due to missing columns, try without them
    if (error && error.message?.includes("column")) {
      console.warn("Some columns not found, fetching available columns only");

      let fallbackQuery = supabase
        .from("employees")
        .select("id, name, email, personal_email, zoho_email, employee_id, role, department, designation, team_id, joining_date, employment_type, salary_structure, base_salary, is_active, deactivated_by, deactivated_at, created_at, updated_at", { count: 'exact' });

      if (role) {
        fallbackQuery = fallbackQuery.eq("role", role);
      }

      if (search) {
        fallbackQuery = fallbackQuery.or(`name.ilike.%${search}%,email.ilike.%${search}%,employee_id.ilike.%${search}%`);
      }

      const { data: fallbackData, count: fallbackCount, error: fallbackError } = await fallbackQuery.order("created_at", { ascending: false });

      if (!fallbackError) {
        data = fallbackData;
        count = fallbackCount;
        error = null;
      } else {
        throw fallbackError;
      }
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mutate payloads correctly because original MongoDB schema mapped `employeeId` instead of `employee_id`
    const users = (data || []).map((u: any) => ({
      ...u,
      employeeId: u.employee_id,
      joiningDate: u.joining_date
    }));

    return NextResponse.json({ users, total: count || 0 }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: "Database Fetch Fault: " + error.message }, { status: 500 });
  }
}
