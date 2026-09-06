/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { google, sheets_v4 } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEETS_ID!;

/**
 * Authenticates using a service account.
 */
function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return auth;
}

export interface AttendanceRecord {
  date: string;
  status: "present" | "absent" | "pto" | "holiday" | "weekend";
}

export interface MonthlyAttendanceSummary {
  employeeId: string;
  month: number;
  year: number;
  total_days: number;
  present: number;
  absent: number;
  pto: number;
  holiday: number;
  records: AttendanceRecord[];
}

/**
 * Expected Google Sheet format:
 * Row 1 (header): Date | EMP001 | EMP002 | EMP003 | ...
 * Rows 2+: 2024-01-01 | P | A | Sick Leave | ...
 *
 * Status codes: P=Present, A=Absent, Sick Leave=Sick Leave/Leave, H=Holiday, WO=Weekend Off
 */
export async function fetchMonthlyAttendance(
  employeeId: string,
  month: number,
  year: number
): Promise<MonthlyAttendanceSummary> {
  try {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });

    const sheetName = `${year}-${String(month).padStart(2, "0")}`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1:ZZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return buildEmptySummary(employeeId, month, year);
    }

    const header = rows[0] as string[];
    const empColIndex = header.findIndex(
      (col) => col.trim().toUpperCase() === employeeId.toUpperCase()
    );

    if (empColIndex === -1) {
      return buildEmptySummary(employeeId, month, year);
    }

    const records: AttendanceRecord[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as string[];
      const date = row[0]?.trim();
      const rawStatus = row[empColIndex]?.trim().toUpperCase() ?? "";

      if (!date) continue;

      const status = normalizeStatus(rawStatus);
      records.push({ date, status });
    }

    return buildSummary(employeeId, month, year, records);
  } catch (error) {
    console.error("Google Sheets attendance fetch error:", error);
    // Return empty summary on integration error — do not crash
    return buildEmptySummary(employeeId, month, year);
  }
}

function normalizeStatus(raw: string): AttendanceRecord["status"] {
  switch (raw) {
    case "P":
    case "PRESENT":
      return "present";
    case "A":
    case "ABSENT":
      return "absent";
    case "Sick Leave":
    case "L":
    case "LEAVE":
      return "pto";
    case "H":
    case "HOLIDAY":
      return "holiday";
    case "WO":
    case "WEEKEND":
    case "":
      return "weekend";
    default:
      return "absent";
  }
}

function buildSummary(
  employeeId: string,
  month: number,
  year: number,
  records: AttendanceRecord[]
): MonthlyAttendanceSummary {
  const working = records.filter((r) => r.status !== "weekend" && r.status !== "holiday");
  return {
    employeeId,
    month,
    year,
    total_days: working.length,
    present: records.filter((r) => r.status === "present").length,
    absent: records.filter((r) => r.status === "absent").length,
    pto: records.filter((r) => r.status === "pto").length,
    holiday: records.filter((r) => r.status === "holiday").length,
    records,
  };
}

function buildEmptySummary(
  employeeId: string,
  month: number,
  year: number
): MonthlyAttendanceSummary {
  return {
    employeeId,
    month,
    year,
    total_days: 0,
    present: 0,
    absent: 0,
    pto: 0,
    holiday: 0,
    records: [],
  };
}

/**
 * Fetch last 6 months attendance for chart data
 */
export async function fetchAttendanceChartData(employeeId: string) {
  const now = new Date();
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }

  const results = await Promise.all(
    months.map(({ month, year }) => fetchMonthlyAttendance(employeeId, month, year))
  );

  return results.map((r) => ({
    label: new Date(r.year, r.month - 1).toLocaleString("en-IN", {
      month: "short",
      year: "2-digit",
    }),
    present: r.present,
    absent: r.absent,
    pto: r.pto,
  }));
}
