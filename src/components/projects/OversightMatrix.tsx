"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { cn } from "@/lib/utils";
import { ShieldCheck, Target, Zap, Activity } from "lucide-react";

interface OversightMatrixProps {
    project: any;
    className?: string;
}

export function OversightMatrix({ project, className }: OversightMatrixProps) {
    const tiers = [
        {
            label: "Admin",
            sublabel: "Project Owner",
            value: project.progress || 0,
            icon: ShieldCheck,
            gradient: "from-purple-500 to-indigo-600",
            status: project.is_active ? "Active" : "Archived",
            statusColor: project.is_active
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-rose-500/10 text-rose-600",
        },
        {
            label: "Manager",
            sublabel: "Department Head",
            value: project.workflow_status === "initialized" ? 0 : 100,
            icon: Target,
            gradient: "from-sky-500 to-blue-500",
            status: project.workflow_status === "delegated" ? "Delegated" : "Initialized",
            statusColor:
                project.workflow_status === "delegated"
                    ? "bg-sky-500/10 text-sky-600"
                    : "bg-amber-500/10 text-amber-600",
        },
        {
            label: "Team Lead",
            sublabel: "Team Leaders",
            value:
                project.tasks?.total > 0
                    ? Math.round((project.tasks.completed / project.tasks.total) * 100)
                    : 0,
            icon: Zap,
            gradient: "from-emerald-500 to-teal-600",
            status: project.teamIds?.length > 0 ? "Assigned" : "Pending",
            statusColor:
                project.teamIds?.length > 0
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-amber-500/10 text-amber-600",
        },
        {
            label: "Employee",
            sublabel: "Working Members",
            value:
                project.tasks?.operational_total > 0
                    ? Math.round(
                          (project.tasks.operational_completed /
                              project.tasks.operational_total) *
                              100
                      )
                    : 0,
            icon: Activity,
            gradient: "from-amber-500 to-orange-600",
            status: "In Progress",
            statusColor: "bg-amber-500/10 text-amber-600",
        },
    ];

    return (
        <div className={cn("space-y-3", className)}>
            {tiers.map((tier, idx) => {
                const Icon = tier.icon;
                return (
                    <div
                        key={idx}
                        className="rounded-2xl border border-theme-border bg-theme-surface p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div
                                    className={cn(
                                        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
                                        tier.gradient
                                    )}
                                >
                                    <Icon size={18} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-theme-fg leading-tight">
                                        {tier.label}
                                    </p>
                                    <p className="text-xs text-theme-muted">{tier.sublabel}</p>
                                </div>
                            </div>
                            <span
                                className={cn(
                                    "rounded-lg px-2.5 py-1 text-[11px] font-semibold flex-shrink-0",
                                    tier.statusColor
                                )}
                            >
                                {tier.status}
                            </span>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-theme-muted">
                                <span>Progress</span>
                                <span className="font-bold text-theme-fg">{tier.value}%</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-theme-raised">
                                <div
                                    className={cn(
                                        "h-full rounded-full bg-gradient-to-r transition-all duration-700",
                                        tier.gradient
                                    )}
                                    style={{ width: `${tier.value}%` }}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
