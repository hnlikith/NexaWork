/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import React from "react";
import { renderToHtml } from "@/lib/onboarding/renderHtml";
import { launchBrowser } from "@/lib/browser";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DOC_CSS } from "@/components/onboarding/templates/docStyles";
import { HEADER_MM, FOOTER_MM, SIDE_MM } from "@/components/onboarding/templates/brand";
import { buildOfferLetterBlocks, buildNdaBlocks, buildHandbookBlocks } from "@/components/onboarding/templates/blocks";
import type { TemplateData } from "@/lib/onboarding/types";

export type DocKind = "offer" | "nda" | "handbook";

// Pure builders → flat block arrays (no client components, no react-dom/server).
const TEMPLATE_BLOCKS: Record<DocKind, (d: TemplateData) => React.ReactNode[]> = {
  offer: buildOfferLetterBlocks,
  nda: buildNdaBlocks,
  handbook: buildHandbookBlocks,
};

const CONTENT_MM = 210 - 2 * SIDE_MM;
const SIG_STRIP_MM = 6; // per-page candidate signature strip (matches PaginatedDoc.tsx)

/**
 * Render a document to a self-contained HTML string for Puppeteer. The blocks go
 * into a hidden measuring container; a page.evaluate step then splits them into
 * A4 pages (each with the letterhead) — identical to the on-screen preview.
 */
export function renderDocHtml(kind: DocKind, data: TemplateData): string {
  const blocksHtml = renderToHtml(TEMPLATE_BLOCKS[kind](data));
  const pagedCss = `
@page { size: A4; margin: 0; }
html,body { margin:0; padding:0; background:#fff; }
#od-src { position: relative; width: ${CONTENT_MM}mm; margin: 0 auto; }
#od-pages .od-page { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
#od-pages .od-page:last-child { break-after: auto; page-break-after: auto; }
`;
  return `<!doctype html><html><head><meta charset="utf-8" />
<style>${DOC_CSS}${pagedCss}</style>
</head><body>
<div id="od-src">${blocksHtml}</div>
<div id="od-pages"></div>
</body></html>`;
}

// Footer contact links (A4 = 595.28 × 841.89 pt; origin bottom-left). The footer
// strip sits in the bottom margin; the contact row is ~100pt up from the bottom.
// Left empty — the previous entries were the old company's real phone/email/
// website. There's no equivalent NexaWork contact configured anywhere in the
// app to source real values from, and stamping clickable links to contact
// info nobody here owns would be worse than no links at all. Populate this
// once real NexaWork contact details are configured.
const FOOTER_LINKS: { uri: string; x0: number; x1: number }[] = [];
const LINK_Y0 = 86;
const LINK_Y1 = 120;

/** Stamp clickable URI link annotations over the footer contact row on every page. */
async function addFooterLinks(bytes: Uint8Array): Promise<Buffer> {
  const doc = await PDFDocument.load(bytes);
  const ctx = doc.context;
  for (const page of doc.getPages()) {
    const refs = FOOTER_LINKS.map((l) => {
      const annot = ctx.obj({
        Type: PDFName.of("Annot"),
        Subtype: PDFName.of("Link"),
        Rect: [l.x0, LINK_Y0, l.x1, LINK_Y1],
        Border: [0, 0, 0],
        A: ctx.obj({ Type: PDFName.of("Action"), S: PDFName.of("URI"), URI: PDFString.of(l.uri) }),
      });
      return ctx.register(annot);
    });
    let annots = page.node.Annots();
    if (!annots) {
      annots = ctx.obj([]);
      page.node.set(PDFName.of("Annots"), annots);
    }
    refs.forEach((r) => annots!.push(r));
  }
  return Buffer.from(await doc.save());
}

/**
 * Render one HTML doc → A4 PDF buffer using an ALREADY-OPEN browser. Launching a
 * headless browser is the expensive step (a serverless Chromium cold-start is
 * ~1–3s), so callers that produce several PDFs should launch once and reuse it
 * via this function rather than calling htmlToPdf() per document.
 */
