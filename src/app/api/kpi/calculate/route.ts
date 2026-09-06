/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import dayjs from "@/lib/dayjs";

/**
 * Auto-calculate KPI based on employee's actual performance data
 * Fetches from attendance, projects, tasks, and behavioral metrics
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    if (!employeeId || !month || !year) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    // Get month date range
    const startDate = dayjs()
      .year(yearNum)
      .month(monthNum - 1)
      .startOf("month")
      .format("YYYY-MM-DD");
    const endDate = dayjs()
      .year(yearNum)
      .month(monthNum - 1)
      .endOf("month")
      .format("YYYY-MM-DD");

    // ==========================================
    // 1. ATTENDANCE METRICS (40% of KPI)
    // ==========================================
    const { data: attendanceLogs } = await supabase
      .from("attendance_logs")
      .select("*")
      .eq("employee_id", employeeId)
      .gte("date", startDate)
      .lte("date", endDate);

    const totalDaysInMonth = dayjs(endDate).date();
    const presentDays = attendanceLogs?.filter(
      (l) => l.status === "present"
    ).length || 0;
    const lateDays = attendanceLogs?.filter(
      (l) => l.status === "late"
    ).length || 0;
    const absentDays = attendanceLogs?.filter(
      (l) => l.status === "absent"
    ).length || 0;

    // Calculate attendance score (0-100)
    const workingDays = presentDays + lateDays;
    const attendancePercentage = (workingDays / totalDaysInMonth) * 100;
    const attendanceScore =
      attendancePercentage > 95
        ? 100
        : attendancePercentage > 85
          ? 90
          : attendancePercentage > 75
            ? 80
            : attendancePercentage > 65
              ? 70
              : 60;

    // Late penalty
    const latePenalty = Math.min(lateDays * 2, 15);
    const kpiScore1 = Math.max(Math.min(attendanceScore - latePenalty, 100), 0);

    // ==========================================
    // 2. PROJECT & TASK COMPLETION (40% of KPI)
    // ==========================================
    const { data: projects } = await supabase
      .from("projects")
      .select("*")
      .eq("lead_id", employeeId);

    const { data: tasks } = await supabase
      .from("project_tasks")
      .select("*")
      .eq("assigned_to", employeeId);

    const completedTasks = tasks?.filter((t) => t.status === "completed").length || 0;
    const totalTasks = tasks?.length || 0;
    const onTimeProjects = projects?.filter(
      (p) => new Date(p.updated_at) <= new Date(p.due_date)
    ).length || 0;

    let projectScore = 75;
    if (totalTasks > 0) {
      const taskCompletionRate = (completedTasks / totalTasks) * 100;
      projectScore =
        taskCompletionRate > 95
          ? 95
          : taskCompletionRate > 80
            ? 85
            : taskCompletionRate > 60
              ? 75
              : 60;
    }

    if (projects && projects.length > 0) {
      const projectOnTimeRate = (onTimeProjects / projects.length) * 100;
      if (projectOnTimeRate > 80) projectScore = Math.min(projectScore + 5, 100);
      else if (projectOnTimeRate < 50) projectScore = Math.max(projectScore - 10, 0);
    }

    const kpiScore2 = projectScore;

    // ==========================================
    // 3. KRA METRICS (Quality, Ownership, Initiative)
    // ==========================================
    // Based on task complexity and project impact
    const highPriorityTasks = tasks?.filter((t) => t.priority === "high").length || 0;
    const qualityScore = Math.min(
      75 + (completedTasks / Math.max(totalTasks, 1)) * 15,
      100
    );
    const ownershipScore = Math.min(
      70 + (onTimeProjects / Math.max(projects?.length || 1, 1)) * 20,
      100
    );
    const initiativeScore = Math.min(
      70 + (highPriorityTasks / Math.max(totalTasks, 1)) * 20,
      100
    );

    const kraScore = (qualityScore + ownershipScore + initiativeScore) / 3;

    // ==========================================
    // 4. BEHAVIORAL METRICS
    // ==========================================
    // Attendance behavior
    const attendanceBehaviorScore = Math.max(100 - absentDays * 5, 0);

    // Discipline (punctuality)
    const disciplineScore = Math.max(100 - lateDays * 3, 0);

    // Communication (based on meeting attendance, messages)
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("sender_id", employeeId)
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    const communicationScore = Math.min(
      70 + (messages?.length || 0) / 10,
      100
    );

    const behavioralScore =
      (attendanceBehaviorScore + disciplineScore + communicationScore) / 3;

    // ==========================================
    // 5. FINAL SCORE CALCULATION
    // ==========================================
    // KPI Component (40%)
    const finalKpiScore = (kpiScore1 + kpiScore2) / 2;

    // Calculate weighted final score
    const finalScore = Math.min(
      (finalKpiScore * 0.4 + kraScore * 0.4 + behavioralScore * 0.2),
      100
    );

    const getRating = (score: number): string => {
      if (score >= 90) return "Outstanding";
      if (score >= 75) return "Exceeds";
      if (score >= 60) return "Meets";
      if (score >= 40) return "Needs Improvement";
      return "Poor";
    };

    return NextResponse.json({
      success: true,
      auto_calculated: {
        // KPI Entries
        kpi_entries: [
          {
            label: "Attendance & Punctuality",
            weight: 40,
            score: kpiScore1,
            breakdown: {
              present: presentDays,
              late: lateDays,
              absent: absentDays,
              total_days: totalDaysInMonth,
            },
          },
          {
            label: "Project Execution",
            weight: 30,
            score: kpiScore2,
            breakdown: {
              completed_tasks: completedTasks,
              total_tasks: totalTasks,
              on_time_projects: onTimeProjects,
            },
          },
          {
            label: "Overall Performance",
            weight: 30,
            score: finalKpiScore,
          },
        ],

        // KRA Metrics
        kra_metrics: {
          ownership: Math.round(ownershipScore),
          quality: Math.round(qualityScore),
          initiative: Math.round(initiativeScore),
        },

        // Behavioral Metrics
        behavioral_metrics: {
          attendance: Math.round(attendanceBehaviorScore),
          discipline: Math.round(disciplineScore),
          communication: Math.round(communicationScore),
        },

        // Final Scores
        kpi_score: Math.round(finalKpiScore * 10) / 10,
        kra_score: Math.round(kraScore * 10) / 10,
        behavioral_score: Math.round(behavioralScore * 10) / 10,
        final_score: Math.round(finalScore * 10) / 10,
        rating_label: getRating(finalScore),

        // Insights
        insights: {
          attendance_status:
            attendancePercentage > 90
              ? "Excellent attendance"
              : attendancePercentage > 75
                ? "Good attendance"
                : "Needs improvement",
          task_completion:
            totalTasks === 0
              ? "No tasks assigned"
              : completedTasks === totalTasks
                ? "All tasks completed"
                : `${Math.round((completedTasks / totalTasks) * 100)}% tasks completed`,
          project_status:
            !projects || projects.length === 0
              ? "No projects led"
              : `${onTimeProjects}/${projects.length} projects on time`,
          recommendation:
            finalScore >= 90
              ? "Excellent performer - consider for promotion"
              : finalScore >= 75
                ? "Good performer - maintain current level"
                : finalScore >= 60
                  ? "Meets expectations - provide support"
                  : "Below expectations - requires intervention",
        },
      },
    });
  } catch (err: any) {
    console.error("KPI calculation error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to calculate KPI" },
      { status: 500 }
    );
  }
}
