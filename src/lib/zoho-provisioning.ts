/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveToken } from "@/lib/zoho-mail";

const ZOHO_MAIL_API = process.env.ZOHO_MAIL_API_URL || "https://mail.zoho.in/api";

// ── Load org config from DB ───────────────────────────────────────────────────
async function getOrgConfig() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("zoho_config")
    .select("id, org_id, zoid, org_domain, client_id, client_secret")
    .maybeSingle();

  if (data && (!data.org_id || !data.zoid) && process.env.ZOHO_ORG_ID) {
    const orgId = process.env.ZOHO_ORG_ID;
    data.org_id = orgId;
    data.zoid = orgId;
    await supabase
      .from("zoho_config")
      .update({ org_id: orgId, zoid: orgId })
      .eq("id", data.id);
  }
  return data;
}

// ── Fetch verified primary domain from Zoho Mail API and persist it ───────────
export async function syncDomainFromZoho(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const token = await getActiveToken();
  const org   = await getOrgConfig();
  const orgId = org?.org_id || org?.zoid;

  if (!token || !orgId) return org?.org_domain || null;

  try {
    const res  = await fetch(`${ZOHO_MAIL_API}/organization/${orgId}/domains`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const json = await res.json();

    // Zoho returns array of domains; pick the primary/verified one
    const domains: any[] = json?.data || [];
    const primary = domains.find(
      (d: any) => d.isPrimary === true || d.isVerified === true || d.status === "verified",
    ) || domains[0];

    if (primary?.domainName) {
      const domain = primary.domainName.toLowerCase();
      await supabase
        .from("zoho_config")
        .update({ org_domain: domain, domain_synced_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .or(`zoid.eq.${orgId}`);
      return domain;
    }
  } catch (e: any) {
    console.error("[Zoho domain sync]", e.message);
  }
  return org?.org_domain || null;
}

// ── License check: is a Zoho mailbox seat available? ─────────────────────────
export interface MailboxLicense {
  used:      number | null;
  allowed:   number | null;
  available: number | null;
  canCreate: boolean;
  source:    "zoho" | "unknown" | "not_connected";
}

export async function checkMailboxLicense(): Promise<MailboxLicense> {
  const org   = await getOrgConfig();
  const token = await getActiveToken();
  const orgId = org?.org_id || org?.zoid;

  if (!token || !orgId) {
    // Can't verify — don't hard-block; the actual create will surface a Zoho error.
    return { used: null, allowed: null, available: null, canCreate: true, source: "not_connected" };
  }

  try {
    // Used seats = current org accounts
    const accRes  = await fetch(`${ZOHO_MAIL_API}/organization/${orgId}/accounts`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const accJson = await accRes.json();
    const accounts: any[] = accJson?.data || [];
    const used = Array.isArray(accounts) ? accounts.length : null;

    // Allowed seats — field name varies across Zoho plans, so probe several.
    let allowed: number | null = null;
    try {
      const orgRes  = await fetch(`${ZOHO_MAIL_API}/organization/${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      const orgJson = await orgRes.json();
      const d: any  = orgJson?.data || {};
      const cand    = d.allowedUsers ?? d.allowedAccounts ?? d.noOfSubscription
                   ?? d.licenseCount ?? d.planUserLimit ?? d.userLimit ?? null;
      allowed = typeof cand === "number" ? cand : (cand != null ? parseInt(String(cand)) : null);
      if (Number.isNaN(allowed as number)) allowed = null;
    } catch {}

    const available = allowed != null && used != null ? Math.max(0, allowed - used) : null;
    // Only block when we can confidently say seats are full.
    const canCreate = available == null ? true : available > 0;

    return { used, allowed, available, canCreate, source: "zoho" };
  } catch {
    return { used: null, allowed: null, available: null, canCreate: true, source: "unknown" };
  }
}

// ── Build email address from full name + domain ───────────────────────────────
function buildEmail(name: string, domain: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/);
  const local =
    parts.length >= 2 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0];
  // Sanitize: remove non alphanumeric except . and -
  const clean = local.replace(/[^a-z0-9.\-]/g, "");
  return `${clean}@${domain}`;
}

// ── Create a Zoho account via Admin API ──────────────────────────────────────
async function createZohoAccount(
  token: string,
  orgId: string,
  primaryEmailAddress: string,
  displayName: string,
  password: string,
): Promise<{ zohoUserId: string | null; zohoAccountId: string | null; finalEmail: string; error?: string }> {
  const base = { displayName, password, role: "member" as const };

  const attempt = async (email: string) => {
    const res = await fetch(`${ZOHO_MAIL_API}/organization/${orgId}/accounts`, {
      method:  "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ ...base, primaryEmailAddress: email }),
    });
    const json = await res.json();
    console.log(`[Zoho Create Account] ${email} → ${res.status}:`, JSON.stringify(json?.status || json?.data || json));
    return { res, json };
  };

  // A collision is anything that means "this address can't be used" — an existing
  // mailbox in THIS org OR an address Zoho still has reserved from a prior deleted
  // user ("EMAILADDRESS_ALREADY_EXISTS"). In every collision case we retry with a
  // numeric suffix so provisioning ALWAYS succeeds instead of silently failing.
  const isCollision = (res: Response, json: any) =>
    json?.data?.errorCode === "MAILBOX_ALREADY_EXISTS" ||
    json?.data?.errorCode === "EMAILADDRESS_ALREADY_EXISTS" ||
    json?.status?.code === 409 ||
    res.status === 409;

  // A license/seat-limit error means NO address will work — retrying a suffixed
  // address is pointless and just burns ~10s. Detect it and bail immediately.
  const isLicenseLimit = (j: any) => {
    const blob = JSON.stringify(j || "").toLowerCase();
    return blob.includes("license") || blob.includes("maximum user") || blob.includes("seat limit");
  };

  const [loc, dm] = primaryEmailAddress.split("@");
  let email = primaryEmailAddress;
  let { res, json } = await attempt(email);
  let licenseLimited = isLicenseLimit(json);

  // Retry with a fresh suffix ONLY on an address collision — and never once we've
  // seen a license-limit error.
  for (let i = 0; i < 5 && isCollision(res, json) && !licenseLimited; i++) {
    const suffix = Math.floor(Math.random() * 900) + 100;
    email = `${loc}${suffix}@${dm}`;
    ({ res, json } = await attempt(email));
    licenseLimited = licenseLimited || isLicenseLimit(json);
  }

  const resolvedAccountId = json?.data?.accountId || null;

  // When Zoho didn't return an account id, capture the REAL reason instead of
  // dropping it. This is what surfaces to the admin — "seat/plan limit reached",
  // "EMAILADDRESS_ALREADY_EXISTS", an OAuth scope error, etc. — instead of a
  // blind "no account id".
  let error: string | undefined;
  if (!resolvedAccountId) {
    error = licenseLimited
      ? "Maximum user license limit reached in Zoho — no free mailbox seats. Delete an unused mailbox in the Zoho Admin Console, or upgrade your Zoho plan, then retry."
      : json?.data?.moreInfo ||
        json?.data?.errorCode ||
        json?.status?.description ||
        json?.message ||
        `Zoho responded with HTTP ${res.status} and no account id`;
  }

  return {
    zohoUserId:    json?.data?.mailboxId || json?.data?.accountId || null,
    zohoAccountId: resolvedAccountId,
    finalEmail:    email,
    error,
  };
}

// ── Apply default signature ───────────────────────────────────────────────────
export async function applyDefaultSignature(
  token: string,
  accountId: string,
  info: { name: string; designation: string; department: string },
) {
  const signatureDomain = process.env.ZOHO_MAIL_DOMAIN;
  const html = `<div style="font-family:sans-serif;font-size:13px;color:#374151">
<strong>${info.name}</strong><br/>
${info.designation}${info.department ? ` | ${info.department}` : ""}<br/>
NexaWork${signatureDomain ? ` | ${signatureDomain}` : ""}
</div>`;

  await fetch(`${ZOHO_MAIL_API}/accounts/${accountId}/signatures`, {
    method:  "POST",
    headers: {
      Authorization:  `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ signatureName: "Default", signature: html, isDefault: true }),
  }).catch(() => {});
}

// ── Main: provision a Zoho mailbox for a new employee ────────────────────────
export async function provisionZohoMailbox(params: {
  employeeId:  string;
  name:        string;
  designation?: string;
  department?:  string;
  tempPassword: string;
  // On a retry, reuse the address already assigned to the employee so the mailbox
  // and any SAML assertion stay on the same address instead of rebuilding it.
  preferredEmail?: string;
}): Promise<{
  zoho_email:      string;
  zoho_user_id:    string | null;
  zoho_account_id: string | null;
  error?:          string;
}> {
  const supabase = getSupabaseAdmin();
  const org      = await getOrgConfig();
  const token    = await getActiveToken();
  const orgId    = org?.org_id || org?.zoid;

  // ── Always use domain from DB (set via Zoho Admin Console sync) ─────────────
  // If org_domain not set yet, try to sync from Zoho, else fail clearly
  let domain = org?.org_domain;
  if (!domain && token && orgId) {
    domain = await syncDomainFromZoho() ?? undefined;
  }
  if (!domain) {
    domain = process.env.ZOHO_MAIL_DOMAIN;
  }
  if (!domain) {
    console.warn("[Zoho provision] org_domain not configured. Go to /admin/mail/config and set your domain.");
    domain = "your-company.com"; // generic placeholder — admin should fix via config page
  }

  let zohoEmail      = params.preferredEmail || buildEmail(params.name, domain);
  let zohoUserId:    string | null = null;
  let zohoAccountId: string | null = null;
  let provisionError: string | undefined;

  // ── Call Zoho Admin API to create the account ────────────────────────────────
  if (token && orgId) {
    try {
      const result = await createZohoAccount(
        token, orgId, zohoEmail, params.name, params.tempPassword,
      );
      zohoUserId    = result.zohoUserId;
      zohoAccountId = result.zohoAccountId;
      zohoEmail     = result.finalEmail; // may have suffix if collision
      if (!zohoAccountId) provisionError = result.error;

      if (zohoAccountId) {
        await applyDefaultSignature(token, zohoAccountId, {
          name:        params.name,
          designation: params.designation || "",
          department:  params.department  || "",
        });
      }
    } catch (e: any) {
      console.error("[Zoho provision] API error:", e.message);
      provisionError = e.message;
    }
  } else {
    console.warn("[Zoho provision] No token or orgId — skipping Zoho API call. Email stored locally only.");
    provisionError = !token ? "Zoho is not connected (no valid token)." : "Zoho org id is not configured.";
  }

  // ── Persist on employee record ───────────────────────────────────────────────
  await supabase
    .from("employees")
    .update({
      zoho_email:      zohoEmail,
      zoho_user_id:    zohoUserId,
      zoho_account_id: zohoAccountId,
      // When provisioning succeeds, zoho_email becomes the canonical professional
      // email — sync it back to the primary `email` field so every consumer
      // (profile display, login lookup, session) sees the real address.
      ...(zohoAccountId ? { email: zohoEmail } : {}),
    })
    .eq("id", params.employeeId);

  // Sync Supabase Auth so the login identity matches the new zoho_email.
  if (zohoAccountId) {
    await supabase.auth.admin
      .updateUserById(params.employeeId, { email: zohoEmail })
      .catch((e: any) =>
        console.warn("[Zoho provision] Auth email sync failed (non-fatal):", e.message),
      );
  }

  // ── Track in account_access ──────────────────────────────────────────────────
  if (zohoAccountId) {
    await supabase.from("account_access").upsert(
      {
        user_id:         params.employeeId,
        zoho_account_id: zohoAccountId,
        email_address:   zohoEmail,
        display_name:    params.name,
        access_type:     "owner",
      },
      { onConflict: "user_id,zoho_account_id" },
    );
  }

  // ── Audit log (non-blocking) ──────────────────────────────────────────────────
  await supabase.from("audit_logs").insert({
    actor_id:    params.employeeId,
    user_id:     params.employeeId,
    action:      "mailbox_provisioned",
    table_name:  "employees",
    record_id:   params.employeeId,
    target_type: "mailbox",
    target_id:   zohoEmail,
    new_values:  { zoho_user_id: zohoUserId, zoho_account_id: zohoAccountId, domain },
  }).then(undefined, () => {});

  return { zoho_email: zohoEmail, zoho_user_id: zohoUserId, zoho_account_id: zohoAccountId, error: provisionError };
}

// ── Disable a Zoho mailbox (offboarding) ─────────────────────────────────────
export async function disableZohoMailbox(zohoUserId: string): Promise<void> {
  const org   = await getOrgConfig();
  const token = await getActiveToken();
  const orgId = org?.org_id || org?.zoid;

  if (!token || !orgId || !zohoUserId) return;

  await fetch(`${ZOHO_MAIL_API}/organization/${orgId}/accounts/${zohoUserId}`, {
    method:  "PATCH",
    headers: {
      Authorization:  `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accountEnabled: false }),
  }).catch(() => {});
}

// ── Enable/Activate a Zoho mailbox in real-time ──────────────────────────────
// NOTE: Zoho Mail API does NOT support enabling/disabling mailboxes via API on free plans.
// The correct way to record a Zoho "login" event is through the SAML SSO flow.
// This function verifies mailbox exists and is accessible.
export async function activateZohoMailbox(zohoUserId: string): Promise<boolean> {
  const org   = await getOrgConfig();
  const token = await getActiveToken();
  const orgId = org?.org_id || org?.zoid;

  if (!token || !orgId || !zohoUserId) {
    console.warn("[Zoho mailbox check] Missing credentials or token.");
    return false;
  }

  try {
    // Fetch all accounts and find this user — to verify the mailbox is active
    const listUrl = `${ZOHO_MAIL_API}/organization/${orgId}/accounts`;
    const res = await fetch(listUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (!res.ok) {
      console.warn(`[Zoho mailbox check] Failed to list accounts: ${res.status}`);
      return false;
    }

    const json = await res.json();
    const accounts: any[] = json?.data || [];
    
    // Match by accountId or by ZUID (zohoUserId could be either)
    const account = accounts.find(
      (a: any) => a.accountId === zohoUserId || String(a.zuid) === String(zohoUserId)
    );

    if (!account) {
      console.warn(`[Zoho mailbox check] Account not found in Zoho for ID: ${zohoUserId}`);
      return false;
    }

    const isEnabled = account.enabled === true || account.status === true;
    const lastLogin = account.lastLogin;
    console.log(`[Zoho Mailbox Check] Account: ${account.primaryEmailAddress}, enabled: ${isEnabled}, lastLogin: ${lastLogin}`);
    return isEnabled;
  } catch (e: any) {
    console.error("[Zoho mailbox check] API error:", e.message);
    return false;
  }
}

// ── Grant a user access to a shared mailbox ───────────────────────────────────
export async function grantSharedMailboxAccess(params: {
  userId:        string;
  zohoAccountId: string;
  emailAddress:  string;
  displayName:   string;
  accessType:    "shared_read" | "shared_send";
}) {
  const supabase = getSupabaseAdmin();
  await supabase.from("account_access").upsert(
    {
      user_id:         params.userId,
      zoho_account_id: params.zohoAccountId,
      email_address:   params.emailAddress,
      display_name:    params.displayName,
      access_type:     params.accessType,
    },
    { onConflict: "user_id,zoho_account_id" },
  );
}

// ── Generate a random temporary password ─────────────────────────────────────
export function generateTempPassword(length = 12): string {
  const uppers = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lowers = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "@#!$%&*";
  
  // Guarantee at least one of each character class
  const pwdParts = [
    uppers[Math.floor(Math.random() * uppers.length)],
    lowers[Math.floor(Math.random() * lowers.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];
  
  const allChars = uppers + lowers + digits + symbols;
  for (let i = pwdParts.length; i < length; i++) {
    pwdParts.push(allChars[Math.floor(Math.random() * allChars.length)]);
  }
  
  // Shuffle the password characters using Fisher-Yates algorithm
  for (let i = pwdParts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwdParts[i], pwdParts[j]] = [pwdParts[j], pwdParts[i]];
  }
  
  return pwdParts.join("");
}

// ── Update Zoho account password ──────────────────────────────────────────────
export async function updateZohoPassword(zohoAccountId: string, newPassword: string): Promise<boolean> {
  const org = await getOrgConfig();
  const token = await getActiveToken();
  const orgId = org?.org_id || org?.zoid;

  if (!token || !orgId || !zohoAccountId) {
    console.warn("[Zoho password update] Missing credentials or token — skipping password sync.");
    return false;
  }

  try {
    // 1. Fetch Zoho accounts to get the ZUID for this accountId
    const listUrl = `${ZOHO_MAIL_API}/organization/${orgId}/accounts`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    
    if (!listRes.ok) {
      throw new Error(`Failed to fetch accounts list: ${listRes.status}`);
    }
    
    const listJson = await listRes.json();
    const accounts = listJson?.data || [];
    const userAccount = accounts.find((a: any) => a.accountId === zohoAccountId);
    
    if (!userAccount) {
      console.warn(`[Zoho password update] Account not found in Zoho for account ID: ${zohoAccountId}`);
      return false;
    }
    
    const zuid = userAccount.zuid;
    if (!zuid) {
      console.warn(`[Zoho password update] ZUID not found for account ID: ${zohoAccountId}`);
      return false;
    }

    // 2. Perform the password reset PUT request using the correct ZUID
    const url = `${ZOHO_MAIL_API}/organization/${orgId}/accounts/${zohoAccountId}`;
    console.log(`[Zoho Password Update] Requesting PUT for ZUID: ${zuid} at URL: ${url}`);
    
    // Construct raw JSON string to preserve 64-bit integer precision for zuid
    const rawBody = `{"zuid": ${zuid}, "password": ${JSON.stringify(newPassword)}, "mode": "resetPassword"}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: rawBody,
    });

    const json = await res.json();
    console.log(`[Zoho Password Update] Status: ${res.status}, Response:`, JSON.stringify(json));
    
    return res.ok;
  } catch (e: any) {
    console.error("[Zoho password update] API error:", e.message);
    return false;
  }
}
