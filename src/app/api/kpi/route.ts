/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, apiError, apiSuccess } from "@/middleware/auth";

// GET /api/kpi — fetch KPI metrics (real-time)
export const GET = withAuth(async (req, authUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const allEmployees = searchParams.get("allEmployees") === "true";

    const { createClient } = await import("@/lib/supabaseServer");
    const supabase = await createClient();

    // Use explicit relationship names to disambiguate foreign keys
    let query = supabase
      .from("kpi_metrics")
      .select(`
        id,
        employee_id,
        month,
        year,
        kpi_score,
        kpi_entries,
        kra_score,
        kra_metrics,
        behavioral_score,
        behavioral_metrics,
        final_score,
        rating_label,
        remarks,
        entered_at,
        updated_at,
        employee:employees!kpi_metrics_employee_id_fkey(id, name, employee_id, department, designation),
        entered_by:employees!kpi_metrics_entered_by_fkey(id, name)
      `);

    if (employeeId) {
      query = query.eq("employee_id", employeeId);
    }

    if (month && year) {
      query = query
        .eq("month", parseInt(month))
        .eq("year", parseInt(year));
    }

    if (!allEmployees) {
      query = query.order("updated_at", { ascending: false }).limit(1);
    }

    const { data, error } = await query;

    if (error) throw error;

    return apiSuccess({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (err: any) {
    console.error("KPI fetch error:", err);
    return apiError(err.message || "Failed to fetch KPI");
  }
});

// POST /api/kpi — create/update KPI score (HR/Lead/Admin)
export const POST = withAuth(async (req) => {
  try {
    const body = await req.json();
    const {
      id,
      employee_id,
      month,
      year,
      kpi_score,
      kpi_entries,
      kra_score,
      kra_metrics,
      behavioral_score,
      behavioral_metrics,
      final_score,
      rating_label,
      remarks
    } = body;

    if (!employee_id || month === undefined || !year) {
      return apiError("Missing required fields: employee_id, month, year", 400);
    }

    const { createClient } = await import("@/lib/supabaseServer");
    const supabase = await createClient();

    // Insert or update KPI with explicit relationship select
    const { data, error } = await supabase
      .from("kpi_metrics")
      .upsert(
        {
          id: id || undefined,
          employee_id,
          month,
          year,
          kpi_score: kpi_score || 0,
          kpi_entries: kpi_entries || [],
          kra_score: kra_score || 0,
          kra_metrics: kra_metrics || {},
          behavioral_score: behavioral_score || 0,
          behavioral_metrics: behavioral_metrics || {},
          final_score: final_score || 0,
          rating_label: rating_label || "Meets",
          remarks,
          updated_at: new Date().toISOString()
        },
        { onConflict: "id" }
      )
      .select(`
        id,
        employee_id,
        month,
        year,
        kpi_score,
        kpi_entries,
        kra_score,
        kra_metrics,
        behavioral_score,
        behavioral_metrics,
        final_score,
        rating_label,
        remarks,
        entered_at,
        updated_at,
        employee:employees!kpi_metrics_employee_id_fkey(id, name, employee_id, department)
      `);

    if (error) throw error;

    return apiSuccess({ success: true, data: data?.[0] }, id ? 200 : 201);
  } catch (err: any) {
    console.error("KPI save error:", err);
    return apiError(err.message || "Failed to save KPI");
  }
}, "admin", "hr");

// DELETE /api/kpi — delete KPI record (Admin only)
export const DELETE = withAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const kpiId = searchParams.get("id");

    if (!kpiId) {
      return apiError("Missing KPI ID", 400);
    }

    const { createClient } = await import("@/lib/supabaseServer");
    const supabase = await createClient();

    const { error } = await supabase
      .from("kpi_metrics")
      .delete()
      .eq("id", kpiId);

    if (error) throw error;

    return apiSuccess({ success: true, message: "KPI deleted" });
  } catch (err: any) {
    console.error("KPI delete error:", err);
    return apiError(err.message || "Failed to delete KPI");
  }
}, "admin");
