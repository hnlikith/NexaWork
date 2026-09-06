/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ZOHO_API, getZohoToken } from "@/lib/zoho-auth";
import { zohoGet } from "@/lib/zoho-mail";

// Attachments are stored in Supabase storage (mail-attachments bucket).
// This makes them completely independent of which Zoho account sends the email —
// every sender (admin or any employee) can attach files without storeName conflicts.
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const employeeId = formData.get("employee_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Unique storage path: mail-attachments/{employeeId|shared}/{timestamp}-{filename}
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${employeeId || "shared"}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("mail-attachments")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("[Attachments API] Supabase upload error:", uploadError.message);
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // 30-day signed URL — works for any recipient (internal or external) without Supabase auth
    const { data: signedData, error: signError } = await supabase.storage
      .from("mail-attachments")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 30); // 30 days

    if (signError || !signedData?.signedUrl) {
      console.error("[Attachments API] Failed to create signed URL:", signError?.message);
      return NextResponse.json({ error: "Failed to generate download link." }, { status: 500 });
    }

    console.log("[Attachments API] Uploaded to Supabase:", { storagePath, size: file.size });

    // Return same shape the compose page expects from res.data[0]
    return NextResponse.json({
      data: [{
        storeName:      "supabase",
        attachmentName: file.name,
        attachmentPath: signedData.signedUrl,
        attachmentSize: file.size,
      }],
    });
  } catch (e: any) {
    console.error("[Attachments API] Fatal exception:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const accountId      = searchParams.get("accountId");
  const messageId      = searchParams.get("messageId");
  const fileName       = searchParams.get("fileName") || "attachment";
  // These may be absent when the link was pre-built at send-time
  let folderId         = searchParams.get("folderId");
  let attachmentId     = searchParams.get("attachmentId");
  // Fallback: name-based lookup when attachmentId is not yet known
  const attachmentName = searchParams.get("attachmentName") || fileName;

  if (!accountId || !messageId) {
    return new NextResponse("Missing required parameters: accountId and messageId", { status: 400 });
  }

  const token = await getZohoToken();
  if (!token) {
    return new NextResponse("Zoho Mail not connected", { status: 503 });
  }

  try {
    // If folderId or attachmentId is missing, resolve them via Zoho detail lookup
    if (!folderId || !attachmentId) {
      console.log(`[Attachment Download] Resolving folderId/attachmentId for message ${messageId} in account ${accountId}`);

      // 1. Fetch folders list
      const foldersRes = await zohoGet(token, `/accounts/${accountId}/folders`);
      const folders: any[] = foldersRes?.data || [];

      // 2. Try each common folder until we find the message + its attachment
      const foldersToTry = ["Inbox", "Sent", "Drafts", "Trash", ...folders.map((f: any) => f.folderName)];
      const uniqueFolders = [...new Set(foldersToTry)];

      for (const folderName of uniqueFolders) {
        const matched = folders.find((f: any) => f.folderName?.toLowerCase() === folderName.toLowerCase());
        const fId = matched?.folderId;
        if (!fId) continue;

        try {
          const detailsRes = await zohoGet(token, `/accounts/${accountId}/folders/${fId}/messages/${messageId}/attachmentinfo`);
          if (detailsRes?.data) {
            const attachments: any[] = detailsRes.data.attachments || [];
            // Match by name (case-insensitive)
            const matched_att = attachments.find(
              (a: any) => (a.attachmentName || a.fileName)?.toLowerCase() === attachmentName.toLowerCase()
            ) || attachments[0]; // fallback to first attachment

            if (matched_att) {
              folderId     = fId;
              attachmentId = matched_att.attachmentId;
              console.log(`[Attachment Download] Resolved: folderId=${folderId}, attachmentId=${attachmentId} via folder '${folderName}'`);
              break;
            }
          }
        } catch (err: any) {
          console.warn(`[Attachment Download] Could not fetch attachmentinfo for folder '${folderName}':`, err.message);
        }
      }

      if (!folderId || !attachmentId) {
        return new NextResponse(
          `Could not resolve attachment "${attachmentName}" — the email may not have synced to Zoho yet. Please try again in a moment.`,
          { status: 404 }
        );
      }
    }

    const downloadUrl = `${ZOHO_API.mail}/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachments/${attachmentId}`;
    console.log(`[Attachment Download] Fetching from Zoho: ${downloadUrl}`);

    const res = await fetch(downloadUrl, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error(`[Attachment Download] Zoho download failed: ${res.statusText}`, errorText);
      return new NextResponse(`Zoho attachment fetch failed: ${res.statusText}`, { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const isViewable = [
      "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff", "tif",
      "html", "htm", "txt", "json", "xml", "yaml", "yml", "js", "ts", "tsx", "jsx", 
      "css", "sh", "bat", "py", "go", "c", "cpp", "h", "java", "php", "rb", "sql", 
      "r", "ini", "conf", "env", "csv"
    ].includes(ext);
    const disposition = isViewable ? "inline" : "attachment";

    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      bmp: "image/bmp",
      ico: "image/x-icon",
      tiff: "image/tiff",
      tif: "image/tiff",
      html: "text/html",
      htm: "text/html",
      txt: "text/plain",
      md: "text/markdown",
      log: "text/plain",
      json: "application/json",
      xml: "application/xml",
      yaml: "text/yaml",
      yml: "text/yaml",
      csv: "text/csv",
      // Code/scripts mapped to plain text for browser rendering
      js: "text/plain",
      ts: "text/plain",
      tsx: "text/plain",
      jsx: "text/plain",
      css: "text/plain",
      sh: "text/plain",
      bat: "text/plain",
      py: "text/plain",
      go: "text/plain",
      c: "text/plain",
      cpp: "text/plain",
      h: "text/plain",
      java: "text/plain",
      php: "text/plain",
      rb: "text/plain",
      sql: "text/plain",
      r: "text/plain",
      ini: "text/plain",
      conf: "text/plain",
      env: "text/plain"
    };
    const contentType = isViewable ? (mimeMap[ext] || "application/octet-stream") : (res.headers.get("Content-Type") || "application/octet-stream");

    return new NextResponse(buffer, {
      headers: {
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(fileName)}"`,
        "Content-Type": contentType,
      },
    });
  } catch (e: any) {
    console.error("[Attachment Download] Exception during download:", e);
    return new NextResponse(e.message || "Internal server error", { status: 500 });
  }
}
