"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronRight, Clock, MapPin, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "@/lib/dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface CalendarEvent {
  id:            string;
  title:         string;
  description?:  string;
  start_time:    string;
  end_time:      string;
  all_day:       boolean;
  calendar_type: "personal" | "department" | "statutory";
  department?:   string;
  color?:        string;
  location?:     string;
}

const TYPE_COLORS: Record<string, string> = {
  statutory:  "bg-red-500",
  department: "bg-green-500",
  personal:   "bg-indigo-500",
};

const TYPE_LABELS: Record<string, string> = {
  statutory:  "Statutory",
  department: "Department",
  personal:   "Personal",
};

interface CalendarWidgetProps {
  userId:     string;
  department?: string;
  maxItems?:  number;
  className?: string;
}

export function CalendarWidget({ userId, department, maxItems = 5, className }: CalendarWidgetProps) {
  const [events,  setEvents]  = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const from = new Date().toISOString();
    const to   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({ userId, from, to, limit: String(maxItems) });
    if (department) params.set("department", department);

    fetch(`/api/calendar/events?${params}`)
      .then(r => r.json())
      .then(({ events: evts }) => setEvents((evts || []).slice(0, maxItems)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, department, maxItems]);

  return (
    <div className={cn("rounded-2xl border border-theme-border bg-theme-card p-5", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-indigo-500" />
          <span className="font-black text-sm uppercase tracking-widest text-theme-fg">Upcoming Events</span>
        </div>
        <Link href="/dashboard/calendar" className="flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-indigo-600 transition-colors">
          View All <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-1 h-14 rounded-full bg-theme-border" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-theme-border rounded w-3/4" />
                <div className="h-2.5 bg-theme-border rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Calendar className="h-10 w-10 text-theme-muted mb-2 opacity-40" />
          <p className="text-sm text-theme-muted">No upcoming events</p>
          <Link href="/dashboard/calendar" className="mt-2 text-xs font-bold text-indigo-500 hover:underline">
            Create an event
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(evt => {
            const start    = dayjs(evt.start_time);
            const isToday  = start.isToday?.() || start.format("YYYY-MM-DD") === dayjs().format("YYYY-MM-DD");
            const isPast   = start.isBefore(dayjs());
            const dotColor = evt.color || TYPE_COLORS[evt.calendar_type] || "bg-indigo-500";

            return (
              <div key={evt.id} className={cn("flex gap-3 group", isPast && "opacity-50")}>
                <div className={cn("w-1 rounded-full shrink-0 self-stretch", dotColor.startsWith("#") ? "" : dotColor)}
                  style={dotColor.startsWith("#") ? { backgroundColor: dotColor } : {}} />
                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-theme-fg truncate leading-tight">{evt.title}</p>
                    <span className={cn(
                      "shrink-0 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded",
                      evt.calendar_type === "statutory" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" :
                      evt.calendar_type === "department" ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" :
                      "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400"
                    )}>
                      {TYPE_LABELS[evt.calendar_type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-theme-muted">
                      <Clock className="h-3 w-3" />
                      {isToday ? `Today, ${start.format("h:mm A")}` : start.format("MMM D, h:mm A")}
                    </span>
                    {evt.location && (
                      <span className="flex items-center gap-1 text-xs text-theme-muted truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {evt.location}
                      </span>
                    )}
                  </div>
                  {evt.calendar_type === "statutory" && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                      <span className="text-[11px] text-red-500 font-semibold">Compliance deadline</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
