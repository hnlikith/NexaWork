/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob;
    const interviewId = formData.get("interviewId") as string;
    const interviewerId = formData.get("interviewerId") as string;

    if (!file || !interviewId || !interviewerId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const fileName = `${interviewId}_${Date.now()}.webm`;
    const filePath = `recordings/${interviewerId}/${fileName}`;

    const { data, error: uploadErr } = await supabase.storage
      .from("interview-recordings")
      .upload(filePath, file, {
        contentType: "video/webm",
        upsert: true
      });

    if (uploadErr) throw uploadErr;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("interview-recordings")
      .getPublicUrl(filePath);

    // Update interview record
    await supabase.from("interviews")
      .update({ recording_url: publicUrl })
      .eq("interview_id", interviewId);

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error: any) {
    console.error("[Record API] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
