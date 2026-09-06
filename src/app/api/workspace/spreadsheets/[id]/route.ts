/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(_req.url);
    const userId = searchParams.get("userId");
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_spreadsheets")
      .select("*, owner:employees!workspace_spreadsheets_owner_id_fkey(id,name,employee_id)")
      .eq("id", id)
      .single();

    if (error) throw error;

    // Ownership check
    if (data.owner_id === userId) {
      return NextResponse.json({ spreadsheet: data, accessLevel: 'owner' });
    }

    // Share check
    const { data: share } = await supabase
      .from("workspace_shares")
      .select("access_level")
      .eq("item_id", id)
      .eq("user_id", userId)
      .single();

    if (!share) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    return NextResponse.json({ spreadsheet: data, accessLevel: share.access_level });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { title, sheets, is_pinned, status, tags, last_edited_by } = body;

    // 1. Fetch current spreadsheet to check ownership
    const { data: current, error: fetchError } = await supabase
      .from("workspace_spreadsheets")
      .select("owner_id")
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Spreadsheet not found" }, { status: 404 });
    }

    // 2. Permission logic
    let hasEditAccess = current.owner_id === userId;
    
    if (!hasEditAccess) {
      const { data: share } = await supabase
        .from("workspace_shares")
        .select("access_level")
        .eq("item_id", id)
        .eq("user_id", userId)
        .single();
      
      if (share?.access_level === 'edit') {
        hasEditAccess = true;
      }
    }

    if (!hasEditAccess) {
      return NextResponse.json({ error: "No edit permission" }, { status: 403 });
    }

    const update: Record<string, any> = { last_edited_at: new Date().toISOString() };
    if (title !== undefined) update.title = title;
    if (sheets !== undefined) update.sheets = sheets;
    if (is_pinned !== undefined) update.is_pinned = is_pinned;
    if (status !== undefined) update.status = status;
    if (tags !== undefined) update.tags = tags;
    if (last_edited_by !== undefined) update.last_edited_by = last_edited_by;

    const { data, error } = await supabase
      .from("workspace_spreadsheets")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ spreadsheet: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("workspace_spreadsheets").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
