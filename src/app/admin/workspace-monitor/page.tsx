"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Activity, Users, Radio, Coffee, Video, MonitorSmartphone, RefreshCw, Loader2, Circle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspaceFeed } from "@/lib/use-workspace-feed";
import {
  relTime, roleClass, prettyRole, screenLabel, presenceStatus, sectionForAction,
} from "@/lib/log-ui";

export default function WorkspaceMonitorPage() {
  const { logs, presence, serverNow, loading, refreshing, refresh } = useWorkspaceFeed(120);

  const people = useMemo(() => {
    return presence
      .map((p) => ({ p, st: presenceStatus(p, serverNow) }))
      .filter(({ st }) => st.key !== "offline")
      .sort((a, b) => new Date(b.p.last_seen).getTime() - new Date(a.p.last_seen).getTime());
  }, [presence, serverNow]);

  const counts = useMemo(() => {
    const c = { online: 0, meeting: 0, idle: 0 };
    for (const { st } of people) {
      if (st.key === "online") c.online++;
      else if (st.key === "meeting") c.meeting++;
      else if (st.key === "idle") c.idle++;
    }
    return c;
  }, [people]);

  const feed = logs.slice(0, 40);

  const health = [
    { label: "Active now", value: counts.online, icon: <Radio size={15} />, tone: "text-emerald-500" },
    { label: "In meetings", value: counts.meeting, icon: <Video size={15} />, tone: "text-violet-500" },
    { label: "Idle", value: counts.idle, icon: <Coffee size={15} />, tone: "text-amber-500" },
    { label: "People on now", value: people.length, icon: <Users size={15} />, tone: "text-primary" },
  ];

  return (
    <DashboardShell
      moduleKey="workspace_monitor"
      title="Workspace Monitor"
      subtitle="Who is working right now — live presence, status and activity across the whole workspace"
    >
      <div className="flex flex-col gap-4">
        {/* Health strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {health.map((h) => (
            <Card key={h.label}>
              <CardContent className="p-4">
                <div className={cn("mb-2", h.tone)}>{h.icon}</div>
                <p className="text-2xl font-bold text-foreground tabular-nums leading-none">{h.value}</p>
                <p className="text-[11px] text-muted-foreground mt-1.5">{h.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Live people */}
          <div className="lg:col-span-7 xl:col-span-8">
            <Card className="h-full">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MonitorSmartphone size={15} className="text-primary" />
                    <span className="text-sm font-semibold text-foreground">Live employees</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{people.length} on now</Badge>
                    <Button variant="outline" size="sm" className="h-8" onClick={refresh} disabled={refreshing}>
                      <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Syncing…" : "Refresh"}
                    </Button>
                  </div>
                </div>
                {loading ? (
                  <div className="py-16 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto" size={20} /></div>
                ) : people.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-16 text-center">No one is active in the workspace right now.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {people.map(({ p, st }) => (
                      <div key={p.user_id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                        <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", st.dot)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {p.emp?.name || "Unknown"}
                            {p.emp?.employee_id && <span className="text-muted-foreground font-normal"> · {p.emp.employee_id}</span>}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {screenLabel(p.current_path)} · {st.key === "online" ? "active now" : relTime(p.last_seen, serverNow)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={cn("text-[9px]", st.badge)}>{st.label}</Badge>
                          {p.emp?.role && <Badge variant="outline" className={cn("text-[9px] capitalize", roleClass(p.emp.role))}>{prettyRole(p.emp.role)}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Activity feed */}
          <div className="lg:col-span-5 xl:col-span-4">
            <Card className="h-full">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Live activity feed</span>
                </div>
                <div className="space-y-0.5 max-h-[62vh] overflow-y-auto -mx-1 px-1">
                  {loading ? (
                    <div className="py-16 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto" size={18} /></div>
                  ) : feed.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-16 text-center">Nothing has happened yet.</p>
                  ) : (
                    feed.map((l) => (
                      <div key={l.id} className="flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-muted/40">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-foreground leading-snug">
                            <span className="font-semibold">{l.actor_name || "System"}</span> {l.summary || l.action}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {sectionForAction(l.action, l.section)} · {relTime(l.created_at, serverNow)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Circle size={7} className="fill-emerald-500 text-emerald-500" /> Live — presence refreshes every 30s per user. Full history lives in the <span className="font-medium text-foreground">Master Log Sheet</span>.
        </p>
      </div>
    </DashboardShell>
  );
}
