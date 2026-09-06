/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import crypto from "crypto";

// AES-256-GCM string encryption for at-rest secrets (currently the deferred-Zoho
// password vault). Key from CREDENTIAL_ENC_KEY, falling back to BIOMETRIC_ENC_KEY
// (32 bytes as hex[64] or base64). If no key is configured the helpers return null
// and callers degrade gracefully (a later-provisioned mailbox just gets a fresh
// temp password instead of the synced one).
//
// SECURITY NOTE: storing a reversible copy of a user password is normally avoided.
// It exists ONLY so a company mailbox provisioned AFTER the user set their password
// can be created with that same password (Supabase keeps only a hash, so it can't
// be recovered otherwise). The proper long-term fix is SSO (SAML) so the mailbox
// password is irrelevant. Keep the key secret; rotating it invalidates the vault.

function getKey(): Buffer | null {
  const raw = process.env.CREDENTIAL_ENC_KEY || process.env.BIOMETRIC_ENC_KEY;
  if (!raw) return null;
  try {
    const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function secretVaultConfigured(): boolean {
  return getKey() !== null;
}

/** Encrypt a string → "iv:tag:ciphertext" base64 blob, or null if no key. */
export function encryptSecret(plain: string): string | null {
  const key = getKey();
  if (!key || typeof plain !== "string" || !plain) return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Decrypt an "iv:tag:ciphertext" blob back to the string, or null on failure. */
export function decryptSecret(blob: string | null | undefined): string | null {
  const key = getKey();
  if (!key || !blob) return null;
  try {
    const [ivB64, tagB64, ctB64] = blob.split(":");
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
