/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

interface RouteCtx { params: Promise<{ id: string }> }

// PATCH /api/interns/[id]
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  try {
    const body = await req.json();
    const updatable: Record<string, unknown> = {};
    for (const k of ["full_name","intern_id","upi_id","stipend_amount","joining_date","starting_date","billing_date","is_active","notes"]) {
      if (k in body) updatable[k] = body[k];
    }
    if (Object.keys(updatable).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase.from("interns").update(updatable).eq("id", id).select("*").single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Intern ID already in use." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ intern: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message ?? "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/interns/[id]
// Soft-delete: sets is_active = false. Use ?hard=true for actual delete.
export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  const hard = req.nextUrl.searchParams.get("hard") === "true";
  try {
    if (hard) {
      const { error } = await supabase.from("interns").delete().eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("interns").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message ?? "Unknown error" }, { status: 500 });
  }
}
