/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import nodemailer from "nodemailer";
import { getActiveToken } from "@/lib/zoho-mail";
import { ZOHO_API } from "@/lib/zoho-auth";
import { generateTempPassword, updateZohoPassword } from "@/lib/zoho-provisioning";
import { getActor } from "@/lib/onboarding/server";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// ── Helper: get SMTP config ──
async function getSmtp() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("system_config")
    .select("smtp_host, smtp_port, smtp_user, smtp_pass, company_name")
    .single();
  return data;
}

async function sendMail(to: string, subject: string, html: string) {
  const cfg = await getSmtp();
  if (!cfg?.smtp_host || !cfg?.smtp_user || !cfg?.smtp_pass) {
    throw new Error("SMTP not configured. Set it in System Config → Email Server.");
  }
  const transporter = nodemailer.createTransport({
    host: cfg.smtp_host,
    port: cfg.smtp_port || 587,
    secure: cfg.smtp_port === 465,
    auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
  });
  await transporter.sendMail({
    from: `"${cfg.company_name || "NexaWork"}" <${cfg.smtp_user}>`,
    to,
    subject,
    html,
  });
}

// ── GET /api/users/[id] ───────────────────────────────────
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("employees").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ user: { ...data, employeeId: data.employee_id, joiningDate: data.joining_date } });
}

// ── PATCH /api/users/[id] — update profile ────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const updates: Record<string, any> = {};
  if (typeof body.isActive === "boolean") {
    // Prevent self-deactivation: you cannot deactivate your own account
    if (body.isActive === false && body.deactivatedBy && body.deactivatedBy === id) {
      return NextResponse.json({
        error: "SELF_DEACTIVATION_BLOCKED",
        message: "You are not permitted to deactivate your own account."
      }, { status: 403 });
    }

    if (body.isActive === true) {
      // Fetch the current record to check who deactivated it
      const { data: currentEmp } = await supabase
        .from("employees")
        .select("is_active, deactivated_by")
        .eq("id", id)
        .single();
      
      if (currentEmp && currentEmp.is_active === false && currentEmp.deactivated_by) {
        // Enforce: only the admin who deactivated it OR a super admin (role = 'admin') can reactivate it.
        if (body.deactivatedBy && body.deactivatedBy !== currentEmp.deactivated_by) {
          // Fetch the requesting user's details to verify their role
          const { data: requester } = await supabase
            .from("employees")
            .select("role")
            .eq("id", body.deactivatedBy)
            .single();

          if (requester && requester.role !== "admin") {
            // Fetch the deactivating admin's details
            const { data: deactivator } = await supabase
              .from("employees")
              .select("name, role, employee_id")
              .eq("id", currentEmp.deactivated_by)
              .single();

            return NextResponse.json({
              error: "UNAUTHORIZED_REACTIVATION",
              message: `This account was suspended by ${deactivator?.name || "another administrator"}. Only the suspending administrator or a Super Admin is authorized to reactivate this account.`,
              deactivator: deactivator || { name: "System Admin", role: "admin", employee_id: "System" }
            }, { status: 403 });
          }
        }
      }
    }

    updates.is_active = body.isActive;
    if (body.isActive === false) {
      updates.deactivated_by = body.deactivatedBy || null;
      updates.deactivated_at = new Date().toISOString();
    } else {
      updates.deactivated_by = null;
      updates.deactivated_at = null;
    }
  }
  if (body.name) updates.name = body.name;
  if (body.designation) updates.designation = body.designation;
  if (body.role) updates.role = body.role;
  if (body.department) updates.department = body.department;
  if (body.team_id !== undefined) updates.team_id = body.team_id;
  if (body.shift_id !== undefined) updates.shift_id = body.shift_id;
  if (body.matrix_role !== undefined) updates.matrix_role = body.matrix_role;
  if (body.monthly_leave_quota !== undefined) updates.monthly_leave_quota = body.monthly_leave_quota;
  if (body.employment_type !== undefined) updates.employment_type = body.employment_type;
  if (body.salary_structure !== undefined) updates.salary_structure = body.salary_structure;
  if (body.base_salary !== undefined) updates.base_salary = Number(body.base_salary);
  if (body.employeeId !== undefined) updates.employee_id = body.employeeId;
  if (body.commission_enabled !== undefined) updates.commission_enabled = body.commission_enabled;
  if (body.monthly_sales_target !== undefined) updates.monthly_sales_target = body.monthly_sales_target;
  if (body.salary_slab_id !== undefined) updates.salary_slab_id = body.salary_slab_id;

  // New salary range and KPI fields
  if (body.salary_min !== undefined) updates.salary_min = body.salary_min ? Number(body.salary_min) : null;
  if (body.salary_max !== undefined) updates.salary_max = body.salary_max ? Number(body.salary_max) : null;
  if (body.salary_step !== undefined) updates.salary_step = body.salary_step ? Number(body.salary_step) : null;
  if (body.hourly_rate !== undefined) updates.hourly_rate = body.hourly_rate ? Number(body.hourly_rate) : null;
  if (body.daily_rate !== undefined) updates.daily_rate = body.daily_rate ? Number(body.daily_rate) : null;
  if (body.stipend_amount !== undefined) updates.stipend_amount = body.stipend_amount ? Number(body.stipend_amount) : null;
  if (body.kpi_weight !== undefined) updates.kpi_weight = Number(body.kpi_weight) || 40;
  if (body.kra_weight !== undefined) updates.kra_weight = Number(body.kra_weight) || 40;
  if (body.behavioral_weight !== undefined) updates.behavioral_weight = Number(body.behavioral_weight) || 20;
  if (body.kpi_enabled !== undefined) updates.kpi_enabled = Boolean(body.kpi_enabled);
  if (body.enable_salary_linkage !== undefined) updates.enable_salary_linkage = Boolean(body.enable_salary_linkage);
  if (body.joiningDate !== undefined) updates.joining_date = body.joiningDate;

  // Snapshot the fields we may change, so the master log can show "from → to".
  const { data: before } = await supabase
    .from("employees")
    .select("name, role, department, designation, is_active, base_salary, employee_id, enable_salary_linkage")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("employees")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  {
    const changes: Record<string, { from: any; to: any }> = {};
    for (const k of Object.keys(updates)) {
      if (k === "deactivated_at") continue; // noisy timestamp
      const fromV = (before as any)?.[k];
      const toV = (updates as any)[k];
      if (fromV !== toV) changes[k] = { from: fromV ?? null, to: toV ?? null };
    }
    const toggled = "is_active" in updates;
    const action = toggled ? (updates.is_active ? "user.activate" : "user.deactivate") : "user.update";
    const summary = toggled
      ? `${updates.is_active ? "Reactivated" : "Deactivated"} employee ${data.name}`
      : `Edited ${data.name}'s profile`;
    const actor = await getActor();
    await logAudit({
      actorId: actor?.userId ?? body.deactivatedBy ?? body.updatedBy ?? null,
      action, section: "Users", summary,
      targetType: "employee", targetId: id, changes,
    });
  }

  return NextResponse.json({ user: data });
}

