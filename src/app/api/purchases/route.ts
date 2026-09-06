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
  const status = searchParams.get("status") || "all";
  const category = searchParams.get("category") || "all";

  try {
    let query = supabase
      .from("purchases")
      .select("*, vendors(id, name, email, phone, contact_person, category)")
      .order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);
    if (category !== "all") query = query.eq("category", category);
    if (search) {
      query = query.or(
        `vendor_name.ilike.%${search}%,description.ilike.%${search}%,purchase_number.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ purchases: data || [] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();

  try {
    const body = await req.json();
    const { 
      vendor_id, vendor_name, description, category, amount, date, status, notes,
      filed_by_emp_id, filed_by_name, filed_by_dept, filed_by_desig, filed_by_uuid 
    } = body;

    if (!vendor_name || !description || !category || !amount || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("purchases")
      .insert({
        vendor_id: vendor_id || null,
        vendor_name,
        description,
        category,
        amount: Number(amount),
        date,
        status: status || "pending",
        notes: notes || null,
        purchase_number: "",
        filed_by_emp_id,
        filed_by_name,
        filed_by_dept,
        filed_by_desig,
        filed_by_uuid: filed_by_uuid || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ purchase: data }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
