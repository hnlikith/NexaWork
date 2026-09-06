"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useCallback, useRef, useState, type CSSProperties } from "react";
import { X, Upload, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Canvas-based background removal ─────────────────────────────────────────
// Three-pass algorithm:
//   Pass 1 — flood-fill from all 4 edges (removes outer connected background)
//   Pass 2 — global island sweep (removes enclosed background pockets that
//             flood-fill cannot reach because signature/seal strokes surround them)
//   Pass 3 — 1-pixel edge feather (softens jagged anti-alias boundary)
//
// Corner sampling uses a median of 6×6 patches at each corner so a single dark
// speck in the corner doesn't throw off the background colour estimate.

function sampleBgColor(d: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const P = Math.min(6, Math.floor(Math.min(w, h) / 6));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let dy = 0; dy < P; dy++) {
    for (let dx = 0; dx < P; dx++) {
      for (const ci of [dy * w + dx, dy * w + (w - 1 - dx), (h - 1 - dy) * w + dx, (h - 1 - dy) * w + (w - 1 - dx)]) {
        rs.push(d[ci * 4]); gs.push(d[ci * 4 + 1]); bs.push(d[ci * 4 + 2]);
      }
    }
  }
  const med = (a: number[]) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  return [med(rs), med(gs), med(bs)];
}

function removeBg(dataUrl: string, sensitivity: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      // Scale to ≤900px — enough for document quality, ~2× faster than 1400px
      const MAX = 900;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      const [bgR, bgG, bgB] = sampleBgColor(d, w, h);

      // Inline distance helper (avoids repeated sqrt calls in hot loops by
      // comparing squared distance against squared threshold — faster)
      const sqThresh = sensitivity * sensitivity;
      const sqIsland = (sensitivity * 0.55) * (sensitivity * 0.55);

      const sqDist = (p: number) => {
        const dr = d[p] - bgR, dg = d[p + 1] - bgG, db = d[p + 2] - bgB;
        return dr * dr + dg * dg + db * db;
      };

      // ── Pass 1: flood-fill from every edge pixel ───────────────────────────
      const visited = new Uint8Array(w * h); // 1 = scheduled/removed
      const stack: number[] = [];

      const tryPush = (idx: number) => {
        if (idx < 0 || idx >= w * h || visited[idx]) return;
        if (sqDist(idx * 4) < sqThresh) { visited[idx] = 1; stack.push(idx); }
      };

      for (let x = 0; x < w; x++) { tryPush(x); tryPush((h - 1) * w + x); }
      for (let y = 1; y < h - 1; y++) { tryPush(y * w); tryPush(y * w + w - 1); }

      while (stack.length) {
        const idx = stack.pop()!;
        d[idx * 4 + 3] = 0;
        const x = idx % w; const y = (idx - x) / w;
        if (x > 0) tryPush(idx - 1);
        if (x < w - 1) tryPush(idx + 1);
        if (y > 0) tryPush(idx - w);
        if (y < h - 1) tryPush(idx + w);
      }

      // ── Pass 2: island sweep — enclosed background regions ─────────────────
      // Signature loops and enclosed seal areas that weren't reachable from
      // any edge. Uses a lower threshold (55% of sensitivity) so we don't
      // accidentally erase light-coloured ink.
      for (let i = 0; i < w * h; i++) {
        if (!visited[i] && d[i * 4 + 3] > 0 && sqDist(i * 4) < sqIsland) {
          d[i * 4 + 3] = 0;
          visited[i] = 1;
        }
      }

      // ── Pass 3: 1-pixel edge feather ──────────────────────────────────────
      const out = new Uint8ClampedArray(d);
      for (let i = 0; i < w * h; i++) {
        if (d[i * 4 + 3] > 0) {
          const x = i % w; const y = (i - x) / w;
          const hasTransp =
            (x > 0 && d[(i - 1) * 4 + 3] === 0) ||
            (x < w - 1 && d[(i + 1) * 4 + 3] === 0) ||
            (y > 0 && d[(i - w) * 4 + 3] === 0) ||
            (y < h - 1 && d[(i + w) * 4 + 3] === 0);
          if (hasTransp) out[i * 4 + 3] = Math.round(d[i * 4 + 3] * 0.72);
        }
      }
      ctx.putImageData(new ImageData(out, w, h), 0, 0);
      resolve(canvas.toDataURL("image/png", 0.95));
    };
    img.src = dataUrl;
  });
}

// ── Checkered background (shows transparency) ────────────────────────────────
const CHECKER: CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg,#d4d4d4 25%,transparent 25%)," +
    "linear-gradient(-45deg,#d4d4d4 25%,transparent 25%)," +
    "linear-gradient(45deg,transparent 75%,#d4d4d4 75%)," +
    "linear-gradient(-45deg,transparent 75%,#d4d4d4 75%)",
  backgroundSize: "14px 14px",
  backgroundPosition: "0 0,0 7px,7px -7px,-7px 0",
  backgroundColor: "#ffffff",
};

// ── Component ────────────────────────────────────────────────────────────────
export interface AssetUploadModalProps {
  label: string;
  assetType: "signature" | "seal";
  onClose: () => void;
  onUploaded: (url: string) => void;
}

