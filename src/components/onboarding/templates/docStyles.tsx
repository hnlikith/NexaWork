/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import React from "react";
import type { DocBlock } from "./docModel";
import { HEADER_MM, FOOTER_MM, SIDE_MM, LETTERHEAD_HEADER, LETTERHEAD_FOOTER } from "./brand";

// ════════════════════════════════════════════════════════════════════════════
// Self-contained document styling — identical in browser preview, candidate
// sign page, and Puppeteer PDF. Reproduces the source .docx: Bahnschrift font,
// black bold headings (SECTION/CHAPTER centered), and the letterhead
// (header logo + branded footer) from the Word header image (A4 @ 300dpi).
// NOTE: the letterhead image asset itself still shows the old company's
// branding — see brand.ts.
// All rules scoped under `.od-doc` and prefixed `od-` to avoid clashing with the app.
// ════════════════════════════════════════════════════════════════════════════

export const DOC_CSS = `
@page { size: A4; margin: 0; }
.od-doc {
  box-sizing: border-box;
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  background: #ffffff;
  color: #1a1a1a;
  font-family: 'Bahnschrift','Bahnschrift Light SemiCondensed','DIN Next','Segoe UI',system-ui,sans-serif;
  font-size: 11pt;
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.od-doc * { box-sizing: border-box; }
/* Paged (PDF) mode: content fills Puppeteer's content box; letterhead added per-page by Puppeteer. */
.od-doc-paged { width: auto; min-height: 0; margin: 0; }

/* Inline letterhead for on-screen preview / sign page (header at top, footer at bottom) */
.od-lh-head { width: 100%; height: ${HEADER_MM}mm; background: url('${LETTERHEAD_HEADER}') center top / 100% 100% no-repeat; flex: 0 0 auto; }
.od-lh-foot { position: relative; width: 100%; height: ${FOOTER_MM}mm; background: url('${LETTERHEAD_FOOTER}') center bottom / 100% 100% no-repeat; flex: 0 0 auto; }
.od-foot-link { position: absolute; top: 21%; height: 15%; display: block; }
.od-body { padding: 4mm ${SIDE_MM}mm 4mm; }

/* Paginated preview — discrete A4 pages, each with the letterhead header + footer. */
.od-paged-root {
  width: 210mm; margin: 0 auto;
  color: #1a1a1a;
  font-family: 'Bahnschrift','Bahnschrift Light SemiCondensed','DIN Next','Segoe UI',system-ui,sans-serif;
  font-size: 11pt; line-height: 1.45;
}
.od-page {
  box-sizing: border-box; width: 210mm; height: 297mm; background: #fff;
  margin: 0 auto 14px; box-shadow: 0 2px 18px rgba(0,0,0,.12);
  position: relative; overflow: hidden; display: flex; flex-direction: column;
}
.od-page-body { flex: 1 1 auto; padding: 5mm ${SIDE_MM}mm; overflow: hidden; }
.od-measure { position: absolute; left: -100000px; top: 0; width: ${210 - 2 * SIDE_MM}mm; visibility: hidden; }

.od-title { text-align: center; font-size: 13.5pt; font-weight: 700; letter-spacing: .03em; color: #1a1a1a; margin: 2pt 0 10pt; }
.od-subtitle { text-align: center; font-size: 10pt; color: #595959; margin: 0 0 14pt; }
.od-section { text-align: center; font-size: 12pt; font-weight: 700; color: #1a1a1a; margin: 18pt 0 9pt; page-break-after: avoid; }
.od-snum { font-size: 11pt; font-weight: 700; color: #1a1a1a; margin: 12pt 0 3pt; page-break-after: avoid; }
.od-sub  { font-size: 11pt; font-weight: 700; color: #1a1a1a; margin: 9pt 0 3pt; page-break-after: avoid; }
.od-p    { margin: 0 0 6pt; text-align: justify; }
.od-ul   { margin: 0 0 7pt; padding-left: 18pt; }
.od-ul li { margin: 1.5pt 0; }
.od-cat  { font-weight: 700; color: #1a1a1a; margin: 4pt 0 4pt; font-size: 11pt; }
/* Clear line break after each Section-1 question + its checklist. */
.od-category { margin: 0 0 11pt; }
.od-category:first-of-type { margin-top: 0; }
/* Manual page break — start this section on a new page (PDF honors break-before). */
.od-break-before { break-before: page; page-break-before: always; }
.od-field { margin: 2pt 0; }
.od-field .od-lbl { color: #333; }
.od-field .od-val { font-weight: 600; color: #1a1a1a; border-bottom: 1px solid #555; padding: 0 4pt; }
.od-check { display: flex; gap: 7pt; align-items: baseline; margin: 3pt 0; }
.od-box { font-family: 'Segoe UI Symbol','Arial Unicode MS',sans-serif; font-size: 11pt; line-height: 1; color: #1a1a1a; }
.od-note { margin: 2pt 0 4pt 18pt; font-size: 10pt; color: #333; text-align: justify; white-space: pre-wrap; }
.od-muted { color: #777; }
.od-spacer { height: 8pt; }
.od-sigwrap { margin-top: 24pt; display: flex; justify-content: space-between; align-items: flex-start; gap: 40pt; page-break-inside: avoid; }
.od-sigcol { flex: 1; }
.od-sigcaps { font-weight: 700; font-size: 10.5pt; color: #1a1a1a; margin-bottom: 4pt; }
.od-sigline { border-bottom: 1px solid #333; height: 34pt; margin-bottom: 3pt; display: flex; align-items: flex-end; }
.od-sigline img { max-height: 40pt; max-width: 180pt; }
.od-sigmeta { font-size: 9.5pt; color: #333; }
.od-sigmeta b { color: #111; }
.od-ack { margin-top: 14pt; padding-top: 10pt; border-top: 1px dashed #bbb; }
.od-callout { font-size: 10pt; color: #444; background: #f4f4f5; border-left: 3px solid #bbb; padding: 6pt 8pt; margin: 8pt 0; text-align: justify; }

/* ── Per-page candidate signature strip (sits between page body and letterhead footer) ── */
.od-pagesig {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 7pt;
  padding: 2.5pt 8.5mm;
  border-top: 0.75px solid #d8d8d8;
  font-size: 8pt; color: #666;
  font-family: 'Bahnschrift','DIN Next','Segoe UI',system-ui,sans-serif;
}
.od-pagesig-lbl { white-space: nowrap; color: #888; flex-shrink: 0; }
.od-pagesig-sig {
  display: inline-flex; align-items: flex-end;
  width: 96pt; height: 18pt;
  border-bottom: 0.75px solid #555; flex-shrink: 0;
}
.od-pagesig-sig img { max-height: 17pt; max-width: 94pt; }
.od-pagesig-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.od-pagesig-pg { white-space: nowrap; color: #bbb; margin-left: auto; flex-shrink: 0; }
`;

