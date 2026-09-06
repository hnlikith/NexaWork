/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { application_id, scheduled_at, interviewer_id, interview_type = 'technical' } = body;

    if (!application_id || !scheduled_at || !interviewer_id) {
      return NextResponse.json({ error: "Missing required fields (application_id, scheduled_at, interviewer_id)" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 0. Conflict Detection (30-min buffer)
    const startTime = new Date(scheduled_at);
    const bufferBefore = new Date(startTime.getTime() - 30 * 60 * 1000);
    const bufferAfter = new Date(startTime.getTime() + 30 * 60 * 1000);

    const { data: conflict } = await supabase
      .from("interviews")
      .select("id")
      .eq("interviewer_id", interviewer_id)
      .gt("scheduled_at", bufferBefore.toISOString())
      .lt("scheduled_at", bufferAfter.toISOString())
      .maybeSingle();

    if (conflict) {
      return NextResponse.json({ 
        error: "Interviewer has a scheduling conflict. Please choose a time at least 30 minutes apart from other interviews." 
      }, { status: 409 });
    }

    // 1. Fetch Candidate & Profile
    const { data: application, error: fetchErr } = await supabase
      .from("applications")
      .select("*")
      .eq("application_id", application_id)
      .single();

    if (fetchErr || !application) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from("company_profile")
      .select("*")
      .limit(1)
      .single();

    // 2. Generate Meeting Link
    const meetingId = `INT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const accessToken = `ni_${Math.random().toString(36).substr(2, 12)}_${Date.now()}`;
    
    // Get origin from request header to handle dynamic subdomains
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const meetingLink = `${origin}/meet/${meetingId}?token=${accessToken}`;

    // 3. Save Interview Record
    const { error: insertErr } = await supabase
      .from("interviews")
      .insert({
        interview_id: meetingId,
        application_id,
        interviewer_id,
        interview_type,
        meeting_link: meetingLink,
        unique_access_token: accessToken,
        scheduled_at,
        status: "scheduled"
      });

    if (insertErr) throw insertErr;

    // 4. Send Email
    const smtpHost = profile?.smtp_host;
    const smtpPort = Number(profile?.smtp_port || 587);
    const smtpUser = profile?.smtp_user;
    const smtpPass = profile?.smtp_pass;
    const smtpSecure = profile?.smtp_secure ?? false;
    const smtpFromName = profile?.smtp_from_name || "NexaWork Recruitment";
    const smtpFromEmail = profile?.smtp_from_email || smtpUser;
    const companyName = profile?.company_name || smtpFromName;

    if (smtpHost && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure === true,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const dateStr = new Date(scheduled_at).toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      });

      const html = `
        <!DOCTYPE html>
        <html>
        <body style="font-family: 'Inter', Arial, sans-serif; color: #1e293b; line-height:1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px;">
            <div style="text-align:center; margin-bottom: 25px;">
              <h1 style="color:#0f172a; margin:0; font-size:24px;">Interview Invitation</h1>
              <p style="color:#64748b; margin:5px 0 0;">${companyName} Talent Acquisition</p>
            </div>
            
            <p>Dear <b>${application.applicant_name}</b>,</p>
            
            <p>You have been selected for the next stage of our hiring process at ${companyName}. We would like to invite you to a <b>live video interview</b> for your technical evaluation.</p>

            <div style="background:#020617; color: white; padding:25px; border-radius:16px; margin: 25px 0; border: 1px solid #10b981;">
              <p style="margin:0 0 10px; font-size:11px; color:#10b981; text-transform:uppercase; font-weight:900; letter-spacing:0.1em;">Interview Details</p>
              <p style="margin:0; font-size:18px; color:#ffffff; font-weight:700;">${dateStr}</p>
              
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #1e293b;">
                <p style="margin:0 0 5px; font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:700; letter-spacing:0.05em;">Role Assessment</p>
                <p style="margin:0; font-size:15px; color:#f8fafc; font-weight:600;">${application.applied_cluster_id}</p>
              </div>

              <a href="${meetingLink}" style="display:inline-block; margin-top: 25px; padding:14px 32px; background:#10b981; color:#020617; text-decoration:none; border-radius:12px; font-weight:900; font-size:14px; text-transform: uppercase; letter-spacing: 0.02em; transition: all 0.2s;">Join Interview Room</a>
            </div>

            <h3 style="color:#0f172a; font-size:16px; margin-top:30px;">✅ Pre-Interview Checklist</h3>
            <ul style="padding-left: 20px; color:#475569; font-size:14px;">
              <li>Test your <b>Camera & Microphone</b> by clicking the link 15 minutes early.</li>
              <li>Ensure you have a <b>stable internet connection</b> (5Mbps+ recommended).</li>
              <li>The interview will be recorded and analyzed by our <b>Gemma AI Engine</b>.</li>
              <li>Have your digital portfolio or projects ready for <b>Screen Sharing</b>.</li>
            </ul>

            <div style="background:#fef2f2; border-left:4px solid #ef4444; padding:12px 16px; margin-top:20px;">
              <p style="margin:0; font-size:13px; color:#991b1b;">
                <b>Note:</b> Access to the room is restricted. Do not share your unique link with anyone.
              </p>
            </div>

            <p style="margin-top:40px; font-size:12px; color:#94a3b8; text-align:center;">
              Powered by <b>NexaWork Intelligence</b><br/>
              &copy; 2026 ${companyName}. All rights reserved.
            </p>
          </div>
        </body>
        </html>
      `;

      await transporter.sendMail({
        from: `"${smtpFromName}" <${smtpFromEmail}>`,
        to: application.applicant_email,
        subject: `Video Interview Invitation: ${application.applied_cluster_id}`,
        html,
      });
    }

    return NextResponse.json({ 
      success: true, 
      meeting_id: meetingId, 
      meeting_link: meetingLink,
      message: "Interview scheduled and invitation sent."
    });

  } catch (error: any) {
    console.error("[Schedule API] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to schedule interview" }, { status: 500 });
  }
}
