/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  try {
    let query = supabase.from("vendors").select("*").order("name");
    if (search) query = query.ilike("name", `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ vendors: data || [] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();

  try {
    const body = await req.json();
    const { name, contact_person, email, phone, category } = body;

    if (!name) return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("vendors")
      .insert({ name, contact_person: contact_person || null, email: email || null, phone: phone || null, category: category || "General" })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ vendor: data }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
