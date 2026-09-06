/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveToken } from "@/lib/zoho-mail";
import { provisionZohoMailbox, generateTempPassword, checkMailboxLicense } from "@/lib/zoho-provisioning";
import { decryptSecret } from "@/lib/crypto/secretbox";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/employees/[id]/provision-zoho
// Re-runs Zoho mailbox provisioning for an employee whose mailbox was never
// created (zoho_account_id is null — the red "Zoho Setup Failed" state). This is
// the clean target for the profile-page retry button: it verifies a live Zoho
// token first, then reuses provisionZohoMailbox so behavior matches the create
// flow. It does NOT do SAML — the caller activates afterwards, because SAML needs
// the mailbox to already exist in the Zoho org.
export async function POST(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  // Allow self-service (own profile) or an admin acting on someone else.
  const isSelf  = session.userId === id;
  const isAdmin = session.role === "admin";
  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: emp } = await supabase
    .from("employees")
    .select("id, name, designation, department, zoho_email, zoho_account_id, pwd_vault")
    .eq("id", id)
    .maybeSingle();

  if (!emp) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (emp.zoho_account_id) {
    // Already provisioned — nothing to re-run.
    return NextResponse.json({ ok: true, already_provisioned: true, zoho_account_id: emp.zoho_account_id, zoho_email: emp.zoho_email });
  }

  // The server is the source of truth for connectivity. If Zoho isn't connected,
  // a retry can't succeed — tell the caller to reconnect first.
  const token = await getActiveToken();
  if (!token) {
    return NextResponse.json(
      { error: "Zoho is not connected on the server. Ask an admin to reconnect in Admin → Mail Config, then try again." },
      { status: 400 }
    );
  }

  // Seat preflight — the most common reason a create fails is a full plan (e.g.
  // free Zoho Mail caps at 5 mailboxes). checkMailboxLicense only blocks when it
  // can CONFIRM seats are full, so it never false-blocks when the count is unknown.
  const license = await checkMailboxLicense();
  if (!license.canCreate) {
    return NextResponse.json(
      {
        error: `Your Zoho plan has no free mailbox seats left (${license.used ?? "?"}/${license.allowed ?? "?"} used). Delete an unused mailbox or upgrade the plan in the Zoho Admin Console, then retry.`,
        seat_limit: true,
      },
      { status: 409 }
    );
  }

  // Use the employee's CURRENT password (from the encrypted vault) so the new
  // mailbox is created with the same password they already log in with — no reset
  // needed. Falls back to a fresh temp password if the vault/key isn't available.
  const currentPassword = decryptSecret((emp as any).pwd_vault) || generateTempPassword();

  try {
    const result = await provisionZohoMailbox({
      employeeId:   emp.id,
      name:         emp.name,
      designation:  emp.designation || "",
      department:   emp.department  || "",
      tempPassword: currentPassword,
      preferredEmail: emp.zoho_email || undefined,
    });

    if (!result.zoho_account_id) {
      const reason = result.error ? ` Zoho said: ${result.error}.` : "";
      return NextResponse.json(
        { error: `Couldn't create the mailbox.${reason} This usually means your Zoho plan's mailbox limit is reached, or the address is already reserved in Zoho.` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, zoho_account_id: result.zoho_account_id, zoho_email: result.zoho_email });
  } catch (e: any) {
    console.error("[provision-zoho] failed:", e.message);
    return NextResponse.json({ error: e.message || "Provisioning failed." }, { status: 500 });
  }
}