// Run a promise but never let it block longer than `ms` (returns null on timeout).
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), ms))]);
}

// Per-employee "owned data" tables — rows that belong to the employee and must be
// removed before the employees row can be deleted. Cleared by employee_id / user_id.
// (Authored/reference columns like created_by, approved_by, team_lead_id are handled
// by ON DELETE SET NULL in migration 20260609180000 + the nullify step below.)
const OWNED_TABLES: Array<{ table: string; cols: string[] }> = [
  { table: "attendance_logs",      cols: ["employee_id"] },
  { table: "leave_requests",       cols: ["employee_id"] },
  { table: "leave_balances",       cols: ["employee_id"] },
  { table: "project_members",      cols: ["employee_id"] },
  { table: "user_onboarding",      cols: ["user_id"] },
  { table: "employee_permissions", cols: ["employee_id"] },
  { table: "payslips",             cols: ["employee_id"] },
  { table: "reimbursements",       cols: ["employee_id"] },
  { table: "kpi_metrics",          cols: ["employee_id"] },
  { table: "salary_revisions",     cols: ["employee_id"] },
  { table: "system_notifications", cols: ["user_id"] },
  { table: "otp_codes",            cols: ["user_id"] },
];

// References on rows that should SURVIVE the deletion — just point them at NULL.
const NULLIFY_REFS: Array<{ table: string; col: string }> = [
  { table: "projects",        col: "team_lead_id" },
  { table: "support_tickets", col: "assignee_id" },
  { table: "support_tickets", col: "current_handler_id" },
  { table: "employees",       col: "deactivated_by" },
];

