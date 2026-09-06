/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// ════════════════════════════════════════════════════════════════════════════
// Onboarding — shared types
// ════════════════════════════════════════════════════════════════════════════

export type OnboardingStatus =
  | "draft"
  | "pending_approval"
  | "changes_requested"
  | "approved"
  | "sent"
  | "viewed"
  | "signed"
  | "completed";

// A free-text sub-field attached to a config option (e.g. stipend amount).
export interface ConfigField {
  id: string;
  label: string;
  placeholder?: string;
  prefix?: string;          // e.g. "INR"
  type?: "text" | "date" | "number";
}

export interface ConfigOption {
  id: string;
  label: string;
  fields?: ConfigField[];   // shown when this option is selected
  docNote?: string;         // static legal text rendered in the document when selected
  defaultChecked?: boolean; // for "multi" categories (J, K pre-ticked items)
}

// single = radio (one choice), multi = checkboxes (many), description = free text, fields = labelled inputs
export type ConfigCategoryKind = "fields" | "single" | "multi" | "description";

export interface ConfigCategory {
  id: string;                 // stable key, e.g. "internship_type"
  letter: string;             // "A".."K"
  title: string;              // "INTERNSHIP TYPE"
  kind: ConfigCategoryKind;
  fields?: ConfigField[];     // for kind="fields" (A role info, E period)
  options?: ConfigOption[];   // for kind="single" | "multi"
  note?: string;              // small helper text under the title (form only)
  pageBreakBefore?: boolean;  // start this section on a new page (preview + PDF)
}

// The selections stored in onboarding_packets.config (free-form but conventionally):
//   single   → config[categoryId] = optionId (string)
//   multi    → config[categoryId] = optionId[]  (string[])
//   fields   → config[fieldId]    = value (string)   (flattened)
//   option sub-fields → config[fieldId] = value (string)
export type OnboardingConfig = Record<string, string | string[] | undefined>;

export interface OnboardingPacket {
  id: string;
  application_id: string | null;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  candidate_address: string | null;
  config: OnboardingConfig;
  status: OnboardingStatus;
  created_by: string | null;
  approver_id: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  sign_token: string | null;
  token_expires_at: string | null;
  signature: OnboardingSignature | null;
  offer_pdf_url: string | null;
  nda_pdf_url: string | null;
  handbook_pdf_url: string | null;
  submitted_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined (optional)
  creator?: { name?: string; email?: string } | null;
  approver?: { name?: string; email?: string } | null;
}

export interface OnboardingSignature {
  image_base64?: string;   // drawn signature PNG data URL
  typed_name: string;
  signed_at: string;
  ip?: string;
  user_agent?: string;
  // Identity-verification evidence recorded server-side before signing (no raw
  // images) — liveness/face/risk + device-fingerprint hash. See /api/sign/[token]/verify.
  verification?: {
    liveness_pass?: boolean;
    quality_pass?: boolean;
    ref_present?: boolean;
    face_matched?: boolean | null;
    similarity?: number | null;
    risk_score?: number | null;
    risk_max?: number | null;
    device_fp?: string | null;
    checks?: { label: string; pass: boolean }[];
    verified_at?: string;
  };
}

export interface OnboardingSettings {
  id: number;
  config_schema: ConfigCategory[] | null;
  signatory_name: string;
  signatory_designation: string;
  company_name: string;
  company_details: Record<string, string>;
  template_versions: Record<string, string>;
  require_approval: boolean;
  signatory_signature_url: string | null;
  company_seal_url: string | null;
  updated_by: string | null;
  updated_at: string;
}

// Everything a document template needs to render.
export interface TemplateData {
  offerDate: string;             // e.g. "24 June 2026"
  candidate: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  config: OnboardingConfig;
  schema: ConfigCategory[];
  signatory: {
    name: string;
    designation: string;
    companyName: string;
    signatureUrl?: string | null;
    sealUrl?: string | null;
  };
  signature?: OnboardingSignature | null;  // present once signed (embeds into PDF)
}

// Status display metadata (label + tailwind classes) — single source of truth for badges.
export const STATUS_META: Record<OnboardingStatus, { label: string; className: string }> = {
  draft:             { label: "Draft",             className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/20" },
  pending_approval:  { label: "Pending Approval",  className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  changes_requested: { label: "Changes Requested", className: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  approved:          { label: "Approved",          className: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  sent:              { label: "Sent",              className: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  viewed:            { label: "Viewed",            className: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" },
  signed:            { label: "Signed",            className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  completed:         { label: "Completed",         className: "bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border-emerald-600/30" },
};
