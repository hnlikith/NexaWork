/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, isAdmin } from "@/lib/onboarding/server";
import { logAudit } from "@/lib/audit";

// POST /api/admin/sessions/signout — admin force-ends a user's workspace session.
// Always removes them from the live presence board; additionally attempts a global
// token revocation where the auth server supports it.
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(actor)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { user_id } = await req.json().catch(() => ({}));
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  let revoked = false;
  try {
    const adminApi = supabase.auth.admin as any;
    if (typeof adminApi.signOut === "function") {
      await adminApi.signOut(user_id, "global");
      revoked = true;
    }
  } catch {
    // Token revocation not supported on this auth server — presence clear still applies.
  }

  // Drop them from the live presence board immediately.
  await supabase.from("user_presence").delete().eq("user_id", user_id);

  const { data: emp } = await supabase
    .from("employees")
    .select("name, employee_id")
    .eq("id", user_id)
    .maybeSingle();

  await logAudit({
    actorId: actor.userId,
    action: "session.force_signout", section: "Security",
    summary: `Force-signed-out ${emp?.name || user_id}${revoked ? "" : " (presence cleared — token revocation unavailable)"}`,
    targetType: "employee", targetId: user_id,
  });

  return NextResponse.json({
    ok: true,
    revoked,
    message: revoked
      ? "User signed out globally — they must log in again."
      : "User removed from the live board; their session ends on next token refresh.",
  });
}
