/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");

    if (!employeeId) {
      return NextResponse.json({ success: true, data: [], count: 0 });
    }

    // 1. Fetch Employee's Team ID
    const { data: employeeData } = await supabase
      .from("employees")
      .select("team_id")
      .eq("id", employeeId)
      .single();

    const teamId = employeeData?.team_id;

    // 2. Fetch projects where employee is a direct member
    const { data: memberProjects } = await supabase
      .from("project_members")
      .select(`project_id, role, projects(*)`)
      .eq("employee_id", employeeId);

    // 3. Fetch projects where employee's team is assigned
    let teamProjectIds: string[] = [];
    if (teamId) {
      const { data: teamAssignments } = await supabase
        .from("project_teams")
        .select("project_id")
        .eq("team_id", teamId);
      
      if (teamAssignments) {
        teamProjectIds = teamAssignments.map(ta => ta.project_id);
      }
    }

    // 4. Fetch the full project details for team-assigned projects
    let teamProjectsData: any[] = [];
    if (teamProjectIds.length > 0) {
      const { data: tpData } = await supabase
        .from("projects")
        .select("*")
        .in("id", teamProjectIds);
      if (tpData) teamProjectsData = tpData;
    }

    // 5. Combine and De-duplicate
    const allProjectsMap = new Map();

    // Process direct memberships first
    memberProjects?.forEach(mp => {
      if (mp.projects) {
        allProjectsMap.set(mp.project_id, {
          ...mp.projects,
          role: mp.role || 'Member',
          isDirect: true
        });
      }
    });

    // Process team projects (if not already added)
    teamProjectsData.forEach(proj => {
      if (!allProjectsMap.has(proj.id)) {
        allProjectsMap.set(proj.id, {
          ...proj,
          role: 'Team Member',
          isDirect: false
        });
      }
    });

    const finalProjectList = Array.from(allProjectsMap.values());
    const projectIds = finalProjectList.map(p => p.id);

    // 6. Fetch Task Stats for these projects
    let taskStatsByProject: Record<string, any> = {};
    if (projectIds.length > 0) {
      const { data: tasks } = await supabase
        .from("project_tasks")
        .select("project_id, status")
        .in("project_id", projectIds);

      tasks?.forEach((task: any) => {
        if (!taskStatsByProject[task.project_id]) {
          taskStatsByProject[task.project_id] = { total: 0, completed: 0, inProgress: 0, todo: 0, submitted: 0 };
        }
        taskStatsByProject[task.project_id].total += 1;
        if (task.status === "COMPLETED") taskStatsByProject[task.project_id].completed += 1;
        if (task.status === "IN_PROGRESS") taskStatsByProject[task.project_id].inProgress += 1;
        if (task.status === "TODO") taskStatsByProject[task.project_id].todo += 1;
        if (task.status === "SUBMITTED") taskStatsByProject[task.project_id].submitted += 1;
      });
    }

    // 7. Format final response
    const formattedProjects = finalProjectList.map(proj => ({
      id: proj.id,
      name: proj.name,
      description: proj.description,
      progress: proj.progress || 0,
      phase: proj.phase,
      dueDate: proj.due_date,
      budget: proj.budget,
      role: proj.role,
      tasks: taskStatsByProject[proj.id] || { total: 0, completed: 0, inProgress: 0, todo: 0, submitted: 0 },
    }));

    return NextResponse.json({
      success: true,
      data: formattedProjects,
      count: formattedProjects.length,
    });
  } catch (err: any) {
    console.error("Project fetch error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
