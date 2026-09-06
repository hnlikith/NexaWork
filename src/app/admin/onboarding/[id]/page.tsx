"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAuth } from "@/components/layout/AuthProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Send, CheckCircle2, RotateCcw, Loader2, Download,
  Clock, AlertCircle, FileText, ShieldCheck, PenTool, Mail, Pencil, RefreshCw, ExternalLink, Lock, Globe, Monitor, Smartphone, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AddPersonnelDialog } from "@/components/users/AddPersonnelDialog";
import { ConfigForm } from "@/components/onboarding/ConfigForm";
import { SchemaEditor } from "@/components/onboarding/SchemaEditor";
import { DocumentPreview } from "@/components/onboarding/DocumentPreview";
import { buildTemplateData } from "@/lib/onboarding/templateData";
import { STATUS_META, type ConfigCategory, type OnboardingConfig, type OnboardingPacket, type OnboardingStatus } from "@/lib/onboarding/types";

const CANDIDATE_DOC_LABELS: Record<string, string> = {
  profile_photo: "Profile Photo (for ID Card)",
  face_photo: "Face Verification Selfie",
  aadhaar: "Aadhaar Card",
  pan: "PAN Card",
  other: "Supporting Document",
};

interface FormState {
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  candidate_address: string;
  config: OnboardingConfig;
}

function parseUA(ua: string): { os: string; browser: string; mobile: boolean } {
  const mobile = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
  let os = "Unknown OS";
  if (/iPhone|iPad|iPod/i.test(ua)) os = /iPad/i.test(ua) ? "iPad" : "iPhone";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows NT 1[01]/i.test(ua)) os = "Windows 10/11";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  let browser = "Unknown Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  return { os, browser, mobile };
}