// Fully remove an employee from Postgres: clear owned data, null surviving refs, then
// delete the row. If an unforeseen FK still blocks, parse the offending table from the
// error and clear it by employee_id/user_id, then retry (self-healing, schema-independent).
async function purgeEmployee(supabase: ReturnType<typeof getSupabaseAdmin>, id: string) {
  // 1. Null out references that must survive (ignore missing table/column errors)
  await Promise.all(NULLIFY_REFS.map((r) => supabase.from(r.table).update({ [r.col]: null }).eq(r.col, id)));
  // 2. Delete owned data
  await Promise.all(
    OWNED_TABLES.flatMap((t) => t.cols.map((c) => supabase.from(t.table).delete().eq(c, id)))
  );
  // 3. Delete the row, self-healing on any remaining FK blocker (owned-data columns only)
  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (!error) return { ok: true as const };

    const blocking = (error.message + " " + (error.details || "")).match(/table "([^"]+)"/)?.[1];
    if (!blocking || blocking === "employees") return { ok: false as const, error: error.message };

    // Clear the offending table by the columns that mean "belongs to this employee".
    const ownedCols = ["employee_id", "user_id"];
    const results = await Promise.all(ownedCols.map((c) => supabase.from(blocking).delete().eq(c, id)));
    const clearedSomething = results.some((r) => !r.error);
    if (!clearedSomething) {
      // The blocker is an authored/reference column the migration should SET NULL.
      return { ok: false as const, error: `Blocked by ${blocking} (needs ON DELETE SET NULL): ${error.message}` };
    }
  }
  return { ok: false as const, error: "Exceeded cascade-cleanup retries." };
}

