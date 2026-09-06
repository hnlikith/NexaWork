/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status") || "active";
    const pinned = searchParams.get("pinned");

    const userId = searchParams.get("userId");
    const userRole = searchParams.get("userRole");
    const projectId = searchParams.get("projectId");
    const isAdmin = userRole === "admin";

    if (!userId && !projectId) {
      return NextResponse.json({ spreadsheets: [] });
    }

    let query = supabase
      .from("workspace_spreadsheets")
      .select("id, title, icon, is_pinned, status, tags, last_edited_at, created_at, owner_id, project_id, owner:employees!workspace_spreadsheets_owner_id_fkey(id,name,employee_id)")
      .eq("status", status)
      .order("last_edited_at", { ascending: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    } else if (!isAdmin) {
      const { data: sharedIds } = await supabase
        .from("workspace_shares")
        .select("item_id")
        .eq("user_id", userId!)
        .eq("item_type", "spreadsheet");
      const sharedItemIds = (sharedIds || []).map(s => s.item_id);
      query = query.or(`owner_id.eq.${userId}${sharedItemIds.length > 0 ? `,id.in.(${sharedItemIds.join(',')})` : ''}`);
    }

    if (search) query = query.ilike("title", `%${search}%`);
    if (pinned === "true") query = query.eq("is_pinned", true);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ spreadsheets: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { title, owner_id, folder_id, project_id, tags } = body;

    const defaultSheets = [
      {
        name: "Sheet 1",
        data: Array(50).fill(0).map(() => Array(20).fill("")),
        styles: {},
        colWidths: Array(20).fill(150),
      },
    ];

    const { data, error } = await supabase
      .from("workspace_spreadsheets")
      .insert({
        title: title || "Untitled Spreadsheet",
        sheets: defaultSheets,
        owner_id,
        folder_id: folder_id || null,
        project_id: project_id || null,
        tags: tags || [],
        last_edited_by: owner_id,
        last_edited_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("workspace_activity").insert({
      item_type: "spreadsheet",
      item_id: data.id,
      item_title: data.title,
      employee_id: owner_id,
      action: "created",
    });

    return NextResponse.json({ spreadsheet: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
