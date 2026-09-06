/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { itemId, itemType, itemTitle, shares, message } = await req.json();
    const supabase = getSupabaseAdmin();

    const shareData = shares.map((s: any) => ({
      item_id: itemId,
      item_type: itemType,
      item_title: itemTitle,
      user_id: s.userId,
      access_level: s.accessLevel || "view",
      message: message || "",
    }));

    const { error } = await supabase
      .from("workspace_shares")
      .upsert(shareData, { onConflict: "item_type,item_id,user_id" });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ sharedUsers: [] });

    const supabase = getSupabaseAdmin();

    // Try the view first, fall back to direct join if view doesn't exist yet.
    // Both paths are normalized to the same shape below — the view's raw columns
    // (share_id, access_level, name, email, role, employee_id) don't match what the
    // UI expects (id, permission, user_name, user_employee_id, user_role) any more
    // than the base-table columns do, so both branches map through the same shape.
    const { data, error } = await supabase
      .from("workspace_shared_users")
      .select("*")
      .eq("item_id", itemId);

    if (!error) {
      const mapped = (data || []).map((r: any) => ({
        id: r.share_id,
        permission: r.access_level,
        user_id: r.user_id,
        user_name: r.name,
        user_employee_id: r.employee_id,
        user_role: r.role,
      }));
      return NextResponse.json({ sharedUsers: mapped });
    }

    // Fallback: direct query with join (used when the view doesn't exist yet)
    const { data: raw, error: err2 } = await supabase
      .from("workspace_shares")
      .select("id, access_level, message, user_id, employees!workspace_shares_user_id_fkey(id,name,employee_id,role)")
      .eq("item_id", itemId);

    if (err2) throw err2;
    const mapped = (raw || []).map((r: any) => ({
      id: r.id,
      permission: r.access_level,
      user_id: r.employees?.id,
      user_name: r.employees?.name,
      user_employee_id: r.employees?.employee_id,
      user_role: r.employees?.role,
    }));
    return NextResponse.json({ sharedUsers: mapped });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shareId = searchParams.get("shareId");
    if (!shareId) return NextResponse.json({ error: "shareId required" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("workspace_shares").delete().eq("id", shareId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
