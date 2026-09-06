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
      return NextResponse.json({ presentations: [] });
    }

    let query = supabase
      .from("workspace_presentations")
      .select("id, title, theme, is_pinned, status, tags, last_edited_at, created_at, owner_id, project_id, owner:employees!workspace_presentations_owner_id_fkey(id,name,employee_id)")
      .eq("status", status)
      .order("last_edited_at", { ascending: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    } else if (!isAdmin) {
      const { data: sharedIds } = await supabase
        .from("workspace_shares")
        .select("item_id")
        .eq("user_id", userId!)
        .eq("item_type", "presentation");
      const sharedItemIds = (sharedIds || []).map(s => s.item_id);
      query = query.or(`owner_id.eq.${userId}${sharedItemIds.length > 0 ? `,id.in.(${sharedItemIds.join(',')})` : ''}`);
    }

    if (search) query = query.ilike("title", `%${search}%`);
    if (pinned === "true") query = query.eq("is_pinned", true);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ presentations: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { title, owner_id, folder_id, project_id, tags, theme } = body;

    const defaultSlides = [
      {
        id: "slide-1",
        background: "#FFFFFF",
        layout: "title",
        elements: [
          {
            id: "el-title",
            type: "text",
            content: "Click to add title",
            x: 10, y: 30, width: 80, height: 18,
            style: {
              fontSize: "2.2rem", fontWeight: "bold",
              color: "#1e293b", textAlign: "center",
            },
          },
          {
            id: "el-sub",
            type: "text",
            content: "Click to add subtitle",
            x: 15, y: 55, width: 70, height: 12,
            style: {
              fontSize: "1.1rem",
              color: "#64748b", textAlign: "center",
            },
          },
        ],
      },
    ];

    const { data, error } = await supabase
      .from("workspace_presentations")
      .insert({
        title: title || "Untitled Presentation",
        slides: defaultSlides,
        theme: theme || { primary: "#6366f1", secondary: "#e2e8f0", font: "Inter", bg: "#FFFFFF" },
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
      item_type: "presentation",
      item_id: data.id,
      item_title: data.title,
      employee_id: owner_id,
      action: "created",
    });

    return NextResponse.json({ presentation: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
