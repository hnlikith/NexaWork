/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import type { ConfigCategory, OnboardingConfig, OnboardingSignature, TemplateData } from "./types";

function fmtLong(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

// Accepts either normalized {name,email,…} or the packet/form shape {candidate_name,…}.
type CandidateInput = {
  name?: string;
  email?: string;
  phone?: string | null;
  address?: string | null;
  candidate_name?: string;
  candidate_email?: string;
  candidate_phone?: string | null;
  candidate_address?: string | null;
};

/** Assemble the data object every document template consumes. */
export function buildTemplateData(opts: {
  candidate: CandidateInput;
  config: OnboardingConfig;
  schema: ConfigCategory[];
  signatory: { name: string; designation: string; companyName: string; signatureUrl?: string | null; sealUrl?: string | null };
  signature?: OnboardingSignature | null;
  offerDateISO?: string | null; // when the offer was issued/sent; defaults to today
}): TemplateData {
  const c = opts.candidate;
  const dateBase = opts.offerDateISO ? new Date(opts.offerDateISO) : new Date();
  return {
    offerDate: fmtLong(isNaN(dateBase.getTime()) ? new Date() : dateBase),
    candidate: {
      name: c.name ?? c.candidate_name ?? "",
      email: c.email ?? c.candidate_email ?? "",
      phone: c.phone ?? c.candidate_phone ?? "",
      address: c.address ?? c.candidate_address ?? "",
    },
    config: opts.config || {},
    schema: opts.schema,
    signature: opts.signature ?? null,
    signatory: opts.signatory,
  };
}
