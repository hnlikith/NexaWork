/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import crypto from "crypto";

// AES-256-GCM encryption for biometric face templates (128-D descriptors).
// We NEVER persist raw face images for matching — only the encrypted embedding.
// The key comes from BIOMETRIC_ENC_KEY (32 bytes as hex[64] or base64). If it is
// unset the helpers return null and callers fall back gracefully (with a warning),
// so a missing key degrades to the prior client-asserted behaviour rather than
// breaking signing.

function getKey(): Buffer | null {
  const raw = process.env.BIOMETRIC_ENC_KEY;
  if (!raw) return null;
  try {
    let key: Buffer;
    if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, "hex");
    else key = Buffer.from(raw, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function biometricKeyConfigured(): boolean {
  return getKey() !== null;
}

/** Encrypt a face descriptor (array of floats) → "iv:tag:ciphertext" base64 blob, or null if no key. */
export function encryptTemplate(descriptor: number[]): string | null {
  const key = getKey();
  if (!key || !Array.isArray(descriptor) || !descriptor.length) return null;
  try {
    // Pack the floats into a compact Float32 buffer.
    const f32 = Float32Array.from(descriptor);
    const plain = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Decrypt an "iv:tag:ciphertext" blob back into a Float32Array, or null on failure. */
export function decryptTemplate(blob: string | null | undefined): Float32Array | null {
  const key = getKey();
  if (!key || !blob) return null;
  try {
    const [ivB64, tagB64, ctB64] = blob.split(":");
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return new Float32Array(plain.buffer, plain.byteOffset, plain.byteLength / 4);
  } catch {
    return null;
  }
}

/** Euclidean distance between two descriptors (face-api convention: ≤0.6 = same person). */
export function euclidean(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

/** Cosine similarity (0..1) for display. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Same threshold the client uses (face-api euclidean ≤0.55 ≈ strict same-person).
export const FACE_MATCH_MAX_DISTANCE = 0.55;
