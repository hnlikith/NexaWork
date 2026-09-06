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
    
    if (!userId || userId === "undefined" || userId === "null") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_documents")
      .select("*, owner:employees!workspace_documents_owner_id_fkey(id,name,employee_id)")
      .eq("id", id)
      .single();

    if (error) throw error;

    // SECURITY CHECK: Is user owner?
    if (data.owner_id === userId) {
      return NextResponse.json({ document: data, accessLevel: 'owner' });
    }

    // SECURITY CHECK: Is user shared?
    const { data: share } = await supabase
      .from("workspace_shares")
      .select("access_level")
      .eq("item_id", id)
      .eq("user_id", userId)
      .single();

    if (!share) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    return NextResponse.json({ document: data, accessLevel: share.access_level });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    
    if (!userId || userId === "undefined" || userId === "null") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { title, content, is_pinned, status, icon, cover_color, tags, last_edited_by } = body;

    // 1. Fetch current document to check ownership
    const { data: currentDoc, error: fetchError } = await supabase
      .from("workspace_documents")
      .select("owner_id")
      .eq("id", id)
      .single();

    if (fetchError || !currentDoc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // 2. Permission logic
    let hasEditAccess = currentDoc.owner_id === userId;
    
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
    if (content !== undefined) update.content = content;
    if (is_pinned !== undefined) update.is_pinned = is_pinned;
    if (status !== undefined) update.status = status;
    if (icon !== undefined) update.icon = icon;
    if (cover_color !== undefined) update.cover_color = cover_color;
    if (tags !== undefined) update.tags = tags;
    if (last_edited_by !== undefined) update.last_edited_by = last_edited_by;

    const { data, error } = await supabase
      .from("workspace_documents")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    if (last_edited_by) {
      await supabase.from("workspace_activity").insert({
        item_type: "document",
        item_id: id,
        item_title: data.title,
        employee_id: last_edited_by,
        action: "edited",
      });
    }

    return NextResponse.json({ document: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("workspace_documents").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
