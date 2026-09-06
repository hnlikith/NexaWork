/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, employeeIds, role = "Member" } = body;

    if (!projectId || !employeeIds || !Array.isArray(employeeIds)) {
      return NextResponse.json(
        { success: false, error: "projectId and employeeIds array required" },
        { status: 400 }
      );
    }

    // Insert project members
    const membersData = employeeIds.map((empId: string) => ({
      project_id: projectId,
      employee_id: empId,
      role: role,
    }));

    const { data, error } = await supabase
      .from("project_members")
      .upsert(membersData, { onConflict: "project_id,employee_id" })
      .select(`
        id,
        project_id,
        employee_id,
        role,
        assigned_at,
        employees!inner(id, name, email)
      `);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data,
      message: `Assigned ${employeeIds.length} employee(s) to project`,
    });
  } catch (err: any) {
    console.error("Project member assignment error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to assign project members" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const employeeId = searchParams.get("employeeId");

    if (!projectId || !employeeId) {
      return NextResponse.json(
        { success: false, error: "projectId and employeeId required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("employee_id", employeeId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Employee removed from project",
    });
  } catch (err: any) {
    console.error("Project member removal error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to remove project member" },
      { status: 500 }
    );
  }
}
