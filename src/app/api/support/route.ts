/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findTeamLead(supabase: any, teamId: string | null, excludeId?: string) {
  if (!teamId) return null;
  const { data } = await supabase
    .from("employees")
    .select("id, name, role, department, team_id, is_team_lead, is_dept_lead")
    .eq("team_id", teamId)
    .eq("is_team_lead", true)
    .eq("is_active", true)
    .neq("id", excludeId || "")
    .limit(1);
  return (data && data.length > 0) ? data[0] : null;
}

async function findDeptLead(supabase: any, department: string | null, excludeId?: string) {
  if (!department) return null;
  const { data } = await supabase
    .from("employees")
    .select("id, name, role, department, team_id, is_team_lead, is_dept_lead")
    .eq("department", department)
    .eq("is_dept_lead", true)
    .eq("is_active", true)
    .neq("id", excludeId || "")
    .limit(1);
  return (data && data.length > 0) ? data[0] : null;
}

async function findAdmin(supabase: any) {
  const { data } = await supabase
    .from("employees")
    .select("id, name, role, department")
    .eq("role", "admin")
    .eq("is_active", true)
    .limit(1);
  return (data && data.length > 0) ? data[0] : null;
}

function buildTrackingEntry(
  action: string,
  by: { id: string; name: string; role?: string; is_team_lead?: boolean; is_dept_lead?: boolean } | null,
  to: { id: string; name: string; role?: string; is_team_lead?: boolean; is_dept_lead?: boolean } | null,
  notes?: string
) {
  const getRoleLabel = (emp: any) => {
    if (!emp) return "";
    if (emp.role === "admin" || emp.role === "super_admin") return "Admin";
    if (emp.is_dept_lead) return "DL";
    if (emp.is_team_lead) return "TL";
    if (emp.role === "team_lead") return "TL";
    if (emp.role === "dept_lead") return "DL";
    if (emp.role === "employee") return "Emp";
    if (emp.role === "intern") return "Int";
    return "Emp";
  };

  return {
    timestamp: new Date().toISOString(),
    action,
    by_id: by?.id ?? null,
    by_name: by?.name ?? "System",
    by_role: by ? getRoleLabel(by) : null,
    to_id: to?.id ?? null,
    to_name: to?.name ?? null,
    to_role: to ? getRoleLabel(to) : null,
    notes: notes ?? null,
  };
}

// ─── Ticket select fragment ───────────────────────────────────────────────────
const TICKET_SELECT = `
  *,
  creator:employees!support_tickets_creator_id_fkey(id, name, email, role, department, designation, employee_id, team_id, is_team_lead, is_dept_lead),
  assignee:employees!support_tickets_assignee_id_fkey(id, name, email, role, department, designation, employee_id),
  resolver:employees!support_tickets_resolved_by_fkey(id, name, email, role),
  current_handler:employees!support_tickets_current_handler_id_fkey(id, name, email, role, department),
  linked_ticket:support_tickets!linked_ticket_id(
    id, subject, status, priority, created_at,
    creator:employees!support_tickets_creator_id_fkey(id, name, email, role, department)
  )
`;

