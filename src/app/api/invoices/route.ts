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

  try {
    let query = supabase
      .from("invoices")
      .select(`
        *,
        clients (id, name, email, company),
        projects (id, name),
        teams (id, name)
      `)
      .order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);
    if (search) query = query.ilike("invoice_number", `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ invoices: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();

  try {
    const body = await req.json();
    const {
      client_id, project_id, team_id,
      issued_date, due_date, notes, terms, bank_details,
      billing_address, client_gstin, client_email, place_of_supply,
      subtotal, cgst, sgst, igst, tax, total, amount,
      status, type, items,
      created_by_emp_id, created_by_name, created_by_dept, created_by_team, created_by_desig,
    } = body;

    // Generate invoice number
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${year}-01-01`);
    const invoiceNumber = `INV-${year}-${String((count || 0) + 1).padStart(3, "0")}`;

    // Insert invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        client_id: client_id || null,
        project_id: project_id || null,
        team_id: team_id || null,
        issued_date: issued_date || null,
        due_date: due_date || null,
        notes: notes || null,
        terms: terms || null,
        bank_details: bank_details || null,
        billing_address: billing_address || null,
        client_gstin: client_gstin || null,
        client_email: client_email || null,
        place_of_supply: place_of_supply || null,
        subtotal: Number(subtotal) || 0,
        cgst: Number(cgst) || 0,
        sgst: Number(sgst) || 0,
        igst: Number(igst) || 0,
        tax: Number(tax) || 0,
        total: Number(total) || 0,
        amount: Number(amount) || 0,
        status: status || "draft",
        type: type || "receivable",
        created_by_emp_id:  created_by_emp_id  || null,
        created_by_name:    created_by_name    || null,
        created_by_dept:    created_by_dept    || null,
        created_by_team:    created_by_team    || null,
        created_by_desig:   created_by_desig   || null,
      })
      .select()
      .single();

    if (invErr) throw invErr;

    // Insert line items
    if (items && items.length > 0) {
      const lineItems = items.map((item: any, idx: number) => ({
        invoice_id: invoice.id,
        description: item.description,
        hsn_sac: item.hsn_sac || null,
        quantity: Number(item.quantity) || 1,
        rate: Number(item.rate) || 0,
        gst_rate: Number(item.gst_rate) || 18,
        amount: Number(item.amount) || 0,
        cgst_amount: Number(item.cgst_amount) || 0,
        sgst_amount: Number(item.sgst_amount) || 0,
        igst_amount: Number(item.igst_amount) || 0,
        total: Number(item.total) || 0,
        sort_order: idx,
      }));
      const { error: itemErr } = await supabase.from("invoice_items").insert(lineItems);
      if (itemErr) throw itemErr;
    }

    return NextResponse.json({ success: true, invoice }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
