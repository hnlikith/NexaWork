/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { id: employeeId } = await params;
    console.log(`[API] Fetching employee: ${employeeId}`);

    if (!employeeId) {
      console.warn("[API] No employee ID provided");
      return NextResponse.json(
        { success: false, error: "Employee ID required" },
        { status: 400 }
      );
    }

    // Query with all available columns using Admin client to ensure full profile sync
    console.log("[API] Querying Supabase for employee...");
    const supabase = getSupabaseAdmin();
    const { data: dataArray, error } = await supabase
      .from("employees")
      .select("*")
      .eq("id", employeeId)
      .limit(1);

    const data = Array.isArray(dataArray) && dataArray.length > 0 ? dataArray[0] : null;

    if (error) {
      console.error("[API] Supabase error:", {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint
      });
      return NextResponse.json(
        {
          success: false,
          error: error.message || "Failed to fetch employee",
          details: (error as any).details
        },
        { status: 500 }
      );
    }

    if (!data) {
      console.warn("[API] Employee not found for ID:", employeeId);
      console.warn("[API] This user exists in auth but has no employee record");
      return NextResponse.json(
        {
          success: false,
          error: "Employee record not found. Please create an employee profile in the admin panel.",
          userId: employeeId,
          hint: "Go to Admin > Employees > Add Employee to create your profile"
        },
        { status: 404 }
      );
    }

    console.log("[API] Employee found:", {
      id: data.id,
      name: data.name,
      has_salary_min: data.salary_min !== undefined,
      has_salary_max: data.salary_max !== undefined
    });

    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (err: any) {
    console.error("[API] Unexpected error:", {
      message: err.message,
      stack: err.stack
    });
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch employee" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body   = await req.json();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("employees")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
