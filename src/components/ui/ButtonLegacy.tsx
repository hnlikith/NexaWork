/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
 variant?: "primary" | "secondary" | "outline" | "danger" | "ghost" | "success";
 size?: "xs" | "sm" | "md" | "lg";
 loading?: boolean;
}

const variants: Record<string, string> = {
 primary: "bg-theme-primary text-theme-surface hover:opacity-90 shadow-sm border border-theme-primary",
 secondary: "bg-theme-raised text-theme-fg border border-theme-border hover:bg-theme-overlay",
 outline: "bg-transparent text-theme-muted border border-theme-border hover:bg-theme-raised hover:text-theme-fg",
 danger: "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20",
 ghost: "bg-transparent text-theme-muted hover:bg-theme-raised hover:text-theme-fg",
 success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
};

const sizes: Record<string, string> = {
 xs: "px-2 py-1 text-[10px] font-semibold tracking-wide rounded-md",
 sm: "px-3 py-1.5 text-xs font-semibold tracking-wide rounded-lg",
 md: "px-4 py-2 text-xs font-semibold tracking-wide rounded-lg",
 lg: "px-6 py-3 text-sm font-semibold tracking-wide rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
 ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
 return (
 <button
 ref={ref}
 disabled={disabled || loading}
 className={cn(
 "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
 variants[variant],
 sizes[size],
 className
 )}
 {...props}
 >
 {loading && (
 <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
 )}
 {children}
 </button>
 );
 }
);
Button.displayName = "Button";