export default function OnboardingBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [packet, setPacket] = useState<OnboardingPacket | null>(null);
  const [schema, setSchema] = useState<ConfigCategory[]>([]);
  const [signatory, setSignatory] = useState({ name: "YOUR NAME", designation: "Founder, Executive Chairman & Managing Director", companyName: "YOUR COMPANY" });
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [previewForm, setPreviewForm] = useState<FormState | null>(null);
  const [candidateDocs, setCandidateDocs] = useState<any[] | null>(null);

  const [requireApproval, setRequireApproval] = useState(true);

  // Full-depth form-builder editing (gated by onboarding_builder permission)
  const [canEditSchema, setCanEditSchema] = useState(false);
  const [editSchema, setEditSchema] = useState(false);
  const [schemaDraft, setSchemaDraft] = useState<ConfigCategory[]>([]);
  const [savingSchema, setSavingSchema] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  // Add Employee from completed onboarding
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const formRef = useRef<FormState | null>(null);

  const status = packet?.status as OnboardingStatus | undefined;
  const editable =
    (isOwner && (status === "draft" || status === "changes_requested")) ||
    (isAdmin && status === "pending_approval");
  const readOnly = !editable;

  const load = useCallback(async (resyncForm: boolean) => {
    try {
      const res = await fetch(`/api/onboarding/${id}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to load");
      }
      const json = await res.json();
      setPacket(json.packet);
      if (json.packet?.candidate_email) {
        fetch(`/api/admin/recruitment/documents?email=${encodeURIComponent(json.packet.candidate_email)}`)
          .then((r) => r.json())
          .then((d) => setCandidateDocs(d.documents || []))
          .catch(() => setCandidateDocs([]));
      }
      setSchema(json.schema);
      setSchemaDraft(json.schema);
      setSignatory(json.settings);
      setIsAdmin(json.isAdmin);
      setIsOwner(json.isOwner);
      setCanEditSchema(!!json.canEditSchema);
      setRequireApproval(json.requireApproval ?? true);
      if (resyncForm || !form) {
        const loaded: FormState = {
          candidate_name: json.packet.candidate_name ?? "",
          candidate_email: json.packet.candidate_email ?? "",
          candidate_phone: json.packet.candidate_phone ?? "",
          candidate_address: json.packet.candidate_address ?? "",
          config: json.packet.config ?? {},
        };
        setForm(loaded);
        setPreviewForm(loaded); // preview reflects the saved state until "Update Preview"
        setDirty(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load onboarding");
      router.push("/admin/onboarding");
    } finally {
      setLoading(false);
    }
  }, [id, router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(true); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: reflect status changes (approval / signing) from other panels.
  useEffect(() => {
    const ch = supabase
      .channel(`onboarding-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "onboarding_packets", filter: `id=eq.${id}` },
        (payload: any) => {
          const newStatus = payload.new?.status;
          // Only resync the form when we're (or just became) read-only, to avoid clobbering edits.
          const willBeReadOnly = !(
            (payload.new?.created_by === user?.id && (newStatus === "draft" || newStatus === "changes_requested")) ||
            (user?.role === "admin" && newStatus === "pending_approval")
          );
          load(willBeReadOnly);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, user?.id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSave = useCallback(async (f: FormState, silent = true) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/onboarding/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setSavedAt(Date.now());
      setDirty(false);
      if (!silent) toast.success("Saved");
    } catch (e: any) {
      if (!silent) toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [id]);

  // Keep a ref to the latest form so actions always persist current edits.
  useEffect(() => { formRef.current = form; }, [form]);

  // NO auto-save: typing only updates the form (and marks it dirty). The preview
  // is frozen until the user clicks "Update Preview", which saves + refreshes it.
  const updateForm = (next: FormState) => {
    formRef.current = next;
    setForm(next);
    setDirty(true);
  };

  // Save the current edits AND refresh the preview to match.
  const updatePreview = async () => {
    if (!form) return;
    setPreviewForm(form);
    await doSave(form, false);
  };

  async function action(path: string, body?: any, label?: string) {
    setBusy(label || path);
    try {
      if (form && editable) await doSave(form, true); // flush latest edits first
      const res = await fetch(`/api/onboarding/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Action failed");
      return json;
    } catch (e: any) {
      toast.error(e.message || "Action failed");
      throw e;
    } finally {
      setBusy(null);
    }
  }

  const onSubmit = async () => {
    if (!form?.candidate_email) return toast.error("Candidate email is required.");
    await action("submit");
    toast.success("Submitted for admin approval");
    load(true);
  };
  const onDirectSend = async () => {
    if (!form?.candidate_email) return toast.error("Candidate email is required.");
    await action("direct-send", undefined, "direct");
    toast.success("Sent to the candidate for e-signature");
    load(true);
  };
  const onApprove = async () => {
    await action("approve", undefined, "approve");
    toast.success("Approved — generating documents & emailing the candidate…");
    load(true);
  };
  const onFinalize = async () => {
    await action("finalize", undefined, "finalize");
    toast.success("Accepted — final signed documents emailed to the candidate");
    load(true);
  };
  const onResend = async () => {
    await action("send", undefined, "resend");
    toast.success("E-sign email sent to the candidate");
    load(true);
  };

  const saveSchema = async () => {
    setSavingSchema(true);
    try {
      const res = await fetch("/api/onboarding/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config_schema: schemaDraft }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success("Form structure saved (applies to all onboardings)");
      setEditSchema(false);
      await load(false); // refresh the schema; keep current form edits
    } catch (e: any) {
      toast.error(e.message || "Failed to save form structure");
    } finally {
      setSavingSchema(false);
    }
  };
  const onReject = async () => {
    await action("reject", { note: rejectNote });
    setRejectOpen(false);
    setRejectNote("");
    toast.success("Sent back for changes");
    load(true);
  };

  const openAddEmployee = () => setAddEmpOpen(true);

  // Preview reflects ONLY previewForm — frozen until the user clicks "Update Preview".
  const templateData = useMemo(
    () =>
      previewForm
        ? buildTemplateData({
            candidate: previewForm,
            config: previewForm.config,
            schema,
            signatory,
            signature: packet?.signature,
            offerDateISO: packet?.sent_at || packet?.approved_at || null,
          })
        : null,
    [previewForm, schema, signatory, packet?.signature, packet?.sent_at, packet?.approved_at]
  );

  if (loading || !form || !packet) {
    return (
      <DashboardShell moduleKey="onboarding" title="Onboarding" subtitle="Loading…">
        <div className="space-y-4">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <div className="grid lg:grid-cols-2 gap-6">
            <Skeleton className="h-[600px] rounded-xl" />
            <Skeleton className="h-[600px] rounded-xl" />
          </div>
        </div>
      </DashboardShell>
    );
  }

  const meta = STATUS_META[packet.status];

  const timeline = [
    { label: "Created", at: packet.created_at, icon: FileText },
    { label: "Submitted", at: packet.submitted_at, icon: Send },
    { label: "Approved", at: packet.approved_at, icon: ShieldCheck },
    { label: "Sent", at: packet.sent_at, icon: Mail },
    { label: "Viewed", at: packet.viewed_at, icon: Clock },
    { label: "Signed", at: packet.signed_at, icon: CheckCircle2 },
    { label: "Completed", at: packet.status === "completed" ? packet.updated_at : null, icon: ShieldCheck },
  ];

  return (
    <DashboardShell
      moduleKey="onboarding"
      title={packet.candidate_name}
      subtitle="Onboarding offer"
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={cn("text-[11px] font-medium border", meta.className)}>{meta.label}</Badge>
          {editable && (
            <Button variant={dirty ? "default" : "outline"} size="sm" onClick={updatePreview} disabled={saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {dirty ? "Save & Update Preview" : "Saved"}
            </Button>
          )}
          {isOwner && (status === "draft" || status === "changes_requested") && (
            (isAdmin || !requireApproval) ? (
              <Button size="sm" onClick={onDirectSend} disabled={!!busy}>
                {busy === "direct" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send for E-Sign
              </Button>
            ) : (
              <Button size="sm" onClick={onSubmit} disabled={!!busy}>
                {busy === "submit" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Submit for Approval
              </Button>
            )
          )}
          {(isOwner || isAdmin) && status === "signed" && (
            <Button size="sm" onClick={onFinalize} disabled={!!busy}>
              {busy === "finalize" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Accept &amp; Send Signed Copy
            </Button>
          )}
          {/* Retry / re-send the e-sign email. Shows once approved (incl. when the
              initial send failed and left sent_at empty) and while awaiting signature. */}
          {(isOwner || isAdmin) && ["approved", "sent", "viewed"].includes(status ?? "") && (
            <Button
              variant={packet.sent_at ? "outline" : "default"}
              size="sm"
              onClick={onResend}
              disabled={!!busy}
            >
              {busy === "resend" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}{" "}
              {packet.sent_at ? "Re-send E-Sign" : "Send E-Sign (retry)"}
            </Button>
          )}
          {isAdmin && status === "pending_approval" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)} disabled={!!busy}>
                <RotateCcw size={13} /> Request Changes
              </Button>
              <Button size="sm" onClick={onApprove} disabled={!!busy}>
                {busy === "approve" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve &amp; Send
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Back + autosave hint */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.push("/admin/onboarding")} className="text-muted-foreground">
            <ArrowLeft size={14} /> All onboardings
          </Button>
          {editable && (
            <span className={cn("text-[11px] font-medium", saving ? "text-muted-foreground" : dirty ? "text-amber-600" : "text-emerald-600")}>
              {saving ? "Saving…" : dirty ? "Unsaved changes — click Update Preview" : savedAt ? "Saved" : "Fill the form, then Update Preview"}
            </span>
          )}
        </div>

        {/* Changes requested banner */}
        {status === "changes_requested" && packet.rejection_note && (
          <div className="flex items-start gap-2.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
            <AlertCircle size={15} className="text-orange-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">Changes requested by admin</p>
              <p className="text-xs text-muted-foreground mt-0.5">{packet.rejection_note}</p>
            </div>
          </div>
        )}

        {/* Status timeline — shown once the onboarding moves past draft (approval, send, sign… with timestamps) */}
        {status !== "draft" && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                {timeline.map((t) => (
                  <div key={t.label} className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-md", t.at ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground/40")}>
                      <t.icon size={13} />
                    </div>
                    <div>
                      <p className={cn("text-[11px] font-medium", t.at ? "text-foreground" : "text-muted-foreground/50")}>{t.label}</p>
                      {t.at && <p className="text-[10px] text-muted-foreground">{new Date(t.at).toLocaleString()}</p>}
                    </div>
                  </div>
                ))}
                {isAdmin && status === "completed" && (
                  <Button variant="outline" size="sm" onClick={openAddEmployee} className="ml-auto">
                    <UserPlus size={13} /> Add Employee
                  </Button>
                )}
              </div>
              {packet.signature && (packet.signature.ip || packet.signature.user_agent) && (() => {
                const parsed = packet.signature.user_agent ? parseUA(packet.signature.user_agent) : null;
                const DeviceIcon = parsed?.mobile ? Smartphone : Monitor;
                return (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 pt-3 border-t border-border">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">E-Sign Details</span>
                    {packet.signature.ip && (() => {
                      const ip = packet.signature.ip;
                      const isLocal = ip === "::1" || ip === "127.0.0.1" || ip.startsWith("::ffff:127.");
                      return isLocal ? (
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Localhost — signed from the same machine as the server (dev/testing only)">
                          <Globe size={10} className="shrink-0" />
                          <span className="font-medium text-foreground tabular-nums">{ip}</span>
                          <span className="text-[10px] text-muted-foreground/60">(localhost)</span>
                        </span>
                      ) : (
                        <a
                          href={`https://ipinfo.io/${ip}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors group"
                          title={`Look up IP ${ip} on ipinfo.io`}
                        >
                          <Globe size={10} className="shrink-0" />
                          <span className="font-medium text-foreground tabular-nums group-hover:underline">{ip}</span>
                          <ExternalLink size={9} className="opacity-50 group-hover:opacity-100" />
                        </a>
                      );
                    })()}
                    {parsed && (
                      <span
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                        title={packet.signature.user_agent}
                      >
                        <DeviceIcon size={10} className="shrink-0" />
                        <span className="font-medium text-foreground">{parsed.os}</span>
                        <span>·</span>
                        <span>{parsed.browser}</span>
                      </span>
                    )}
                    {(() => {
                      const v: any = packet.signature.verification;
                      if (!v) return null;
                      return (
                        <span
                          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                          title={v.device_fp ? `Device fingerprint: ${v.device_fp}` : undefined}
                        >
                          <ShieldCheck size={10} className="shrink-0 text-emerald-500" />
                          <span className="font-medium text-foreground">Identity verified</span>
                          {v.liveness_pass && <span>· liveness ✓</span>}
                          {v.ref_present && typeof v.similarity === "number" && <span>· face {Math.round(v.similarity * 100)}%</span>}
                          {typeof v.risk_score === "number" && <span>· risk {v.risk_score}/{v.risk_max}</span>}
                        </span>
                      );
                    })()}
                  </div>
                );
              })()}
              {(packet.offer_pdf_url || packet.nda_pdf_url || packet.handbook_pdf_url) && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                  {[
                    { key: "offer", label: "Offer Letter", url: packet.offer_pdf_url },
                    { key: "nda", label: "NDA", url: packet.nda_pdf_url },
                    { key: "handbook", label: "Handbook", url: packet.handbook_pdf_url },
                  ].filter((d) => d.url).map((d) => (
                    <Button key={d.key} asChild variant="outline" size="sm">
                      <a href={`/api/onboarding/${id}/pdf?doc=${d.key}`} target="_blank" rel="noreferrer">
                        <Download size={13} /> {d.label}
                      </a>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Main: form (editable) + preview, or full-width preview (read-only) */}
        <div className={cn("grid gap-6", editable ? "lg:grid-cols-2" : "grid-cols-1")}>
          {editable && (
            <Card>
              <CardContent className="p-5 space-y-6 max-h-[calc(100vh-240px)] overflow-y-auto">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 sticky top-0 z-10 bg-card -mx-5 px-5 pb-2 pt-0.5 border-b border-border">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
                      <PenTool size={13} className="text-primary" /> Candidate Details
                    </h3>
                    <Button size="sm" onClick={updatePreview} disabled={saving || !dirty} className="shrink-0">
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Update Preview
                    </Button>
                  </div>
                  {(() => {
                    // Display picture = the candidate's profile photo (falls back to
                    // the verification selfie for candidates who uploaded before it).
                    const dpUrl =
                      candidateDocs?.find((d: any) => d.document_type === "profile_photo")?.url ??
                      candidateDocs?.find((d: any) => d.document_type === "face_photo")?.url;
                    return dpUrl ? (
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={dpUrl} alt="" className="h-14 w-14 rounded-full object-cover border border-border flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{form.candidate_name || "Candidate"}</p>
                          <p className="text-[10px] text-muted-foreground">Profile photo from uploaded documents</p>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Full Name</Label>
                      <Input value={form.candidate_name} onChange={(e) => updateForm({ ...form, candidate_name: e.target.value })} className="text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        Email
                        {(!!packet?.application_id || (candidateDocs?.length ?? 0) > 0) && (
                          <span className="inline-flex items-center gap-0.5 text-[10px]"><Lock size={10} /> locked</span>
                        )}
                      </Label>
                      <Input
                        type="email"
                        value={form.candidate_email}
                        onChange={(e) => updateForm({ ...form, candidate_email: e.target.value })}
                        disabled={!!packet?.application_id || (candidateDocs?.length ?? 0) > 0}
                        className="text-sm disabled:opacity-100 disabled:cursor-not-allowed"
                        title={(!!packet?.application_id || (candidateDocs?.length ?? 0) > 0) ? "Locked — this email links the candidate's uploaded documents" : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <Input value={form.candidate_phone} onChange={(e) => updateForm({ ...form, candidate_phone: e.target.value })} className="text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Address</Label>
                      <Input value={form.candidate_address} onChange={(e) => updateForm({ ...form, candidate_address: e.target.value })} className="text-sm" />
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {candidateDocs && candidateDocs.length > 0 && (
                  <>
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
                        <FileText size={13} className="text-primary" /> Candidate Documents
                        <span className="text-[10px] font-normal normal-case text-muted-foreground">({candidateDocs.length})</span>
                      </h3>
                      <div className="space-y-2">
                        {candidateDocs.map((d: any) => (
                          <a
                            key={d.id}
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5 hover:bg-muted transition-colors"
                          >
                            {d.file_type?.startsWith("image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={d.url} alt="" className="h-10 w-10 rounded-md object-cover border border-border bg-muted flex-shrink-0" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary flex-shrink-0"><FileText size={15} /></div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">{CANDIDATE_DOC_LABELS[d.document_type] || d.document_type}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{d.filename}</p>
                            </div>
                            <ExternalLink size={13} className="text-muted-foreground flex-shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                    <div className="h-px bg-border" />
                  </>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
                      <FileText size={13} className="text-primary" /> {editSchema ? "Edit Form Structure" : "Configuration Sheet"}
                    </h3>
                    {canEditSchema && (
                      <Button
                        variant={editSchema ? "default" : "outline"}
                        size="sm"
                        onClick={() => { if (!editSchema) setSchemaDraft(schema); setEditSchema((v) => !v); }}
                      >
                        <Pencil size={12} /> {editSchema ? "Close Editor" : "Edit Form"}
                      </Button>
                    )}
                  </div>

                  {editSchema ? (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground">
                        Add or edit questions, checklist points, and types (radio / checkbox / description). New questions auto-letter (A, B, C…). Changes apply to all onboardings.
                      </p>
                      <SchemaEditor value={schemaDraft} onChange={setSchemaDraft} />
                      <div className="flex gap-2 sticky bottom-0 bg-card py-2 border-t border-border">
                        <Button size="sm" onClick={saveSchema} disabled={savingSchema}>
                          {savingSchema ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Form
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setSchemaDraft(schema); setEditSchema(false); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <ConfigForm
                      schema={schema}
                      config={form.config}
                      onChange={(config) => updateForm({ ...form, config })}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {templateData && (
            <DocumentPreview data={templateData} className={editable ? "h-[calc(100vh-240px)]" : "h-[calc(100vh-300px)]"} />
          )}
        </div>
      </div>

      {/* Add Employee — full Add Personnel dialog pre-filled from onboarding */}
      <AddPersonnelDialog
        open={addEmpOpen}
        onOpenChange={setAddEmpOpen}
        prefill={{
          name: packet.candidate_name,
          email: packet.candidate_email,
          designation: typeof packet.config?.position === "string" ? packet.config.position : "",
          role: "intern",
          employment_type: "internship",
          salary_structure: "stipend",
        }}
        onSuccess={() => toast.success(`${packet.candidate_name} added as an employee`)}
      />

      {/* Request changes dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RotateCcw size={18} className="text-orange-500" /> Request Changes</DialogTitle>
            <DialogDescription>Send this onboarding back to {packet.creator?.name || "the submitter"} with a note.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="What needs to change?"
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button onClick={onReject} disabled={!!busy}>
              {busy === "reject" ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Send Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
