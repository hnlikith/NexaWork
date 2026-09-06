"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Loader2, CheckCircle2, AlertTriangle, ShieldCheck, UploadCloud,
  Camera, CreditCard, Fingerprint, FileText, X, Mail, Lock, Check, Info, Scissors, Contact,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { validatePhotoLocally } from "@/lib/photo-validate-client";
import { SelfieCapture } from "@/components/onboarding/SelfieCapture";

// Face images that get on-device quality/anti-spoof checks after selection.
const PHOTO_DOCS = new Set(["face_photo", "profile_photo"]);

// ── Crop config per document type ─────────────────────────────────────────────
const CROP_ASPECT: Record<string, number | null> = {
  profile_photo: 7 / 9, // 3.5 cm × 4.5 cm — passport/ID portrait, used as the DP
  face_photo: 7 / 9,    // 3.5 cm × 4.5 cm — Indian passport standard (portrait)
  aadhaar:  856 / 540,  // 85.6 mm × 54 mm — standard ID card (landscape)
  pan:      856 / 540,  // 85.6 mm × 54 mm — standard ID card (landscape)
};
const CROP_HINT: Record<string, string> = {
  profile_photo: "3.5 × 4.5 cm · Clear, front-facing — this becomes your ID-card photo",
  face_photo: "3.5 × 4.5 cm · Face must fill 70–80% of the frame",
  aadhaar:    "85.6 × 54 mm — align all four card corners inside the box",
  pan:        "85.6 × 54 mm — align all four card corners inside the box",
};

// ── Icons ──────────────────────────────────────────────────────────────────────
const DOC_ICON: Record<string, any> = {
  profile_photo: Contact, face_photo: Camera, aadhaar: Fingerprint, pan: CreditCard, other: FileText,
};

