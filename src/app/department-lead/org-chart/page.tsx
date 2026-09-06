"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { supabase } from "@/lib/supabase";
import {
  Building2, Crown, Users, ShieldCheck,
  ZoomIn, ZoomOut, Maximize2, ChevronDown, ChevronRight,
  Minus, Plus,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/ButtonLegacy";
import { useAuth } from "@/components/layout/AuthProvider";

interface OrgNode {
  id: string;
  name: string;
  role: string;
  type: "root" | "dept" | "team" | "employee";
  employee_id?: string;
  matrix_role?: string;
  access_level?: string;
  candidate_name?: string;
  children?: OrgNode[];
}

function collectIds(node: OrgNode): string[] {
  return [node.id, ...(node.children?.flatMap(collectIds) ?? [])];
}

// ── Layout constants ──────────────────────────────────────────
const NW   = 220;  // node card width  (px, natural)
const NH   = 140;  // node card height (px, approximate)
const HGAP = 40;   // min horizontal gap between sibling subtrees
const VGAP = 64;   // vertical gap between parent bottom and child top
const PAD  = 72;   // canvas edge padding

const ROLE_LABEL: Record<string, string> = {
  employee: "Employee",
  hr: "HR",
  accounts: "Accounts",
  admin: "Admin",
  intern: "Intern",
  dept_lead: "Department Lead",
  team_lead: "Team Lead",
  sales: "Sales",
};

// ── Compute the horizontal space needed for a subtree ─────────
function stW(node: OrgNode, exp: Set<string>): number {
  const kids = exp.has(node.id) && node.children?.length ? node.children : [];
  if (!kids.length) return NW;
  const total = kids.reduce((s, c) => s + stW(c, exp), 0) + HGAP * (kids.length - 1);
  return Math.max(NW, total);
}

// ── Place every visible node at an absolute position ─────────
type NodePos = { x: number; y: number; node: OrgNode };

function place(
  node: OrgNode,
  exp: Set<string>,
  leftX: number,
  y: number,
  out: Map<string, NodePos>,
) {
  const w = stW(node, exp);
  // Centre this node within its allocated subtree width
  out.set(node.id, { x: leftX + (w - NW) / 2, y, node });

  const kids = exp.has(node.id) && node.children?.length ? node.children : [];
  if (!kids.length) return;

  const totalKW =
    kids.reduce((s, c) => s + stW(c, exp), 0) + HGAP * (kids.length - 1);
  let cx = leftX + (w - totalKW) / 2;

  for (const k of kids) {
    place(k, exp, cx, y + NH + VGAP, out);
    cx += stW(k, exp) + HGAP;
  }
}

// ── NodeCard (identical visual design) ───────────────────────
function NodeCard({
  node, isExpanded, hasChildren, onToggle, isRoot = false,
}: {
  node: OrgNode;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  isRoot?: boolean;
}) {
  const typeLabel =
    node.type === "root"     ? "Dept Root"  :
    node.type === "dept"     ? "Department" :
    node.type === "employee" ? "Employee"   :
    hasChildren              ? "Lead Team"  : "Sub-Team";

  return (
    <div
      onClick={hasChildren ? onToggle : undefined}
      className={cn(
        "relative flex w-full flex-col rounded-2xl border px-4 py-3 transition-all duration-200 select-none",
        hasChildren ? "cursor-pointer" : "cursor-default",
        isRoot
          ? "bg-[hsl(222,47%,11%)] border-[hsl(222,47%,18%)] shadow-xl"
          : isExpanded && hasChildren
          ? "bg-theme-surface border-[hsl(var(--border-strong))] shadow-md ring-1 ring-[hsl(var(--border-strong))/0.4]"
          : "bg-theme-surface border-theme-border shadow-sm hover:border-[hsl(var(--border-strong))] hover:shadow-md"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className={cn(
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg",
          isRoot ? "bg-white/10 text-white/80" : "bg-theme-raised text-theme-muted",
        )}>
          {node.type === "root"     && <Crown      size={13} />}
          {node.type === "dept"     && <Building2  size={13} />}
          {node.type === "team"     && <Users       size={13} />}
          {node.type === "employee" && <ShieldCheck size={13} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-[9px] font-semibold uppercase tracking-widest leading-none mb-0.5",
            isRoot ? "text-white/40" : "text-theme-subtle",
          )}>
            {typeLabel}
          </p>
          <p className={cn(
            "text-[13px] font-bold leading-snug truncate",
            isRoot ? "text-white" : "text-theme-fg",
          )}>
            {node.name}
          </p>
          {node.candidate_name && (
            <p className={cn(
              "text-[10px] font-medium leading-none truncate mt-1 tracking-wide",
              isRoot ? "text-white/70" : "text-theme-muted",
            )}>
              {node.candidate_name}
            </p>
          )}
        </div>
        {hasChildren && (
          <div className={cn(
            "flex-shrink-0 transition-transform duration-200",
            isExpanded ? "rotate-90" : "",
            isRoot ? "text-white/30" : "text-theme-subtle",
          )}>
            <ChevronRight size={12} />
          </div>
        )}
      </div>

      {/* Details list */}
      <div className={cn(
        "rounded-lg px-2.5 py-1.5 flex flex-col gap-1",
        isRoot ? "bg-white/10" : "bg-theme-raised",
      )}>
        <div className="flex items-center justify-between text-[9px] uppercase tracking-wider">
          <span className={isRoot ? "text-white/50" : "text-theme-subtle"}>Designation</span>
          <span className={cn("font-bold truncate max-w-[100px] text-right", isRoot ? "text-white" : "text-theme-muted")}>{node.role || "N/A"}</span>
        </div>
        
        {(node.access_level || node.matrix_role || node.type === "employee" || node.type === "root") && (
          <div className="flex items-center justify-between text-[9px] uppercase tracking-wider">
            <span className={isRoot ? "text-white/50" : "text-theme-subtle"}>Matrix Role</span>
            <span className={cn("font-bold truncate max-w-[100px] text-right", isRoot ? "text-white" : "text-theme-primary/80")}>
              {node.access_level ? (ROLE_LABEL[node.access_level] || node.access_level.replace('_', ' ')) : (node.matrix_role || "N/A")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────
export default function ManagerOrgChartPage() {
  const { user } = useAuth();
  const [orgData, setOrgData]     = useState<OrgNode | null>(null);
  const [loading, setLoading]     = useState(true);
  const [expandedIds, setExpanded] = useState<Set<string>>(new Set());
  const [zoom, setZoom]           = useState(0.75);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const drag       = useRef({ x: 0, y: 0, sl: 0, st: 0 });

  // ── Fetch data ───────────────────────────────────────────────
  async function hydrateChart() {
    if (!user) return;
    try {
      setLoading(true);
      const [{ data: teamsData }, { data: employeesData }] = await Promise.all([
        supabase.from("teams").select("*"),
        supabase.from("employees").select(
          "id, name, employee_id, designation, matrix_role, team_id, department, role"
        ),
      ]);

      const teams = teamsData || [];
      const employees = employeesData || [];

      // Find user's department
      let dept = teams.find((t: any) => t.type === "department" && t.lead_id === user.id);
      if (!dept && user.department) {
        dept = teams.find((t: any) => t.type === "department" && t.name.toLowerCase() === user.department.toLowerCase());
      }

      if (dept) {
        const buildTree = (parentId: string): OrgNode[] => {
          return teams
            .filter((t: any) => t.parent_id === parentId)
            .map((t: any) => {
              const leadEmp = employees.find((e: any) => e.id === t.lead_id)
                || employees.find((e: any) => e.team_id === t.id && (e.is_team_lead || e.is_dept_lead));
              const teamEmps = employees
                .filter((e: any) => e.team_id === t.id && (!leadEmp || e.id !== leadEmp.id))
                .map((e: any) => ({
                  id: e.id, name: e.name, employee_id: e.employee_id,
                  role: e.designation, matrix_role: e.matrix_role,
                  access_level: e.role,
                  type: "employee" as const,
                }));
              return {
                id: t.id,
                name: t.name,
                candidate_name: leadEmp ? leadEmp.name : undefined,
                role: leadEmp ? leadEmp.designation : (t.head_designation || "Team Lead"),
                access_level: leadEmp ? leadEmp.role : undefined,
                matrix_role: leadEmp ? leadEmp.matrix_role : undefined,
                type: "team" as const,
                children: [...teamEmps, ...buildTree(t.id)],
              };
            });
        };

        const leadEmp = employees.find((e: any) => e.id === dept.lead_id) 
                     || employees.find((e: any) => e.id === user.id) 
                     || employees.find((e: any) => (e.department === dept.name || e.team_id === dept.id) && (e.role === 'admin' || e.is_dept_lead))
                     || (user as any);
        const deptEmps = employees
          .filter((e: any) => (e.team_id === dept.id || (e.department === dept.name && !e.team_id)) && (!leadEmp || e.id !== leadEmp.id))
          .map((e: any) => ({
            id: e.id, name: e.name, employee_id: e.employee_id,
            role: e.designation, matrix_role: e.matrix_role,
            access_level: e.role,
            type: "employee" as const,
          }));

        const root: OrgNode = {
          id: dept.id,
          name: dept.name,
          candidate_name: leadEmp.name,
          role: leadEmp.designation || dept.head_designation || "Department Lead",
          access_level: leadEmp.role,
          matrix_role: leadEmp.matrix_role || "Dept Lead",
          type: "root",
          children: [...deptEmps, ...buildTree(dept.id)],
        };

        setOrgData(root);
        const defaultExpanded = new Set<string>([dept.id]);
        root.children?.forEach(c => defaultExpanded.add(c.id));
        setExpanded(defaultExpanded);
      }
    } catch (err) {
      console.error("OrgChart:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    hydrateChart();
    const sub = supabase
      .channel("org-chart-live-dept")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" },       hydrateChart)
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, hydrateChart)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [user]);

  // ── Compute positions + SVG lines ────────────────────────────
  const { positions, canvasW, canvasH, lines } = useMemo(() => {
    if (!orgData) {
      return {
        positions: new Map<string, NodePos>(),
        canvasW: 800, canvasH: 400,
        lines: [] as { x1: number; y1: number; x2: number; y2: number }[],
      };
    }

    const positions = new Map<string, NodePos>();
    place(orgData, expandedIds, PAD, PAD, positions);

    let maxX = 0, maxY = 0;
    positions.forEach(({ x, y }) => {
      if (x + NW > maxX) maxX = x + NW;
      if (y + NH > maxY) maxY = y + NH;
    });

    // Build SVG connector lines by traversing the visible tree
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    function addLines(node: OrgNode) {
      const pp = positions.get(node.id);
      if (!pp) return;
      const kids = expandedIds.has(node.id) && node.children?.length ? node.children : [];
      for (const kid of kids) {
        const cp = positions.get(kid.id);
        if (cp) lines.push({ x1: pp.x + NW / 2, y1: pp.y + NH, x2: cp.x + NW / 2, y2: cp.y });
        addLines(kid);
      }
    }
    addLines(orgData);

    return { positions, canvasW: maxX + PAD, canvasH: maxY + PAD, lines };
  }, [orgData, expandedIds]);

  // ── Tree controls ────────────────────────────────────────────
  function toggleNode(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function expandAll()   { if (orgData) setExpanded(new Set(collectIds(orgData))); }
  function collapseAll() { if (orgData) setExpanded(new Set([orgData.id])); }
  function reset() {
    setZoom(0.75);
    collapseAll();
    if (scrollRef.current) { scrollRef.current.scrollLeft = 0; scrollRef.current.scrollTop = 0; }
  }

  // ── Pan handlers ─────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    isDragging.current = true;
    drag.current = {
      x: e.clientX, y: e.clientY,
      sl: scrollRef.current?.scrollLeft ?? 0,
      st: scrollRef.current?.scrollTop  ?? 0,
    };
    if (scrollRef.current) scrollRef.current.style.cursor = "grabbing";
  };
  const onMouseUp   = () => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
    scrollRef.current.scrollTop  = drag.current.st - (e.clientY - drag.current.y);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(p => Math.min(2, Math.max(0.15, p + (e.deltaY > 0 ? -0.08 : 0.08))));
    }
  };

  return (
    <DashboardShell
      moduleKey="manager_org_chart"
      title="Department Hierarchy"
      subtitle="Visual map of your department structure, teams, and personnel."
      actions={
        <div className="flex items-center gap-2">
          {/* Collapse / Expand */}
          <div className="flex rounded-lg border border-theme-border bg-theme-raised p-0.5 gap-0.5">
            <button
              onClick={collapseAll}
              title="Collapse all"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-theme-muted hover:bg-theme-page hover:text-theme-fg transition-colors"
            >
              <Minus size={12} /> Collapse
            </button>
            <button
              onClick={expandAll}
              title="Expand all"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-theme-muted hover:bg-theme-page hover:text-theme-fg transition-colors"
            >
              <Plus size={12} /> Expand All
            </button>
          </div>

          {/* Zoom */}
          <div className="flex rounded-lg border border-theme-border bg-theme-raised p-0.5 gap-0.5">
            <button
              onClick={() => setZoom(z => Math.max(0.15, +(z - 0.1).toFixed(2)))}
              className="p-1.5 rounded-md text-theme-muted hover:bg-theme-page hover:text-theme-fg transition-colors"
            >
              <ZoomOut size={14} />
            </button>
            <div className="flex min-w-[46px] items-center justify-center px-1 text-xs font-semibold text-theme-muted">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))}
              className="p-1.5 rounded-md text-theme-muted hover:bg-theme-page hover:text-theme-fg transition-colors"
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={reset}>
            <Maximize2 size={13} className="mr-1.5" /> Reset
          </Button>
        </div>
      }
    >
      {/* ── Canvas ── */}
      <div
        ref={scrollRef}
        onMouseDown={onMouseDown}
        onMouseLeave={onMouseUp}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        onWheel={onWheel}
        className="relative h-[76vh] w-full overflow-auto rounded-2xl border border-theme-border"
        style={{
          cursor: "grab",
          background: "hsl(var(--bg))",
          backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {loading && !orgData ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-theme-primary border-t-transparent" />
              <p className="text-xs font-semibold text-theme-muted">Loading chart…</p>
            </div>
          </div>
        ) : orgData ? (
          <div
            style={{
              width: canvasW,
              height: canvasH,
              position: "relative",
              margin: "0 auto",
              marginTop: "40px",
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              transition: "transform 0.12s ease",
            }}
          >
            {/* SVG connector lines — behind nodes */}
            <svg
              width={canvasW}
              height={canvasH}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              {lines.map((ln, i) => {
                const midY = (ln.y1 + ln.y2) / 2;
                return (
                  <path
                    key={i}
                    d={`M ${ln.x1} ${ln.y1} C ${ln.x1} ${midY}, ${ln.x2} ${midY}, ${ln.x2} ${ln.y2}`}
                    stroke="hsl(var(--border-strong))"
                    strokeWidth={1.5}
                    fill="none"
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>

            {/* Node cards — absolutely placed, guaranteed no overlap */}
            {Array.from(positions.entries()).map(([id, { x, y, node }]) => (
              <div
                key={id}
                data-node="1"
                style={{ position: "absolute", left: x, top: y, width: NW }}
              >
                <NodeCard
                  node={node}
                  isExpanded={expandedIds.has(id)}
                  hasChildren={!!(node.children?.length)}
                  onToggle={() => toggleNode(id)}
                  isRoot={node.type === "root"}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-2 text-center">
              <ShieldCheck size={40} className="mx-auto text-theme-subtle opacity-30" />
              <p className="text-sm font-semibold text-theme-muted">No organizational data found</p>
              <p className="text-xs text-theme-subtle">
                Create teams and add employees to see them here.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Legend + hint */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
        {[
          { Icon: Crown,     label: "Dept Root",      dark: true  },
          { Icon: Building2, label: "Department",      dark: false },
          { Icon: Users,     label: "Team / Sub-Team", dark: false },
        ].map(({ Icon, label, dark }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={cn(
              "flex h-5 w-5 items-center justify-center rounded-md",
              dark ? "bg-[hsl(222,47%,11%)] text-white" : "bg-theme-raised text-theme-muted",
            )}>
              <Icon size={10} />
            </div>
            <span className="text-[11px] text-theme-subtle">{label}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1 text-[11px] text-theme-subtle">
          <ChevronDown size={11} />
          Click node to expand · Drag to pan · Ctrl + scroll to zoom
        </div>
      </div>
    </DashboardShell>
  );
}
