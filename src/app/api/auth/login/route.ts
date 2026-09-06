/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { activateZohoMailbox } from "@/lib/zoho-provisioning";

// Anon client for signInWithPassword — service role key rejects user auth calls
const getAnonClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || null;
    const body = await req.json();
    const { email, password } = LoginSchema.parse(body);

    const supabase = getSupabaseAdmin();
    const cleanEmail = email.trim().toLowerCase();

    // 1. Look up the employee profile in database by email (personal, professional or zoho)
    const { data: emp } = await supabase
      .from("employees")
      .select("id, name, email, zoho_email, zoho_user_id, personal_email, status, is_active, role, employee_id, department, designation")
      .or(`email.ilike.${cleanEmail},personal_email.ilike.${cleanEmail},zoho_email.ilike.${cleanEmail}`)
      .maybeSingle();

    if (!emp) {
      return NextResponse.json({ error: "You are not authorized in this company." }, { status: 403 });
    }

    if (emp.status === "disabled" || emp.is_active === false) {
      return NextResponse.json({ error: "Account has been deactivated. Please contact your administrator." }, { status: 403 });
    }

    // 2. Fetch onboarding status
    const { data: onboarding } = await supabase
      .from("user_onboarding")
      .select("status")
      .eq("user_id", emp.id)
      .maybeSingle();

    const onboardingCompleted = onboarding?.status === "completed";
    const isPersonalEmail = cleanEmail === emp.personal_email?.toLowerCase();

    // 3. If they enter their personal email and onboarding is completed, block them!
    if (isPersonalEmail && onboardingCompleted && emp.status !== "disabled") {
      return NextResponse.json({ error: "Please login with your company mail ID." }, { status: 403 });
    }

    // 3b. If they enter their professional email but onboarding is not completed, block them!
    const isProfessionalEmail = cleanEmail === emp.email?.toLowerCase() || (emp.zoho_email && cleanEmail === emp.zoho_email?.toLowerCase());
    const hasDistinctPersonalEmail = emp.personal_email && emp.personal_email.toLowerCase() !== emp.email?.toLowerCase();
    if (isProfessionalEmail && hasDistinctPersonalEmail && !onboardingCompleted) {
      return NextResponse.json({ error: "First time login with personal mail and complete onboarding, after login with professional mail." }, { status: 403 });
    }

    // 4. Authenticate against Supabase Auth using their professional email (which is the registered login identity)
    const anonClient = getAnonClient();
    let { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
      email: emp.email, // Always authenticate using the professional email registered in Supabase Auth
      password,
    });

    // Fallback: if it fails, try signing in with their personal email (for legacy users)
    if ((authError || !authData.user) && emp.personal_email && emp.personal_email !== emp.email) {
      const retry = await anonClient.auth.signInWithPassword({
        email: emp.personal_email,
        password,
      });
      if (retry.data?.user && !retry.error) {
        authData = retry.data;
        authError = null;
      }
    }

    if (authData?.user && !authError) {
      const session = await getSession();
      session.userId = emp.id;
      session.email  = emp.email;
      session.role   = emp.role as any;
      await session.save();

      const isProfessionalEmail = cleanEmail === emp.email?.toLowerCase() || (emp.zoho_email && cleanEmail === emp.zoho_email?.toLowerCase());
      const identityType = isProfessionalEmail ? "professional_zoho_mail" : "personal_mail";
      const logDetails = isProfessionalEmail 
        ? `User signed in using official company Zoho mail ID: ${cleanEmail}` 
        : `User signed in using personal mail ID: ${cleanEmail}`;

      await supabase.from("audit_logs").insert({
        actor_id:    emp.id,
        user_id:     emp.id,
        action:      isProfessionalEmail ? "login_success_professional" : "login_success_personal",
        table_name:  "employees",
        record_id:   emp.id,
        target_type: "login",
        new_values:  { email, method: "supabase_auth", identity_type: identityType, details: logDetails },
        ip_address:  ip,
      });

      // Trigger Zoho Mailbox activation in real-time if a Zoho mailbox is provisioned
      if (emp.zoho_user_id) {
        try {
          await activateZohoMailbox(emp.zoho_user_id);
          console.log(`[Zoho Login Activation] Successfully triggered mailbox activation on login for user: ${emp.name}`);
          
          // Log the activation action specifically for audit purposes
          await supabase.from("audit_logs").insert({
            actor_id:    emp.id,
            user_id:     emp.id,
            action:      "zoho_mailbox_activated_on_login",
            table_name:  "employees",
            record_id:   emp.id,
            target_type: "mailbox",
            new_values:  { zoho_user_id: emp.zoho_user_id, email: emp.zoho_email, reason: "Login activation trigger" },
            ip_address:  ip,
          });
        } catch (activateErr: any) {
          console.error(`[Zoho Login Activation Error] Failed to activate Zoho mailbox:`, activateErr.message);
        }
      }

      return NextResponse.json({
        user: {
          id:          emp.id,
          name:        emp.name,
          email:       emp.email,
          zoho_email:  emp.zoho_email,
          role:        emp.role,
          employeeId:  emp.employee_id,
          department:  emp.department,
          designation: emp.designation,
        },
      });
    }

    // ── 3. Dev fallback — demo credentials (remove in production) ────────────
    if (process.env.NODE_ENV === "development" && password === "demo") {
      const { data: emp } = await supabase
        .from("employees")
        .select("id, name, email, zoho_email, role, employee_id, department, designation, status")
        .or(`email.eq.${email},zoho_email.eq.${email}`)
        .maybeSingle();

      if (emp) {
        const session = await getSession();
        session.userId = emp.id;
        session.email  = emp.email;
        session.role   = emp.role as any;
        await session.save();
        return NextResponse.json({
          user: {
            id: emp.id, name: emp.name, email: emp.email,
            zoho_email: emp.zoho_email, role: emp.role,
            employeeId: emp.employee_id, department: emp.department,
            designation: emp.designation,
          },
        });
      }

      // Absolute fallback demo user
      const demoUser = { id: "uuid-demo", name: "Demo User", email, role: "employee", employeeId: "EMP-DEMO", department: "General", designation: "Tester" };
      const session = await getSession();
      session.userId = demoUser.id;
      session.email  = demoUser.email;
      session.role   = demoUser.role as any;
      await session.save();
      return NextResponse.json({ user: demoUser });
    }

    // ── Log failed attempt ────────────────────────────────────────────────────
    try {
      await supabase.from("audit_logs").insert({
        action:      "login_failed",
        table_name:  "employees",
        record_id:   "unknown",
        target_type: "login",
        new_values:  { email },
        ip_address:  ip,
      });
    } catch (_) {}

    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[LOGIN]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
