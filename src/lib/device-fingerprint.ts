/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// Lightweight device fingerprint for the e-sign audit trail. It hashes coarse
// device/browser signals into a SHA-256 hex string — NOT a tracking supercookie,
// just a tamper-evidence signal recorded next to the signature so the same session
// can be corroborated. Runs entirely in the browser (needs a secure context, which
// the camera step already requires); returns "unknown" if anything is unavailable.
export async function computeDeviceFingerprint(): Promise<string> {
  try {
    const nav = navigator as any;
    const parts = [
      navigator.userAgent,
      navigator.language,
      (navigator.languages || []).join(","),
      nav.platform || "",
      String(nav.hardwareConcurrency || ""),
      String(nav.deviceMemory || ""),
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      String(window.devicePixelRatio || ""),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      canvasSignature(),
    ];
    const data = new TextEncoder().encode(parts.join("|"));
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "unknown";
  }
}

function canvasSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 60, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("nexawork-esign", 2, 2);
    return canvas.toDataURL().slice(-64);
  } catch {
    return "";
  }
}
