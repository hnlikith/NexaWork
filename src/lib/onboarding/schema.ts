/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import type { ConfigCategory } from "./types";

// ════════════════════════════════════════════════════════════════════════════
// DEFAULT_SCHEMA — the Offer Letter "Section 1: Internship Configuration Sheet"
// (categories A–K), modelled exactly from Final_Internship Offer Letter_2026.docx.
//
// This single declarative schema drives BOTH the onboarding form controls AND the
// document template's conditional rendering. It is overridable via
// onboarding_settings.config_schema (Settings → Phase 8); when null, this is used.
// ════════════════════════════════════════════════════════════════════════════

export const DEFAULT_SCHEMA: ConfigCategory[] = [
  // ── A. ROLE INFORMATION ─────────────────────────────────────────────────────
  {
    id: "role_info",
    letter: "A",
    title: "ROLE INFORMATION",
    kind: "fields",
    fields: [
      { id: "position", label: "Internship Position / Role", placeholder: "e.g. Software Development Intern" },
      { id: "primary_function", label: "Primary Role / Function", placeholder: "e.g. Frontend Engineering" },
      { id: "reporting_location", label: "Work / Reporting Location (if applicable)", placeholder: "e.g. Remote / Bengaluru" },
    ],
  },

  // ── B. INTERNSHIP TYPE ──────────────────────────────────────────────────────
  {
    id: "internship_type",
    letter: "B",
    title: "INTERNSHIP TYPE",
    kind: "single",
    options: [
      { id: "unpaid", label: "Unpaid Internship" },
      { id: "stipend", label: "Stipend Internship" },
      { id: "training_stipend", label: "Training + Stipend Internship" },
      { id: "project_based", label: "Project-Based Internship" },
      { id: "commission_based", label: "Commission-Based Internship" },
      { id: "business_dev", label: "Business Development Internship" },
      { id: "type_other", label: "Other", fields: [{ id: "internship_type_other", label: "Specify" }] },
    ],
  },

  // ── C. COMPENSATION STRUCTURE ───────────────────────────────────────────────
  {
    id: "compensation",
    letter: "C",
    title: "COMPENSATION STRUCTURE",
    kind: "single",
    options: [
      { id: "none", label: "No Compensation (Unpaid Internship)" },
      {
        id: "fixed_stipend",
        label: "Fixed Monthly Stipend",
        fields: [{ id: "stipend_amount", label: "Applicable Monthly Stipend", prefix: "INR" }],
      },
      {
        id: "project_comp",
        label: "Project-Based Compensation",
        fields: [{ id: "project_terms", label: "Project Compensation Terms" }],
      },
      {
        id: "commission",
        label: "Commission-Based Compensation",
        docNote:
          "1% – 5% of revenue generated and collected by the Company from business secured through the Intern's efforts, subject to applicable Company policies and commission eligibility requirements.",
      },
      {
        id: "stipend_incentives",
        label: "Fixed Monthly Stipend + Incentives",
        fields: [{ id: "stipend_amount", label: "Applicable Monthly Stipend", prefix: "INR" }],
        docNote:
          "Incentive Structure: 1% - 10% of net profit attributable to the applicable project, engagement, assignment, or business activity, subject to Company calculations, approvals, profitability assessment, and applicable incentive policies.",
      },
      {
        id: "stipend_commission",
        label: "Fixed Monthly Stipend + Commission",
        fields: [{ id: "stipend_amount", label: "Applicable Monthly Stipend", prefix: "INR" }],
        docNote:
          "Commission Structure: 2% – 5% of revenue generated and collected by the Company from business secured through the Intern's efforts, subject to applicable Company policies and commission eligibility requirements.",
      },
      {
        id: "deferred",
        label: "Deferred / Conditional Stipend Internship",
        fields: [
          { id: "stipend_amount", label: "Applicable Monthly Stipend", prefix: "INR" },
          { id: "accrual_days", label: "Stipend Accrual Start — after training period (days)", type: "number" },
        ],
        docNote:
          "Payouts may be deferred and processed subject to Company profitability, grant availability, project monetization, operational requirements, cash-flow requirements, and management approval.",
      },
      {
        id: "comp_other",
        label: "Other Compensation Structure",
        fields: [{ id: "compensation_terms", label: "Applicable Terms" }],
      },
    ],
  },

  // ── D. TRAINING PERIOD ──────────────────────────────────────────────────────
  {
    id: "training",
    letter: "D",
    title: "TRAINING PERIOD",
    kind: "single",
    options: [
      {
        id: "applicable",
        label: "Applicable",
        fields: [
          { id: "training_duration", label: "Training Duration" },
          { id: "training_start", label: "Training Start Date", type: "date" },
          { id: "training_end", label: "Training End Date", type: "date" },
        ],
      },
      { id: "not_applicable", label: "Not Applicable" },
    ],
  },

  // ── E. INTERNSHIP PERIOD ────────────────────────────────────────────────────
  {
    id: "internship_period",
    letter: "E",
    title: "INTERNSHIP PERIOD",
    kind: "fields",
    fields: [
      { id: "internship_start", label: "Internship Start Date", type: "date" },
      { id: "internship_end", label: "Internship End Date", type: "date" },
    ],
  },

  // ── F. WORK MODE ────────────────────────────────────────────────────────────
  {
    id: "work_mode",
    letter: "F",
    title: "WORK MODE",
    kind: "single",
    options: [
      { id: "remote", label: "Remote" },
      { id: "hybrid", label: "Hybrid" },
      { id: "onsite", label: "Onsite" },
    ],
  },

  // ── G. SHIFT ALLOCATION ─────────────────────────────────────────────────────
  {
    id: "shift",
    letter: "G",
    title: "SHIFT ALLOCATION",
    kind: "single",
    options: [
      { id: "general", label: "General Shift" },
      { id: "morning", label: "Morning Shift" },
      { id: "evening", label: "Evening Shift" },
      { id: "night", label: "Night Shift" },
      { id: "rotational", label: "Rotational Shift" },
      { id: "flexible", label: "Flexible Shift" },
      { id: "client_aligned", label: "Client-Aligned Shift" },
      { id: "shift_other", label: "Other", fields: [{ id: "shift_other_text", label: "Specify" }] },
    ],
  },

  // ── H. WEEKLY OFF STRUCTURE ─────────────────────────────────────────────────
  {
    id: "weekly_off",
    letter: "H",
    title: "WEEKLY OFF STRUCTURE",
    kind: "single",
    options: [
      { id: "rotational", label: "Rotational Weekly Off" },
      { id: "fixed", label: "Fixed Weekly Off", fields: [{ id: "weekly_off_day", label: "Applicable Day (if any)" }] },
    ],
  },

  // ── I. CLIENT ENGAGEMENT CLASSIFICATION ─────────────────────────────────────
  {
    id: "client_engagement",
    letter: "I",
    title: "CLIENT ENGAGEMENT CLASSIFICATION",
    kind: "multi",
    options: [
      { id: "client_facing", label: "Client-Facing Role" },
      { id: "non_client_facing", label: "Non-Client-Facing Role" },
      { id: "client_access", label: "Client Access Required" },
      { id: "no_client_access", label: "No Client Access Required" },
    ],
  },

  // ── J. COMPANY SYSTEMS & ASSET ACCESS ───────────────────────────────────────
  {
    id: "systems_access",
    letter: "J",
    title: "COMPANY SYSTEMS & ASSET ACCESS",
    kind: "multi",
    options: [
      { id: "company_email", label: "Company Email", defaultChecked: true },
      { id: "internal_platforms", label: "Internal Platforms", defaultChecked: true },
      { id: "shared_drives", label: "Shared Drives / Cloud Storage", defaultChecked: true },
      { id: "design_tools", label: "Design & Creative Tools", defaultChecked: true },
      { id: "dev_tools", label: "Development Tools & Repositories", defaultChecked: true },
      { id: "ai_tools", label: "AI Tools & Platforms", defaultChecked: true },
      { id: "client_systems", label: "Client Systems & Platforms", defaultChecked: true },
      { id: "systems_other", label: "Other", fields: [{ id: "systems_other_text", label: "Specify" }] },
    ],
  },

  // ── K. DOCUMENTATION & VERIFICATION REQUIREMENTS ────────────────────────────
  {
    id: "verification",
    letter: "K",
    title: "DOCUMENTATION & VERIFICATION REQUIREMENTS",
    kind: "multi",
    options: [
      { id: "nda", label: "NDA", defaultChecked: true },
      { id: "background", label: "Background Verification", defaultChecked: true },
      { id: "police", label: "Police Verification" },
      { id: "academic", label: "Academic Verification", defaultChecked: true },
      { id: "identity", label: "Identity Verification", defaultChecked: true },
      { id: "address", label: "Address Verification", defaultChecked: true },
      { id: "reference", label: "Reference Verification" },
      { id: "verify_other", label: "Other", fields: [{ id: "verify_other_text", label: "Specify" }] },
    ],
  },
];

// Build a fresh config object pre-populated with the schema's default-checked multi options.
export function defaultConfig(schema: ConfigCategory[] = DEFAULT_SCHEMA) {
  const cfg: Record<string, string | string[]> = {};
  for (const cat of schema) {
    if (cat.kind === "multi" && cat.options) {
      cfg[cat.id] = cat.options.filter((o) => o.defaultChecked).map((o) => o.id);
    }
  }
  return cfg;
}
