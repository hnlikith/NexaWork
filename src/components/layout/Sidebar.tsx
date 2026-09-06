"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard, CalendarDays, TrendingUp, Wallet, FileText, Zap, Users,
  Settings, LogOut, Sun, Moon, ChevronRight, Building2,
  GitBranch, Receipt, CreditCard, Tag, PiggyBank, Handshake,
  MessageSquare, CalendarClock, IndianRupee,
  Shield, RefreshCw, Mail, Ticket,
  Network, Briefcase, BarChart3, ClipboardList, Folder, User,
  BookOpen, Table2, Presentation, StickyNote, LayoutTemplate, Award, GraduationCap,
  Inbox, PenLine, Send, Paperclip, Layers, KeyRound, FileSignature, ScrollText,
  MonitorSmartphone, MonitorPlay, ShieldAlert,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { isPayrollInternOnly } from "@/lib/payroll-access";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/ToastLegacy";
import { playMessagePing } from "@/lib/sounds";

// ─── Types ───────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  moduleKey: string;
};
type NavSection = { title: string; items: NavItem[] };

// ─── MASTER NAV ───────────────────────────────────────────────
// Single source of truth for ALL possible routes. The DB (role_permissions)
// controls which items are visible per role.

const MASTER_NAV: NavSection[] = [
  {
    title: "Organization",
    items: [
      { href: "/admin",             label: "Admin Overview",   icon: LayoutDashboard, moduleKey: "admin_dashboard" },
      { href: "/hr",                label: "HR Hub",           icon: LayoutDashboard, moduleKey: "hr_dashboard" },
      { href: "/accounts",          label: "Accounts Hub",     icon: LayoutDashboard, moduleKey: "accounts_dashboard" },
      { href: "/department-lead/dashboard", label: "Manager Hub",      icon: LayoutDashboard, moduleKey: "manager_dashboard" },
      { href: "/dashboard",         label: "My Dashboard",     icon: LayoutDashboard, moduleKey: "my_dashboard" },
      { href: "/admin/projects",    label: "Projects",         icon: Folder,          moduleKey: "projects" },
      { href: "/admin/users",       label: "Employees",        icon: Users,           moduleKey: "employees" },
      { href: "/admin/shifts",      label: "Shift Management", icon: CalendarClock,   moduleKey: "shift_management" },
      { href: "/admin/teams",       label: "Teams",            icon: Building2,       moduleKey: "teams" },
      { href: "/admin/org-chart",   label: "Org Chart",        icon: Network,         moduleKey: "org_chart" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: "/admin/workspace",               label: "Workspace Hub",  icon: LayoutTemplate, moduleKey: "workspace_hub" },
      { href: "/admin/workspace/documents",     label: "Documents",      icon: BookOpen,       moduleKey: "workspace_documents" },
      { href: "/admin/workspace/spreadsheets",  label: "Spreadsheets",   icon: Table2,         moduleKey: "workspace_spreadsheets" },
      { href: "/admin/workspace/presentations", label: "Presentations",  icon: Presentation,   moduleKey: "workspace_presentations" },
      { href: "/admin/workspace/notes",         label: "Notes",          icon: StickyNote,     moduleKey: "workspace_notes" },
    ],
  },
  {
    title: "HR & Hiring",
    items: [
      { href: "/admin/hr/job-clusters", label: "Job Clusters",    icon: Network,       moduleKey: "job_clusters" },
      { href: "/admin/recruitment",     label: "Recruitment Hub", icon: Briefcase,     moduleKey: "recruitment" },
      { href: "/admin/ats",             label: "ATS Scanner",     icon: RefreshCw,     moduleKey: "ats_scanner" },
      { href: "/admin/interviews",      label: "Interviews",      icon: MessageSquare, moduleKey: "interviews" },
      { href: "/admin/onboarding",      label: "Onboarding",      icon: FileSignature, moduleKey: "onboarding" },
    ],
  },
  {
    title: "Learning & Development",
    items: [
      { href: "/admin/lms",                label: "Academy Manager",  icon: BookOpen,     moduleKey: "lms_academy" },
      { href: "/admin/lms/courses",        label: "Manage Courses",   icon: ClipboardList,moduleKey: "lms_courses" },
      { href: "/admin/lms/certifications", label: "Certifications",   icon: Award,        moduleKey: "lms_certifications" },
      { href: "/dashboard/academy",        label: "Training Academy", icon: BookOpen,     moduleKey: "training_academy" },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/admin/attendance",     label: "Attendance",      icon: CalendarDays,  moduleKey: "attendance" },
      { href: "/admin/priority",       label: "Priority Payout", icon: Zap,           moduleKey: "priority_payout" },
      { href: "/admin/claims",         label: "Claims",          icon: FileText,      moduleKey: "claims" },
      { href: "/admin/reimbursements", label: "Reimbursements",  icon: Receipt,       moduleKey: "reimbursements" },
      { href: "/admin/incentives",     label: "Incentives",      icon: Wallet,        moduleKey: "incentives" },
      { href: "/admin/kpi",            label: "KPI / KRA",       icon: TrendingUp,    moduleKey: "kpi_kra" },
      { href: "/admin/payroll",        label: "Payroll",         icon: IndianRupee,   moduleKey: "payroll" },
      { href: "/admin/payroll/internship", label: "Internship Stipend", icon: IndianRupee, moduleKey: "payroll_internship" },
      { href: "/admin/payslips",       label: "Payslips",        icon: FileText,      moduleKey: "payslips_management" },
      { href: "/admin/support",        label: "Support Center",  icon: Ticket,        moduleKey: "support_admin" },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/admin/invoicing",     label: "Invoicing",    icon: CreditCard, moduleKey: "invoicing" },
      { href: "/admin/vendors",       label: "Vendors",      icon: Briefcase,  moduleKey: "vendors" },
      { href: "/admin/subscriptions", label: "Subscriptions",icon: Tag,        moduleKey: "subscriptions" },
      { href: "/admin/budgets",       label: "Budgets",      icon: PiggyBank,  moduleKey: "budgets" },
    ],
  },
  {
    title: "CRM",
    items: [
      { href: "/admin/crm",         label: "Sales Pipeline", icon: GitBranch, moduleKey: "sales_pipeline" },
      { href: "/admin/crm/clients", label: "Clients",        icon: Handshake, moduleKey: "crm_clients" },
    ],
  },
  {
    title: "Communications",
    items: [
      { href: "/admin/mail",           label: "Mail Hub",    icon: Mail,         moduleKey: "mail_hub" },
      { href: "/admin/mail/inbox",     label: "Inbox",       icon: Inbox,        moduleKey: "mail_inbox" },
      { href: "/admin/mail/compose",   label: "Compose",     icon: PenLine,      moduleKey: "mail_compose" },
      { href: "/admin/mail/sent",      label: "Sent",        icon: Send,         moduleKey: "mail_sent" },
      { href: "/admin/mail/drafts",    label: "Drafts",      icon: FileText,     moduleKey: "mail_drafts" },
      { href: "/admin/mail/files",     label: "File Share",  icon: Paperclip,    moduleKey: "mail_files" },
      { href: "/admin/mail/templates", label: "Templates",   icon: Layers,       moduleKey: "mail_templates" },
      { href: "/admin/mail/accounts",  label: "Mail Accounts",icon: Users,        moduleKey: "mail_accounts" },
      { href: "/admin/mail/config",    label: "Mail Config", icon: KeyRound,     moduleKey: "mail_config" },
      { href: "/admin/messaging",      label: "Messages",    icon: MessageSquare,moduleKey: "messages" },
      { href: "/admin/meetings",       label: "Meetings",    icon: CalendarClock,moduleKey: "meetings" },
    ],
  },
  {
    title: "My Account",
    items: [
      // Identity
      { href: "/dashboard/profile",        label: "My Profile",      icon: User,         moduleKey: "my_profile" },
      // Daily workflow
      { href: "/dashboard/attendance",     label: "My Attendance",   icon: CalendarDays, moduleKey: "my_attendance" },
      { href: "/dashboard/calendar",       label: "My Calendar",     icon: CalendarDays, moduleKey: "my_calendar" },
      { href: "/dashboard/meetings",       label: "Meetings",        icon: CalendarClock,moduleKey: "my_meetings" },
      { href: "/dashboard/messages",       label: "Messages",        icon: MessageSquare,moduleKey: "my_messages" },
      { href: "/dashboard/projects",       label: "My Projects",     icon: Folder,       moduleKey: "my_projects" },
      // Manager visibility
      { href: "/department-lead/teams",     label: "My Teams",        icon: Building2,    moduleKey: "manager_teams" },
      { href: "/department-lead/org-chart", label: "My Org Chart",    icon: Network,      moduleKey: "manager_org_chart" },
      // Performance & compensation (periodic)
      { href: "/dashboard/performance",    label: "Performance",     icon: TrendingUp,   moduleKey: "my_performance" },
      { href: "/dashboard/payslips",       label: "My Payslips",     icon: IndianRupee,  moduleKey: "my_payslips" },
      { href: "/dashboard/incentives",     label: "My Incentives",   icon: Wallet,       moduleKey: "my_incentives" },
      { href: "/dashboard/reimbursements", label: "Reimbursements",  icon: Receipt,      moduleKey: "my_reimbursements" },
      { href: "/dashboard/priority",       label: "Priority Payout", icon: Zap,          moduleKey: "my_priority_payout" },
      // Growth
      { href: "/dashboard/academy",        label: "Academy",         icon: GraduationCap,moduleKey: "my_academy" },
      // Help (last)
      { href: "/dashboard/support",        label: "Support & Help",  icon: Ticket,       moduleKey: "support_user" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/workspace-monitor", label: "Workspace Monitor", icon: MonitorPlay,      moduleKey: "workspace_monitor" },
      { href: "/admin/master-log",        label: "Master Log Sheet",  icon: ScrollText,       moduleKey: "master_log" },
      { href: "/admin/sessions",          label: "Sessions",          icon: MonitorSmartphone,moduleKey: "sessions" },
      { href: "/admin/security",          label: "Security & Audit",  icon: ShieldAlert,      moduleKey: "security_audit" },
      { href: "/admin/permissions",       label: "Permissions",       icon: Shield,           moduleKey: "permissions_control" },
      { href: "/admin/analytics",         label: "Analytics",         icon: BarChart3,        moduleKey: "analytics" },
      { href: "/admin/audit",             label: "Audit Log",         icon: ClipboardList,    moduleKey: "audit_log" },
      { href: "/admin/report",            label: "Feature Report",    icon: ClipboardList,    moduleKey: "feature_report" },
      { href: "/admin/config",            label: "System Config",     icon: Settings,         moduleKey: "system_config" },
    ],
  },
];

// ─── Role badge variant ───────────────────────────────────────

function roleBadge(role?: string) {
  const map: Record<string, { label: string; className: string }> = {
    admin:    { label: "Admin",    className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20" },
    hr:       { label: "HR",       className: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20" },
    accounts: { label: "Accounts", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    employee: { label: "Employee", className: "" },
    intern:   { label: "Intern",   className: "bg-indigo-500/15 text-indigo-500 border-indigo-500/20" },
    dept_lead: { label: "Dept Lead", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20" },
    team_lead: { label: "Team Lead", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  };
  return map[role ?? "employee"] ?? map.employee;
}

function initials(name?: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Sidebar component ────────────────────────────────────────

export function Sidebar() {
  const { user, permissions, logout } = useAuth();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const navRef = useRef<HTMLDivElement>(null);

  const role = roleBadge(user?.role);

  const [unreadCount, setUnreadCount] = useState(0);
  const { showToast } = useToast();

  // Play dual-tone chime sound programmatically via browser Web Audio API
  const playChimeSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      // Note E5
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note A5 starting slightly later
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(0.15, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.5);
    } catch (e) {
      console.error("Audio Context playback failed", e);
    }
  };

  // Show desktop Notification
  const showDesktopNotification = (msg: { id: string; sender_name: string; subject: string; is_internal?: boolean }) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      const typeLabel = msg.is_internal ? "INTERNAL" : "EXTERNAL";
      const notification = new Notification(`[${typeLabel}] New Mail from ${msg.sender_name}`, {
        body: msg.subject || "(No Subject)",
        icon: "/icon.png",
        tag: msg.id,
      });

      notification.onclick = () => {
        window.focus();
        window.location.href = `/admin/mail/inbox?select_id=${msg.id}`;
      };
    }
  };

  // Request browser notification permissions on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  // Fetch initial unread count and subscribe to realtime broadcast channels
  useEffect(() => {
    if (!user?.id) return;

    const fetchCount = async () => {
      const { count, error } = await supabase
        .from("mail_messages")
        .select("*", { count: "exact", head: true })
        .eq("employee_id", user.id)
        .eq("folder", "Inbox")
        .eq("is_read", false);

      if (!error && count !== null) {
        setUnreadCount(count);
      }
    };

    fetchCount();

    const channel = supabase
      .channel("mail_realtime_sidebar")
      .on("broadcast", { event: "new_mail" }, (payload: any) => {
        if (payload.payload && payload.payload.employee_id === user.id) {
          playMessagePing();
          fetchCount();
          showDesktopNotification(payload.payload);

          const isInternal = payload.payload.is_internal;
          const senderName = payload.payload.sender_name || "NexaWork";
          const subject = payload.payload.subject || "(No Subject)";

          const typeBadge = isInternal ? (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-md">
              Internal
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-500 border border-rose-500/25 rounded-md shadow-sm animate-pulse">
              External
            </span>
          );

          showToast(
            <div className="flex flex-col gap-1 text-left">
              <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-900 dark:text-white text-xs">New Mail from {senderName}</span>
                {typeBadge}
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                {subject}
              </span>
            </div>,
            "info",
            () => {
              window.location.href = `/admin/mail/inbox?select_id=${payload.payload.id}`;
            }
          );
        }
      })
      .on("broadcast", { event: "mail_status_changed" }, (payload: any) => {
        if (payload.payload && payload.payload.employee_id === user.id) {
          fetchCount();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // ── Permission filtering ──────────────────────────────────
  const permSections: NavSection[] = MASTER_NAV
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!permissions) return false;
        const perm = permissions[item.moduleKey];
        if (!perm) return false;
        return perm.can_view;
      }),
    }))
    .filter((section) => section.items.length > 0);

  // Payroll-intern accounts see ONLY the internship module — a fixed nav that
  // bypasses the permission map entirely (payroll_internship has no perm row).
  const sections: NavSection[] = isPayrollInternOnly(user?.email)
    ? [{
        title: "Internship",
        items: [
          { href: "/admin/payroll/internship",        label: "Internship Stipend",  icon: IndianRupee,  moduleKey: "payroll_internship" },
          { href: "/admin/payroll/internship/manage", label: "Holidays & Payments", icon: CalendarDays, moduleKey: "payroll_internship" },
        ],
      }]
    : permSections;

  // Restore scroll position
  useEffect(() => {
    const saved = sessionStorage.getItem("sidebar-scroll");
    if (saved && navRef.current) {
      navRef.current.scrollTop = parseInt(saved, 10);
    }
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    sessionStorage.setItem("sidebar-scroll", e.currentTarget.scrollTop.toString());
  };

  const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === "/admin" || href === "/dashboard" || href === "/manager/dashboard") {
      return pathname === href;
    }
    if (pathname.startsWith(href + "/")) {
      const hasMoreSpecific = allHrefs.some(
        (h) => h !== href && pathname.startsWith(h) && h.length > href.length
      );
      return !hasMoreSpecific;
    }
    return false;
  };

  // ── Accordion section state — only one open at a time ──
  const activeSectionTitle = useMemo(() => {
    for (const s of sections) {
      if (s.items.some((i) => isActive(i.href))) return s.title;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, pathname]);

  const [openSection, setOpenSection] = useState<string | null | undefined>(undefined);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = sessionStorage.getItem("sidebar-open-section");
      if (raw !== null) setOpenSection(JSON.parse(raw));
    } catch {}
  }, []);

  const toggleSection = (title: string) => {
    setOpenSection((prev) => {
      const current = prev === undefined ? activeSectionTitle : prev;
      const next = current === title ? null : title;
      try { sessionStorage.setItem("sidebar-open-section", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const isSectionOpen = (title: string) => {
    const current = openSection === undefined ? activeSectionTitle : openSection;
    return current === title;
  };

  return (
    <ShadcnSidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">N</div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-semibold tracking-tight truncate">NexaWork</p>
            <p className="text-[11px] text-muted-foreground truncate">Workspace</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent ref={navRef} onScroll={handleScroll} className="gap-0 px-2 py-2">
        {sections.map((section) => {
          const open = isSectionOpen(section.title);
          const sectionHasActive = section.items.some((i) => isActive(i.href));
          return (
            <SidebarGroup key={section.title} className="py-0.5">
              <button
                type="button"
                onClick={() => toggleSection(section.title)}
                aria-expanded={open}
                className="group/label group-data-[collapsible=icon]:hidden flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/40"
              >
                <SidebarGroupLabel asChild>
                  <span
                    className={cn(
                      "text-xs font-semibold transition-colors",
                      sectionHasActive || open
                        ? "text-foreground"
                        : "text-muted-foreground group-hover/label:text-foreground",
                    )}
                  >
                    {section.title}
                  </span>
                </SidebarGroupLabel>
                <ChevronRight
                  size={13}
                  className={cn(
                    "text-muted-foreground transition-transform duration-200 ease-out",
                    open && "rotate-90 text-foreground",
                  )}
                />
              </button>

              {/* Animated expand/collapse — grid-rows trick (no JS height calc) */}
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  "group-data-[collapsible=icon]:grid-rows-[1fr]",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <SidebarGroupContent
                    className={cn(
                      "mt-1 ml-3 border-l border-sidebar-border/60 pl-2",
                      // No indent / guide in icon-collapsed mode
                      "group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:pl-0 group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:mt-0",
                    )}
                  >
                    <SidebarMenu className="gap-0.5">
                      {section.items.map(({ href, label, icon: Icon }) => {
                        const active = isActive(href);
                        return (
                          <SidebarMenuItem key={href}>
                            <SidebarMenuButton
                              asChild
                              isActive={active}
                              tooltip={label}
                              className="h-8 rounded-md text-sm font-normal data-[active=true]:bg-sidebar-accent data-[active=true]:text-foreground data-[active=true]:font-medium"
                            >
                              <Link href={href} scroll={false} className="flex items-center justify-between w-full">
                                <span className="flex items-center gap-2 min-w-0">
                                  <Icon className="size-4 shrink-0" />
                                  <span className="truncate">{label}</span>
                                </span>
                                {(label === "Inbox" || label === "Mail Hub") && unreadCount > 0 && (
                                  <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white leading-none">
                                    {unreadCount}
                                  </span>
                                )}
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </div>
              </div>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-sidebar-border p-2">
        {/* User card */}
        <div className="group-data-[collapsible=icon]:hidden flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs font-medium">{initials(user?.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-foreground truncate">{user?.name ?? "—"}</p>
            </div>
            <p className="text-xs text-muted-foreground truncate">{user?.zoho_email || user?.email || "—"}</p>
          </div>
          <Badge variant="secondary" className={cn("text-[10px] font-medium border", role.className)}>
            {role.label}
          </Badge>
        </div>

        {/* Theme toggle + Logout */}
        <div className="flex gap-1.5 group-data-[collapsible=icon]:flex-col">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex-1 justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:p-0"
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            <span className="group-data-[collapsible=icon]:hidden">{theme === "dark" ? "Light" : "Dark"}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            className="flex-1 justify-center gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:p-0"
            title="Logout"
          >
            <LogOut size={14} />
            <span className="group-data-[collapsible=icon]:hidden">Logout</span>
          </Button>
        </div>
        <div className="mt-2 text-center text-[9px] text-muted-foreground/60 leading-tight group-data-[collapsible=icon]:hidden">
          © 2026 NexaWork
          <br />Covered under AGPL 3.
        </div>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
