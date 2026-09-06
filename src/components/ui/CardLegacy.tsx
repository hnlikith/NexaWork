/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { cn } from "@/lib/utils";

interface CardProps {
 children: React.ReactNode;
 className?: string;
 title?: string;
 subtitle?: string;
}

export function Card({ children, className, title, subtitle }: CardProps) {
 return (
 <div className={cn("enterprise-card", className)}>
 {(title || subtitle) && (
 <div className="border-b border-theme-border px-6 py-4 bg-theme-raised/50">
 {title && <h3 className="text-[10px] font-black text-theme-fg uppercase tracking-[0.2em] leading-none mb-1">{title}</h3>}
 {subtitle && <p className="text-[9px] font-medium text-theme-muted uppercase tracking-widest">{subtitle}</p>}
 </div>
 )}
 <div className="p-6">{children}</div>
 </div>
 );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
 return (
 <div className={cn("border-b border-theme-border px-6 py-4 bg-theme-raised/50", className)}>
 {children}
 </div>
 );
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
 return (
 <h3 className={cn("text-[10px] font-black text-theme-fg uppercase tracking-[0.2em]", className)}>
 {children}
 </h3>
 );
}
