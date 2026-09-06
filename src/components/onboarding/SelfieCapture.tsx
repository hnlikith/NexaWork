"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, RefreshCw, Check, X, RotateCcw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadFaceModels, detectFromImage, assessQuality, type QualityResult } from "@/lib/face-verify-client";
import {
  loadFaceLandmarker, detectFrame, makeChallengeSequence, newProgress, stepChallenge,
  scoreRisk, type Challenge, type ChallengeProgress,
} from "@/lib/liveness-client";

// Live front-camera selfie with enterprise active-liveness: a randomized
// challenge sequence (blink / turn / smile) proven live via MediaPipe Face
// Landmarker, then on-device face-quality (face-api) + a weighted risk score.
// Produces a JPEG File only when liveness + quality pass. Camera starts on a tap
// so the permission prompt appears on every device.
export function SelfieCapture({ onCapture, onCancel }: { onCapture: (file: File) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<File | null>(null);
  const rafRef = useRef<number | null>(null);
  const tsRef = useRef(0);

  const [camStarted, setCamStarted] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [hasMulti, setHasMulti] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QualityResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [centered, setCentered] = useState(false);

  // Liveness challenge sequence
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [chIdx, setChIdx] = useState(0);
  const [chCount, setChCount] = useState(0);        // progress for the active challenge
  const [liveDone, setLiveDone] = useState(false);
  const progRef = useRef<ChallengeProgress>(newProgress());
  const idxRef = useRef(0);
  const doneRef = useRef(false);
  const challengesRef = useRef<Challenge[]>([]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Preload both models (MediaPipe liveness + face-api embedding/quality).
  useEffect(() => {
    Promise.allSettled([loadFaceLandmarker(), loadFaceModels()]).then(() => setModelsReady(true));
  }, []);

  function resetChallenges() {
    const seq = makeChallengeSequence();
    challengesRef.current = seq;
    setChallenges(seq);
    idxRef.current = 0; setChIdx(0);
    progRef.current = newProgress(); setChCount(0);
    doneRef.current = false; setLiveDone(false);
  }

  useEffect(() => {
    if (!camStarted) return;
    let active = true;
    (async () => {
      setCamErr(null);
      try {
        stop();
        if (!navigator.mediaDevices?.getUserMedia) { setCamErr("This browser doesn't support the camera. Try Chrome or Safari."); return; }
        let s: MediaStream;
        try { s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
        catch (e: any) {
          if (e?.name === "OverconstrainedError" || e?.name === "ConstraintNotSatisfiedError") s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          else throw e;
        }
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
        try { const d = await navigator.mediaDevices.enumerateDevices(); if (active) setHasMulti(d.filter((x) => x.kind === "videoinput").length > 1); } catch { /* ignore */ }
        resetChallenges();
        startLoop();
      } catch (e: any) {
        if (!active) return;
        const n = e?.name || "";
        if (n === "NotAllowedError" || n === "SecurityError") setCamErr("Camera permission is blocked. Allow it from your browser's site settings, then tap Retry.");
        else if (n === "NotReadableError" || n === "TrackStartError" || n === "AbortError") setCamErr("Your camera is being used by another app or tab. Close it and tap Retry.");
        else if (n === "NotFoundError" || n === "DevicesNotFoundError") setCamErr("No camera was found on this device.");
        else setCamErr("Couldn't start the camera. Tap Retry, or check your browser's camera settings.");
      }
    })();
    return () => { active = false; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camStarted, facing]);

  useEffect(() => () => stop(), [stop]);

  // rAF loop (throttled ~15fps): centering + drive the challenge sequence.
  function startLoop() {
    let lastRun = 0;
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const v = videoRef.current;
      if (!v || !v.videoWidth || preview) return;
      const now = performance.now();
      if (now - lastRun < 66) return; // ~15fps
      lastRun = now;
      tsRef.current = Math.max(tsRef.current + 1, Math.round(now));
      const s = detectFrame(v, tsRef.current);

      // Centering (single face, centered, large enough)
      if (s.present && s.faceCount === 1 && s.box) {
        const cx = s.box.x + s.box.width / 2, cy = s.box.y + s.box.height / 2;
        setCentered(cx > 0.34 && cx < 0.66 && cy > 0.24 && cy < 0.74 && s.box.width > 0.24 && s.box.width < 0.85);
      } else setCentered(false);

      // Only advance challenges when a single face is present.
      if (doneRef.current || !s.present || s.faceCount !== 1) return;
      const seq = challengesRef.current;
      const ch = seq[idxRef.current];
      if (!ch) return;
      const p = stepChallenge(ch, s, progRef.current);
      setChCount(p.count);
      if (p.done) {
        if (idxRef.current + 1 >= seq.length) { doneRef.current = true; setLiveDone(true); }
        else { idxRef.current += 1; setChIdx(idxRef.current); progRef.current = newProgress(); setChCount(0); }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true); setResult(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth; canvas.height = v.videoHeight;
      canvas.getContext("2d")!.drawImage(v, 0, 0);
      const { faces, result: det } = await detectFromImage(canvas);
      if (!det) {
        setResult({ pass: false, sharpness: 0, checks: [{ key: "face", label: "A face is clearly visible", pass: false }] });
        setBusy(false);
        return;
      }
      const q = assessQuality(canvas, det, faces);
      // Weighted risk score (liveness already passed to reach here).
      const noSun = (q.checks.find((c) => c.key === "noglasses")?.pass ?? true) && (q.checks.find((c) => c.key === "nomask")?.pass ?? true);
      const risk = scoreRisk({
        faceDetected: true,
        qualityPass: q.pass,
        noSunglassesMask: noSun,
        eyesVisible: q.checks.find((c) => c.key === "eyes")?.pass ?? true,
        livenessPass: doneRef.current,
        identityMatch: null, // registration selfie has no prior reference
      });
      const finalPass = q.pass && risk.pass;
      setResult({ pass: finalPass, sharpness: q.sharpness, checks: [...q.checks, { key: "risk", label: `Security score ${risk.score}/${risk.max}`, pass: risk.pass }] });
      canvas.toBlob((blob) => {
        if (blob && finalPass) { fileRef.current = new File([blob], `selfie_${Date.now()}.jpg`, { type: "image/jpeg" }); setPreview(URL.createObjectURL(blob)); }
        setBusy(false);
      }, "image/jpeg", 0.92);
    } catch {
      setBusy(false);
      setResult({ pass: false, sharpness: 0, checks: [{ key: "err", label: "Could not analyse the photo — please retake", pass: false }] });
    }
  }

  function useIt() { if (fileRef.current) { stop(); onCapture(fileRef.current); } }
  function retake() {
    setResult(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null); fileRef.current = null;
    resetChallenges();
  }

  const activeChallenge = challenges[chIdx];
  const guide = !centered
    ? "Center your face in the oval"
    : !liveDone && activeChallenge
      ? (activeChallenge.type === "blink" ? `${activeChallenge.label} (${chCount}/${activeChallenge.target})` : activeChallenge.label)
      : "Liveness confirmed — capture now";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={15} /> Live face verification</h3>
          <button onClick={onCancel} className="rounded p-1 hover:bg-muted"><X size={16} /></button>
        </div>

        <div className="space-y-3 p-5">
          {!camStarted ? (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                We'll verify a <strong>live</strong> photo of your face. Please <strong>remove glasses, mask, and any cap/hat</strong>,
                face the camera in good light with a plain background, then follow the on-screen prompts.
              </p>
              <Button className="w-full" onClick={() => { setCamErr(null); setCamStarted(true); }}>
                <Camera size={15} /> Enable camera
              </Button>
            </>
          ) : (
            <>
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-black">
                {preview ? (
                  <img src={preview} alt="selfie" className="h-full w-full object-cover" />
                ) : (
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }} />
                )}
                {!preview && (
                  <>
                    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[3px] border-dashed transition-colors"
                      style={{ width: "64%", height: "74%", borderColor: centered && liveDone ? "#22c55e" : centered ? "#f59e0b" : "#f43f5e" }} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-3">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-center text-[11px] font-medium text-white", liveDone ? "bg-emerald-600/85" : centered ? "bg-amber-600/90" : "bg-rose-600/85")}>
                        {guide}
                      </span>
                    </div>
                    {/* Challenge step dots */}
                    {challenges.length > 0 && (
                      <div className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 gap-1.5">
                        {challenges.map((_, i) => (
                          <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i < chIdx || liveDone ? "bg-emerald-400" : i === chIdx ? "bg-amber-400" : "bg-white/40")} />
                        ))}
                      </div>
                    )}
                  </>
                )}
                {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white"><Loader2 className="animate-spin" size={22} /></div>}
                {hasMulti && !preview && (
                  <button type="button" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-[11px] text-white hover:bg-black/70">
                    <RefreshCw size={12} /> Flip
                  </button>
                )}
              </div>

              {camErr && (
                <div className="space-y-2">
                  <p className="text-xs text-rose-600 dark:text-rose-400">{camErr}</p>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => { setCamErr(null); setCamStarted(false); setTimeout(() => setCamStarted(true), 60); }}>
                    <RefreshCw size={13} /> Retry camera
                  </Button>
                </div>
              )}

              {result && (
                <div className={cn("space-y-1 rounded-lg border p-3", result.pass ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5")}>
                  <p className={cn("mb-1 text-xs font-semibold", result.pass ? "text-emerald-600" : "text-rose-600")}>
                    {result.pass ? "Verified — all checks passed" : "Please fix the highlighted items"}
                  </p>
                  {result.checks.map((c) => (
                    <div key={c.key} className="flex items-center gap-1.5 text-[11px]">
                      {c.pass ? <Check size={12} className="flex-shrink-0 text-emerald-500" /> : <X size={12} className="flex-shrink-0 text-rose-500" />}
                      <span className={c.pass ? "text-muted-foreground" : "text-rose-600"}>{c.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {!preview ? (
                <Button className="w-full" onClick={capture} disabled={busy || !modelsReady || !!camErr || !centered || !liveDone}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}{" "}
                  {!modelsReady ? "Loading verification…" : !centered ? "Center your face…" : !liveDone ? "Follow the prompts…" : "Capture"}
                </Button>
              ) : result?.pass ? (
                <Button className="w-full" onClick={useIt}><Check size={15} /> Use this photo</Button>
              ) : (
                <Button variant="outline" className="w-full" onClick={retake}><RotateCcw size={13} /> Retake</Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
