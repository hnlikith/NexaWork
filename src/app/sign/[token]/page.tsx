"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, ShieldCheck, AlertTriangle, PenTool, FileSignature, Mail, Lock, Camera, ScanFace, RefreshCw, RotateCcw, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DocumentPreview } from "@/components/onboarding/DocumentPreview";
import { SignaturePad } from "@/components/onboarding/SignaturePad";
import { loadFaceModels, detectFromImage, verifyAgainst, assessQuality, type FaceVerdict } from "@/lib/face-verify-client";
import {
  loadFaceLandmarker, detectFrame, makeChallengeSequence, newProgress, stepChallenge,
  scoreRisk, type Challenge, type ChallengeProgress,
} from "@/lib/liveness-client";
import { computeDeviceFingerprint } from "@/lib/device-fingerprint";
import type { TemplateData } from "@/lib/onboarding/types";

type SignState = "ready" | "invalid" | "expired" | "signed" | "error";

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SignState>("ready");
  const [data, setData] = useState<TemplateData | null>(null);
  const [company, setCompany] = useState("YOUR COMPANY");
  const [candidateName, setCandidateName] = useState("");

  const [sigImage, setSigImage] = useState<string | null>(null);
  const [sigEdge, setSigEdge] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Identity gate (email OTP → live face → sign)
  const [step, setStep] = useState<"gate" | "face" | "sign">("gate");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [otpErr, setOtpErr] = useState<string | null>(null);

  // Server-issued proof that OTP + liveness + face all passed. The sign POST
  // requires it, so the biometric gate can't be skipped by calling the API direct.
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const deviceFpRef = useRef<string>("unknown");

  // Live face verification
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const refDescRef = useRef<Float32Array | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [faceStatus, setFaceStatus] = useState<"init" | "ready" | "verifying">("init");
  const [faceMsg, setFaceMsg] = useState("");
  const [faceResult, setFaceResult] = useState<FaceVerdict | null>(null);
  const [refMissing, setRefMissing] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [faceFails, setFaceFails] = useState(0);
  const [camAttempt, setCamAttempt] = useState(0);
  const [hasMultiCam, setHasMultiCam] = useState(false);
  // Camera must be started by an explicit tap — some mobile browsers (Samsung
  // Internet, in-app browsers) only show the permission prompt on a user gesture,
  // never from a bare useEffect. camLive flips true once the video is playing.
  const [camStarted, setCamStarted] = useState(false);
  const [camLive, setCamLive] = useState(false);
  // Randomized active-liveness challenge sequence (blink / turn / smile)
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [chIdx, setChIdx] = useState(0);
  const [chCount, setChCount] = useState(0);
  const [liveDone, setLiveDone] = useState(false);
  const [centered, setCentered] = useState(false);
  const progRef = useRef<ChallengeProgress>(newProgress());
  const idxRef = useRef(0);
  const doneRef = useRef(false);
  const challengesRef = useRef<Challenge[]>([]);
  const rafRef = useRef<number | null>(null);
  const tsRef = useRef(0);

  // ── Session security ────────────────────────────────────────────────────────
  // There is deliberately NO time limit — the candidate may take as long as they
  // need to read the offer, NDA, and handbook. Security comes from the exit guard
  // below: leaving or switching away from this tab after the OTP resets everything
  // back to the very start (email OTP + face) so the session can't be handed off.
  const [sessionMsg, setSessionMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/sign/${token}`);
        const json = await res.json();
        if (!res.ok) { setState("invalid"); return; }
        setCompany(json.companyName);
        setCandidateName(json.candidateName);
        setEmail(json.candidateEmail || "");
        setData(json.data);
        setTypedName(json.candidateName || "");
        if (json.alreadySigned) setState("signed");
        else if (json.expired) setState("expired");
        else setState("ready");
      } catch {
        setState("error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Compute a device fingerprint once for the audit trail.
  useEffect(() => { computeDeviceFingerprint().then((fp) => { deviceFpRef.current = fp; }); }, []);

  async function submit() {
    setErr(null);
    if (!agreed) return setErr("Please tick the acknowledgement to continue.");
    if (!typedName.trim()) return setErr("Please type your full legal name.");
    if (!verifyToken) { restartFromOtp("Please verify your identity again before signing."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: sigImage, typed_name: typedName, agreed, verify_token: verifyToken }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Proof missing/expired → send them back through OTP + face.
        if (res.status === 403) { restartFromOtp("Your verification expired — please verify your email and face again to sign."); return; }
        throw new Error(json.error || "Failed to submit");
      }
      setState("signed");
    } catch (e: any) {
      setErr(e.message || "Failed to submit your signature.");
    } finally {
      setSubmitting(false);
    }
  }

  // OTP countdown — ticks while a code is live.
  useEffect(() => {
    if (!otpSent) return;
    const t = setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [otpSent]);

  async function sendOtp() {
    setOtpErr(null);
    setOtpSending(true);
    try {
      const res = await fetch(`/api/sign/${token}/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't send the code.");
      setOtpSent(true);
      setOtp("");
      setSecondsLeft(60);
    } catch (e: any) {
      setOtpErr(e.message || "Couldn't send the code.");
    } finally {
      setOtpSending(false);
    }
  }

  async function verifyOtp() {
    setOtpErr(null);
    setOtpVerifying(true);
    try {
      const res = await fetch(`/api/sign/${token}/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", otp }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Verification failed.");
      setSessionMsg(null);
      // Enter the face step. The camera starts on an explicit tap (see the camLive
      // effect) so the permission prompt reliably appears on every device/browser.
      setCamStarted(false);
      setCamLive(false);
      setStep("face");
    } catch (e: any) {
      setOtpErr(e.message || "Verification failed.");
    } finally {
      setOtpVerifying(false);
    }
  }

  // ── Live face verification ─────────────────────────────────────────────────
  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function loadImageEl(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("load failed"));
      img.src = src;
    });
  }

  // Load the model + the reference (profile) descriptor on entering the face step.
  useEffect(() => {
    if (step !== "face") return;
    let cancelled = false;
    (async () => {
      try {
        setFaceStatus("init");
        setFaceMsg("Loading face verification…");
        await Promise.allSettled([loadFaceModels(), loadFaceLandmarker()]);
        try {
          const img = await loadImageEl(`/api/sign/${token}/profile-photo`);
          const { result } = await detectFromImage(img);
          if (result) refDescRef.current = result.descriptor;
          else if (!cancelled) setRefMissing(true);
        } catch {
          if (!cancelled) setRefMissing(true);
        }
        if (!cancelled) { setFaceStatus("ready"); setFaceMsg(""); }
      } catch {
        if (!cancelled) { setFaceStatus("ready"); setRefMissing(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [step, token]);

  // Camera lifecycle — starts ONLY after the user taps "Enable camera" (camStarted),
  // so the permission prompt reliably appears on every device/browser. Also re-runs
  // on flip or retry.
  useEffect(() => {
    if (step !== "face" || !camStarted) { stopStream(); return; }
    let active = true;
    (async () => {
      setCamError(null);
      setCamLive(false);
      try {
        stopStream();
        if (!navigator.mediaDevices?.getUserMedia) {
          setCamError("This browser doesn't support camera access. Try Chrome, Safari, or Edge.");
          return;
        }
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false });
        } catch (e: any) {
          // Constraint not satisfiable (e.g. no rear camera on a laptop) → any camera.
          if (e?.name === "OverconstrainedError" || e?.name === "ConstraintNotSatisfiedError") {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } else {
            throw e;
          }
        }
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        if (active) setCamLive(true); // video is now live → timer may start

        // Show the flip control only when more than one camera exists (mobiles).
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (active) setHasMultiCam(devices.filter((d) => d.kind === "videoinput").length > 1);
        } catch { /* ignore */ }
      } catch (e: any) {
        if (!active) return;
        const name = e?.name || "";
        if (name === "NotAllowedError" || name === "SecurityError")
          setCamError("Camera permission is blocked. Allow it from the camera icon in your address bar, then tap Retry.");
        else if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError")
          setCamError("Your camera is being used by another app or tab. Close it and tap Retry.");
        else if (name === "NotFoundError" || name === "DevicesNotFoundError")
          setCamError("No camera was found on this device.");
        else
          setCamError("Couldn't start the camera. Tap Retry, or check your browser's camera settings.");
      }
    })();
    return () => { active = false; stopStream(); };
  }, [step, facing, camAttempt, camStarted]);

  // Randomized liveness loop: once the camera is live, run a fresh challenge
  // sequence (blink / turn / smile) via MediaPipe. Capture is gated on completing
  // it — a photo or replayed clip can't satisfy a random live sequence.
  useEffect(() => {
    if (step !== "face" || !camLive) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const seq = makeChallengeSequence();
    challengesRef.current = seq; setChallenges(seq);
    idxRef.current = 0; setChIdx(0);
    progRef.current = newProgress(); setChCount(0);
    doneRef.current = false; setLiveDone(false);

    let lastRun = 0;
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      const now = performance.now();
      if (now - lastRun < 66) return; // ~15fps
      lastRun = now;
      tsRef.current = Math.max(tsRef.current + 1, Math.round(now));
      const s = detectFrame(v, tsRef.current);
      if (s.present && s.faceCount === 1 && s.box) {
        const cx = s.box.x + s.box.width / 2, cy = s.box.y + s.box.height / 2;
        setCentered(cx > 0.34 && cx < 0.66 && cy > 0.24 && cy < 0.74 && s.box.width > 0.24 && s.box.width < 0.85);
      } else setCentered(false);
      if (doneRef.current || !s.present || s.faceCount !== 1) return;
      const ch = challengesRef.current[idxRef.current];
      if (!ch) return;
      const p = stepChallenge(ch, s, progRef.current);
      setChCount(p.count);
      if (p.done) {
        if (idxRef.current + 1 >= challengesRef.current.length) { doneRef.current = true; setLiveDone(true); }
        else { idxRef.current += 1; setChIdx(idxRef.current); progRef.current = newProgress(); setChCount(0); }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  }, [step, camLive]);

  // Exit guard: once past the OTP gate, switching away from or leaving this tab
  // (tab switch, minimize, app switch, screen lock, closing the tab) fully resets
  // the session — the candidate must verify their email AND face again from the
  // very start. This is the ONLY thing that interrupts signing (no time limit).
  useEffect(() => {
    if (step === "gate") return;
    function onHide() {
      if (!document.hidden) return;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setFaceResult(null); setFaceFails(0); setRefMissing(false);
      setVerifyToken(null);
      setOtp(""); setOtpSent(false); setSecondsLeft(0);
      setSigImage(null); setAgreed(false);
      setStep("gate");
      setSessionMsg("You left this page — please verify your email and face again to continue signing.");
    }
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop the camera if the component unmounts mid-flow.
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  async function captureVerify() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setFaceStatus("verifying");
    setFaceResult(null);
    setFaceMsg("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      const { faces, result } = await detectFromImage(canvas);

      if (!result) {
        setFaceResult({ pass: false, similarity: 0, distance: 1, checks: [{ label: "A face is clearly visible", pass: false }] });
        setFaceStatus("ready");
        setFaceFails((n) => n + 1);
        return;
      }

      // Full quality/anti-spoof suite (single, frontal, size, sharp, no
      // mask/glasses/hat, plain background) — same checks as the KYC selfie.
      const q = assessQuality(canvas, result, faces);
      const qChecks = q.checks.map((c) => ({ label: c.label, pass: c.pass }));
      const noSun = (q.checks.find((c) => c.key === "noglasses")?.pass ?? true) && (q.checks.find((c) => c.key === "nomask")?.pass ?? true);
      const hasRef = !(refMissing || !refDescRef.current);
      const verdict = hasRef ? verifyAgainst(refDescRef.current!, result, canvas.width * canvas.height, faces) : null;

      // Weighted risk score (liveness already completed to reach here).
      const risk = scoreRisk({
        faceDetected: true,
        qualityPass: q.pass,
        noSunglassesMask: noSun,
        eyesVisible: q.checks.find((c) => c.key === "eyes")?.pass ?? true,
        livenessPass: doneRef.current,
        identityMatch: hasRef ? !!verdict?.pass : null,
      });

      const checks = hasRef && verdict ? [verdict.checks[0], ...qChecks] : qChecks;
      checks.push({ label: `Security score ${risk.score}/${risk.max}`, pass: risk.pass });
      const pass = risk.pass && q.pass && (!hasRef || !!verdict?.pass);

      setFaceResult({ pass, similarity: verdict?.similarity ?? 0, distance: verdict?.distance ?? 1, checks });
      setFaceStatus("ready");
      if (pass) {
        // Record the evidence server-side and obtain the single-use proof token the
        // sign POST requires. Only advance to signing once we actually hold it.
        try {
          const evidence = {
            livenessPass: doneRef.current,
            qualityPass: q.pass,
            refPresent: hasRef,
            faceMatched: hasRef ? !!verdict?.pass : null,
            similarity: verdict?.similarity ?? null,
            riskScore: risk.score,
            riskMax: risk.max,
            deviceFingerprint: deviceFpRef.current,
            checks,
          };
          // Downscaled live frame for the optional face-match worker (true server-side
          // extraction). Small JPEG (~480px) — processed transiently, never stored.
          const liveImage = (() => {
            try {
              const maxW = 480;
              const scale = Math.min(1, maxW / canvas.width);
              const w = Math.round(canvas.width * scale), h = Math.round(canvas.height * scale);
              const oc = document.createElement("canvas");
              oc.width = w; oc.height = h;
              oc.getContext("2d")!.drawImage(canvas, 0, 0, w, h);
              return oc.toDataURL("image/jpeg", 0.85);
            } catch { return null; }
          })();
          const res = await fetch(`/api/sign/${token}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              evidence,
              // Descriptors for the in-app server-side comparison (not stored in
              // plaintext — reference is AES-encrypted, live is compared then dropped).
              refDescriptor: refDescRef.current ? Array.from(refDescRef.current) : null,
              liveDescriptor: result?.descriptor ? Array.from(result.descriptor) : null,
              // Live image for the worker tier (true server-side extraction), if configured.
              liveImage,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json.token) {
            if (res.status === 403 && json.error === "otp_required") { restartFromOtp("Please verify your email again to continue."); return; }
            throw new Error(json.message || json.error || "Couldn't record your verification.");
          }
          setVerifyToken(json.token);
          setTimeout(() => { stopStream(); setStep("sign"); }, 800);
        } catch (e: any) {
          setFaceResult({ pass: false, similarity: verdict?.similarity ?? 0, distance: verdict?.distance ?? 1, checks: [...checks, { label: "Secure verification recorded", pass: false }] });
          setFaceMsg(e.message || "Couldn't record your verification — please retry.");
          setFaceFails((n) => n + 1);
        }
      } else {
        setFaceFails((n) => n + 1);
      }
    } catch {
      setFaceStatus("ready");
      setFaceMsg("Verification failed — please retry.");
    }
  }

  function restartFromOtp(msg?: string) {
    stopStream();
    setFaceResult(null);
    setFaceFails(0);
    setRefMissing(false);
    setVerifyToken(null);
    setOtp("");
    setOtpSent(false);
    setStep("gate");
    if (msg) setSessionMsg(msg);
  }

  // ── Loading / terminal states ────────────────────────────────────────────
  if (loading) {
    return (
      <Centered>
        <Loader2 className="animate-spin text-primary" size={28} />
        <p className="text-sm text-muted-foreground">Loading your offer…</p>
      </Centered>
    );
  }
  if (state === "invalid" || state === "error") {
    return (
      <Centered>
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10">
          <AlertTriangle className="text-rose-500" size={28} />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Link not valid</h1>
        <p className="text-sm text-muted-foreground max-w-sm text-center">This signing link is invalid or has been revoked. Please contact your hiring coordinator.</p>
      </Centered>
    );
  }
  if (state === "expired") {
    return (
      <Centered>
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
          <AlertTriangle className="text-amber-500" size={28} />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Link expired</h1>
        <p className="text-sm text-muted-foreground max-w-sm text-center">This signing link has expired. Please request a fresh offer from your hiring coordinator.</p>
      </Centered>
    );
  }
  if (state === "signed") {
    return (
      <Centered>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={36} />
        </div>
        <h1 className="text-xl font-bold text-foreground">Thank you, {candidateName?.split(" ")[0] || "and welcome"}!</h1>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          Your internship offer and NDA have been signed successfully. A confirmation has been recorded and the {company} team has been notified. We look forward to having you on board.
        </p>
      </Centered>
    );
  }

  // ── Identity gate: email OTP ───────────────────────────────────────────────
  if (state === "ready" && step === "gate") {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col">
        <header className="bg-card border-b border-border">
          <div className="mx-auto max-w-5xl px-5 py-4 flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              {company.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{company}</p>
              <p className="text-xs text-muted-foreground">Internship Offer &amp; Onboarding</p>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 space-y-5">
              {sessionMsg && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2.5 text-xs text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>{sessionMsg}</span>
                </div>
              )}

              <div className="flex flex-col items-center text-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><ShieldCheck size={22} /></div>
                <h1 className="text-lg font-bold text-foreground">Verify it&apos;s you</h1>
                <p className="text-sm text-muted-foreground">We&apos;ll email a 6-digit code to confirm your identity before you sign.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Your email</Label>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <Mail size={14} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate flex-1">{email}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0"><Lock size={11} /> Locked</span>
                </div>
              </div>

              {!otpSent ? (
                <>
                  <Button onClick={sendOtp} disabled={otpSending || !email} className="w-full">
                    {otpSending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send code
                  </Button>
                  {otpErr && <p className="text-xs text-rose-600 dark:text-rose-400 text-center">{otpErr}</p>}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Enter the 6-digit code</Label>
                      <span className={cn("text-xs font-medium tabular-nums", secondsLeft > 0 ? "text-muted-foreground" : "text-rose-500")}>
                        {secondsLeft > 0 ? `Expires in 0:${String(secondsLeft).padStart(2, "0")}` : "Code expired"}
                      </span>
                    </div>
                    <Input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      placeholder="000000"
                      className="text-center text-lg font-mono tracking-[0.5em]"
                    />
                  </div>
                  {otpErr && <p className="text-xs text-rose-600 dark:text-rose-400">{otpErr}</p>}
                  <Button onClick={verifyOtp} disabled={otpVerifying || otp.length !== 6 || secondsLeft === 0} className="w-full">
                    {otpVerifying ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Verify &amp; continue
                  </Button>
                  <Button variant="ghost" size="sm" onClick={sendOtp} disabled={otpSending || secondsLeft > 0} className="w-full text-xs">
                    {secondsLeft > 0 ? `Resend code in 0:${String(secondsLeft).padStart(2, "0")}` : "Resend code"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // ── Live face verification ─────────────────────────────────────────────────
  if (state === "ready" && step === "face") {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col">
        <header className="bg-card border-b border-border">
          <div className="mx-auto max-w-5xl px-5 py-4 flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              {company.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{company}</p>
              <p className="text-xs text-muted-foreground">Internship Offer &amp; Onboarding</p>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><ScanFace size={22} /></div>
                <h1 className="text-lg font-bold text-foreground">Face verification</h1>
                <p className="text-sm text-muted-foreground">Look into the camera and capture a photo — we&apos;ll match it to your verification selfie on file.</p>
              </div>

              {/* Exit-guard notice — no timer; only leaving/switching the tab resets. */}
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                <ShieldCheck size={13} className="mt-0.5 shrink-0" />
                <span>Take your time — there&apos;s no countdown. Just keep this tab open: if you switch away or leave the page, you&apos;ll need to verify your email and face again.</span>
              </div>

              {!camStarted ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    {refMissing
                      ? "We'll capture a clear, live photo of your face to confirm you're really here before you sign."
                      : "We'll match a live photo of your face to your verification selfie on file."}{" "}
                    Tap below and <strong>allow camera access</strong> when your browser asks.
                  </div>
                  <Button className="w-full" onClick={() => { setCamError(null); setCamStarted(true); }}>
                    <Camera size={15} /> Enable camera
                  </Button>
                </div>
              ) : (
                <>
                  {refMissing && !faceResult && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                      No profile photo is on file — we'll still confirm a clear, single, live face before you continue.
                    </div>
                  )}
                  <div className="relative overflow-hidden rounded-xl border border-border bg-black aspect-[4/3]">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-cover"
                      style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
                    />
                    {/* Liveness oval + challenge prompt */}
                    {faceStatus === "ready" && !faceResult?.pass && (
                      <>
                        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[3px] border-dashed transition-colors"
                          style={{ width: "54%", height: "82%", borderColor: liveDone ? "#22c55e" : centered ? "#f59e0b" : "#f43f5e" }} />
                        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-3">
                          <span className={cn("rounded-full px-2.5 py-0.5 text-center text-[11px] font-medium text-white", liveDone ? "bg-emerald-600/85" : centered ? "bg-amber-600/90" : "bg-rose-600/85")}>
                            {!centered ? "Center your face in the oval"
                              : liveDone ? "Liveness confirmed — tap Capture"
                              : challenges[chIdx]
                                ? (challenges[chIdx].type === "blink" ? `${challenges[chIdx].label} (${chCount}/${challenges[chIdx].target})` : challenges[chIdx].label)
                                : "Follow the prompts…"}
                          </span>
                        </div>
                        {challenges.length > 0 && (
                          <div className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 gap-1.5">
                            {challenges.map((_, i) => (
                              <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i < chIdx || liveDone ? "bg-emerald-400" : i === chIdx ? "bg-amber-400" : "bg-white/40")} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {(faceStatus === "init" || faceStatus === "verifying") && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white">
                        <Loader2 className="animate-spin" size={22} />
                        <span className="text-xs">{faceStatus === "init" ? (faceMsg || "Loading…") : "Verifying…"}</span>
                      </div>
                    )}
                    {hasMultiCam && (
                      <button
                        type="button"
                        onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
                        className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-[11px] text-white hover:bg-black/70"
                        title="Switch camera"
                      >
                        <RefreshCw size={12} /> Flip
                      </button>
                    )}
                  </div>

                  {camError && (
                    <div className="space-y-2">
                      <p className="text-xs text-rose-600 dark:text-rose-400">{camError}</p>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => { setCamError(null); setCamAttempt((n) => n + 1); }}>
                        <RefreshCw size={14} /> Retry camera
                      </Button>
                    </div>
                  )}

                  {faceResult && (
                    <div className={cn("rounded-lg border p-3", faceResult.pass ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5")}>
                      <div className="mb-2 flex items-center justify-between">
                        <p className={cn("text-xs font-semibold", faceResult.pass ? "text-emerald-600" : "text-rose-600")}>
                          {faceResult.pass ? "Identity confirmed" : "Couldn't confirm your identity"}
                        </p>
                        {faceResult.distance < 1 && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">match {Math.round(faceResult.similarity * 100)}%</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {faceResult.checks.map((c) => (
                          <div key={c.label} className="flex items-center gap-1.5 text-[11px]">
                            {c.pass ? <Check size={12} className="text-emerald-500 flex-shrink-0" /> : <X size={12} className="text-rose-500 flex-shrink-0" />}
                            <span className={c.pass ? "text-muted-foreground" : "text-rose-600"}>{c.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {faceResult?.pass ? (
                    <Button className="w-full" disabled><CheckCircle2 size={15} /> Verified — continuing…</Button>
                  ) : (
                    <Button className="w-full" onClick={captureVerify} disabled={faceStatus !== "ready" || !!camError || (!liveDone && !faceResult)}>
                      {faceStatus === "verifying" ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
                      {faceStatus !== "ready" ? "Loading…" : !liveDone && !faceResult ? "Complete the liveness steps…" : faceResult ? "Retry capture" : "Capture & verify"}
                    </Button>
                  )}

                  {faceFails >= 2 && !faceResult?.pass && (
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => restartFromOtp()}>
                      <RotateCcw size={12} /> Start over from email verification
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // ── Ready: review + sign ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header — consistent with the workspace */}
      <header className="bg-card border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            {company.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{company}</p>
            <p className="text-xs text-muted-foreground">Internship Offer &amp; Onboarding</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-5">
        {/* Welcome */}
        <Card>
          <CardContent className="p-5">
            <h1 className="text-xl font-bold text-foreground">Welcome, {candidateName}!</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Please review your <strong className="text-foreground font-semibold">Offer Letter</strong>,{" "}
              <strong className="text-foreground font-semibold">NDA</strong>, and{" "}
              <strong className="text-foreground font-semibold">Handbook</strong> below, then sign at the bottom to accept your internship offer.
            </p>
          </CardContent>
        </Card>

        {/* Document viewer */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileSignature size={15} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Your Documents</h2>
            </div>
            {data && <DocumentPreview data={data} className="h-[62vh]" />}
          </CardContent>
        </Card>

        {/* Signature */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <PenTool size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Your Signature</h2>
            </div>

            <SignaturePad onChange={setSigImage} onBorderViolation={setSigEdge} />

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Full legal name</Label>
              <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Type your full name" />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
              <span className="text-xs text-muted-foreground leading-relaxed">
                I have read, understood, and agree to the terms of the Internship Offer Letter, the Non-Disclosure Agreement, and the Internship Handbook. I understand this electronic signature is legally binding.
              </span>
            </label>

            {err && <p className="text-xs text-rose-600 dark:text-rose-400">{err}</p>}

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck size={13} /> Secured · your IP &amp; timestamp are recorded for verification
              </p>
              <Button onClick={submit} disabled={submitting || sigEdge} className="sm:min-w-[180px]" title={sigEdge ? "Fix the signature first — it is touching the edge" : undefined}>
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Accept &amp; Sign Offer
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground pb-6">
          © {company}. This signing link is unique to you — please do not share it.
        </p>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-muted/30 px-4">
      {children}
    </div>
  );
}
