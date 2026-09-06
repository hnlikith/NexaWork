/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const BUCKET = "attachments";

// POST /api/support/upload
// Accepts multipart/form-data with files[]
// Uses service role key → bypasses RLS entirely
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const userId = formData.get("userId") as string;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin(); // service role — bypasses RLS
    const storagePaths: string[] = [];

    for (const file of files) {
      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 50MB limit.` },
          { status: 413 }
        );
      }

      // Sanitise filename and build storage path
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `support/${userId}/${Date.now()}_${safeName}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (error) {
        console.error("[upload] storage error:", error);
        throw new Error(`Failed to upload "${file.name}": ${error.message}`);
      }

      storagePaths.push(data.path);
    }

    return NextResponse.json({ paths: storagePaths });
  } catch (err: any) {
    console.error("[POST /api/support/upload]", err);
    return NextResponse.json(
      { error: err.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}

// GET /api/support/upload?path=...
// Returns a 1-hour signed URL for a given storage path
export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("path");
    if (!path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600); // 1-hour expiry

    if (error || !data) throw error ?? new Error("Failed to create signed URL");

    return NextResponse.json({ url: data.signedUrl });
  } catch (err: any) {
    console.error("[GET /api/support/upload]", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to generate URL" },
      { status: 500 }
    );
  }
}