// ─── GET — Fetch tickets (role-filtered) ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const userId   = req.nextUrl.searchParams.get("userId");
  const userRole = req.nextUrl.searchParams.get("userRole");
  const view     = req.nextUrl.searchParams.get("view") ?? "all";
  const status   = req.nextUrl.searchParams.get("status");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Fetch the requesting user's full profile for context
    const { data: me } = await supabase
      .from("employees")
      .select("id, name, role, department, team_id, is_team_lead, is_dept_lead")
      .eq("id", userId)
      .single();

    let query = supabase
      .from("support_tickets")
      .select(TICKET_SELECT)
      .order("created_at", { ascending: false });

    // Apply status filter first if requested
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (view === "raised") {
      // Show only tickets this user raised
      query = query.eq("creator_id", userId);
    } else if (view === "assigned") {
      // Show tickets explicitly assigned to this user's desk
      query = query.or(`assignee_id.eq.${userId},current_handler_id.eq.${userId}`);
    } else if (userRole === "admin" || userRole === "super_admin") {
      // Admin: see all tickets
    } else if (me?.is_dept_lead) {
      // Dept Lead: see tickets raised by their department members OR assigned/handled by them
      const { data: deptMembers } = await supabase
        .from("employees")
        .select("id")
        .eq("department", me.department)
        .eq("is_active", true);
      
      const memberIds = (deptMembers || []).map((e: any) => e.id);
      memberIds.push(userId); // include self

      if (memberIds.length > 0) {
        const orClauses = memberIds.map((id: string) => `creator_id.eq.${id}`);
        orClauses.push(`assignee_id.eq.${userId}`);
        orClauses.push(`current_handler_id.eq.${userId}`);
        query = query.or(orClauses.join(","));
      }
    } else if (me?.is_team_lead) {
      // Team Lead: see tickets raised by their team members OR assigned/handled by them
      // If team_id is null (flat-department structure without teams), fall back to dept members
      let memberIds: string[] = [];
      if (me.team_id) {
        const { data: teamMembers } = await supabase
          .from("employees")
          .select("id")
          .eq("team_id", me.team_id)
          .eq("is_active", true);
        memberIds = (teamMembers || []).map((e: any) => e.id);
      } else if (me.department) {
        // No team assigned — fall back to same-department members
        const { data: deptMembers } = await supabase
          .from("employees")
          .select("id")
          .eq("department", me.department)
          .eq("is_active", true);
        memberIds = (deptMembers || []).map((e: any) => e.id);
      }
      memberIds.push(userId);

      if (memberIds.length > 0) {
        const orClauses = memberIds.map((id: string) => `creator_id.eq.${id}`);
        orClauses.push(`assignee_id.eq.${userId}`);
        orClauses.push(`current_handler_id.eq.${userId}`);
        query = query.or(orClauses.join(","));
      }
    } else {
      // Regular employee: only see their own tickets
      query = query.or(`creator_id.eq.${userId},assignee_id.eq.${userId}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ tickets: data ?? [] });
  } catch (err: any) {
    console.error("[GET /api/support]", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

// ─── POST — Create a ticket (auto-routes to TL & DL) ─────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { creator_id, subject, description, priority, linked_ticket_id, attachments } = body;

    if (!creator_id || !subject) {
      return NextResponse.json({ error: "creator_id and subject are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1. Fetch creator's profile
    const { data: creator, error: creatorErr } = await supabase
      .from("employees")
      .select("id, name, role, department, team_id, is_team_lead, is_dept_lead")
      .eq("id", creator_id)
      .single();

    if (creatorErr || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    // 2. Resolve the correct initial handler(s) based on creator's role
    let teamLead: any = null;
    let deptLead: any = null;
    let primaryHandler: any = null;
    let targetRole = "admin";
    let trackingLog: any[] = [];

    if (creator.is_dept_lead) {
      // Dept Lead raising a ticket → goes to Admin
      const admin = await findAdmin(supabase);
      primaryHandler = admin;
      targetRole = "admin";
      trackingLog.push(
        buildTrackingEntry("Ticket Raised", creator, admin, `Department Lead ${creator.name} raised a ticket. Auto-routed to Admin.`)
      );
    } else if (creator.is_team_lead) {
      // Team Lead raising a ticket → goes to their Dept Lead
      deptLead = await findDeptLead(supabase, creator.department, creator.id);
      primaryHandler = deptLead;
      targetRole = "dept_lead";
      trackingLog.push(
        buildTrackingEntry("Ticket Raised", creator, deptLead, `Team Lead ${creator.name} raised a ticket. Auto-routed to Department Lead.`)
      );
    } else {
      // Regular employee — resolve routing based on what actually exists in the org structure
      teamLead = creator.team_id ? await findTeamLead(supabase, creator.team_id, creator.id) : null;
      deptLead = creator.department ? await findDeptLead(supabase, creator.department, creator.id) : null;
      primaryHandler = teamLead || deptLead;

      // Build a contextual routing note
      let routingNote: string;
      if (!teamLead && !deptLead) {
        // Flat org with no leads — try to find any admin as fallback
        const admin = await findAdmin(supabase);
        primaryHandler = admin;
        targetRole = "admin";
        routingNote = `No Team Lead or Department Lead found for ${creator.name}. Auto-escalated to Admin.`;
      } else if (!teamLead && deptLead) {
        // Department-only structure (no teams / no team lead)
        targetRole = "dept_lead";
        routingNote = `No Team found. Auto-routed directly to Department Lead: ${deptLead.name}.`;
      } else if (teamLead && !deptLead) {
        // Has team but department has no Dept Lead
        targetRole = "team_lead";
        routingNote = `Auto-routed to Team Lead: ${teamLead.name}. (No Department Lead configured)`;
      } else {
        // Ideal: both TL and DL exist
        targetRole = "team_lead";
        routingNote = `Auto-routed to Team Lead: ${teamLead!.name} and Department Lead: ${deptLead!.name}.`;
      }

      trackingLog.push(
        buildTrackingEntry("Ticket Raised", creator, primaryHandler, routingNote)
      );
    }

    if (!primaryHandler) {
      return NextResponse.json({ error: "No active support handler (Team Lead, Department Lead, or Admin) found to route this ticket." }, { status: 400 });
    }

    // 3. Insert ticket
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        creator_id,
        target_role: targetRole,
        assignee_id: primaryHandler.id,
        current_handler_id: primaryHandler.id,
        subject,
        description: description ?? "",
        category: "General",
        priority: priority ?? "medium",
        status: "open",
        linked_ticket_id: linked_ticket_id || null,
        attachments: attachments ?? [],
        tracking_log: trackingLog,
        rejection_reason: null,
      })
      .select(TICKET_SELECT)
      .single();

    if (error) throw error;

    return NextResponse.json({ ticket: data });
  } catch (err: any) {
    console.error("[POST /api/support]", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

// ─── PATCH — Update ticket (routing, status changes, rejection) ──────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ticket_id,
      actor_id,           // who is performing the action
      action,             // "update_status" | "route_to_dept" | "notify_dept_lead" | "assign_to_member" | "reject" | "mark_in_review"
      status,             // for "update_status"
      rejection_reason,   // for "reject"
      target_dept_name,   // for "route_to_dept" — name of target department
      target_assignee_id, // for "assign_to_member" — specific employee UUID
      note,               // for "notify_dept_lead" — note text
      resolution_notes,   // for closing
      resolved_by,        // for closing
    } = body;

    if (!ticket_id) {
      return NextResponse.json({ error: "ticket_id is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Fetch current ticket
    const { data: ticket, error: ticketErr } = await supabase
      .from("support_tickets")
      .select("*, creator:employees!support_tickets_creator_id_fkey(id, name, role, department, team_id, is_team_lead, is_dept_lead)")
      .eq("id", ticket_id)
      .single();

    if (ticketErr || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Fetch actor's profile if provided
    let actor: any = null;
    if (actor_id) {
      const { data: actorData } = await supabase
        .from("employees")
        .select("id, name, role, department, team_id, is_team_lead, is_dept_lead")
        .eq("id", actor_id)
        .single();
      actor = actorData;
    }

    const currentLog: any[] = Array.isArray(ticket.tracking_log) ? ticket.tracking_log : [];
    let updateData: any = {};

    // ── ACTION ROUTER ─────────────────────────────────────────────────────────

    if (action === "reject") {
      // Anyone in chain can reject with a mandatory reason
      if (!rejection_reason?.trim()) {
        return NextResponse.json({ error: "rejection_reason is required when rejecting a ticket" }, { status: 400 });
      }
      const logEntry = buildTrackingEntry("Rejected", actor, null, rejection_reason);
      updateData = {
        status: "rejected",
        rejection_reason,
        tracking_log: [...currentLog, logEntry],
      };
    }

    else if (action === "mark_in_review") {
      // Resolver marks ticket as in_review before they can close it
      if (ticket.status !== "open") {
        return NextResponse.json({ error: "Ticket must be 'open' to mark as in review" }, { status: 400 });
      }
      const logEntry = buildTrackingEntry("Marked In Review", actor, null, "Handler confirmed review has started.");
      updateData = {
        status: "in_review",
        tracking_log: [...currentLog, logEntry],
      };
    }

    else if (action === "update_status") {
      if (!status) {
        return NextResponse.json({ error: "status is required for update_status action" }, { status: 400 });
      }
      // Enforce in_review before closing
      if (status === "closed" && ticket.status !== "in_review") {
        return NextResponse.json({ error: "Ticket must be in 'in_review' status before it can be closed." }, { status: 400 });
      }
      const logEntry = buildTrackingEntry(`Status → ${status}`, actor, null, resolution_notes);
      updateData = {
        status,
        tracking_log: [...currentLog, logEntry],
      };
      if (status === "closed") {
        updateData.resolution_notes = resolution_notes ?? null;
        updateData.resolved_by = resolved_by ?? null;
        updateData.resolved_at = new Date().toISOString();
      }
    }

    else if (action === "route_to_dept") {
      // Route ticket to another department's Dept Lead
      // Team Leads and Dept Leads can do this
      if (!target_dept_name) {
        return NextResponse.json({ error: "target_dept_name is required for route_to_dept" }, { status: 400 });
      }
      const targetDL = await findDeptLead(supabase, target_dept_name);
      if (!targetDL) {
        return NextResponse.json({ error: `No active Department Lead found for department: ${target_dept_name}` }, { status: 404 });
      }
      const logEntry = buildTrackingEntry("Routed to Department", actor, targetDL, `Ticket forwarded to ${target_dept_name} department.`);
      updateData = {
        assignee_id: targetDL.id,
        current_handler_id: targetDL.id,
        tracking_log: [...currentLog, logEntry],
      };
    }

    else if (action === "assign_to_member") {
      // Dept Lead can assign to any team member; TL cannot use this for same-dept teams
      if (!target_assignee_id) {
        return NextResponse.json({ error: "target_assignee_id is required for assign_to_member" }, { status: 400 });
      }
      const { data: targetEmployee } = await supabase
        .from("employees")
        .select("id, name, role, department, is_team_lead, is_dept_lead")
        .eq("id", target_assignee_id)
        .single();
      
      if (!targetEmployee) {
        return NextResponse.json({ error: "Target employee not found" }, { status: 404 });
      }
      const logEntry = buildTrackingEntry("Assigned to Member", actor, targetEmployee, note);
      updateData = {
        assignee_id: targetEmployee.id,
        current_handler_id: targetEmployee.id,
        tracking_log: [...currentLog, logEntry],
      };
    }

    else if (action === "notify_dept_lead") {
      // Team Lead sends a note to their Dept Lead to request re-routing to another team in same dept
      if (!actor) {
        return NextResponse.json({ error: "actor_id is required for notify_dept_lead" }, { status: 400 });
      }
      const deptLead = await findDeptLead(supabase, actor.department, actor.id);
      if (!deptLead) {
        return NextResponse.json({ error: "No Department Lead found for your department" }, { status: 404 });
      }
      const logEntry = buildTrackingEntry(
        "Team Lead Notified Dept Lead",
        actor,
        deptLead,
        note || "Team Lead requests Department Lead to review and re-route this ticket."
      );
      // Route to dept lead so they can action it
      updateData = {
        assignee_id: deptLead.id,
        current_handler_id: deptLead.id,
        tracking_log: [...currentLog, logEntry],
      };
    }

    else {
      // Legacy / fallback: direct field updates (for admin overrides)
      if (status) updateData.status = status;
      if (body.assignee_id) {
        updateData.assignee_id = body.assignee_id;
        updateData.current_handler_id = body.assignee_id;
      }
      if (body.target_role) updateData.target_role = body.target_role;
      if (resolution_notes !== undefined) updateData.resolution_notes = resolution_notes;
      if (resolved_by) {
        updateData.resolved_by = resolved_by;
        updateData.resolved_at = new Date().toISOString();
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid update fields provided" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("support_tickets")
      .update(updateData)
      .eq("id", ticket_id)
      .select(TICKET_SELECT)
      .single();

    if (error) throw error;

    return NextResponse.json({ ticket: data });
  } catch (err: any) {
    console.error("[PATCH /api/support]", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
