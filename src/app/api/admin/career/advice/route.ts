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
    const { currentRole, targetRole, skills } = await req.json();

    if (!currentRole || !targetRole) {
      return NextResponse.json({ error: "Missing currentRole or targetRole" }, { status: 400 });
    }

    const prompt = `
You are an expert career advisor.

A professional wants to transition from "${currentRole}" to "${targetRole}".
Their current skills: ${skills || "not specified"}.

Return ONLY a JSON object:
{
  "roadmap": [
    { "step": "Phase 1: <title>", "action": "<detailed action>", "skills": "<skill or resource>" },
    { "step": "Phase 2: <title>", "action": "<detailed action>", "skills": "<skill or resource>" },
    { "step": "Phase 3: <title>", "action": "<detailed action>", "skills": "<skill or resource>" }
  ],
  "mentorTip": "<one high-level strategic tip>"
}
`;

    const raw = await callAI(prompt, true);
    const result = parseAIJSON<{ roadmap: any[]; mentorTip: string }>(raw);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Career advice error:", error.message);
    return NextResponse.json({
      roadmap: [{ step: "Error", action: "Could not generate roadmap. Please try again.", skills: "" }],
      mentorTip: error.message || "AI unavailable",
    }, { status: 500 });
  }
}