// Delete the Zoho mailbox — time-bounded so it can never stall the request.
async function deleteZohoMailbox(supabase: ReturnType<typeof getSupabaseAdmin>, zohoEmail?: string | null, zohoAccountId?: string | null) {
  if (!zohoEmail && !zohoAccountId) return;
  try {
    const token = await getActiveToken();
    if (!token) return;
    const { data: config } = await supabase.from("zoho_config").select("zoid").limit(1).maybeSingle();
    const zoid = config?.zoid || process.env.ZOHO_ORG_ID;
    if (!zoid) return;

    const payload: Record<string, any> = zohoEmail ? { emailList: [zohoEmail] } : { accountList: [zohoAccountId] };
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(`${ZOHO_API.mail}/organization/${zoid}/accounts`, {
      method: "DELETE",
      headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!res.ok) console.error(`[DELETE] Zoho API ${res.status}: ${await res.text()}`);
    else console.log(`[DELETE] Zoho mailbox removed: ${zohoEmail || zohoAccountId}`);
  } catch (e: any) {
    console.error("[DELETE] Zoho mailbox deletion skipped:", e.message);
  }
}

// ── DELETE /api/users/[id] — fully decommission a user everywhere ──────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  console.log(`[DELETE] Decommissioning employee: ${id}`);

  try {
    // 1. Grab Zoho identifiers + identity before the row is gone.
    const { data: emp } = await supabase
      .from("employees")
      .select("zoho_account_id, zoho_email, email, name, employee_id, role")
      .eq("id", id)
      .maybeSingle();

    // 2. Remove the employee from Postgres (owned data → row → self-heal on FK blocks).
    const purge = await purgeEmployee(supabase, id);
    if (!purge.ok) {
      console.error("[DELETE] Postgres purge failed:", purge.error);
      return NextResponse.json({ error: purge.error }, { status: 500 });
    }

    // 3. ALWAYS remove the Supabase Auth identity (the auth UUID). This is the step
    //    that prevents orphan auth users. Retry once if the first attempt fails.
    let { error: authErr } = await supabase.auth.admin.deleteUser(id);
    if (authErr) {
      ({ error: authErr } = await supabase.auth.admin.deleteUser(id));
    }
    if (authErr) console.error("[DELETE] Auth UUID removal failed (no employee row remains):", authErr.message);

    // 4. Delete the Zoho mailbox — time-bounded (max 5s) and non-fatal so the user is
    //    removed from our system fast regardless of Zoho latency.
    await withTimeout(deleteZohoMailbox(supabase, emp?.zoho_email, emp?.zoho_account_id), 6000);

    {
      const actor = await getActor();
      await logAudit({
        actorId: actor?.userId ?? null,
        action: "user.delete", section: "Users",
        summary: `Deleted employee ${emp?.name || "(unknown)"}${emp?.employee_id ? ` [${emp.employee_id}]` : ""}${emp?.role ? ` — ${emp.role}` : ""} from the entire system`,
        targetType: "employee", targetId: id,
      });
    }

    console.log(`[DELETE] Fully decommissioned: ${id} (auth removed: ${!authErr})`);
    return NextResponse.json({
      success: true,
      message: "Employee deleted from the entire system.",
      authRemoved: !authErr,
    });
  } catch (err: any) {
    console.error("[DELETE] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── POST /api/users/[id] — action commands ────────────────
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { action } = body;

  const { data: emp, error: empErr } = await supabase.from("employees").select("*").eq("id", id).single();
  const { data: config } = await supabase.from("system_config").select("company_name").single();
  if (empErr || !emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  if (action === "resend_credentials") {
    const newPass = generateTempPassword();
    const { error: authErr } = await supabase.auth.admin.updateUserById(id, { password: newPass });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

    if (emp.zoho_account_id) {
      console.log(`[Resend Credentials] Syncing new temporary password to Zoho for account ID: ${emp.zoho_account_id}`);
      await updateZohoPassword(emp.zoho_account_id, newPass);
    }

    const { data: onboarding } = await supabase
      .from("user_onboarding")
      .select("status")
      .eq("user_id", id)
      .maybeSingle();
    const onboardingCompleted = onboarding?.status === "completed";
    const recipientEmail = (!onboardingCompleted && emp.personal_email) ? emp.personal_email : emp.email;

    try {
      if (!onboardingCompleted) {
        await sendMail(recipientEmail, `Account Credentials Resent - ${config?.company_name || "NexaWork"}`, `
          <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
            <div style="background-color: #0f172a; color: #ffffff; padding: 32px 20px; text-align: center;">
              <h1 style="margin:0; letter-spacing: 4px; font-size: 24px; font-weight: 800; text-transform: uppercase;">${config?.company_name || "NEXAWORK"}</h1>
              <p style="margin-top: 8px; opacity: 0.8; font-size: 14px;">Credentials Recovery Service</p>
            </div>
            <div style="padding: 40px; color: #1e293b; line-height: 1.6;">
              <h2 style="margin-top: 0; font-size: 20px; font-weight: 700;">Hi <b>${emp.name}</b>,</h2>
              <p>As per your administrator's request, your login credentials for the portal have been reset. Please follow these step-by-step instructions to connect to your workspace:</p>
              
              <div style="margin: 24px 0; font-size: 13px;">
                <div style="margin-bottom: 16px; padding: 16px; border-left: 4px solid #3b82f6; background-color: #f0f9ff; border-radius: 8px;">
                  <strong style="color: #1d4ed8; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 6px; letter-spacing: 1px;">Step 1: First-Time Login (Personal Email)</strong>
                  Log in to the portal using your <b>Personal Email</b>: <span style="font-family: monospace; font-weight: bold; color: #0f172a; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">${emp.personal_email}</span> and the Temporary Password below.
                </div>

                <div style="margin-bottom: 16px; padding: 16px; border-left: 4px solid #f59e0b; background-color: #fefbeb; border-radius: 8px;">
                  <strong style="color: #b45309; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 6px; letter-spacing: 1px;">Step 2: Password Reset & Onboarding</strong>
                  Once logged in, a <b>Change Password</b> modal will prompt you. Enter your new password and sign the Onboarding Consent Form to initialize your identity profile.
                </div>

                <div style="margin-bottom: 16px; padding: 16px; border-left: 4px solid #10b981; background-color: #ecfdf5; border-radius: 8px;">
                  <strong style="color: #047857; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 6px; letter-spacing: 1px;">Step 3: Future Logins (Professional Email Only)</strong>
                  After completing onboarding, access using your personal email will be permanently blocked. Moving forward, you must log in using your official <b>Professional Email</b>: <span style="font-family: monospace; font-weight: bold; color: #0f172a; background: #d1fae5; padding: 2px 6px; border-radius: 4px;">${emp.email}</span> with your newly updated password.
                </div>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; margin: 24px 0;">
                <div style="margin-bottom: 12px; display: flex; align-items: center;">
                  <strong style="width: 180px; color: #64748b; font-size: 12px; text-transform: uppercase;">1st Login Email</strong>
                  <span style="color: #0f172a; font-weight: 600;">${emp.personal_email}</span>
                </div>
                <div style="margin-bottom: 12px; display: flex; align-items: center;">
                  <strong style="width: 180px; color: #64748b; font-size: 12px; text-transform: uppercase;">Future Login Email</strong>
                  <span style="color: #0f172a; font-weight: 600;">${emp.email}</span>
                </div>
                <div style="display: flex; align-items: center;">
                  <strong style="width: 180px; color: #64748b; font-size: 12px; text-transform: uppercase;">Temporary Pass</strong>
                  <code style="background:#e2e8f0; color: #0f172a; padding:4px 8px; border-radius:4px; font-family: monospace; font-size: 14px; font-weight: 700;">${newPass}</code>
                </div>
              </div>

              <p style="font-size: 13px; color: #666;">If you did not request this, please contact your security officer immediately.</p>
              <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px;">
                <p style="margin: 0; font-weight: 700; color: #0f172a;">Identity Management System</p>
                <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px;">Automated Onboarding Engine · ${config?.company_name || "NexaWork"}</p>
              </div>
            </div>
          </div>
        `);
      } else {
        await sendMail(recipientEmail, `Account Credentials Resent - ${config?.company_name || "NexaWork"}`, `
          <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
            <div style="background-color: #0f172a; color: #ffffff; padding: 32px 20px; text-align: center;">
              <h1 style="margin:0; letter-spacing: 4px; font-size: 24px; font-weight: 800; text-transform: uppercase;">${config?.company_name || "NEXAWORK"}</h1>
              <p style="margin-top: 8px; opacity: 0.8; font-size: 14px;">Credentials Recovery Service</p>
            </div>
            <div style="padding: 40px; color: #1e293b; line-height: 1.6;">
              <p>Hi <b>${emp.name}</b>,</p>
              <p>As per your administrator's request, your login credentials for the portal have been reset to the standard temporary access key.</p>
              
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; margin: 24px 0;">
                <div style="margin-bottom: 12px; display: flex; align-items: center;">
                  <strong style="width: 120px; color: #64748b; font-size: 12px; text-transform: uppercase;">Login Email</strong>
                  <span style="color: #0f172a; font-weight: 600;">${emp.email}</span>
                </div>
                <div style="display: flex; align-items: center;">
                  <strong style="width: 120px; color: #64748b; font-size: 12px; text-transform: uppercase;">Temporary Pass</strong>
                  <code style="background:#e2e8f0; color: #0f172a; padding:4px 8px; border-radius:4px; font-family: monospace; font-size: 14px; font-weight: 700;">${newPass}</code>
                </div>
              </div>

              <p style="font-size: 13px; color: #666;">If you did not request this, please contact your security officer immediately.</p>
              <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px;">
                <p style="margin: 0; font-weight: 700; color: #0f172a;">Identity Management System</p>
                <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px;">Automated Onboarding Engine · ${config?.company_name || "NexaWork"}</p>
              </div>
            </div>
          </div>
        `);
      }
      await logAudit({
        actorId: (await getActor())?.userId ?? null,
        action: "user.resend_credentials", section: "Users",
        summary: `Reset & resent login credentials for ${emp.name}`,
        targetType: "employee", targetId: id,
      });
      return NextResponse.json({ success: true, message: "Credentials resent successfully." });
    } catch (e: any) {
      return NextResponse.json({ warning: "Account updated but email failed: " + e.message });
    }
  }

  if (action === "reset_password") {
    const { error } = await supabase.auth.resetPasswordForEmail(emp.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit({
      actorId: (await getActor())?.userId ?? null,
      action: "user.reset_password", section: "Users",
      summary: `Sent an official password-reset link to ${emp.name}`,
      targetType: "employee", targetId: id,
    });
    return NextResponse.json({ success: true, message: "Official password reset link sent." });
  }

  if (action === "send_custom") {
    const { subject, message } = body;
    try {
      await sendMail(emp.email, subject, `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
          <div style="background:#0f172a; color:#fff; padding:20px; text-align:center"><h2>${config?.company_name || "NexaWork"}</h2></div>
          <div style="padding:30px; background:#fbfbfa">
            <p>Hi <b>${emp.name}</b>,</p>
            ${message.split("\n").map((l: string) => `<p>${l}</p>`).join("")}
          </div>
        </div>
      `);
      await logAudit({
        actorId: (await getActor())?.userId ?? null,
        action: "user.send_custom_mail", section: "Users",
        summary: `Sent a custom email to ${emp.name}${subject ? ` — "${subject}"` : ""}`,
        targetType: "employee", targetId: id,
      });
      return NextResponse.json({ success: true, message: "Custom email delivered." });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid Action" }, { status: 400 });
}
