/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, isAdmin } from "@/lib/onboarding/server";
import { launchBrowser } from "@/lib/browser";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Convert a PNG/JPEG buffer to a base64 data URL. */
function imageToDataUrl(buffer: Buffer, mimeType: string): string {
  const mime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** Render the first page of a PDF buffer to a PNG data URL via Puppeteer. */
async function pdfToDataUrl(buffer: Buffer): Promise<string> {
  const b64 = buffer.toString("base64");
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 600, height: 600, deviceScaleFactor: 2 });
    await page.goto(`data:application/pdf;base64,${b64}`, { waitUntil: "networkidle0", timeout: 15000 });
    await new Promise((r) => setTimeout(r, 2500));
    const screenshot = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 600, height: 600 } });
    return `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`;
  } finally {
    await browser.close();
  }
}

// POST /api/onboarding/settings/assets
// Body: multipart/form-data  { file: File, assetType: "signature" | "seal" }
// Admin only. Converts to a base64 data URL and stores it in onboarding_settings.
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !isAdmin(actor)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("file") as File | null;
  const assetType = form.get("assetType") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!["signature", "seal"].includes(assetType ?? "")) {
    return NextResponse.json({ error: "assetType must be 'signature' or 'seal'" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPEG, and PDF files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File must be under 5 MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let dataUrl: string;
  if (file.type === "application/pdf") {
    try {
      dataUrl = await pdfToDataUrl(buffer);
    } catch (e: any) {
      return NextResponse.json({ error: `PDF render failed: ${e.message}. Try PNG or JPEG instead.` }, { status: 422 });
    }
  } else {
    dataUrl = imageToDataUrl(buffer, file.type);
  }

  const column = assetType === "signature" ? "signatory_signature_url" : "company_seal_url";
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("onboarding_settings")
    .upsert({ id: 1, [column]: dataUrl, updated_by: actor.userId, updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url: dataUrl });
}

// DELETE /api/onboarding/settings/assets?type=signature|seal
export async function DELETE(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !isAdmin(actor)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const assetType = new URL(req.url).searchParams.get("type");
  if (!["signature", "seal"].includes(assetType ?? "")) {
    return NextResponse.json({ error: "type must be 'signature' or 'seal'" }, { status: 400 });
  }

  const column = assetType === "signature" ? "signatory_signature_url" : "company_seal_url";
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("onboarding_settings")
    .upsert({ id: 1, [column]: null, updated_by: actor.userId, updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
