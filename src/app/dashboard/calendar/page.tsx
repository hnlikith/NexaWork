"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import {
  ChevronLeft, ChevronRight, Plus, Clock, MapPin, AlertCircle, Tag, Trash2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import dayjs, { Dayjs } from "@/lib/dayjs";
import isBetween from "dayjs/plugin/isBetween";
import isToday from "dayjs/plugin/isToday";

dayjs.extend(isBetween);
dayjs.extend(isToday);

interface CalEvent {
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
  attendees?:    string[];
  created_by?:   string;
}

type ViewMode = "month" | "week" | "day";

const TYPE_COLOR: Record<string, string> = {
  statutory:  "#ef4444",
  department: "#22c55e",
  personal:   "#6366f1",
};

function getEventColor(evt: CalEvent) {
  return evt.color || TYPE_COLOR[evt.calendar_type] || "#6366f1";
}

function getDaysInMonth(year: number, month: number): Dayjs[] {
  const first = dayjs(new Date(year, month, 1));
  const last  = first.endOf("month");
  const days: Dayjs[] = [];
  for (let i = 0; i < first.day(); i++) {
    days.push(first.subtract(first.day() - i, "day"));
  }
  for (let d = 1; d <= last.date(); d++) {
    days.push(dayjs(new Date(year, month, d)));
  }
  const rem = 7 - (days.length % 7);
  if (rem < 7) {
    for (let i = 1; i <= rem; i++) days.push(last.add(i, "day"));
  }
  return days;
}

function getWeekDays(anchor: Dayjs): Dayjs[] {
  const start = anchor.startOf("week");
  return Array.from({ length: 7 }, (_, i) => start.add(i, "day"));
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hourLabel = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);

const emptyForm = {
  id:        "" as string,
  title:     "",
  date:      dayjs().format("YYYY-MM-DD"),
  startTime: "09:00",
  endTime:   "10:00",
  description: "",
  location:  "",
  type:      "personal" as CalEvent["calendar_type"],
  color:     "#6366f1",
};

