/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// Pure client-side computer-vision validation for profile photos.
// Runs entirely in the browser (canvas pixel analysis + the native FaceDetector
// where available) — no AI API, no cost, instant, and the photo never leaves the device.

export interface PhotoCheck {
  key: string;
  label: string;
  pass: boolean;
}

export interface PhotoValidation {
  ok: boolean; // whether analysis ran
  pass: boolean; // every check passed
  checks: PhotoCheck[];
  reason?: string;
  error?: string;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}

const REASONS: Record<string, string> = {
  resolution: "Photo resolution is too low — use a larger, clearer image.",
  lighting: "Lighting is poor — use a well-lit photo, not too dark or washed out.",
  sharp: "Photo is blurry — hold steady and use a sharp, in-focus image.",
  one_face: "No face detected — use a clear, front-facing photo.",
  single: "More than one person detected — only you should be in the photo.",
  centered: "Face isn't centered — center your face in the frame.",
  face_large: "Face is too small — move closer so your face fills more of the frame.",
  eyes: "Eyes aren't clearly visible — face the camera with eyes open.",
};

export async function validatePhotoLocally(file: File): Promise<PhotoValidation> {
  if (!file.type.startsWith("image/")) {
    return { ok: true, pass: false, checks: [], reason: "Please upload an image file for your photo." };
  }
  try {
    const img = await loadImage(file);
    const ow = img.naturalWidth || img.width;
    const oh = img.naturalHeight || img.height;

    // Downscale for fast pixel analysis while keeping aspect ratio.
    const MAXD = 480;
    const scale = Math.min(1, MAXD / Math.max(ow, oh));
    const w = Math.max(1, Math.round(ow * scale));
    const h = Math.max(1, Math.round(oh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: false, pass: false, checks: [], error: "Canvas not supported." };
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    // Grayscale + luminance statistics.
    const n = w * h;
    const gray = new Float64Array(n);
    let sum = 0;
    let sumSq = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[p] = g;
      sum += g;
      sumSq += g * g;
    }
    const mean = sum / n;
    const contrast = Math.sqrt(Math.max(0, sumSq / n - mean * mean));

    // Blur = variance of the Laplacian (edge energy). Low variance ⇒ soft/blurry.
    let lSum = 0;
    let lSqSum = 0;
    let lCount = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - w] - gray[idx + w];
        lSum += lap;
        lSqSum += lap * lap;
        lCount++;
      }
    }
    const lapMean = lCount ? lSum / lCount : 0;
    const lapVar = lCount ? lSqSum / lCount - lapMean * lapMean : 0;

    const checks: PhotoCheck[] = [
      { key: "resolution", label: "Good resolution", pass: ow >= 240 && oh >= 240 },
      { key: "lighting", label: "Good lighting", pass: mean > 45 && mean < 225 && contrast > 18 },
      { key: "sharp", label: "Sharp (not blurry)", pass: lapVar > 55 },
    ];

    // Optional face checks — only where the browser ships the Shape Detection API.
    const FaceDetectorCtor = (typeof window !== "undefined" ? (window as any).FaceDetector : undefined) as
      | (new (opts?: any) => { detect: (src: CanvasImageSource) => Promise<any[]> })
      | undefined;
    if (FaceDetectorCtor) {
      try {
        const fd = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 5 });
        const faces = await fd.detect(canvas);
        checks.push({ key: "one_face", label: "Face detected", pass: faces.length >= 1 });
        checks.push({ key: "single", label: "No multiple people", pass: faces.length <= 1 });
        const f = faces[0];
        if (f?.boundingBox) {
          const b = f.boundingBox;
          const cx = (b.x + b.width / 2) / w;
          const cy = (b.y + b.height / 2) / h;
          checks.push({ key: "centered", label: "Face centered", pass: cx > 0.3 && cx < 0.7 && cy > 0.22 && cy < 0.78 });
          checks.push({ key: "face_large", label: "Face large enough", pass: (b.width * b.height) / (w * h) > 0.08 });
          if (Array.isArray(f.landmarks) && f.landmarks.length) {
            const eyes = f.landmarks.filter((l: any) => l.type === "eye").length;
            checks.push({ key: "eyes", label: "Eyes visible", pass: eyes >= 2 });
          }
        }
      } catch {
        /* face detector present but failed — skip face checks, keep quality checks */
      }
    }

    const failed = checks.filter((c) => !c.pass);
    const pass = failed.length === 0;
    return { ok: true, pass, checks, reason: pass ? "" : (REASONS[failed[0].key] || "Please upload a clearer photo.") };
  } catch {
    return { ok: false, pass: false, checks: [], error: "Couldn't read that image — try a different file." };
  }
}
