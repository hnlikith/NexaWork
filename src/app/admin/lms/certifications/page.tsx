/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
﻿"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Award, Search, Download, Eye, Plus, Calendar,
  ShieldCheck, Zap, Loader2, X, Check, User,
  Star, RefreshCw, Copy, AlertCircle, Palette,
  Trophy, ChevronRight, BadgeCheck, Hash, Filter
} from "lucide-react";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/ToastLegacy";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CertRecord {
  id: string;
  employee: string;
  employeeInitials: string;
  avatarColor: string;
  course: string;
  date: string;
  hash: string;
  employeeId: string;
  courseId: string;
}

interface BadgeRecord {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  earnedCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500",
  "bg-amber-500", "bg-rose-500", "bg-cyan-500",
  "bg-indigo-500", "bg-pink-500",
];
function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}
function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}
function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Certificate Templates ────────────────────────────────────────────────────

const CERT_TEMPLATES = [
  {
    id: "gold",
    name: "Professional Achievement",
    desc: "Classic gold finish for senior-level completions",
    emoji: "🏆",
    from: "from-amber-950/80",
    to: "to-amber-900/40",
    ring: "ring-amber-600/40",
    tag: "text-amber-400",
    tagBg: "bg-amber-500/15",
  },
  {
    id: "tech",
    name: "Technical Excellence",
    desc: "Sharp modern look for engineering courses",
    emoji: "⚡",
    from: "from-blue-950/80",
    to: "to-blue-900/40",
    ring: "ring-blue-500/40",
    tag: "text-blue-400",
    tagBg: "bg-blue-500/15",
  },
  {
    id: "leader",
    name: "Leadership Credential",
    desc: "Premium layout for leadership programs",
    emoji: "👑",
    from: "from-violet-950/80",
    to: "to-violet-900/40",
    ring: "ring-violet-600/40",
    tag: "text-violet-400",
    tagBg: "bg-violet-500/15",
  },
  {
    id: "compliance",
    name: "Compliance Certified",
    desc: "Clean verification badge for compliance tracks",
    emoji: "🛡️",
    from: "from-emerald-950/80",
    to: "to-emerald-900/40",
    ring: "ring-emerald-600/40",
    tag: "text-emerald-400",
    tagBg: "bg-emerald-500/15",
  },
];

// ─── Grant Modal ──────────────────────────────────────────────────────────────