export default function CalendarPage() {
  const { user } = useAuth();
  const [view,    setView]    = useState<ViewMode>("month");
  const [anchor,  setAnchor]  = useState<Dayjs>(dayjs());
  const [events,  setEvents]  = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState(emptyForm);

  // "Manager view" — admin sees everything; a dept_lead employee also gets it.
  const isAdmin = user?.role === "admin" || !!user?.is_dept_lead;

  const fetchEvents = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const from = anchor.startOf("month").subtract(7, "day").toISOString();
    const to   = anchor.endOf("month").add(7, "day").toISOString();
    try {
      const res  = await fetch(`/api/calendar/events?userId=${user.id}&department=${user.department || ""}&from=${from}&to=${to}&limit=200`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch {}
    setLoading(false);
  }, [user?.id, user?.department, anchor]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  function eventsForDay(day: Dayjs) {
    return events.filter(e => dayjs(e.start_time).format("YYYY-MM-DD") === day.format("YYYY-MM-DD"));
  }

  function openCreate(date?: Dayjs) {
    setForm({ ...emptyForm, date: (date ?? anchor).format("YYYY-MM-DD") });
    setFormOpen(true);
  }

  function openEdit(evt: CalEvent) {
    setSelected(null);
    setForm({
      id:        evt.id,
      title:     evt.title,
      date:      dayjs(evt.start_time).format("YYYY-MM-DD"),
      startTime: dayjs(evt.start_time).format("HH:mm"),
      endTime:   dayjs(evt.end_time).format("HH:mm"),
      description: evt.description || "",
      location:  evt.location || "",
      type:      evt.calendar_type,
      color:     getEventColor(evt),
    });
    setFormOpen(true);
  }

  async function saveEvent() {
    if (!form.title || !user?.id) return;
    setSaving(true);
    const start = new Date(`${form.date}T${form.startTime}:00`).toISOString();
    const end   = new Date(`${form.date}T${form.endTime}:00`).toISOString();
    const payload = {
      title:         form.title,
      description:   form.description,
      start_time:    start,
      end_time:      end,
      location:      form.location,
      calendar_type: form.type,
      department:    user.department || null,
      color:         TYPE_COLOR[form.type] || form.color,
    };
    try {
      if (form.id) {
        const res = await fetch("/api/calendar/events", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: form.id, ...payload }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to update");
        toast.success("Event updated");
      } else {
        const res = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, created_by: user.id }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to create");
        toast.success("Event created");
      }
      setFormOpen(false);
      fetchEvents();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(id: string) {
    try {
      const res = await fetch(`/api/calendar/events?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to delete");
      toast.success("Event deleted");
      setSelected(null);
      fetchEvents();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function prev() {
    if (view === "month") setAnchor(a => a.subtract(1, "month"));
    else if (view === "week") setAnchor(a => a.subtract(1, "week"));
    else setAnchor(a => a.subtract(1, "day"));
  }
  function next() {
    if (view === "month") setAnchor(a => a.add(1, "month"));
    else if (view === "week") setAnchor(a => a.add(1, "week"));
    else setAnchor(a => a.add(1, "day"));
  }
  function rangeTitle() {
    if (view === "month") return anchor.format("MMMM YYYY");
    if (view === "week")  return `${anchor.startOf("week").format("MMM D")} – ${anchor.endOf("week").format("MMM D, YYYY")}`;
    return anchor.format("dddd, MMMM D YYYY");
  }

  const days     = getDaysInMonth(anchor.year(), anchor.month());
  const weekDays = getWeekDays(anchor);
  const canEditSelected = selected && (isAdmin || selected.created_by === user?.id) && selected.calendar_type !== "statutory";

  return (
    <DashboardShell
      moduleKey="my_calendar"
      title="Calendar"
      subtitle="Personal, department & compliance events"
      actions={<Button size="sm" onClick={() => openCreate()}><Plus size={14} /> New Event</Button>}
    >
      <div className="space-y-4">
        {/* Legend + controls */}
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-4 text-xs">
            {[["personal", "#6366f1", "Personal"], ["department", "#22c55e", "Department"], ["statutory", "#ef4444", "Statutory"]].map(([k, c, l]) => (
              <span key={k} className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                {l}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="month" className="text-xs capitalize">Month</TabsTrigger>
                <TabsTrigger value="week" className="text-xs capitalize">Week</TabsTrigger>
                <TabsTrigger value="day" className="text-xs capitalize">Day</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prev}><ChevronLeft size={16} /></Button>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setAnchor(dayjs())}>Today</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={next}><ChevronRight size={16} /></Button>
            </div>
            <span className="text-sm font-semibold text-foreground min-w-[9rem]">{rangeTitle()}</span>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-[560px] w-full rounded-xl" />
        ) : view === "month" ? (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="grid grid-cols-7 border-b border-border">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} className="py-2.5 text-center text-xs font-semibold text-muted-foreground">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                const isCurrentMonth = day.month() === anchor.month();
                const evts = eventsForDay(day);
                return (
                  <div key={idx}
                    onClick={() => { setAnchor(day); setView("day"); }}
                    className={cn(
                      "min-h-[92px] p-1.5 border-b border-r border-border cursor-pointer transition-colors last:border-r-0",
                      isCurrentMonth ? "bg-card hover:bg-muted/50" : "bg-muted/30 opacity-50",
                      day.isToday() && "bg-primary/5",
                    )}>
                    <span className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1",
                      day.isToday() ? "bg-primary text-primary-foreground" : "text-foreground",
                    )}>
                      {day.date()}
                    </span>
                    <div className="space-y-0.5">
                      {evts.slice(0, 3).map(e => (
                        <div key={e.id}
                          onClick={ev => { ev.stopPropagation(); setSelected(e); }}
                          className="truncate rounded px-1 py-0.5 text-[10px] font-medium text-white cursor-pointer"
                          style={{ background: getEventColor(e) }}>
                          {e.title}
                        </div>
                      ))}
                      {evts.length > 3 && <div className="text-[10px] text-muted-foreground pl-1">+{evts.length - 3} more</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : view === "week" ? (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="grid grid-cols-8 border-b border-border">
              <div className="py-2.5 text-center text-xs font-semibold text-muted-foreground border-r border-border">Time</div>
              {weekDays.map(d => (
                <div key={d.format()} className={cn("py-2.5 text-center border-r border-border last:border-r-0", d.isToday() && "bg-primary/5")}>
                  <div className="text-xs font-semibold text-muted-foreground">{d.format("ddd")}</div>
                  <div className={cn("text-sm font-semibold", d.isToday() ? "text-primary" : "text-foreground")}>{d.date()}</div>
                </div>
              ))}
            </div>
            <div className="overflow-y-auto max-h-[600px]">
              {HOURS.map(h => (
                <div key={h} className="grid grid-cols-8 border-b border-border min-h-[50px]">
                  <div className="border-r border-border px-2 py-1 text-[10px] text-muted-foreground font-medium">{hourLabel(h)}</div>
                  {weekDays.map(d => {
                    const dayEvts = eventsForDay(d).filter(e => dayjs(e.start_time).hour() === h);
                    return (
                      <div key={d.format()} className={cn("border-r border-border last:border-r-0 p-0.5 space-y-0.5", d.isToday() && "bg-primary/5")}>
                        {dayEvts.map(e => (
                          <div key={e.id} onClick={() => setSelected(e)}
                            className="rounded px-1 py-0.5 text-[10px] font-medium text-white cursor-pointer truncate"
                            style={{ background: getEventColor(e) }}>
                            {e.title}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-5 py-3 flex items-center gap-3">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold", anchor.isToday() ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                {anchor.date()}
              </span>
              <span className="font-semibold text-foreground">{anchor.format("dddd, MMMM YYYY")}</span>
            </div>
            <div className="overflow-y-auto max-h-[600px]">
              {HOURS.map(h => {
                const dayEvts = eventsForDay(anchor).filter(e => dayjs(e.start_time).hour() === h);
                return (
                  <div key={h} className="grid grid-cols-[80px_1fr] border-b border-border min-h-[60px]">
                    <div className="border-r border-border px-3 py-2 text-xs text-muted-foreground font-medium">{hourLabel(h)}</div>
                    <div className="p-1 space-y-1">
                      {dayEvts.map(e => (
                        <div key={e.id} onClick={() => setSelected(e)}
                          className="rounded-md px-3 py-2 text-sm font-medium text-white cursor-pointer"
                          style={{ background: getEventColor(e) }}>
                          <div className="font-semibold">{e.title}</div>
                          <div className="text-[11px] opacity-80">{dayjs(e.start_time).format("h:mm A")} – {dayjs(e.end_time).format("h:mm A")}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Event detail */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: getEventColor(selected) }} />
                  {selected.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock size={15} className="shrink-0" />
                  {selected.all_day
                    ? `All day · ${dayjs(selected.start_time).format("MMM D, YYYY")}`
                    : `${dayjs(selected.start_time).format("MMM D, YYYY · h:mm A")} – ${dayjs(selected.end_time).format("h:mm A")}`}
                </div>
                {selected.location && (
                  <div className="flex items-center gap-2 text-muted-foreground"><MapPin size={15} className="shrink-0" /> {selected.location}</div>
                )}
                <div className="flex items-center gap-2">
                  <Tag size={15} className="text-muted-foreground" />
                  <Badge variant="outline" className={cn(
                    "capitalize",
                    selected.calendar_type === "statutory" ? "text-rose-600 border-rose-500/30 bg-rose-500/10" :
                    selected.calendar_type === "department" ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10" :
                    "text-indigo-600 border-indigo-500/30 bg-indigo-500/10",
                  )}>
                    {selected.calendar_type}{selected.department && ` · ${selected.department}`}
                  </Badge>
                </div>
                {selected.description && (
                  <p className="text-muted-foreground leading-relaxed border-t border-border pt-3">{selected.description}</p>
                )}
                {selected.calendar_type === "statutory" && (
                  <div className="flex items-center gap-2 text-rose-600 font-medium">
                    <AlertCircle size={15} className="shrink-0" /> Compliance deadline — ensure timely completion
                  </div>
                )}
              </div>
              {canEditSelected && (
                <DialogFooter>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteEvent(selected.id)}>
                    <Trash2 size={14} /> Delete
                  </Button>
                  <Button size="sm" onClick={() => openEdit(selected)}>Edit</Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Event" : "New Event"}</DialogTitle>
            <DialogDescription className="text-xs">Schedule a personal, department, or compliance event.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Event title" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm(p => ({ ...p, type: v as CalEvent["calendar_type"] }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    {isAdmin && <SelectItem value="department">Department</SelectItem>}
                    {user?.role === "admin" && <SelectItem value="statutory">Statutory</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Start time</Label>
                <Input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End time</Label>
                <Input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Room / link (optional)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="resize-none" placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={saveEvent} disabled={!form.title || saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {form.id ? "Save Changes" : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
