"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2, FileText, AlertCircle } from "lucide-react";

function PreviewContent() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get("accountId");
  const folderId = searchParams.get("folderId");
  const messageId = searchParams.get("messageId");
  const attachmentId = searchParams.get("attachmentId");
  const attachmentName = searchParams.get("attachmentName");
  const fileName = searchParams.get("fileName") || attachmentName || "attachment";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);
  const [textLines, setTextLines] = useState<string | null>(null);

  // Construct download URL
  const params = new URLSearchParams();
  if (accountId) params.set("accountId", accountId);
  if (folderId) params.set("folderId", folderId);
  if (messageId) params.set("messageId", messageId);
  if (attachmentId) params.set("attachmentId", attachmentId);
  if (fileName) params.set("fileName", fileName);
  if (attachmentName) params.set("attachmentName", attachmentName);

  const downloadApiUrl = `/api/mail/attachments?${params.toString()}`;

  useEffect(() => {
    if (!accountId || !messageId) {
      setError("Missing required parameters to fetch attachment.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let currentBlobUrl: string | null = null;

    fetch(downloadApiUrl)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}`);
        }
        const mime = res.headers.get("Content-Type") || "application/octet-stream";
        const blob = await res.blob();
        
        // Override MIME type based on extension to prevent browser auto-downloads
        const ext = fileName.split(".").pop()?.toLowerCase() || "";
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
        const overrideMime = mimeMap[ext];
        const finalBlob = overrideMime ? new Blob([blob], { type: overrideMime }) : blob;
        
        currentBlobUrl = URL.createObjectURL(finalBlob);
        setBlobUrl(currentBlobUrl);

        // Parse CSV if file is csv
        const lowerName = fileName.toLowerCase();
        if (mime.includes("csv") || lowerName.endsWith(".csv")) {
          try {
            const text = await blob.text();
            const rows = text.trim().split(/\r?\n/).map(row =>
              row.split(",").map(cell => cell.replace(/^"|"$/g, "").trim())
            );
            setCsvRows(rows);
          } catch (e) {
            console.warn("Failed to parse CSV as table, falling back to text:", e);
            try {
              const text = await blob.text();
              setTextLines(text);
            } catch (textErr) {
              console.warn("Failed to load CSV as text:", textErr);
            }
          }
        }

        // Fetch and load raw text lines for code/txt/md files
        const textExtensions = [
          "txt", "md", "log", "json", "xml", "yaml", "yml", "js", "ts", "tsx", "jsx", "css", 
          "sh", "bat", "py", "go", "c", "cpp", "h", "java", "php", "rb", "sql", "r", "ini", "conf", "env"
        ];
        if (textExtensions.includes(ext)) {
          try {
            const text = await blob.text();
            setTextLines(text);
          } catch (e) {
            console.warn("Failed to load text lines:", e);
          }
        }

        setLoading(false);
      })
      .catch((err) => {
        console.warn("Fetch error:", err);
        setError(err.message || "Failed to load the file.");
        setLoading(false);
      });

    return () => {
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    };
  }, [downloadApiUrl, fileName]);

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff", "tif"].includes(ext);
  const isPdf = ext === "pdf";
  const isCsv = ext === "csv";
  const isHtml = ["html", "htm"].includes(ext);
  const isText = [
    "txt", "md", "log", "json", "xml", "yaml", "yml", "js", "ts", "tsx", "jsx", "css", 
    "sh", "bat", "py", "go", "c", "cpp", "h", "java", "php", "rb", "sql", "r", "ini", "conf", "env"
  ].includes(ext);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090d16] text-[#e2e8f0] font-sans">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e293b] bg-[#0f172a] shadow-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-theme-primary/10 flex items-center justify-center text-theme-primary flex-shrink-0 border border-theme-primary/20">
            <FileText size={18} className="text-[#3b82f6]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black truncate text-[#f1f5f9]">{fileName}</h1>
            <p className="text-[10px] text-[#64748b] uppercase tracking-wider font-bold">Attachment Preview</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {blobUrl && (
            <a
              href={blobUrl}
              download={fileName}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3b82f6] text-white text-xs font-bold hover:bg-[#2563eb] transition-all shadow-md cursor-pointer"
            >
              <Download size={14} />
              Download File
            </a>
          )}
          <button
            onClick={() => window.close()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#334155] text-[#94a3b8] hover:text-[#f1f5f9] text-xs font-semibold hover:bg-[#1e293b] transition-all"
          >
            Close Tab
          </button>
        </div>
      </div>

      {/* Main preview container */}
      <div className="flex-1 overflow-hidden relative flex flex-col bg-[#090d16]">
        {loading && (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <Loader2 size={32} className="animate-spin text-[#3b82f6]" />
            <p className="text-sm text-[#94a3b8] font-medium">Retrieving attachment from Zoho Mail...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center max-w-md mx-auto">
            <div className="h-16 w-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 mb-2">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-sm font-black text-white">Could Not Load Attachment</h2>
            <p className="text-xs text-[#94a3b8] leading-relaxed">
              {error}. This file may not have fully synchronized with Zoho Mail yet.
            </p>
            <a
              href={downloadApiUrl}
              download={fileName}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#3b82f6] text-white text-xs font-bold hover:bg-[#2563eb] transition-all shadow-md"
            >
              <Download size={14} /> Download File Directly
            </a>
          </div>
        )}

        {!loading && !error && blobUrl && (
          <div className="flex-1 w-full h-full overflow-hidden">
            {/* IMAGE PREVIEW */}
            {isImage && (
              <div className="flex items-center justify-center h-full bg-[#0b0f19] p-8">
                <img
                  src={blobUrl}
                  alt={fileName}
                  className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border border-[#1e293b] bg-[#0f172a]"
                />
              </div>
            )}

            {/* PDF PREVIEW */}
            {isPdf && (
              <iframe
                src={downloadApiUrl}
                title={fileName}
                className="w-full h-full border-0 bg-[#0f172a]"
              />
            )}

            {/* CSV PREVIEW */}
            {isCsv && (
              <div className="w-full h-full overflow-auto p-6 bg-[#090d16]">
                {csvRows ? (
                  <div className="rounded-xl border border-[#1e293b] overflow-hidden bg-[#0f172a]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#1e293b] bg-[#1e293b]/40 sticky top-0">
                          {(csvRows[0] || []).map((cell, idx) => (
                            <th key={idx} className="p-3 font-bold text-[#f1f5f9]">{cell}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1e293b]/50">
                        {csvRows.slice(1).map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-[#1e293b]/30">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-2.5 text-[#94a3b8] truncate max-w-[250px]" title={cell}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : textLines !== null ? (
                  <pre className="w-full font-mono text-[11px] leading-relaxed text-[#94a3b8] bg-[#0f172a] border border-[#1e293b] rounded-xl p-6 shadow-inner whitespace-pre-wrap break-all overflow-x-auto">
                    {textLines}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={24} className="animate-spin text-[#3b82f6]" />
                  </div>
                )}
              </div>
            )}

            {/* HTML PREVIEW */}
            {isHtml && (
              <iframe
                src={downloadApiUrl}
                title={fileName}
                className="w-full h-full border-0 bg-white"
              />
            )}

            {/* TEXT PREVIEW */}
            {isText && (
              <div className="w-full h-full overflow-auto p-6 bg-[#090d16]">
                {textLines !== null ? (
                  <pre className="w-full font-mono text-[11px] leading-relaxed text-[#94a3b8] bg-[#0f172a] border border-[#1e293b] rounded-xl p-6 shadow-inner whitespace-pre-wrap break-all overflow-x-auto">
                    {textLines}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={24} className="animate-spin text-[#3b82f6]" />
                  </div>
                )}
              </div>
            )}

            {/* OTHER / OFFICE FALLBACK */}
            {!isImage && !isPdf && !isCsv && !isHtml && !isText && (
              <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center max-w-sm mx-auto">
                <div className="h-20 w-20 rounded-3xl bg-[#1e293b] flex items-center justify-center text-[#3b82f6] mb-2 border border-[#334155]">
                  <FileText size={36} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white mb-1">Preview Unsuited for Browser</h2>
                  <p className="text-xs text-[#94a3b8] leading-relaxed">
                    This file format ({ext.toUpperCase()}) cannot be rendered directly in the browser tab.
                  </p>
                </div>
                <a
                  href={blobUrl}
                  download={fileName}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#3b82f6] text-white text-xs font-bold hover:bg-[#2563eb] transition-all shadow-md"
                >
                  <Download size={14} /> Download {fileName}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AttachmentPreviewPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen w-screen bg-[#090d16]">
        <Loader2 size={32} className="animate-spin text-[#3b82f6]" />
      </div>
    }>
      <PreviewContent />
    </Suspense>
  );
}
