/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { launchBrowser } from "@/lib/browser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let browser: any = null;
  try {
    const { htmlContent, invoiceNumber } = await req.json();

    if (!htmlContent) {
      return NextResponse.json({ error: "HTML content is required" }, { status: 400 });
    }

    console.log("[PDF Generator] Starting PDF generation for", invoiceNumber);
    const startTime = performance.now();

    // Launch browser (serverless-safe)
    browser = await launchBrowser();

    const page = await browser.newPage();

    // Set viewport to A4 size
    await page.setViewport({ width: 794, height: 1123 });

    // Set content
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: 0,
      printBackground: true,
      preferCSSPageSize: true,
      scale: 1,
    });

    await page.close();

    // Convert to base64 - Puppeteer returns a Buffer, convert it properly
    const pdfBase64 = Buffer.isBuffer(pdfBuffer)
      ? pdfBuffer.toString("base64")
      : Buffer.from(pdfBuffer).toString("base64");

    const generationTime = performance.now() - startTime;
    console.log(`[PDF Generator] ✓ PDF generated in ${(generationTime / 1000).toFixed(2)}s, size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    return NextResponse.json({
      success: true,
      pdfBase64,
      fileSize: pdfBuffer.length,
      fileName: `${invoiceNumber}.pdf`,
    });
  } catch (error: any) {
    console.error("[PDF Generator] Error:", error.message);
    return NextResponse.json(
      { error: `PDF generation failed: ${error.message}` },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
