"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { cn } from "@/lib/utils";
import { Activity, Target, Zap, ArrowUp, ArrowDown, History, Info } from "lucide-react";

/**
 * Enterprise Center Gauge (Company Performance)
 */
export function RadialGauge({ value, label, subLabel, size = 180 }: { value: number; label: string; subLabel?: string; size?: number }) {
 const radius = 70;
 const circumference = 2 * Math.PI * radius;
 const offset = circumference - (value / 100) * circumference;

 return (
 <div className="flex flex-col items-center justify-center w-full">
 <div className="relative group" style={{ width: size, height: size }}>
 <svg className="h-full w-full -rotate-90">
 <circle cx="50%" cy="50%" r={radius} fill="transparent" stroke="#f1f5f9" strokeWidth="10" />
 <circle 
 cx="50%" cy="50%" r={radius} 
 fill="transparent" 
 stroke="#0f172a" 
 strokeWidth="10" 
 strokeDasharray={circumference} 
 strokeDashoffset={offset}
 strokeLinecap="round"
 className="transition-all duration-[1000ms] ease-in-out"
 />
 </svg>
 <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
 <span className="text-4xl font-[800] text-theme-fg tracking-tighter tabular-nums leading-none">{value}%</span>
 <span className="text-[9px] font-extrabold text-theme-muted uppercase tracking-widest mt-1">Live Score</span>
 </div>
 </div>
 <div className="mt-4 text-center">
 <p className="text-[11px] font-[800] text-theme-fg uppercase tracking-[0.2em]">{label}</p>
 <p className="text-[9px] font-semibold text-theme-subtle uppercase tracking-widest leading-none mt-1">{subLabel}</p>
 </div>
 </div>
 );
}

/**
 * Premium Arch Gauge (Replacing Pie/Donut)
 * High-legibility Speedometer style for targets
 */
interface MetricBarProps {
 label: string;
 value: number;
 target?: number;
 trend?: "up" | "down";
}

export function MetricBar({ label, value, target = 100, trend = "up" }: MetricBarProps) {
 // SVG Arc calculation for semi-circle
 const radius = 60;
 const circumference = Math.PI * radius; // Half circle
 const offset = circumference - (value / 100) * circumference;

 return (
 <div className="flex-1 bg-theme-surface border border-theme-border p-6 rounded-2xl hover:border-theme-strong transition-all group flex flex-col items-center text-center relative overflow-hidden">
 {/* Background Decorative Element */}
 <div className="absolute top-0 right-0 w-16 h-16 bg-theme-raised rounded-bl-full -z-0 opacity-50" />
 
 <div className="w-full flex justify-between items-start mb-6 z-10">
 <span className="text-[10px] font-[800] text-theme-fg uppercase tracking-[0.1em]">{label}</span>
 <Target size={14} className="text-theme-border group-hover:text-theme-fg transition-colors" />
 </div>

 {/* Semi-Circular Arch Indicator */}
 <div className="relative h-28 w-44 flex items-end justify-center mb-4 z-10">
 <svg className="h-44 w-44 absolute -top-8" viewBox="0 0 160 160">
 <path
 d="M 20 80 A 60 60 0 0 1 140 80"
 fill="none"
 stroke="#f8fafc"
 strokeWidth="12"
 strokeLinecap="round"
 />
 <path
 d="M 20 80 A 60 60 0 0 1 140 80"
 fill="none"
 stroke="#0f172a"
 strokeWidth="12"
 strokeDasharray={circumference}
 strokeDashoffset={offset}
 strokeLinecap="round"
 className="transition-all duration-[1200ms] ease-out"
 />
 </svg>
 <div className="flex flex-col items-center pb-2">
 <div className="flex items-baseline gap-1">
 <span className="text-3xl font-[900] text-theme-fg tabular-nums">{value}%</span>
 </div>
 <div className={cn(
 "flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded bg-theme-surface shadow-sm border border-theme-border",
 trend === "up" ? "text-emerald-600" : "text-rose-600"
 )}>
 {trend === "up" ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
 <span>2.4%</span>
 </div>
 </div>
 </div>

 <div className="w-full space-y-4 z-10">
 <div className="flex justify-between items-center text-[10px] font-[800] text-theme-subtle uppercase tracking-widest italic">
 <span>0%</span>
 <span className="text-theme-fg">GOAL: {target}%</span>
 <span>100%</span>
 </div>
 
 <div className="pt-4 border-t border-theme-border flex items-center justify-between w-full">
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
 <span className="text-[9px] font-bold text-theme-muted uppercase tracking-tight">Active Stream</span>
 </div>
 <span className="text-[9px] font-extrabold text-theme-fg uppercase tracking-tighter">Live Monitor</span>
 </div>
 </div>
 </div>
 );
}