// ── Types ──────────────────────────────────────────────────────────────────────
type Status = "ready" | "invalid" | "expired" | "submitted" | "error";
type PhotoCheck = {
  loading: boolean;
  result: { ok: boolean; pass: boolean; checks?: { key: string; label: string; pass: boolean }[]; reason?: string; error?: string } | null;
};

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>("ready");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [company, setCompany] = useState("NexaWork");
  const [requiredDocs, setRequiredDocs] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});

  const [files, setFiles] = useState<Record<string, File>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [photoChecks, setPhotoChecks] = useState<Record<string, PhotoCheck>>({});

  // Crop modal state
  const [cropModal, setCropModal] = useState<{ docType: string; rawFile: File } | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/documents/${token}`);
        const json = await res.json();
        if (!res.ok) { setStatus("invalid"); return; }
        setCandidateName(json.candidateName);
        setCandidateEmail(json.candidateEmail || "");
        setCompany(json.companyName);
        setRequiredDocs(json.requiredDocs || []);
        setLabels(json.docLabels || {});
        if (json.alreadySubmitted) setStatus("submitted");
        else if (json.expired) setStatus("expired");
        else setStatus("ready");
      } catch {
        setStatus("error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function validatePhoto(docType: string, file: File) {
    setPhotoChecks((p) => ({ ...p, [docType]: { loading: true, result: null } }));
    const result = await validatePhotoLocally(file);
    setPhotoChecks((p) => ({ ...p, [docType]: { loading: false, result } }));
  }

  function pickFile(docType: string, file: File | null) {
    setErr(null);
    if (!file) return;
    setFiles((p) => ({ ...p, [docType]: file }));
    if (file.type.startsWith("image/")) {
      setPreviews((p) => ({ ...p, [docType]: URL.createObjectURL(file) }));
    } else {
      setPreviews((p) => { const n = { ...p }; delete n[docType]; return n; });
    }
    if (PHOTO_DOCS.has(docType)) {
      if (file.type.startsWith("image/")) validatePhoto(docType, file);
      else setPhotoChecks((p) => ({ ...p, [docType]: { loading: false, result: { ok: true, pass: false, reason: "Please upload an image (not a PDF) for your photo.", checks: [] } } }));
    }
  }

  function clearFile(docType: string) {
    setFiles((p) => { const n = { ...p }; delete n[docType]; return n; });
    setPreviews((p) => { const n = { ...p }; delete n[docType]; return n; });
    if (PHOTO_DOCS.has(docType)) setPhotoChecks((p) => { const n = { ...p }; delete n[docType]; return n; });
  }

  async function submit() {
    setErr(null);
    const missing = requiredDocs.find((d) => !files[d]);
    if (missing) return setErr(`Please upload your ${labels[missing] || missing}.`);
    for (const d of requiredDocs) {
      if (!PHOTO_DOCS.has(d)) continue;
      const pc = photoChecks[d];
      if (pc?.loading) return setErr("Please wait — your photo is still being checked.");
      if (pc?.result?.ok === true && pc.result?.pass === false)
        return setErr(`Your ${labels[d] || "photo"} didn't pass the checks. Please upload a clearer, front-facing photo.`);
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      for (const d of requiredDocs) fd.append(d, files[d]);
      fd.append("message", message);
      const res = await fetch(`/api/documents/${token}`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit");
      setDone(true);
      setStatus("submitted");
    } catch (e: any) {
      setErr(e.message || "Failed to submit your documents.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / status screens ──────────────────────────────────────────────
  if (loading) return <Centered><Loader2 className="animate-spin text-primary" size={28} /><p className="text-sm text-muted-foreground">Loading your secure upload page…</p></Centered>;
  if (status === "invalid" || status === "error") return <Centered><Pill tone="rose"><AlertTriangle size={26} /></Pill><h1 className="text-lg font-semibold text-foreground">Link not valid</h1><p className="text-sm text-muted-foreground max-w-sm text-center">This upload link is invalid or has been revoked. Please contact your HR coordinator.</p></Centered>;
  if (status === "expired") return <Centered><Pill tone="amber"><AlertTriangle size={26} /></Pill><h1 className="text-lg font-semibold text-foreground">Link expired</h1><p className="text-sm text-muted-foreground max-w-sm text-center">This upload link has expired. Please ask HR to send you a fresh one.</p></Centered>;
  if (status === "submitted") return <Centered><Pill tone="emerald"><CheckCircle2 size={32} /></Pill><h1 className="text-xl font-bold text-foreground">{done ? "Documents submitted!" : "Already submitted"}</h1><p className="text-sm text-muted-foreground max-w-md text-center">{done ? `Thank you, ${candidateName?.split(" ")[0] || "and welcome"}. Your documents have been sent securely to the ${company} HR team.` : `Your documents have already been received by the ${company} HR team. There's nothing more to do here.`}</p></Centered>;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Crop Modal */}
      {cropModal && (
        <CropperModal
          docType={cropModal.docType}
          srcFile={cropModal.rawFile}
          onDone={(croppedFile) => { pickFile(cropModal.docType, croppedFile); setCropModal(null); }}
          onCancel={() => setCropModal(null)}
        />
      )}

      {/* Live front-camera selfie for the face photo (with on-device CV checks) */}
      {selfieOpen && (
        <SelfieCapture
          onCapture={(file) => { pickFile("face_photo", file); setSelfieOpen(false); }}
          onCancel={() => setSelfieOpen(false)}
        />
      )}

      <header className="bg-card border-b border-border">
        <div className="mx-auto max-w-3xl px-5 py-4 flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            {company.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{company}</p>
            <p className="text-xs text-muted-foreground">Document Submission</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-5">
        <Card>
          <CardContent className="p-5">
            <h1 className="text-xl font-bold text-foreground">Welcome, {candidateName}!</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Please upload the documents below. Tap <strong>Choose file</strong> — a crop tool will open so you can frame the image perfectly before submitting.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <Mail size={14} className="text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Uploading as</span>
              <span className="text-xs font-medium text-foreground truncate">{candidateEmail}</span>
              <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0"><Lock size={11} /> Locked</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {requiredDocs.map((docType) => {
            const Icon = DOC_ICON[docType] || FileText;
            const file = files[docType];
            const preview = previews[docType];
            const hasCropper = docType in CROP_ASPECT;
            return (
              <Card key={docType}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{labels[docType] || docType}</p>
                      <p className="text-xs text-muted-foreground">
                        {file ? "Ready to send" : docType === "face_photo" ? "Live camera selfie · quality checks run automatically" : hasCropper ? "JPG or PNG · cropping tool opens automatically" : "JPG, PNG or PDF"}
                      </p>
                    </div>
                    {file ? (
                      <Button variant="ghost" size="sm" onClick={() => clearFile(docType)} className="text-muted-foreground">
                        <X size={14} /> Remove
                      </Button>
                    ) : docType === "face_photo" ? (
                      <button
                        type="button"
                        onClick={() => setSelfieOpen(true)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        <Camera size={13} /> Take live selfie
                      </button>
                    ) : (
                      <Label
                        htmlFor={`f-${docType}`}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        {hasCropper ? <Scissors size={13} /> : <UploadCloud size={14} />}
                        Choose file
                      </Label>
                    )}
                    {docType !== "face_photo" && (
                      <input
                        id={`f-${docType}`}
                        type="file"
                        accept={hasCropper ? "image/*" : "image/*,application/pdf"}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          if (hasCropper && f.type.startsWith("image/")) {
                            setCropModal({ docType, rawFile: f });
                          } else {
                            pickFile(docType, f);
                          }
                        }}
                      />
                    )}
                  </div>

                  {docType === "profile_photo" && !file && (
                    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                      <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                        <Info size={12} className="flex-shrink-0" /> This is your profile photo:
                      </p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Upload a clear, front-facing passport-style photo. This becomes your display picture and ID-card photo across the company — so pick one you’re happy with. A crop tool opens so you can frame it perfectly.
                      </p>
                    </div>
                  )}

                  {docType === "face_photo" && !file && (
                    <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                      <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        <Info size={12} className="flex-shrink-0" /> Before you tap “Take live selfie”:
                      </p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Remove glasses, mask, and any cap/hat · face the camera in good light · use a plain background.
                        Your live photo is checked on your device (single face, sharp, uncovered) and is used only to verify it’s really you when you e-sign.
                      </p>
                    </div>
                  )}

                  {file && (
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5">
                      {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={preview} alt="preview"
                          className={cn("rounded-md object-cover", PHOTO_DOCS.has(docType) ? "h-14 w-11" : "h-10 w-16")}
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-card text-muted-foreground">
                          <FileText size={18} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
                        <p className="text-[11px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB · {docType === "face_photo" ? "live selfie" : "cropped"}</p>
                        {docType === "profile_photo" && <p className="text-[10px] text-primary">Used as your display picture</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                        {docType === "face_photo" ? (
                          <button
                            type="button"
                            onClick={() => setSelfieOpen(true)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                          >
                            <Camera size={10} /> Retake
                          </button>
                        ) : (
                          <>
                            <Label
                              htmlFor={`recrop-${docType}`}
                              className="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] font-medium border border-border text-muted-foreground hover:text-foreground"
                            >
                              <Scissors size={10} /> Re-crop
                            </Label>
                            <input
                              id={`recrop-${docType}`}
                              type="file"
                              accept={hasCropper ? "image/*" : "image/*,application/pdf"}
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (!f) return;
                                if (hasCropper && f.type.startsWith("image/")) setCropModal({ docType, rawFile: f });
                                else pickFile(docType, f);
                              }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {PHOTO_DOCS.has(docType) && file && <PhotoChecklist state={photoChecks[docType] || { loading: false, result: null }} />}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardContent className="p-5 space-y-2">
            <Label className="text-xs text-muted-foreground">Message (optional)</Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Anything you'd like to add for the HR team…"
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </CardContent>
        </Card>

        {err && <p className="text-xs text-rose-600 dark:text-rose-400">{err}</p>}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pb-8">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck size={13} /> Sent securely to the {company} HR team. Your link is private to you.
          </p>
          <Button
            onClick={submit}
            disabled={submitting || requiredDocs.some((d) => PHOTO_DOCS.has(d) && (photoChecks[d]?.loading || (photoChecks[d]?.result?.ok === true && photoChecks[d]?.result?.pass === false)))}
            className="sm:min-w-[170px]"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            Send Documents
          </Button>
        </div>
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Canvas-based Image Cropper Modal
// ══════════════════════════════════════════════════════════════════════════════
type CropBox = { x: number; y: number; w: number; h: number };
type DragMode = "move" | "tl" | "tr" | "bl" | "br";

function CropperModal({
  docType, srcFile, onDone, onCancel,
}: {
  docType: string; srcFile: File;
  onDone: (file: File) => void; onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const cropRef = useRef<CropBox>({ x: 0, y: 0, w: 0, h: 0 });
  const dragRef = useRef<{ active: boolean; mode: DragMode; sx: number; sy: number; init: CropBox } | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const ratio = CROP_ASPECT[docType] ?? null;
  const hint = CROP_HINT[docType];

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(srcFile);
    const img = new window.Image();
    img.onload = () => { imgRef.current = img; setReady(true); };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [srcFile]);

  // Init canvas + crop box once image is ready
  useEffect(() => {
    if (!ready || !canvasRef.current || !imgRef.current) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;

    const maxW = Math.min(window.innerWidth - 32, 560);
    const maxH = Math.min(window.innerHeight - 200, 500);
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);

    canvas.width  = Math.round(img.naturalWidth  * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    // Initial crop: centered, 85% width, locked ratio
    const initW = canvas.width * 0.85;
    const initH = ratio ? initW / ratio : canvas.height * 0.85;
    const w = Math.min(initW, canvas.width  - 8);
    const h = Math.min(ratio ? w / ratio : initH, canvas.height - 8);
    const finalW = ratio && h >= canvas.height - 8 ? (canvas.height - 8) * ratio : w;
    const finalH = ratio ? finalW / ratio : h;

    cropRef.current = {
      x: Math.round((canvas.width  - finalW) / 2),
      y: Math.round((canvas.height - finalH) / 2),
      w: Math.round(finalW),
      h: Math.round(finalH),
    };
    drawCanvas();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  function drawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext("2d")!;
    const img = imgRef.current;
    const c = cropRef.current;
    const W = canvas.width, H = canvas.height;

    // 1. Image
    ctx.drawImage(img, 0, 0, W, H);

    // 2. Dark overlay — four rectangles around the crop window
    ctx.fillStyle = "rgba(0,0,0,0.58)";
    ctx.fillRect(0, 0,        W,     c.y);              // top
    ctx.fillRect(0, c.y,      c.x,   c.h);              // left
    ctx.fillRect(c.x + c.w,   c.y,   W - c.x - c.w, c.h); // right
    ctx.fillRect(0, c.y + c.h, W,    H - c.y - c.h);   // bottom

    // 3. Crop border + rule-of-thirds grid
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(c.x, c.y, c.w, c.h);

    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(c.x + c.w / 3, c.y); ctx.lineTo(c.x + c.w / 3, c.y + c.h);
    ctx.moveTo(c.x + c.w * 2 / 3, c.y); ctx.lineTo(c.x + c.w * 2 / 3, c.y + c.h);
    ctx.moveTo(c.x, c.y + c.h / 3); ctx.lineTo(c.x + c.w, c.y + c.h / 3);
    ctx.moveTo(c.x, c.y + c.h * 2 / 3); ctx.lineTo(c.x + c.w, c.y + c.h * 2 / 3);
    ctx.stroke();

    // 4. Document-type guide
    if (docType === "face_photo" || docType === "profile_photo") {
      // Oval face guide with dashed indigo border
      ctx.save();
      ctx.strokeStyle = "rgba(129,140,248,0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.ellipse(c.x + c.w / 2, c.y + c.h * 0.42, c.w * 0.36, c.h * 0.40, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label
      ctx.font = "bold 11px system-ui,sans-serif";
      ctx.fillStyle = "rgba(199,210,254,0.9)";
      ctx.textAlign = "center";
      ctx.fillText("face here", c.x + c.w / 2, c.y + c.h * 0.42 + 4);
      ctx.restore();
    } else if (docType === "aadhaar" || docType === "pan") {
      // Card-corner guides
      const s = Math.min(22, c.w * 0.12);
      ctx.save();
      ctx.strokeStyle = "rgba(129,140,248,0.9)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      const corners: [number, number, number, number][] = [
        [c.x + 3, c.y + 3,   1,  1],   // TL
        [c.x + c.w - 3, c.y + 3,  -1,  1],  // TR
        [c.x + 3, c.y + c.h - 3,  1, -1],  // BL
        [c.x + c.w - 3, c.y + c.h - 3, -1, -1], // BR
      ];
      for (const [ox, oy, dx, dy] of corners) {
        ctx.beginPath();
        ctx.moveTo(ox + dx * s, oy); ctx.lineTo(ox, oy); ctx.lineTo(ox, oy + dy * s);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Resize handles (filled white squares at corners)
    const HS = 7;
    ctx.fillStyle = "white";
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 4;
    for (const [hx, hy] of [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]]) {
      ctx.fillRect(hx - HS, hy - HS, HS * 2, HS * 2);
    }
    ctx.shadowBlur = 0;
  }

  // ── Pointer helpers ─────────────────────────────────────────────────────────
  function canvasXY(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (canvas.width  / r.width),
      y: (clientY - r.top)  * (canvas.height / r.height),
    };
  }

  function hitTest(x: number, y: number): DragMode | null {
    const c = cropRef.current;
    const HIT = 18;
    if (Math.abs(x - c.x)       < HIT && Math.abs(y - c.y)       < HIT) return "tl";
    if (Math.abs(x - (c.x+c.w)) < HIT && Math.abs(y - c.y)       < HIT) return "tr";
    if (Math.abs(x - c.x)       < HIT && Math.abs(y - (c.y+c.h)) < HIT) return "bl";
    if (Math.abs(x - (c.x+c.w)) < HIT && Math.abs(y - (c.y+c.h)) < HIT) return "br";
    if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) return "move";
    return null;
  }

  function clamp(next: CropBox): CropBox {
    const canvas = canvasRef.current!;
    const MIN = 40;
    let { x, y, w, h } = next;
    w = Math.max(MIN, w);
    h = Math.max(MIN, h);
    x = Math.max(0, Math.min(canvas.width  - w, x));
    y = Math.max(0, Math.min(canvas.height - h, y));
    return { x, y, w, h };
  }

  function pointerDown(clientX: number, clientY: number) {
    const { x, y } = canvasXY(clientX, clientY);
    const mode = hitTest(x, y);
    if (!mode) return;
    dragRef.current = { active: true, mode, sx: x, sy: y, init: { ...cropRef.current } };
  }

  function pointerMove(clientX: number, clientY: number) {
    if (!dragRef.current?.active) return;
    const { x, y } = canvasXY(clientX, clientY);
    const dx = x - dragRef.current.sx, dy = y - dragRef.current.sy;
    const init = dragRef.current.init;
    let next: CropBox = { ...init };

    switch (dragRef.current.mode) {
      case "move":
        next.x = init.x + dx; next.y = init.y + dy; break;
      case "br":
        next.w = Math.max(40, init.w + dx);
        next.h = ratio ? next.w / ratio : Math.max(40, init.h + dy); break;
      case "bl":
        next.w = Math.max(40, init.w - dx);
        next.h = ratio ? next.w / ratio : Math.max(40, init.h + dy);
        next.x = init.x + init.w - next.w; break;
      case "tr":
        next.w = Math.max(40, init.w + dx);
        next.h = ratio ? next.w / ratio : Math.max(40, init.h - dy);
        next.y = init.y + init.h - next.h; break;
      case "tl":
        next.w = Math.max(40, init.w - dx);
        next.h = ratio ? next.w / ratio : Math.max(40, init.h - dy);
        next.x = init.x + init.w - next.w;
        next.y = init.y + init.h - next.h; break;
    }

    cropRef.current = clamp(next);
    drawCanvas();
  }

  function pointerUp() {
    if (dragRef.current) dragRef.current.active = false;
  }

  // ── Crop + export ────────────────────────────────────────────────────────────
  async function handleCrop() {
    if (!imgRef.current || !canvasRef.current) return;
    setSaving(true);
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const c = cropRef.current;
    const sx = img.naturalWidth  / canvas.width;
    const sy = img.naturalHeight / canvas.height;

    const out = document.createElement("canvas");
    out.width  = Math.round(c.w * sx);
    out.height = Math.round(c.h * sy);
    out.getContext("2d")!.drawImage(img, Math.round(c.x * sx), Math.round(c.y * sy), out.width, out.height, 0, 0, out.width, out.height);

    out.toBlob((blob) => {
      setSaving(false);
      if (!blob) return;
      const name = `cropped_${srcFile.name.replace(/\.[^.]+$/, "")}.jpg`;
      onDone(new File([blob], name, { type: "image/jpeg" }));
    }, "image/jpeg", 0.93);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-3">
      <div
        className="flex w-full max-w-[600px] flex-col rounded-xl bg-card shadow-2xl overflow-hidden"
        style={{ maxHeight: "calc(100dvh - 24px)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {docType === "profile_photo" ? "Profile Photo" : docType === "face_photo" ? "Passport-size Photo" : docType === "aadhaar" ? "Aadhaar Card" : docType === "pan" ? "PAN Card" : "Crop Image"}
            </p>
            {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
          </div>
          <button onClick={onCancel} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Canvas */}
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-black/90 p-2">
          {!ready
            ? <Loader2 className="animate-spin text-white" size={24} />
            : (
              <canvas
                ref={canvasRef}
                style={{ maxWidth: "100%", maxHeight: "58vh", cursor: "crosshair", touchAction: "none", display: "block" }}
                onMouseDown={(e) => { e.preventDefault(); pointerDown(e.clientX, e.clientY); }}
                onMouseMove={(e) => { e.preventDefault(); pointerMove(e.clientX, e.clientY); }}
                onMouseUp={pointerUp}
                onMouseLeave={pointerUp}
                onTouchStart={(e) => { e.preventDefault(); pointerDown(e.touches[0].clientX, e.touches[0].clientY); }}
                onTouchMove={(e) => { e.preventDefault(); pointerMove(e.touches[0].clientX, e.touches[0].clientY); }}
                onTouchEnd={pointerUp}
              />
            )
          }
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            Drag box to move · drag corners to resize
          </p>
          <div className="flex w-full sm:w-auto gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={handleCrop} disabled={!ready || saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Use this crop
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-muted/30 px-4">{children}</div>;
}

function PhotoChecklist({ state }: { state: PhotoCheck }) {
  if (state.loading) return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
      <Loader2 size={14} className="animate-spin text-primary" /> Checking your photo…
    </div>
  );
  const r = state.result;
  if (!r) return null;
  if (!r.ok) return (
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
      Couldn&apos;t auto-check the photo ({r.error || "service unavailable"}). Please make sure it&apos;s a clear, front-facing photo — you can still continue.
    </div>
  );
  return (
    <div className={cn("mt-3 rounded-lg border p-3", r.pass ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5")}>
      <div className="mb-2 flex items-center gap-2">
        {r.pass ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" /> : <AlertTriangle size={15} className="text-rose-500 shrink-0" />}
        <p className={cn("text-xs font-semibold", r.pass ? "text-emerald-600" : "text-rose-600")}>
          {r.pass ? "Photo looks good — all checks passed" : (r.reason || "Please upload a better photo")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {(r.checks || []).map((c) => (
          <div key={c.key} className="flex items-center gap-1.5 text-[11px]">
            {c.pass ? <Check size={12} className="text-emerald-500 shrink-0" /> : <X size={12} className="text-rose-500 shrink-0" />}
            <span className={c.pass ? "text-muted-foreground" : "text-rose-600"}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "rose" | "amber" | "emerald"; children: React.ReactNode }) {
  const map = { rose: "bg-rose-500/10 text-rose-500", amber: "bg-amber-500/10 text-amber-500", emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  return <div className={cn("flex h-16 w-16 items-center justify-center rounded-full", map[tone])}>{children}</div>;
}