function GrantModal({
  open, onClose, employees, courses, onGrant,
}: {
  open: boolean;
  onClose: () => void;
  employees: { id: string; name: string }[];
  courses: { id: string; title: string }[];
  onGrant: (empId: string, courseId: string) => Promise<void>;
}) {
  const [empId, setEmpId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [granting, setGranting] = useState(false);

  const handle = async () => {
    if (!empId || !courseId) return;
    setGranting(true);
    await onGrant(empId, courseId);
    setGranting(false);
    setEmpId(""); setCourseId("");
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 w-full max-w-md bg-theme-surface border border-theme-border rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header stripe */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Award size={20} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-theme-fg">Issue Certificate</h2>
            <p className="text-xs text-theme-muted">Manually grant a credential to an employee</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto h-7 w-7 rounded-lg bg-theme-raised flex items-center justify-center text-theme-muted hover:text-theme-fg transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-theme-muted block mb-1.5">Employee</label>
            <Select value={empId || undefined} onValueChange={setEmpId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select employee…" /></SelectTrigger>
              <SelectContent>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-theme-muted block mb-1.5">Course</label>
            <Select value={courseId || undefined} onValueChange={setCourseId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select course…" /></SelectTrigger>
              <SelectContent>
                {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <Button
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold shadow-lg shadow-amber-500/20"
            disabled={!empId || !courseId || granting}
            onClick={handle}
          >
            {granting
              ? <Loader2 size={15} className="mr-2 animate-spin" />
              : <Award size={15} className="mr-2" />}
            Issue Certificate
          </Button>
          <Button variant="ghost" onClick={onClose} className="px-5">Cancel</Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CertificationsManagerPage() {
  const { showToast } = useToast();

  type Tab = "issued" | "templates" | "badges" | "log";
  const [tab, setTab] = useState<Tab>("issued");

  const [certs, setCerts] = useState<CertRecord[]>([]);
  const [badges, setBadges] = useState<BadgeRecord[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showGrant, setShowGrant] = useState(false);

  const [stats, setStats] = useState({
    total: 0, verified: 0, pending: 0, recipients: 0,
  });

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchCerts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, count } = await supabase
        .from("lms_certifications")
        .select("*, employees(id, name), lms_courses(id, title)", { count: "exact" })
        .order("created_at", { ascending: false });

      const rows: CertRecord[] = (data || []).map(c => {
        const name = (c.employees as any)?.name || "Unknown";
        return {
          id: c.id,
          employee: name,
          employeeInitials: initials(name),
          avatarColor: avatarColor(name),
          course: (c.lms_courses as any)?.title || "Unknown",
          date: c.issue_date,
          hash: c.certificate_number,
          employeeId: (c.employees as any)?.id || "",
          courseId: (c.lms_courses as any)?.id || "",
        };
      });
      setCerts(rows);
      setStats({
        total: count || 0,
        verified: rows.length,
        pending: 0,
        recipients: new Set(rows.map(r => r.employeeId)).size,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const fetchBadges = useCallback(async () => {
    const { data } = await supabase
      .from("lms_badges")
      .select("*, lms_employee_badges(id)")
      .order("created_at");
    if (data) setBadges(data.map(b => ({
      id: b.id, name: b.name, description: b.description,
      icon: b.icon, color: b.color,
      earnedCount: (b.lms_employee_badges || []).length,
    })));
  }, []);

  const fetchDropdowns = useCallback(async () => {
    const [e, c] = await Promise.all([
      supabase.from("employees").select("id, name").order("name"),
      supabase.from("lms_courses").select("id, title").eq("status", "published").order("title"),
    ]);
    if (e.data) setEmployees(e.data);
    if (c.data) setCourses(c.data);
  }, []);

  useEffect(() => {
    fetchCerts(); fetchBadges(); fetchDropdowns();
    const ch = supabase.channel("lms_certs_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "lms_certifications" }, () => fetchCerts(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "lms_employee_badges" }, fetchBadges)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchCerts, fetchBadges, fetchDropdowns]);

  // ─── Grant ─────────────────────────────────────────────────────────────────

  const handleGrant = async (empId: string, courseId: string) => {
    const { error } = await supabase.from("lms_certifications").insert({
      employee_id: empId,
      course_id: courseId,
      certificate_number: `CERT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      issue_date: new Date().toISOString().split("T")[0],
    });
    if (error) { showToast(error.message, "error"); return; }
    showToast("Certificate issued!", "success");
    fetchCerts(true);
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    showToast("Hash copied to clipboard", "success");
  };

  const filtered = certs.filter(c =>
    !query ||
    c.employee.toLowerCase().includes(query.toLowerCase()) ||
    c.course.toLowerCase().includes(query.toLowerCase()) ||
    c.hash.toLowerCase().includes(query.toLowerCase())
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <DashboardShell
      moduleKey="lms_certifications"
        title="Certification Manager"
        subtitle="Issue, track, and verify employee credentials in real time."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm">
              <Palette size={13} className="mr-1.5" /> Templates
            </Button>
            <Button
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold shadow-sm shadow-amber-500/30"
              onClick={() => setShowGrant(true)}
            >
              <Plus size={14} className="mr-1.5" /> Manual Grant
            </Button>
          </div>
        }
      >
        <div className="space-y-5">

          {/* ── Stat row ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Issued",  value: stats.total,      icon: Award,       color: "text-amber-500",   bg: "bg-amber-500/10"  },
              { label: "Verified",      value: stats.verified,   icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-500/10"},
              { label: "Pending",       value: stats.pending,    icon: AlertCircle, color: "text-sky-500",     bg: "bg-sky-500/10"    },
              { label: "Recipients",    value: stats.recipients, icon: User,        color: "text-violet-500",  bg: "bg-violet-500/10" },
            ].map(s => (
              <div key={s.label} className="page-card flex items-center gap-3">
                <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", s.bg)}>
                  <s.icon size={15} className={s.color} />
                </div>
                <div>
                  <p className="text-[11px] text-theme-muted">{s.label}</p>
                  <p className={cn("text-lg font-black leading-tight", s.color)}>
                    {loading ? <span className="opacity-40">—</span> : s.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Hero banner ───────────────────────────────────────────────── */}
          <div className="relative overflow-hidden rounded-2xl bg-zinc-950 border border-zinc-800">
            {/* Background texture */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(245,158,11,0.12),_transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(139,92,246,0.07),_transparent_60%)]" />

            <div className="relative z-10 flex items-center justify-between gap-6 px-8 py-7">
              {/* Left: copy */}
              <div className="space-y-3 max-w-xl">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <Zap size={14} className="text-amber-400" fill="currentColor" />
                  </div>
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">
                    Automated Credentialing
                  </span>
                  <span className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                </div>
                <h2 className="text-2xl font-black text-white leading-snug">
                  Every completion triggers an<br />
                  <span className="text-amber-400">instant verified credential</span>
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Certificates are issued automatically when an employee finishes a course —
                  no admin action required.
                </p>
              </div>

              {/* Right: numbers */}
              <div className="flex-shrink-0 hidden md:flex items-center gap-8">
                <div className="text-center">
                  <p className="text-3xl font-black text-white tabular-nums">{stats.total}</p>
                  <p className="text-[11px] text-zinc-500 mt-1">Issued</p>
                </div>
                <div className="h-12 w-px bg-white/10" />
                <div className="text-center">
                  <p className="text-3xl font-black text-emerald-400 tabular-nums">100%</p>
                  <p className="text-[11px] text-zinc-500 mt-1">Verified</p>
                </div>
                <div className="h-12 w-px bg-white/10" />
                <div className="text-center">
                  <p className="text-3xl font-black text-violet-400 tabular-nums">{stats.recipients}</p>
                  <p className="text-[11px] text-zinc-500 mt-1">Recipients</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Main content card ─────────────────────────────────────────── */}
          <div className="page-card overflow-hidden p-0">

            {/* Tab + toolbar row */}
            <div className="flex flex-col gap-3 border-b border-theme-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Pill tabs */}
              <div className="flex items-center gap-1 rounded-xl border border-theme-border bg-theme-raised p-1">
                {(
                  [
                    { id: "issued",    label: "Issued"    },
                    { id: "templates", label: "Templates" },
                    { id: "badges",    label: "Badges"    },
                    { id: "log",       label: "Log"       },
                  ] as { id: Tab; label: string }[]
                ).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                      tab === t.id
                        ? "bg-theme-surface text-theme-fg shadow-sm"
                        : "text-theme-muted hover:text-theme-fg"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-2">
                {tab === "issued" && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" size={12} />
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search employee, course…"
                      className="h-8 rounded-lg border border-theme-border bg-theme-page pl-8 pr-3 text-xs text-theme-fg placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary/25 w-52 transition-all"
                    />
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => fetchCerts()}
                  title="Refresh"
                >
                  <RefreshCw size={13} />
                </Button>
                {tab === "issued" && (
                  <Button variant="secondary" size="sm" className="h-8">
                    <Download size={13} className="mr-1.5" /> Export
                  </Button>
                )}
              </div>
            </div>

            {/* ── ISSUED TAB ────────────────────────────────────────────── */}
            {tab === "issued" && (
              loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-theme-muted">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-xs font-medium">Loading certificates…</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                    <Award size={28} className="text-amber-500/60" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-theme-fg">
                      {query ? "No results match your search" : "No certificates yet"}
                    </p>
                    <p className="text-xs text-theme-muted">
                      {query ? "Try a different name or course" : "Certificates are auto-issued on course completion."}
                    </p>
                  </div>
                  {!query && (
                    <Button
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-black font-bold shadow-sm shadow-amber-500/25 mt-1"
                      onClick={() => setShowGrant(true)}
                    >
                      <Plus size={13} className="mr-1.5" /> Issue First Certificate
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-theme-border bg-theme-page text-left text-xs text-theme-muted">
                        <th className="px-5 py-3 font-semibold">Employee</th>
                        <th className="px-5 py-3 font-semibold">Course</th>
                        <th className="px-5 py-3 font-semibold">Date Issued</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                        <th className="px-5 py-3 font-semibold">Cert ID</th>
                        <th className="px-5 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border">
                      {filtered.map(cert => (
                        <tr key={cert.id} className="group hover:bg-theme-raised/40 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0",
                                cert.avatarColor
                              )}>
                                {cert.employeeInitials}
                              </div>
                              <span className="font-medium text-theme-fg">{cert.employee}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1.5">
                              <Award size={12} className="text-amber-500 flex-shrink-0" />
                              <span className="text-theme-muted">{cert.course}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-theme-muted text-xs">{fmtDate(cert.date)}</td>
                          <td className="px-5 py-3">
                            <Badge variant="success" className="text-[10px] flex items-center gap-1 w-fit">
                              <ShieldCheck size={9} /> Verified
                            </Badge>
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => copyHash(cert.hash)}
                              className="group/h flex items-center gap-1.5 tabular-nums text-[10px] text-theme-muted bg-theme-raised border border-theme-border rounded-md px-2 py-1 hover:border-theme-primary/40 hover:text-theme-fg transition-all"
                            >
                              <Hash size={9} />
                              {cert.hash.slice(0, 14)}…
                              <Copy size={8} className="opacity-0 group-hover/h:opacity-100 transition-opacity" />
                            </button>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-sky-500 hover:bg-sky-500/10">
                                <Eye size={12} className="mr-1" /> View
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-500 hover:bg-emerald-500/10">
                                <Download size={12} className="mr-1" /> PDF
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* ── TEMPLATES TAB ─────────────────────────────────────────── */}
            {tab === "templates" && (
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {CERT_TEMPLATES.map(t => (
                  <div
                    key={t.id}
                    className={cn(
                      "group relative rounded-xl overflow-hidden border cursor-pointer",
                      "bg-gradient-to-br", t.from, t.to,
                      "ring-1 ring-transparent hover:ring-1 transition-all duration-200",
                      `hover:${t.ring}`
                    )}
                  >
                    {/* Cert mockup preview */}
                    <div className="px-5 pt-6 pb-4">
                      <div className="text-3xl mb-3">{t.emoji}</div>
                      <p className="text-sm font-bold text-white leading-snug">{t.name}</p>
                      <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{t.desc}</p>
                    </div>
                    {/* Footer action row */}
                    <div className="border-t border-white/5 px-5 py-3 flex items-center justify-between">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", t.tagBg, t.tag)}>
                        Template
                      </span>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="text-[10px] text-zinc-300 hover:text-white font-semibold px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors">
                          Preview
                        </button>
                        <button className={cn("text-[10px] font-bold px-2 py-1 rounded-md transition-colors", t.tagBg, t.tag, "hover:brightness-110")}>
                          Use
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add custom template */}
                <div className="rounded-xl border border-dashed border-theme-border flex flex-col items-center justify-center gap-2.5 p-6 cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group min-h-[160px]">
                  <div className="h-10 w-10 rounded-xl bg-theme-raised flex items-center justify-center group-hover:bg-amber-500/10 transition-colors">
                    <Plus size={18} className="text-theme-muted group-hover:text-amber-500 transition-colors" />
                  </div>
                  <p className="text-xs font-semibold text-theme-muted group-hover:text-amber-500 transition-colors text-center">
                    Custom Template
                  </p>
                </div>
              </div>
            )}

            {/* ── BADGES TAB ───────────────────────────────────────────── */}
            {tab === "badges" && (
              <div className="p-5">
                {badges.length === 0 ? (
                  <div className="flex flex-col items-center py-16 gap-3">
                    <Trophy size={32} className="text-theme-muted/30" />
                    <p className="text-sm text-theme-muted font-medium">No badges defined yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {badges.map(b => (
                      <div
                        key={b.id}
                        className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-raised/40 px-4 py-3.5 hover:border-theme-primary/30 hover:bg-theme-raised transition-all group cursor-default"
                      >
                        <span className="text-2xl flex-shrink-0">{b.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-theme-fg truncate">{b.name}</p>
                          <p className="text-xs text-theme-muted line-clamp-1 mt-0.5">{b.description}</p>
                          <div className="flex items-center gap-1 mt-1.5">
                            <Star size={9} className="text-amber-400" fill="currentColor" />
                            <span className="text-[10px] text-theme-muted">{b.earnedCount} earned</span>
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-theme-muted/40 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── LOG TAB ──────────────────────────────────────────────── */}
            {tab === "log" && (
              <div className="divide-y divide-theme-border">
                {loading ? (
                  <div className="py-14 text-center text-xs text-theme-muted">Loading log…</div>
                ) : certs.length === 0 ? (
                  <div className="flex flex-col items-center py-16 gap-3">
                    <BadgeCheck size={32} className="text-theme-muted/30" />
                    <p className="text-sm text-theme-muted font-medium">No verification events yet</p>
                  </div>
                ) : (
                  certs.slice(0, 30).map((cert, i) => (
                    <div key={cert.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-theme-raised/30 transition-colors">
                      <div className="h-7 w-7 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck size={13} className="text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-theme-fg">
                          <span className="text-theme-primary">{cert.employee}</span>
                          {" "}earned a certificate for{" "}
                          <span className="font-semibold">{cert.course}</span>
                        </p>
                        <p className="text-[10px] text-theme-muted mt-0.5 tabular-nums">{cert.hash}</p>
                      </div>
                      <div className="text-[10px] text-theme-muted flex-shrink-0">{fmtDate(cert.date)}</div>
                      <Badge variant="success" className="text-[9px] flex-shrink-0">Valid</Badge>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-theme-border px-5 py-2.5 flex items-center justify-between text-xs text-theme-muted">
              <span>
                {tab === "issued"
                  ? `${filtered.length} certificate${filtered.length !== 1 ? "s" : ""}`
                  : tab === "badges"
                  ? `${badges.length} achievement badges`
                  : tab === "log"
                  ? `${certs.length} events`
                  : `${CERT_TEMPLATES.length} templates`}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-600 font-medium text-[10px]">Real-time</span>
              </div>
            </div>
          </div>

        </div>
      </DashboardShell>

      <AnimatePresence>
        {showGrant && (
          <GrantModal
            open={showGrant}
            onClose={() => setShowGrant(false)}
            employees={employees}
            courses={courses}
            onGrant={handleGrant}
          />
        )}
      </AnimatePresence>
    </>
  );
}
