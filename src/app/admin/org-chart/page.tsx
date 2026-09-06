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
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
    node.type === "root"     ? "HQ Root"    :
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
export default function OrgChartPage() {
  const [orgData, setOrgData]     = useState<OrgNode | null>(null);
  const [loading, setLoading]     = useState(true);
  const [expandedIds, setExpanded] = useState<Set<string>>(new Set(["root_node"]));
  const [zoom, setZoom]           = useState(0.75);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const drag       = useRef({ x: 0, y: 0, sl: 0, st: 0 });

  // ── Fetch data ───────────────────────────────────────────────
  async function hydrateChart() {
    try {
      setLoading(true);
      const [{ data: config }, { data: teamsData }, { data: employeesData }] = await Promise.all([
        supabase.from("system_config").select("*").limit(1).single(),
        supabase.from("teams").select("*"),
        supabase.from("employees").select(
          "id, name, employee_id, designation, matrix_role, team_id, department, role",
        ),
      ]);

      const teams     = teamsData     || [];
      const employees = employeesData || [];

      const buildTree = (parentId: string | null): OrgNode[] =>
        teams
          .filter((t: any) => t.parent_id === parentId && t.type !== "company")
          .map((t: any) => {
            const leadEmp = employees.find((e: any) => e.id === t.lead_id)
                         || employees.find((e: any) => e.team_id === t.id && (e.is_team_lead || e.is_dept_lead));
            const teamEmps = employees
              .filter((e: any) => (e.team_id === t.id || (t.type === "department" && e.department === t.name && !e.team_id)) && (!leadEmp || e.id !== leadEmp.id))
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
              role: leadEmp ? leadEmp.designation : (t.head_designation || (t.type === "department" ? "Dept Head" : "Team Lead")),
              access_level: leadEmp ? leadEmp.role : undefined,
              matrix_role: leadEmp ? leadEmp.matrix_role : undefined,
              type: t.type === "department" ? ("dept" as const) : ("team" as const),
              children: [...teamEmps, ...buildTree(t.id)],
            };
          });

      const companyNode = teams.find((t: any) => t.type === "company");
      const root: OrgNode = {
        id:   "root_node",
        name: config?.company_name || companyNode?.name || "NexaWork HQ",
        candidate_name: config?.founder_name || "CEO",
        role: config?.founder_designation || "Chief Executive Officer",
        access_level: "admin",
        matrix_role: "Global Leader",
        type: "root",
        children: buildTree(companyNode?.id ?? null),
      };

      setOrgData(root);
    } catch (err) {
      console.error("OrgChart:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    hydrateChart();
    const sub = supabase
      .channel("org-chart-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" },       hydrateChart)
      .on("postgres_changes", { event: "*", schema: "public", table: "system_config" }, hydrateChart)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

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
  function collapseAll() { setExpanded(new Set(["root_node"])); }

  /** Center the scroll viewport on the middle of the chart canvas */
  function centerScroll() {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollLeft = Math.max(0, (canvasW * zoom - el.clientWidth) / 2);
    el.scrollTop = 0;
  }

  /** Auto-fit: compute zoom that makes the whole chart fit in the canvas */
  function fitToScreen() {
    if (!scrollRef.current || !orgData) return;
    const el = scrollRef.current;
    const pad = 40;
    const zw = (el.clientWidth - pad * 2) / canvasW;
    const zh = (el.clientHeight - pad * 2) / canvasH;
    const next = Math.max(0.15, Math.min(1.2, Math.min(zw, zh)));
    setZoom(+next.toFixed(2));
    // Re-center after the next paint when canvasW * zoom updates
    setTimeout(() => centerScroll(), 50);
  }

  function reset() {
    setZoom(0.75);
    collapseAll();
    setTimeout(() => centerScroll(), 50);
  }

  // Auto-center the chart on first data load only — don't fight the user's pan after that
  const hasCenteredRef = useRef(false);
  useEffect(() => {
    if (!orgData || hasCenteredRef.current) return;
    const t = setTimeout(() => { centerScroll(); hasCenteredRef.current = true; }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgData]);

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
      moduleKey="org_chart"
      title="Org Chart"
      subtitle="Live enterprise hierarchy mapped from your database."
    >
      {/* ── Canvas container with floating overlays ── */}
      <div className="relative w-full max-w-full overflow-hidden rounded-lg border border-border bg-background">
      <div
        ref={scrollRef}
        onMouseDown={onMouseDown}
        onMouseLeave={onMouseUp}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        onWheel={onWheel}
        className="relative h-[calc(100dvh-10rem)] w-full max-w-full overflow-auto"
        style={{
          cursor: "grab",
          backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {loading && !orgData ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-xs font-medium text-muted-foreground">Loading chart…</p>
            </div>
          </div>
        ) : orgData ? (
          /**
           * The inner div is at NATURAL size (canvasW × canvasH).
           * CSS transform scales it visually without changing scroll extents.
           * origin="top left" so zoom anchors to the top-left corner.
           */
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
              <ShieldCheck size={40} className="mx-auto text-muted-foreground opacity-30" />
              <p className="text-sm font-semibold text-muted-foreground">No organizational data found</p>
              <p className="text-xs text-muted-foreground">
                Create departments and teams to see them here.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating Top-Right Toolbar ── */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5">
        <div className="pointer-events-auto flex items-center rounded-md border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur">
          <Button variant="ghost" size="sm" onClick={collapseAll} title="Collapse all" className="h-7 px-2 text-xs">
            <Minus className="size-3" /> Collapse
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <Button variant="ghost" size="sm" onClick={expandAll} title="Expand all" className="h-7 px-2 text-xs">
            <Plus className="size-3" /> Expand
          </Button>
        </div>

        <div className="pointer-events-auto flex items-center rounded-md border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur">
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(0.15, +(z - 0.1).toFixed(2)))} className="h-7 w-7" title="Zoom out">
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="flex min-w-[42px] items-center justify-center text-xs font-medium text-muted-foreground tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))} className="h-7 w-7" title="Zoom in">
            <ZoomIn className="size-3.5" />
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={fitToScreen} className="pointer-events-auto h-8 bg-background/90 shadow-sm backdrop-blur" title="Fit chart to screen">
          <Maximize2 /> Fit
        </Button>
        <Button variant="outline" size="sm" onClick={reset} className="pointer-events-auto h-8 bg-background/90 shadow-sm backdrop-blur" title="Reset view">
          Reset
        </Button>
      </div>

      {/* ── Floating Bottom-Left Legend ── */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-md border border-border bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur">
        {[
          { Icon: Crown,     label: "HQ Root",       dark: true  },
          { Icon: Building2, label: "Department",     dark: false },
          { Icon: Users,     label: "Team",           dark: false },
        ].map(({ Icon, label, dark }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={cn(
              "flex h-4 w-4 items-center justify-center rounded",
              dark ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
            )}>
              <Icon size={9} />
            </div>
            <span className="text-[11px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Floating Bottom-Right Hint ── */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 hidden md:block rounded-md border border-border bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur">
        <span className="text-[11px] text-muted-foreground">
          Click node · Drag to pan · ⌘+scroll to zoom
        </span>
      </div>
      </div>
    </DashboardShell>
  );
}
