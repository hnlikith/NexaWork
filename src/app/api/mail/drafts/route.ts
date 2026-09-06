/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const employeeId = req.nextUrl.searchParams.get("employee_id");

  let query = supabase
    .from("mail_drafts")
    .select("*")
    .order("last_saved_at", { ascending: false });

  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body     = await req.json();

  const { data, error } = await supabase
    .from("mail_drafts")
    .insert({
      employee_id:   body.employee_id,
      to_addresses:  body.to || [],
      cc_addresses:  body.cc || [],
      bcc_addresses: body.bcc || [],
      subject:       body.subject || "",
      body:          body.body    || "",
      attachments:   body.attachments || [],
      template_id:   body.template_id || null,
      last_saved_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  const supabase      = getSupabaseAdmin();
  const { id, ...updates } = await req.json();

  const { data, error } = await supabase
    .from("mail_drafts")
    .update({ ...updates, last_saved_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const id       = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("mail_drafts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
