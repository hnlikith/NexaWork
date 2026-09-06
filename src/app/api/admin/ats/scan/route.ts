/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { callAI, parseAIJSON } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { resumeText, jobDescription } = await req.json();

    if (!resumeText || !jobDescription) {
      return NextResponse.json({ error: "Missing resume or job description" }, { status: 400 });
    }

    const prompt = `
Perform an ATS analysis.

Job Description:
${jobDescription}

Resume:
${resumeText}

Return ONLY a JSON object:
{
  "score": <number 0-100>,
  "match": <string[] of matching keywords/skills>,
  "missing": <string[] of missing critical keywords/skills>,
  "tips": <string[] of at least 3 actionable tips to improve the resume>
}
`;

    const raw = await callAI(prompt, true);
    const result = parseAIJSON<{ score: number; match: string[]; missing: string[]; tips: string[] }>(raw);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("ATS Scan error:", error.message);
    return NextResponse.json({ error: "AI scan failed", details: error.message, score: 0, match: [], missing: [], tips: [] }, { status: 500 });
  }
}
