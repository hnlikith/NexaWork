/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "purple" | "secondary" | "indigo";

interface BadgeProps {
 variant?: BadgeVariant;
 children: React.ReactNode;
 className?: string;
 style?: React.CSSProperties;
}

const variants: Record<BadgeVariant, string> = {
 default: "bg-theme-raised text-theme-muted",
 success: "bg-theme-success-bg text-theme-success-fg",
 warning: "bg-theme-warning-bg text-theme-warning-fg",
 danger: "bg-theme-danger-bg text-theme-danger-fg",
 info: "bg-theme-info-bg text-theme-info-fg",
 purple: "bg-theme-purple-bg text-theme-purple-fg",
 secondary: "bg-theme-raised/50 text-theme-muted border border-theme-border",
 indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20",
};

export function Badge({ variant = "default", children, className, style }: BadgeProps) {
 return (
 <span
 className={cn(
 "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
 variants[variant],
 className
 )}
 style={style}
 >
 {children}
 </span>
 );
}

export function statusBadgeVariant(status: string): BadgeVariant {
 switch (status?.toLowerCase()) {
 case "approved": case "paid": case "present": case "claimable": case "active": case "processed": return "success";
 case "pending": case "locked": case "draft": case "expiring_soon": return "warning";
 case "rejected": case "absent": case "cancelled": case "overdue": case "inactive": return "danger";
 case "queued": case "held": case "purple": return "purple";
 case "pto": case "sent": case "info": return "info";
 default: return "default";
 }
}
