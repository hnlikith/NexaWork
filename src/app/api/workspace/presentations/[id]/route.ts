/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const ADMIN_ROLES = ["admin"];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(_req.url);
    const userId = searchParams.get("userId");
    const userRole = searchParams.get("userRole") || "";
    const isAdmin = ADMIN_ROLES.includes(userRole);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_presentations")
      .select("*, owner:employees!workspace_presentations_owner_id_fkey(id,name,employee_id)")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Admins can always read
    if (isAdmin || data.owner_id === userId) {
      return NextResponse.json({ presentation: data, accessLevel: isAdmin ? "admin" : "owner" });
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

    return NextResponse.json({ presentation: data, accessLevel: share.access_level });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const userRole = searchParams.get("userRole") || "";
    const isAdmin = ADMIN_ROLES.includes(userRole);

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { title, slides, theme, is_pinned, status, tags, last_edited_by } = body;

    // Admins bypass ownership check
    if (!isAdmin) {
      const { data: current, error: fetchError } = await supabase
        .from("workspace_presentations")
        .select("owner_id")
        .eq("id", id)
        .single();

      if (fetchError || !current) {
        return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
      }

      let hasEditAccess = current.owner_id === userId;
      if (!hasEditAccess) {
        const { data: share } = await supabase
          .from("workspace_shares")
          .select("access_level")
          .eq("item_id", id)
          .eq("user_id", userId)
          .single();
        if (share?.access_level === "edit") hasEditAccess = true;
      }
      if (!hasEditAccess) {
        return NextResponse.json({ error: "No edit permission" }, { status: 403 });
      }
    }

    const update: Record<string, any> = { last_edited_at: new Date().toISOString() };
    if (title !== undefined) update.title = title;
    if (slides !== undefined) update.slides = slides;
    if (theme !== undefined) update.theme = theme;
    if (is_pinned !== undefined) update.is_pinned = is_pinned;
    if (status !== undefined) update.status = status;
    if (tags !== undefined) update.tags = tags;
    if (last_edited_by !== undefined) update.last_edited_by = last_edited_by;

    const { data, error } = await supabase
      .from("workspace_presentations")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ presentation: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("workspace_presentations").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
