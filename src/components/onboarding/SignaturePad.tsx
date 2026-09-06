"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import React, { useRef, useEffect, useState, useCallback } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

// CSS pixels from each edge that count as "too close"
const WARN_MARGIN = 16;

const BLINK_CSS = `
  @keyframes sigPadBlink {
    0%, 100% { border-color: rgb(239 68 68); }
    50%       { border-color: rgb(239 68 68 / 0.25); }
  }
  .sig-pad-blink { animation: sigPadBlink 0.72s ease-in-out infinite; }
`;

type BorderState = "empty" | "ok" | "edge";

export function SignaturePad({
  onChange,
  onBorderViolation,
  height = 160,
}: {
  onChange: (dataUrl: string | null) => void;
  onBorderViolation?: (touching: boolean) => void;
  height?: number;
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const drawing    = useRef(false);
  const last       = useRef<{ x: number; y: number } | null>(null);
  const hasInkRef  = useRef(false);

  const [hasInk,      setHasInk]      = useState(false);
  const [borderState, setBorderState] = useState<BorderState>("empty");

  const ratio = () => Math.max(window.devicePixelRatio || 1, 1);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r    = ratio();
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * r;
    canvas.height = height      * r;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(r, r);
    ctx.lineWidth   = 2.2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "#0f172a";
  }, [height]);

  useEffect(() => {
    setup();
    window.addEventListener("resize", setup);
    return () => window.removeEventListener("resize", setup);
  }, [setup]);

  // Scan four border strips for any ink pixels.
  function hasInkNearEdge(): boolean {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const W = canvas.width, H = canvas.height;
    const m = Math.round(WARN_MARGIN * ratio());
    const strips = [
      ctx.getImageData(0,     0,     W,   m),   // top
      ctx.getImageData(0,     H - m, W,   m),   // bottom
      ctx.getImageData(0,     0,     m,   H),   // left
      ctx.getImageData(W - m, 0,     m,   H),   // right
    ];
    return strips.some(d => {
      for (let i = 3; i < d.data.length; i += 4) {
        if (d.data[i] > 20) return true;
      }
      return false;
    });
  }

  const getPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    drawing.current = true;
    last.current = getPos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInkRef.current) {
      hasInkRef.current = true;
      setHasInk(true);
    }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) return;

    const touching = hasInkNearEdge();
    const next: BorderState = touching ? "edge" : "ok";
    setBorderState(next);
    onBorderViolation?.(touching);
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    setHasInk(false);
    setBorderState("empty");
    onBorderViolation?.(false);
    onChange(null);
  };

  return (
    <>
      <style>{BLINK_CSS}</style>
      <div>
        <div
          className={cn(
            "relative rounded-xl border-2 bg-muted/40 overflow-hidden",
            borderState === "empty" && "border-dashed border-border",
            borderState === "ok"    && "border-dashed border-emerald-500",
            borderState === "edge"  && "border-dashed border-rose-500 sig-pad-blink",
          )}
        >
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height, touchAction: "none", cursor: "crosshair", display: "block" }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />

          {/* Empty placeholder */}
          {!hasInk && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground select-none">
              Draw your signature here
            </span>
          )}

          {/* Edge warning badge */}
          {borderState === "edge" && (
            <div className="pointer-events-none absolute bottom-2 inset-x-0 flex justify-center">
              <span className="rounded-md bg-rose-500 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-md">
                Signature too close to edge — clear and redraw
              </span>
            </div>
          )}

          {/* All-good badge */}
          {borderState === "ok" && (
            <div className="pointer-events-none absolute bottom-2 right-2.5">
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                ✓ looks good
              </span>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {borderState === "edge"
              ? "Keep your signature away from all four edges"
              : borderState === "ok"
              ? "Great — your signature fits perfectly"
              : "Sign within the box"}
          </p>
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Eraser size={13} /> Clear
          </button>
        </div>
      </div>
    </>
  );
}
