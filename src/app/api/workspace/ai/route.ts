/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { callGemma } from "@/lib/zoho-mail";

const WORKSPACE_SYSTEM = `You are an expert document writer and editor. You produce beautifully formatted HTML documents.

STRICT OUTPUT RULES:
1. ALWAYS respond with clean, well-structured HTML — headings, paragraphs, lists, bold, italic, etc.
2. Use semantic HTML: <h1> for main title, <h2> for sections, <h3> for sub-sections, <p> for paragraphs, <ul>/<ol>/<li> for lists, <strong> for bold key terms, <em> for emphasis/italic.
3. Add inline styles for readability: line-height:1.8 on paragraphs, margin-bottom on headings, proper spacing.
4. NEVER return JSON. NEVER return markdown fences. NEVER return plain text without HTML tags.
5. NEVER wrap output in \`\`\`html or \`\`\` fences.
6. Output ONLY the HTML content — no explanation, no preamble, no "Here is the document:" prefix.`;

function cleanWorkspaceResult(raw: string): string {
  let s = raw.trim();

  // Strip markdown code fences if model ignored the rule
  if (s.startsWith("```html")) s = s.replace(/^```html\s*/i, "").replace(/```\s*$/i, "").trim();
  else if (s.startsWith("```"))  s = s.replace(/^```\s*/,     "").replace(/```\s*$/,   "").trim();

  // If the model returned JSON (object or array), extract the richest string field
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      // Pick the longest string value — that's almost always the real content
      const best = Object.values(obj as Record<string, unknown>)
        .filter((v): v is string => typeof v === "string")
        .sort((a, b) => b.length - a.length)[0] ?? "";
      // Convert escaped newlines to actual newlines for further processing
      s = best.replace(/\\n/g, "\n");
    } catch {}
  }

  // If still no HTML tags, convert plain text → HTML paragraphs
  if (!/<[a-z]/i.test(s)) {
    const lines = s.split("\n").filter(Boolean);
    s = lines.map((line) => {
      const t = line.trim();
      if (/^#{1,3}\s/.test(t)) {
        const level = (t.match(/^(#{1,3})/)?.[1].length ?? 1);
        return `<h${level} style="font-weight:700;margin:18px 0 8px">${t.replace(/^#{1,3}\s/, "")}</h${level}>`;
      }
      if (/^[-*•]\s/.test(t)) return `<li style="margin-bottom:6px">${t.replace(/^[-*•]\s/, "")}</li>`;
      return `<p style="margin-bottom:12px;line-height:1.8">${t}</p>`;
    }).join("\n");
    // Wrap orphan <li> items
    s = s.replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul style="margin:8px 0 12px 20px;list-style:disc">${m}</ul>`);
  }

  return s;
}

export async function POST(req: Request) {
  try {
    const { action, content, customPrompt, context } = await req.json();

    let prompt = "";

    switch (action) {
      case "summarize":
        prompt = `Summarize the following document content. Use <h2> for the title "Summary", then <p> tags for the summary paragraphs with key bullet points in a <ul>:\n\n${content}`;
        break;
      case "improve":
        prompt = `Improve the grammar, flow, and professional tone of the following text. Return the full improved document as formatted HTML with <h1>/<h2>/<h3> headings, <p> paragraphs, <strong> for key terms, <em> for emphasis:\n\n${content}`;
        break;
      case "rewrite":
        prompt = `Rewrite the following text in a fresh, engaging way. Return as full formatted HTML with proper headings, paragraphs, bold and italic text:\n\n${content}`;
        break;
      case "brainstorm":
        prompt = `Based on the following content, brainstorm 5 creative next steps or ideas. Use <h2>Brainstorm Ideas</h2>, then an <ol> list with <li> for each idea and a short <p> explanation:\n\n${content}`;
        break;
      case "shorten":
        prompt = `Make the following text significantly shorter and more concise while keeping all key points. Return as formatted HTML:\n\n${content}`;
        break;
      case "expand":
        prompt = `Expand and elaborate on the following text with more detail, examples, and supporting points. Return as beautifully formatted HTML with clear headings and sections:\n\n${content}`;
        break;
      case "formal":
        prompt = `Rewrite the following in a formal, professional tone. Return as formatted HTML:\n\n${content}`;
        break;
      case "casual":
        prompt = `Rewrite the following in a casual, friendly tone. Return as formatted HTML:\n\n${content}`;
        break;
      case "plagiarism":
        prompt = `Analyze the following text for originality. Use <h2>Originality Analysis</h2> and then sections with <h3> sub-headings for findings and suggestions:\n\n${content}`;
        break;
      case "formula_explain":
        prompt = `Explain what this spreadsheet formula does in simple English. Return as formatted HTML with a heading and bullet points breaking down each part:\n\n${content}`;
        break;
      case "formula_suggest":
        prompt = `I have this spreadsheet data:\n${context || ""}\n\nSuggest the best formula for: ${content}\n\nReturn as formatted HTML with the formula in <code> tags and an explanation.`;
        break;
      case "analyze_data":
        prompt = `Analyze this spreadsheet data and provide key insights, anomalies, and actionable recommendations. Use <h2> headings for each section and <ul> lists for findings:\n\n${content}`;
        break;
      case "predict_values":
        prompt = `Based on this data series, predict the next 5 values and explain the pattern. Return as formatted HTML:\n\n${content}`;
        break;
      case "clean_data":
        prompt = `Review this data and suggest what needs cleaning, standardizing, or filling. Return as formatted HTML with clear sections:\n\n${content}`;
        break;
      case "natural_query":
        prompt = `Answer this question about the spreadsheet data. Return as formatted HTML.\nQuestion: ${customPrompt}\n\nData:\n${content}`;
        break;
      case "generate_data":
        prompt = `Generate 10 rows of realistic sample data for: ${content}\n\nFormat as an HTML <table> with <thead> and <tbody>, with inline styles for clean appearance.`;
        break;
      case "chart_suggest":
        prompt = `Based on this data, suggest the best chart type and explain why. Return as formatted HTML:\n\n${content}`;
        break;
      case "custom":
        prompt = customPrompt
          ? `${customPrompt}\n\nReturn your response as beautifully formatted HTML with appropriate headings (<h1>, <h2>, <h3>), paragraphs (<p>), bullet/numbered lists (<ul>/<ol>/<li>), bold key terms (<strong>), and italic emphasis (<em>). Use inline styles for line-height:1.8 on paragraphs and proper spacing.${content ? `\n\nContext from current document:\n${content}` : ""}`
          : content;
        break;
      default:
        prompt = customPrompt || content;
    }

    const raw = await callGemma(prompt, {
      systemPrompt: WORKSPACE_SYSTEM,
      maxTokens: 4096,
      temperature: 0.7,
      preferLocal: true,
    });

    if (!raw) return NextResponse.json({ error: "AI engine unavailable — all models busy, try again in a moment." }, { status: 503 });

    const result = cleanWorkspaceResult(raw);
    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("Workspace AI error:", error.message);
    return NextResponse.json({ error: error.message || "AI engine unavailable" }, { status: 500 });
  }
}
