/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendZohoMail, buildActivationEmailHtml } from "@/lib/zoho-mail";

// Called by the /auth/zoho-activated landing page AFTER Zoho has accepted the
// SAML sign-in and redirected the browser back to us. Reaching this point is the
// genuine proof of activation — so this is where we stamp employees.zoho_activated_at
// (exactly once) and dispatch the "your Zoho is activated" confirmation email to
// both the company (Zoho) and personal address.
export async function POST() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: user, error: userErr } = await supabase
    .from("employees")
    .select("id, name, zoho_email, personal_email, role, zoho_activated_at")
    .eq("id", session.userId)
    .maybeSingle();

  if (userErr || !user) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Stamp only when currently NULL, and .select() so we know whether THIS request
  // was the genuine first activation (rows returned) vs. an already-activated user.
  const { data: stamped, error: stampErr } = await supabase
    .from("employees")
    .update({ zoho_activated_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("zoho_activated_at", null)
    .select("id");

  if (stampErr) {
    console.warn("[zoho-activate] stamp failed:", stampErr.message);
    return NextResponse.json({ firstActivation: false, role: user.role });
  }

  const firstActivation = !!(stamped && stamped.length > 0);

  if (firstActivation) {
    // Audit (non-blocking)
    supabase.from("audit_logs").insert({
      actor_id:    user.id,
      user_id:     user.id,
      action:      "zoho_sso_first_activation",
      table_name:  "employees",
      record_id:   user.id,
      target_type: "login",
      new_values:  { email: user.zoho_email, note: "Zoho SAML sign-in verified — activation confirmed, email sent" },
    }).then(undefined, () => {});

    // Confirmation email → company + personal address (deduped). Time-bounded so a
    // slow mail call never holds up the landing page response.
    const recipients = Array.from(
      new Set(
        [user.zoho_email, (user as any).personal_email]
          .filter(Boolean)
          .map((e) => String(e).toLowerCase())
      )
    );
    if (recipients.length) {
      const result = await Promise.race([
        sendZohoMail({
          to: recipients,
          subject: "Your Zoho mailbox is now active",
          html: buildActivationEmailHtml(user.name || "there", user.zoho_email!),
        }),
        new Promise<{ ok: boolean; error?: string }>((resolve) =>
          setTimeout(() => resolve({ ok: false, error: "mail timeout" }), 8000)
        ),
      ]);
      if (result.ok) console.log(`[zoho-activate] confirmation email sent to ${recipients.join(", ")}`);
      else console.warn("[zoho-activate] confirmation email failed:", result.error);
    }
  }

  return NextResponse.json({ firstActivation, role: user.role });
}