export function AssetUploadModal({ label, assetType, onClose, onUploaded }: AssetUploadModalProps) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [sensitivity, setSensitivity] = useState(65);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfFileRef = useRef<File | null>(null);

  const loadFile = useCallback(async (file: File) => {
    if (file.type === "application/pdf") {
      pdfFileRef.current = file;
      setIsPdf(true);
      setOriginalUrl("__pdf__");
      setProcessedUrl(null);
      return;
    }
    setIsPdf(false);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const url = e.target!.result as string;
      setOriginalUrl(url);
      setProcessedUrl(null);
      setProcessing(true);
      try {
        setProcessedUrl(await removeBg(url, sensitivity));
      } catch {
        toast.error("Background removal failed — try a different image");
      } finally {
        setProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  }, [sensitivity]);

  const reapply = async () => {
    if (!originalUrl || isPdf) return;
    setProcessing(true);
    try { setProcessedUrl(await removeBg(originalUrl, sensitivity)); }
    catch { toast.error("Background removal failed"); }
    finally { setProcessing(false); }
  };

  const reset = () => {
    setOriginalUrl(null); setProcessedUrl(null); setIsPdf(false);
    pdfFileRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUpload = async () => {
    const uploadUrl = processedUrl || (originalUrl !== "__pdf__" ? originalUrl : null);
    if (!uploadUrl && !isPdf) return;
    setUploading(true);
    try {
      const fd = new FormData();
      if (isPdf) {
        if (!pdfFileRef.current) throw new Error("No PDF file");
        fd.append("file", pdfFileRef.current);
      } else {
        const blob = await (await fetch(uploadUrl!)).blob();
        fd.append("file", new File([blob], "asset.png", { type: "image/png" }));
      }
      fd.append("assetType", assetType);
      const res = await fetch("/api/onboarding/settings/assets", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onUploaded(json.url);
      toast.success(`${label} uploaded`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) loadFile(f);
  }, [loadFile]);

  const canUpload = !!originalUrl && !processing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-bold text-foreground">Upload {label}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">PNG · JPEG · PDF &nbsp;·&nbsp; Max 5 MB</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* ── Drop zone (empty state) ── */}
          {!originalUrl && (
            <div
              onClick={() => fileRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              className={`border-2 border-dashed rounded-xl cursor-pointer flex flex-col items-center justify-center gap-4 py-14 transition-all
                ${dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/60 hover:bg-muted/20"}`}
            >
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload size={24} className="text-primary" />
              </div>
              <div className="text-center space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Click to browse or drag & drop</p>
                <p className="text-xs text-muted-foreground">PNG, JPEG, PDF accepted</p>
              </div>
            </div>
          )}

          {/* ── PDF uploaded ── */}
          {isPdf && originalUrl === "__pdf__" && (
            <div className="rounded-xl border border-border bg-muted/20 p-8 flex flex-col items-center gap-3 text-center">
              <span className="text-4xl">📄</span>
              <p className="text-sm font-semibold text-foreground">PDF ready to upload</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                The PDF will be converted to an image on the server.
                Background removal is not available for PDFs — upload as PNG or JPEG to use that feature.
              </p>
              <Button variant="outline" size="sm" onClick={reset} className="mt-1">Change file</Button>
            </div>
          )}

          {/* ── Image before/after ── */}
          {originalUrl && !isPdf && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {/* Original */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Original</p>
                  <div className="rounded-xl border border-border bg-muted/10 min-h-[150px] flex items-center justify-center p-3 overflow-hidden">
                    <img src={originalUrl} alt="original" className="max-h-36 max-w-full object-contain" />
                  </div>
                </div>
                {/* Processed */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Background Removed</p>
                  <div className="rounded-xl border border-border min-h-[150px] flex items-center justify-center p-3 overflow-hidden" style={CHECKER}>
                    {processing
                      ? <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Loader2 size={20} className="animate-spin" />
                          <span className="text-xs">Removing background…</span>
                        </div>
                      : processedUrl
                        ? <img src={processedUrl} alt="result" className="max-h-36 max-w-full object-contain" />
                        : <span className="text-xs text-muted-foreground">Processing…</span>}
                  </div>
                </div>
              </div>

              {/* Sensitivity */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Sensitivity</label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{sensitivity}</span>
                </div>
                <input
                  type="range" min={5} max={175} value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  <strong>Higher</strong> removes more background · <strong>Lower</strong> preserves fine detail. Adjust if edges look rough or the signature/seal gets clipped.
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={reapply} disabled={processing} className="flex-1">
                  <RefreshCw size={12} className={processing ? "animate-spin" : ""} /> Re-apply
                </Button>
                <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground text-xs">
                  Change image
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button size="sm" disabled={!canUpload || uploading} onClick={handleUpload} className="min-w-[130px]">
            {uploading
              ? <><Loader2 size={13} className="animate-spin" /> Uploading…</>
              : <><Upload size={13} /> Upload &amp; Apply</>}
          </Button>
        </div>
      </div>

      <input
        ref={fileRef} type="file" accept="image/png,image/jpeg,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
      />
    </div>
  );
}
