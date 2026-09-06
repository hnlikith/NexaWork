"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2, RotateCcw, Building2, FileText, FileSignature, ShieldCheck, Stamp, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SchemaEditor } from "@/components/onboarding/SchemaEditor";
import { AssetUploadModal } from "@/components/onboarding/AssetUploadModal";
import type { ConfigCategory } from "@/lib/onboarding/types";

interface SettingsState {
  signatory_name: string;
  signatory_designation: string;
  company_name: string;
  require_approval: boolean;
  signatory_signature_url: string | null;
  company_seal_url: string | null;
}

interface AssetUploadProps {
  label: string;
  hint: string;
  currentUrl: string | null;
  assetType: "signature" | "seal";
  onUploaded: (url: string | null) => void;
  onOpenModal: (type: "signature" | "seal") => void;
}

function AssetUpload({ label, hint, currentUrl, assetType, onUploaded, onOpenModal }: AssetUploadProps) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch(`/api/onboarding/settings/assets?type=${assetType}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      onUploaded(null);
      toast.success(`${label} removed`);
    } catch (err: any) {
      toast.error(err.message || "Remove failed");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="text-[11px] text-muted-foreground -mt-1">{hint}</p>
      <div className="flex items-center gap-3">
        {/* Preview box */}
        <div className="h-16 w-24 rounded-md border border-dashed border-border flex items-center justify-center bg-muted/30 shrink-0 overflow-hidden">
          {currentUrl
            ? <img src={currentUrl} alt={label} className="max-h-14 max-w-[88px] object-contain" />
            : <span className="text-[10px] text-muted-foreground text-center leading-tight px-1">No image</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenModal(assetType)}
            className="text-xs h-7"
          >
            <Upload size={12} />
            {currentUrl ? "Replace" : "Upload"}
          </Button>
          {currentUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={removing}
              onClick={handleRemove}
              className="text-xs h-7 text-destructive hover:text-destructive"
            >
              {removing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OnboardingSettingsPanel({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openModal, setOpenModal] = useState<"signature" | "seal" | null>(null);
  const [settings, setSettings] = useState<SettingsState>({
    signatory_name: "", signatory_designation: "", company_name: "",
    require_approval: true, signatory_signature_url: null, company_seal_url: null,
  });
  const [schema, setSchema] = useState<ConfigCategory[]>([]);
  const [defaultSchema, setDefaultSchema] = useState<ConfigCategory[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/onboarding/settings");
        const json = await res.json();
        setSettings(json.settings);
        setSchema(json.schema);
        setDefaultSchema(json.defaultSchema);
      } catch {
        toast.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, config_schema: schema }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function resetSchema() {
    if (!confirm("Reset the configuration sheet to the built-in default?")) return;
    setSchema(defaultSchema);
    try {
      const res = await fetch("/api/onboarding/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, config_schema: null }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success("Configuration sheet reset to default");
    } catch (e: any) {
      toast.error(e.message || "Failed to reset");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft size={14} /> Back to onboardings
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Settings
        </Button>
      </div>

      {/* Signatory & company */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
            <Building2 size={14} className="text-primary" /> Signatory &amp; Company
          </h3>
          <p className="text-xs text-muted-foreground -mt-2">These appear on the Offer Letter and NDA for every candidate.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Company Name</Label>
              <Input value={settings.company_name} onChange={(e) => setSettings({ ...settings, company_name: e.target.value })} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Authorized Signatory</Label>
              <Input value={settings.signatory_name} onChange={(e) => setSettings({ ...settings, signatory_name: e.target.value })} className="text-sm" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Signatory Designation</Label>
              <Input value={settings.signatory_designation} onChange={(e) => setSettings({ ...settings, signatory_designation: e.target.value })} className="text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seal & Signature */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
            <Stamp size={14} className="text-primary" /> Seal &amp; Signature
          </h3>
          <p className="text-xs text-muted-foreground -mt-2">
            Uploaded images appear automatically in the company signatory column of every Offer Letter, NDA, and Handbook — in both the preview and generated PDFs. Accepted formats: PNG, JPEG, PDF.
          </p>
          <div className="grid sm:grid-cols-2 gap-5">
            <AssetUpload
              label="Authorized Signatory Signature"
              hint="Scan or photo of the owner/CEO handwritten signature"
              currentUrl={settings.signatory_signature_url}
              assetType="signature"
              onUploaded={(url) => setSettings((s) => ({ ...s, signatory_signature_url: url }))}
              onOpenModal={setOpenModal}
            />
            <AssetUpload
              label="Company Seal / Stamp"
              hint="Official company rubber stamp or digital seal"
              currentUrl={settings.company_seal_url}
              assetType="seal"
              onUploaded={(url) => setSettings((s) => ({ ...s, company_seal_url: url }))}
              onOpenModal={setOpenModal}
            />
          </div>
        </CardContent>
      </Card>

      {/* Approval workflow */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
            <ShieldCheck size={14} className="text-primary" /> Approval Workflow
          </h3>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Require admin approval for non-admin onboardings</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, onboardings created by non-admin roles must be approved by an admin before the offer is e-mailed for e-signature.
                When OFF, anyone with onboarding access can send directly. <strong>Admins always send directly.</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettings({ ...settings, require_approval: !settings.require_approval })}
              className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${settings.require_approval ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`}
              role="switch"
              aria-checked={settings.require_approval}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${settings.require_approval ? "translate-x-7" : "translate-x-0.5"}`} />
              <span className={`absolute text-[9px] font-bold tracking-wide transition-opacity ${settings.require_approval ? "left-1.5 text-white" : "right-1 text-zinc-500"}`}>
                {settings.require_approval ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Configuration sheet editor */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              <FileSignature size={14} className="text-primary" /> Offer Letter Configuration Sheet
            </h3>
            <Button variant="ghost" size="sm" onClick={resetSchema} className="text-muted-foreground text-xs">
              <RotateCcw size={12} /> Reset to default
            </Button>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Add or edit questions, checklist points, and per-question type (radio / checkbox / description / fields). New questions auto-letter (A, B, C…). These drive the onboarding form and render into the Offer Letter.
          </p>
          <SchemaEditor value={schema} onChange={setSchema} />
        </CardContent>
      </Card>

      {/* Source documents reference */}
      <Card>
        <CardContent className="p-5 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
            <FileText size={14} className="text-primary" /> Source Documents
          </h3>
          <p className="text-xs text-muted-foreground">
            The Offer Letter, NDA, and Internship Handbook reproduce your source documents (letterhead, Bahnschrift) and are generated as paginated A4 PDFs on approval.
          </p>
        </CardContent>
      </Card>

      {/* Asset upload modal */}
      {openModal && (
        <AssetUploadModal
          label={openModal === "signature" ? "Authorized Signatory Signature" : "Company Seal / Stamp"}
          assetType={openModal}
          onClose={() => setOpenModal(null)}
          onUploaded={(url) => {
            if (openModal === "signature") setSettings((s) => ({ ...s, signatory_signature_url: url }));
            else setSettings((s) => ({ ...s, company_seal_url: url }));
            setOpenModal(null);
          }}
        />
      )}
    </div>
  );
}
