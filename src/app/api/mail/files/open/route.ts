/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/mail/files/open?id=<uuid>
// Decodes the base64 data URL stored in mail_file_shares and serves the raw binary
// so Chrome opens it as a proper file (no "Not secure" / about:blank issues).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return new NextResponse("Missing id", { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: file, error } = await supabase
    .from("mail_file_shares")
    .select("storage_url, filename, file_type")
    .eq("id", id)
    .single();

  if (error || !file) return new NextResponse("File not found", { status: 404 });

  const { storage_url, filename, file_type } = file as {
    storage_url: string;
    filename: string;
    file_type: string;
  };

  if (!storage_url) return new NextResponse("No file content", { status: 404 });

  // If it's not a base64 data URL, redirect to the URL directly
  if (!storage_url.startsWith("data:")) {
    return NextResponse.redirect(storage_url);
  }

  // Parse the data URL: "data:<mime>;base64,<b64data>"
  const commaIdx = storage_url.indexOf(",");
  if (commaIdx === -1) return new NextResponse("Invalid file data", { status: 500 });

  const header = storage_url.slice(0, commaIdx);        // "data:application/pdf;base64"
  const b64    = storage_url.slice(commaIdx + 1);       // base64 string

  const mime = file_type
    || (header.match(/data:([^;]+)/) || [])[1]
    || "application/octet-stream";

  const buffer = Buffer.from(b64, "base64");

  const safeFilename = encodeURIComponent(filename || "file");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":        mime,
      "Content-Disposition": `inline; filename="${safeFilename}"`,
      "Content-Length":      String(buffer.length),
      "Cache-Control":       "private, max-age=3600",
    },
  });
}
