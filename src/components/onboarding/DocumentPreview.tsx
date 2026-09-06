"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { TemplateData } from "@/lib/onboarding/types";
import { DocStyle } from "@/components/onboarding/templates/docStyles";
import { OfferLetterTemplate } from "@/components/onboarding/templates/OfferLetterTemplate";
import { NdaTemplate } from "@/components/onboarding/templates/NdaTemplate";
import { HandbookTemplate } from "@/components/onboarding/templates/HandbookTemplate";

const A4_PX = 794; // 210mm @ 96dpi

export type DocKind = "offer" | "nda" | "handbook";

const TABS: { key: DocKind; label: string }[] = [
  { key: "offer", label: "Offer Letter" },
  { key: "nda", label: "NDA" },
  { key: "handbook", label: "Handbook" },
];

export function DocumentPreview({ data, className }: { data: TemplateData; className?: string }) {
  const [tab, setTab] = useState<DocKind>("offer");
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [innerH, setInnerH] = useState(0);

  useLayoutEffect(() => {
    const recompute = () => {
      const cw = containerRef.current?.clientWidth ?? A4_PX;
      const s = Math.min(1, (cw - 4) / A4_PX);
      setScale(s);
      if (innerRef.current) setInnerH(innerRef.current.scrollHeight);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    if (containerRef.current) ro.observe(containerRef.current);
    // Observe the inner doc too — pagination changes its height after layout settles.
    if (innerRef.current) ro.observe(innerRef.current);
    // re-measure a few times while pagination/fonts settle
    const timers = [60, 200, 500].map((d) => setTimeout(recompute, d));
    return () => { ro.disconnect(); timers.forEach(clearTimeout); };
  }, [data, tab]);

  // Memoize the heavy document render so it only recomputes when the (debounced)
  // data or the active tab changes — not on every parent re-render while typing.
  const doc = useMemo(() => {
    if (tab === "offer") return <OfferLetterTemplate data={data} withStyle={false} />;
    if (tab === "nda") return <NdaTemplate data={data} withStyle={false} />;
    return <HandbookTemplate data={data} withStyle={false} />;
  }, [data, tab]);

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-1.5 mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto rounded-xl border border-border bg-muted/40 p-3">
        <DocStyle />
        <div style={{ height: innerH * scale, position: "relative" }}>
          <div
            ref={innerRef}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: A4_PX,
              position: "absolute",
              top: 0,
              left: "50%",
              marginLeft: -(A4_PX * scale) / 2,
              boxShadow: "0 2px 18px rgba(0,0,0,0.12)",
            }}
          >
            {doc}
          </div>
        </div>
      </div>
    </div>
  );
}
