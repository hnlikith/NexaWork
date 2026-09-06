"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Save, Loader2, Settings as SettingsIcon, Info, Calendar, IndianRupee,
} from "lucide-react";
import dayjs from "@/lib/dayjs";

interface Settings {
  id: number;
  default_holidays_per_month: number;
  per_day_divisor: number;
  auto_buffer_cycle: boolean;
  notes: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export default function InternshipSettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({
    default_holidays_per_month: 6,
    per_day_divisor: 30,
    auto_buffer_cycle: true,
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/interns/settings")
      .then(r => r.json())
      .then(j => {
        if (!mounted) return;
        if (j.settings) {
          setSettings(j.settings);
          setForm({
            default_holidays_per_month: j.settings.default_holidays_per_month,
            per_day_divisor:            j.settings.per_day_divisor,
            auto_buffer_cycle:          j.settings.auto_buffer_cycle,
            notes:                      j.settings.notes ?? "",
          });
        }
      })
      .catch(() => toast.error("Failed to load settings."))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/interns/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_holidays_per_month: form.default_holidays_per_month,
          per_day_divisor:            form.per_day_divisor,
          auto_buffer_cycle:          form.auto_buffer_cycle,
          notes:                      form.notes.trim() || null,
          updated_by:                 user?.id ?? null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setSettings(j.settings);
      toast.success("Settings saved.");
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <DashboardShell
      moduleKey="payroll_internship"
      title="Internship Stipend — Settings"
      subtitle="Module-wide defaults for stipend calculation."
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/payroll/internship">
              <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back
            </Link>
          </Button>
          <Button size="sm" onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            Save Settings
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <form onSubmit={save} className="max-w-3xl space-y-6">
          {/* ── Calculation defaults ─────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                  <IndianRupee className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Calculation Defaults</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">How a stipend cycle is computed for each intern each month.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Default holidays per month</Label>
                  <Input
                    type="number"
                    min={0}
                    max={31}
                    value={form.default_holidays_per_month}
                    onChange={(e) => setForm({ ...form, default_holidays_per_month: Number(e.target.value) })}
                    className="tabular-nums"
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Paid holidays included in every monthly cycle. Currently <strong>6</strong> (4 weekly off + 2 paid). Holidays are <strong>paid</strong> — they don&apos;t reduce stipend. Extra leaves beyond this count are LOP (Loss of Pay) and reduce stipend at per-day rate.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Per-day rate divisor</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={form.per_day_divisor}
                    onChange={(e) => setForm({ ...form, per_day_divisor: Number(e.target.value) })}
                    className="tabular-nums"
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Per-day rate = stipend ÷ <strong>{form.per_day_divisor}</strong>. Default <strong>30</strong> (flat month, Feb 28-day rule ignored). Changing this affects ALL future cycles. Existing rows are unchanged.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">Auto-create buffer-month cycles</Label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed max-w-md">
                    When an intern starts work before their billing date, the &quot;buffer month&quot; (containing Starting Date) auto-generates a cycle with the pre-billing days credited as paid. Disable to require manual creation.
                  </p>
                </div>
                <Switch
                  checked={form.auto_buffer_cycle}
                  onCheckedChange={(v) => setForm({ ...form, auto_buffer_cycle: v })}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Calculation explainer ────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center">
                  <Info className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">How the calculation works</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Live preview based on the values above.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="rounded-md border p-3 bg-muted/30 space-y-2 font-mono">
                <div>per_day_rate = stipend ÷ <strong>{form.per_day_divisor}</strong></div>
                <div>gross = per_day_rate × (paid_days + buffer_paid_days)</div>
                <div>net = gross − deductions</div>
                <div>deductions ≥ extra_leave_days × per_day_rate <span className="text-muted-foreground">(LOP)</span></div>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                <strong>Example</strong> for ₹10,000 stipend, full 30-day month, default settings:<br />
                per_day = ₹{(10000 / form.per_day_divisor).toFixed(2)} · gross = ₹{((10000 / form.per_day_divisor) * 30).toFixed(0)} · net (no LOP) = ₹{((10000 / form.per_day_divisor) * 30).toFixed(0)}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Add 2 extra leave days (LOP): deductions = ₹{((10000 / form.per_day_divisor) * 2).toFixed(0)} · net = ₹{((10000 / form.per_day_divisor) * 28).toFixed(0)}
              </p>
            </CardContent>
          </Card>

          {/* ── Notes ────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center">
                  <SettingsIcon className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Internal Notes</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">For your reference — visible only on this settings page.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional — anything worth remembering about policy changes, exceptions, etc."
              />
            </CardContent>
          </Card>

          {/* ── Audit info ───────────────────────────────── */}
          {settings && settings.updated_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Last updated {dayjs(settings.updated_at).format("DD MMM YYYY, HH:mm")}</span>
              {settings.updated_by && <Badge variant="secondary" className="text-[10px]">by admin</Badge>}
            </div>
          )}
        </form>
      )}
    </DashboardShell>
  );
}
