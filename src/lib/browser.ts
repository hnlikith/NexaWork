/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// Shared headless-browser launcher for server-side PDF generation.
//
// The problem this solves: bundled `puppeteer` expects a full Chrome install on
// disk. That works locally, but on Vercel's serverless sandbox there is no Chrome
// (the runtime failed with "Could not find Chrome ... /home/sbx_userXXXX/.cache/puppeteer").
//
// Fix: in serverless/production use `@sparticuz/chromium` (a Lambda-sized Chromium
// binary) driven by `puppeteer-core`; locally keep the full `puppeteer` with its
// bundled Chrome so dev needs no extra setup. Dynamic imports keep each path from
// pulling in the other's heavy dependency.
import type { Browser } from "puppeteer-core";

// Serverless when running on Vercel/Lambda. NODE_ENV alone isn't enough (a prod
// build could still run on a machine with Chrome), so key off the platform envs.
function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.FUNCTION_TARGET,
  );
}

/** Launch a headless browser that works both locally and on Vercel serverless. */
export async function launchBrowser(): Promise<Browser> {
  if (isServerless()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return (await puppeteer.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: await chromium.executablePath(),
      headless: true,
    })) as unknown as Browser;
  }

  // Local dev / any host that has the full puppeteer Chrome download.
  const puppeteer = await import("puppeteer");
  return (await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })) as unknown as Browser;
}
