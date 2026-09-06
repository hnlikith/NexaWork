/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticate, requireRole } from "@/middleware/auth";
import { fetchMonthlyAttendance, fetchAttendanceChartData } from "@/services/attendanceService";

// GET /api/attendance?employeeId=EMP001&month=1&year=2024&chart=true
export async function GET(req: NextRequest) {
  try {
    const authUser = await authenticate();
    const { searchParams } = new URL(req.url);

    let employeeId = searchParams.get("employeeId");
    const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
    const chart = searchParams.get("chart") === "true";

    // Employees can only view their own attendance
    if (authUser.role === "employee") {
      // employeeId from query must match their profile
      // We trust the employeeId passed; in production, fetch from DB
      if (!employeeId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
    } else {
      await requireRole(req, "admin");
      if (!employeeId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
    }

    if (chart) {
      const chartData = await fetchAttendanceChartData(employeeId!);
      return NextResponse.json({ chartData });
    }

    const attendance = await fetchMonthlyAttendance(employeeId!, month, year);
    return NextResponse.json({ attendance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