async function renderHtmlToPdfBuffer(
  browser: Awaited<ReturnType<typeof launchBrowser>>,
  html: string,
  sigData?: { image?: string | null; name: string }
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Paginate exactly like the on-screen preview: measure each block and split
    // into A4 pages, each wrapped with the letterhead header + per-page candidate
    // signature strip + letterhead footer.
    await page.evaluate(
      (headerMM: number, footerMM: number, sigStripMM: number, sig: { image?: string | null; name: string } | null) => {
        const PX = 96 / 25.4;
        const usable = (297 - headerMM - sigStripMM - footerMM - 10) * PX;
        const src = document.getElementById("od-src");
        const out = document.getElementById("od-pages");
        if (!src || !out) return;
        const blocks = Array.from(src.children) as HTMLElement[];

        const groups: number[][] = [];
        let cur: number[] = [];
        let pageTop = blocks.length ? blocks[0].offsetTop : 0;
        for (let i = 0; i < blocks.length; i++) {
          const c = blocks[i];
          const forceBreak = c.classList.contains("od-break-before");
          const bottom = c.offsetTop + c.offsetHeight;
          if (cur.length && (forceBreak || bottom - pageTop > usable)) {
            groups.push(cur);
            cur = [];
            pageTop = c.offsetTop;
          }
          cur.push(i);
        }
        if (cur.length) groups.push(cur);

        for (let gi = 0; gi < groups.length; gi++) {
          const idxs = groups[gi];
          const pg = document.createElement("div");
          pg.className = "od-page";

          const head = document.createElement("div");
          head.className = "od-lh-head";

          const body = document.createElement("div");
          body.className = "od-page-body";
          for (const i of idxs) body.appendChild(blocks[i]);

          // Per-page candidate signature strip
          const sigStrip = document.createElement("div");
          sigStrip.className = "od-pagesig";
          const imgTag = sig?.image ? `<img src="${sig.image}" alt="sig" />` : "";
          const name = sig?.name || "";
          sigStrip.innerHTML =
            `<span class="od-pagesig-lbl">Candidate:</span>` +
            `<span class="od-pagesig-sig">${imgTag}</span>` +
            `<span class="od-pagesig-name">${name}</span>` +
            `<span class="od-pagesig-pg">Page ${gi + 1} of ${groups.length}</span>`;

          const foot = document.createElement("div");
          foot.className = "od-lh-foot";

          pg.appendChild(head);
          pg.appendChild(body);
          pg.appendChild(sigStrip);
          pg.appendChild(foot);
          out.appendChild(pg);
        }
        src.remove();
      },
      HEADER_MM,
      FOOTER_MM,
      SIG_STRIP_MM,
      sigData ?? null
    );

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return await addFooterLinks(pdf);
  } finally {
    await page.close();
  }
}

/** Render HTML → A4 PDF buffer, launching (and closing) a dedicated browser. Use for one-off single-doc renders. */
export async function htmlToPdf(html: string, sigData?: { image?: string | null; name: string }): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    return await renderHtmlToPdfBuffer(browser, html, sigData);
  } finally {
    await browser.close();
  }
}

const BUCKET = "onboarding";

/**
 * Generate the three onboarding PDFs and upload them to Storage.
 * Returns the storage paths (not signed URLs).
 */
export async function generateAndStorePdfs(
  packetId: string,
  data: TemplateData,
  which: DocKind[] = ["offer", "nda", "handbook"]
): Promise<Partial<Record<DocKind, string>>> {
  const supabase = getSupabaseAdmin();
  const stamp = data.signature?.signed_at ? "signed" : "offer";
  const paths: Partial<Record<DocKind, string>> = {};
  const sigData = { image: data.signature?.image_base64 ?? null, name: data.candidate.name };

  // Launch the headless browser ONCE and render all docs on it — a browser
  // launch (serverless Chromium cold-start) dwarfs the per-doc render cost, so
  // this cuts the previous "3 launches" down to a single one. Pages render
  // sequentially to keep serverless memory bounded.
  const browser = await launchBrowser();
  const rendered: { kind: DocKind; path: string; buffer: Buffer }[] = [];
  try {
    for (const kind of which) {
      const html = renderDocHtml(kind, data);
      const buffer = await renderHtmlToPdfBuffer(browser, html, sigData);
      rendered.push({ kind, path: `${packetId}/${kind}-${stamp}.pdf`, buffer });
    }
  } finally {
    await browser.close();
  }

  // Upload all PDFs to Storage in parallel — independent network writes.
  await Promise.all(
    rendered.map(async ({ kind, path, buffer }) => {
      const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (error) throw new Error(`Failed to store ${kind} PDF: ${error.message}`);
      paths[kind] = path;
    })
  );
  return paths;
}

/** A short-lived signed URL for downloading a stored onboarding PDF. */
export async function signedPdfUrl(path: string, seconds = 600): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/** Read a stored onboarding PDF back as a Buffer (for email attachments). */
export async function downloadPdf(path: string): Promise<Buffer> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Failed to read PDF: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