/** Inject the document stylesheet once into the preview/sign-page DOM. */
export function DocStyle() {
  return <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />;
}

/**
 * Document shell. In preview mode renders the letterhead inline (header
 * at top, footer at bottom). In paged (PDF) mode renders only the content — the
 * letterhead is added on every page by Puppeteer's header/footer templates.
 */
/** Full letterhead header (swirl + centered logo + rule) — used on every page. */
export function LetterheadHeader() {
  return <div className="od-lh-head" />;
}
export function LetterheadFooter() {
  // Contact links intentionally omitted — the previous phone/email/website
  // belonged to the old company, and there's no equivalent NexaWork contact
  // info configured anywhere to source real values from. Restore once real
  // contact details are available, matching the same call in pdf.tsx.
  return <div className="od-lh-foot" />;
}

export function DocShell({ children, paged }: { children: React.ReactNode; paged?: boolean }) {
  if (paged) return <div className="od-doc od-doc-paged">{children}</div>;
  return (
    <div className="od-doc">
      <LetterheadHeader />
      <div className="od-body">{children}</div>
      <LetterheadFooter />
    </div>
  );
}

const KIND_CLASS: Record<DocBlock["k"], string> = {
  t: "od-section",
  s: "od-snum",
  h: "od-sub",
  b: "od-p",
  li: "od-ul-item",
};

/**
 * Render DocBlocks to a flat array of nodes (consecutive list items grouped into <ul>).
 * opts.breakSections → each section/chapter title ("t") starts on a new page,
 * mirroring the source documents. opts.skipFirstSectionBreak keeps the first one
 * inline (e.g. Handbook CHAPTER 1 shares page 1 with the title).
 */
export function renderBlocks(
  blocks: DocBlock[],
  keyPrefix = "b",
  opts: { breakSections?: boolean; skipFirstSectionBreak?: boolean } = {}
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let liBuffer: string[] = [];
  let ulN = 0;
  let sectionN = 0;
  const flush = () => {
    if (liBuffer.length) {
      out.push(
        <ul className="od-ul" key={`${keyPrefix}-ul-${ulN++}`}>
          {liBuffer.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      );
      liBuffer = [];
    }
  };
  blocks.forEach((b, i) => {
    if (b.k === "li") { liBuffer.push(b.t); return; }
    flush();
    const key = `${keyPrefix}-${i}`;
    if (b.k === "t") {
      sectionN++;
      const brk = opts.breakSections && !(opts.skipFirstSectionBreak && sectionN === 1);
      out.push(<h2 className={brk ? "od-section od-break-before" : "od-section"} key={key}>{b.t}</h2>);
    } else if (b.k === "s") out.push(<h3 className="od-snum" key={key}>{b.t}</h3>);
    else if (b.k === "h") out.push(<h4 className="od-sub" key={key}>{b.t}</h4>);
    else out.push(<p className="od-p" key={key}>{b.t}</p>);
  });
  flush();
  return out;
}

/** Render an array of DocBlocks, grouping consecutive list items into <ul>. */
export function Blocks({ blocks }: { blocks: DocBlock[] }) {
  return <>{renderBlocks(blocks)}</>;
}
