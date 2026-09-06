/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireModule } from "@/lib/authz";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: teams, error } = await supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ teams });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const gate = await requireModule("teams", "can_create");
    if (!gate.ok) return gate.response;

    const supabase = getSupabaseAdmin();
    const body = await req.json();

    // Duplicate Guard: Check if a node with same name, type, and parent already exists
    const { data: existing } = await supabase
      .from("teams")
      .select("id")
      .eq("name", body.name)
      .eq("type", body.type)
      .eq("parent_id", body.parent_id || null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `A ${body.type} named "${body.name}" already exists under the same parent.` },
        { status: 409 }
      );
    }

    const { data: team, error } = await supabase
      .from("teams")
      .insert([body])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ team });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const gate = await requireModule("teams", "can_edit");
    if (!gate.ok) return gate.response;

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "ID required for update." }, { status: 400 });

    const { data: team, error } = await supabase
      .from("teams")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ team });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const gate = await requireModule("teams", "can_delete");
    if (!gate.ok) return gate.response;

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    // Cascade: also delete all children of this node recursively
    async function deleteChildren(parentId: string) {
      const { data: children } = await supabase
        .from("teams")
        .select("id")
        .eq("parent_id", parentId);

      if (children && children.length > 0) {
        for (const child of children) {
          await deleteChildren(child.id);
        }
        await supabase.from("teams").delete().eq("parent_id", parentId);
      }
    }

    await deleteChildren(id);
    const { error } = await supabase.from("teams").delete().eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
