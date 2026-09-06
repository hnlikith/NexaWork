/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";
import { getApiUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import dayjs from "@/lib/dayjs";

// GET — check if today's check-in is blocked by an overdue sick-leave certificate.
// Called by GlobalAttendanceWidget before allowing check-in.
// Also stamps blocks_checkin = true on any newly-overdue leaves (compute-on-access).

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const today = dayjs().format("YYYY-MM-DD");

  // Find leaves past their certificate deadline with no cert submitted
  const { data: overdue } = await supabase
    .from("sick_leaves")
    .select("id, from_date, to_date, certificate_deadline, blocks_checkin, cert_status")
    .eq("employee_id", userId)
    .eq("cert_status", "pending")
    .is("certificate_url", null)
    .lte("certificate_deadline", today);

  if (overdue?.length) {
    // Stamp blocks_checkin = true on all overdue
    await supabase
      .from("sick_leaves")
      .update({ blocks_checkin: true })
      .in("id", overdue.map(l => l.id));

    return NextResponse.json({ blocked: true, leaves: overdue.map(l => ({ ...l, blocks_checkin: true })) });
  }

  // Also check any leave already marked as blocking (late cert awaiting approval)
  const { data: alreadyBlocking } = await supabase
    .from("sick_leaves")
    .select("id, from_date, to_date, certificate_deadline, cert_status, certificate_url")
    .eq("employee_id", userId)
    .eq("blocks_checkin", true)
    .neq("cert_status", "approved");

  if (alreadyBlocking?.length) {
    return NextResponse.json({ blocked: true, leaves: alreadyBlocking });
  }

  return NextResponse.json({ blocked: false, leaves: [] });
}
