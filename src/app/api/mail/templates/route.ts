/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const category = req.nextUrl.searchParams.get("category");
  const status   = req.nextUrl.searchParams.get("status") || "active";

  let query = supabase
    .from("mail_templates")
    .select("*, creator:employees!mail_templates_created_by_fkey(id,name)")
    .order("usage_count", { ascending: false });

  if (category && category !== "all") query = query.eq("category", category);
  if (status   && status   !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body     = await req.json();

  const { data, error } = await supabase
    .from("mail_templates")
    .insert({
      created_by: body.created_by,
      name:       body.name,
      category:   body.category || "general",
      subject:    body.subject,
      body:       body.body,
      variables:  body.variables || [],
      status:     body.status    || "active",
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
    .from("mail_templates")
    .update({ ...updates, updated_at: new Date().toISOString() })
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

  // Soft delete: set status to archived
  const { error } = await supabase
    .from("mail_templates")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
