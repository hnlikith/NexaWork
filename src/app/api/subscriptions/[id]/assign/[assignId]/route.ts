/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assignId: string }> }
) {
  const supabase = getSupabaseAdmin();
  const { assignId } = await params;
  try {
    const { error } = await supabase
      .from("subscription_assignments")
      .delete()
      .eq("id", assignId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
