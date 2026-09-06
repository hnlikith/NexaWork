/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import React from "react";
import type { TemplateData, ConfigCategory } from "@/lib/onboarding/types";
import { renderBlocks } from "./docStyles";
import { sliceBlocks } from "./docModel";
import { OFFER_BLOCKS } from "./content/offerLetterBlocks";
import { NDA_BLOCKS } from "./content/ndaBlocks";
import { HANDBOOK_BLOCKS } from "./content/handbookBlocks";

// ════════════════════════════════════════════════════════════════════════════
// Pure, server-safe builders that turn TemplateData into a flat array of doc
// blocks. NO client imports — so server code (Puppeteer PDF) can use these
// without dragging in client-only components such as PaginatedDoc.
// ════════════════════════════════════════════════════════════════════════════

function fmtDate(v?: string): string {
  if (!v) return "";
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

const Check = () => <span className="od-box">☑</span>;

// Company signatory column — shared across Offer Letter, NDA, Handbook.
// Layout: seal is displayed large; signature sits on top of it (overlapping),
// mimicking how a real stamped + signed document looks.
function CompanySignatoryCol({ signatory, date }: { signatory: { name: string; designation: string; companyName: string; signatureUrl?: string | null; sealUrl?: string | null }; date: string }) {
  const hasSeal = !!signatory.sealUrl;
  const hasSign = !!signatory.signatureUrl;
  // Container is tall enough to show both at full size
  return (
    <div className="od-sigcol">
      <div className="od-sigcaps">FOR {(signatory.companyName || "").toUpperCase()}</div>
      <div className="od-sigmeta">Authorized Signatory</div>
      {/* Signature left-aligned (directly under "Authorized Signatory" label).
          Seal centered under signature via marginLeft auto trick.
          Negative marginBottom on signature pulls seal up so they visually touch. */}
      <div style={{ marginTop: "3pt", marginBottom: "4pt" }}>
        {hasSign && (
          <img
            src={signatory.signatureUrl!}
            alt="signature"
            style={{
              display: "block",
              maxHeight: "44pt",
              maxWidth: "114pt",
              objectFit: "contain",
              objectPosition: "bottom center",
              position: "relative",
              zIndex: 1,
              marginBottom: hasSeal ? "-18pt" : "0",
            }}
          />
        )}
        {hasSeal && (
          <img
            src={signatory.sealUrl!}
            alt="seal"
            style={{
              display: "block",
              height: "58pt",
              width: "58pt",
              objectFit: "contain",
              opacity: 0.92,
              marginLeft: hasSign ? "8pt" : "0",
            }}
          />
        )}
      </div>
      <div className="od-sigmeta"><b>Name:</b> {signatory.name}</div>
      <div className="od-sigmeta"><b>Designation:</b> {signatory.designation}</div>
      <div className="od-sigmeta"><b>Date:</b> {date}</div>
    </div>
  );
}

function val(config: TemplateData["config"], id: string): string {
  const v = config[id];
  return typeof v === "string" ? v : "";
}

// One Section-1 category showing ONLY the selected options + their sub-fields.
function Category({ cat, config }: { cat: ConfigCategory; config: TemplateData["config"] }) {
  const rows: React.ReactNode[] = [];

  if (cat.kind === "fields" && cat.fields) {
    for (const f of cat.fields) {
      const v = val(config, f.id);
      if (!v) continue;
      rows.push(
        <div className="od-field" key={f.id}>
          <span className="od-lbl">{f.label}: </span>
          <span className="od-val">{f.type === "date" ? fmtDate(v) : v}</span>
        </div>
      );
    }
  }

  if (cat.kind === "single" && cat.options) {
    const sel = val(config, cat.id);
    const opt = cat.options.find((o) => o.id === sel);
    if (opt) {
      rows.push(<div className="od-check" key={opt.id}><Check /><span>{opt.label}</span></div>);
      for (const f of opt.fields ?? []) {
        const v = val(config, f.id);
        if (!v) continue;
        rows.push(
          <div className="od-note" key={f.id}>{f.label}: {f.prefix ? `${f.prefix} ` : ""}{f.type === "date" ? fmtDate(v) : v}</div>
        );
      }
      if (opt.docNote) rows.push(<div className="od-note" key={`${opt.id}-note`}>{opt.docNote}</div>);
    }
  }

  if (cat.kind === "description") {
    const v = val(config, cat.id);
    if (v) rows.push(<p className="od-p" key="desc" style={{ whiteSpace: "pre-wrap" }}>{v}</p>);
  }

  if (cat.kind === "multi" && cat.options) {
    const sel = (config[cat.id] as string[]) ?? [];
    for (const opt of cat.options) {
      if (!sel.includes(opt.id)) continue;
      rows.push(<div className="od-check" key={opt.id}><Check /><span>{opt.label}</span></div>);
      for (const f of opt.fields ?? []) {
        const v = val(config, f.id);
        if (v) rows.push(<div className="od-note" key={f.id}>{f.label}: {v}</div>);
      }
    }
  }

  if (rows.length === 0) rows.push(<div className="od-note od-muted" key="none">—</div>);

  return (
    <div className={cat.pageBreakBefore ? "od-category od-break-before" : "od-category"}>
      <div className="od-cat">{cat.letter}. {cat.title}</div>
      {rows}
    </div>
  );
}

export function buildOfferLetterBlocks(data: TemplateData): React.ReactNode[] {
  const { candidate, config, schema, signatory, signature } = data;
  const staticSections = sliceBlocks(OFFER_BLOCKS, "SECTION 2", "FOR NEXAWORK PRIVATE LIMITED");
  const role = val(config, "position");

  return [
    <h1 className="od-title" key="title">INTERNSHIP OFFER LETTER</h1>,
    <div className="od-field" key="date" style={{ textAlign: "right", marginTop: "4pt", marginBottom: "8pt" }}><span className="od-lbl">Date: </span><span className="od-val">{data.offerDate}</span></div>,
    <p className="od-p" key="to" style={{ marginTop: "8pt", marginBottom: "3pt" }}>To,</p>,
    <div className="od-field" key="name"><span className="od-lbl">Name: </span><span className="od-val">{candidate.name}</span></div>,
    ...(candidate.address ? [<div className="od-field" key="addr"><span className="od-lbl">Address: </span><span className="od-val">{candidate.address}</span></div>] : []),
    <div className="od-field" key="email"><span className="od-lbl">Email ID: </span><span className="od-val">{candidate.email}</span></div>,
    ...(candidate.phone ? [<div className="od-field" key="phone"><span className="od-lbl">Phone Number: </span><span className="od-val">{candidate.phone}</span></div>] : []),
    <div className="od-field" key="subject" style={{ marginTop: "18pt" }}><span className="od-lbl">Subject: </span><span>Internship Offer{role ? ` – ${role}` : ""}</span></div>,
    <p className="od-p" key="dear" style={{ marginTop: "18pt" }}>Dear {candidate.name?.split(" ")[0] || candidate.name},</p>,
    <p className="od-p" key="intro1" style={{ marginTop: "10pt" }}>We are pleased to offer you an internship opportunity with {signatory.companyName} (&ldquo;Company&rdquo;), subject to the terms and conditions contained in this Offer Letter, Company policies, applicable compliance requirements, and supporting agreements executed between the Parties.</p>,
    <p className="od-p" key="intro2" style={{ marginTop: "8pt" }}>The details applicable to your internship engagement are specified below.</p>,
    <h2 className="od-section od-break-before" key="s1">SECTION 1: INTERNSHIP CONFIGURATION SHEET</h2>,
    <p className="od-p" key="s1intro">Only the options selected, marked, completed, or approved by the Company shall apply to the Intern. Any option not selected shall be deemed inapplicable. Where any field, option, checkbox, provision, allowance, benefit, entitlement, compensation component, requirement, or designation remains blank, unmarked, unselected, incomplete, or identified as not applicable, no entitlement, expectation, obligation, commitment, guarantee, or interpretation shall arise in relation to such item.</p>,
    ...schema.map((cat) => <Category key={cat.id} cat={cat} config={config} />),
    <p className="od-p" key="c1">The Intern acknowledges that only the options selected and completed by the Company shall govern the internship engagement.</p>,
    <p className="od-p" key="c2">The Intern further acknowledges that compensation structures, work arrangements, reporting structures, shifts, training requirements, verification requirements, project assignments, client assignments, role responsibilities, and internship terms may vary depending upon business requirements, client requirements, operational needs, organizational priorities, and Company policies.</p>,
    <p className="od-p" key="c3">The Company reserves the right to assign, reassign, rotate, modify, or transfer roles, responsibilities, projects, departments, clients, shifts, reporting structures, work locations, and operational requirements during the internship period based on business needs.</p>,
    <p className="od-p" key="c4">The sections that follow shall form an integral and binding part of this Internship Offer Letter.</p>,
    ...renderBlocks(staticSections, "ofs", { breakSections: true }),
    <div className="od-sigwrap od-break-before" key="sig">
      <CompanySignatoryCol signatory={signatory} date={data.offerDate} />
      <div className="od-sigcol">
        <div className="od-sigcaps">INTERN ACKNOWLEDGEMENT</div>
        <div className="od-sigline">{signature?.image_base64 && <img src={signature.image_base64} alt="signature" />}</div>
        <div className="od-sigmeta"><b>Name:</b> {signature?.typed_name || candidate.name}</div>
        <div className="od-sigmeta"><b>Date:</b> {signature?.signed_at ? fmtDate(signature.signed_at) : "______________"}</div>
      </div>
    </div>,
    <div className="od-ack" key="ack">
      <p className="od-p" style={{ marginBottom: 0 }}>
        I, <b>{signature?.typed_name || candidate.name}</b>, acknowledge that I have read, understood, and agree to comply with the terms and conditions contained in this Offer Letter, the Internship Handbook, applicable Company policies, and supporting agreements applicable to my internship engagement.
      </p>
    </div>,
  ];
}

export function buildNdaBlocks(data: TemplateData): React.ReactNode[] {
  const { candidate, signatory, signature } = data;
  const body = sliceBlocks(NDA_BLOCKS, "1. PURPOSE", "IN WITNESS WHEREOF");

  return [
    <h1 className="od-title" key="title">NON-DISCLOSURE AGREEMENT (NDA)</h1>,
    <p className="od-p" key="intro">This Non-Disclosure Agreement is made and entered into on this <b>{fmtDate(data.offerDate)}</b>, by and between:</p>,
    <div className="od-snum" key="dp">1. Disclosing Party</div>,
    <p className="od-p" key="dptext">{signatory.companyName} Represented by: {signatory.name}, {signatory.designation}. Hereinafter referred to as the &ldquo;Company&rdquo; or &ldquo;Disclosing Party.&rdquo;</p>,
    <div className="od-snum" key="rp">2. Receiving Party</div>,
    <div className="od-field" key="rpname"><span className="od-lbl">Name: </span><span className="od-val">{candidate.name}</span></div>,
    <div className="od-field" key="rpemail"><span className="od-lbl">Email: </span><span className="od-val">{candidate.email}</span></div>,
    <div className="od-field" key="rpphone"><span className="od-lbl">Phone: </span><span className="od-val">{candidate.phone || "—"}</span></div>,
    <p className="od-p" key="rp1" style={{ marginTop: "6pt" }}>Hereinafter referred to as the &ldquo;Receiving Party&rdquo; (which may include an intern, trainee, freelancer, consultant, contractor, or any other engaged individual).</p>,
    <p className="od-p" key="rp2">The Company and the Intern may individually be referred to as a &ldquo;Party&rdquo; and collectively as the &ldquo;Parties.&rdquo;</p>,
    ...renderBlocks(body, "nda"),
    <p className="od-p" key="witness" style={{ marginTop: "12pt", fontWeight: 600 }}>IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first written above.</p>,
    <div className="od-sigwrap" key="sig">
      <CompanySignatoryCol signatory={signatory} date={data.offerDate} />
      <div className="od-sigcol">
        <div className="od-sigcaps">RECEIVING PARTY</div>
        <div className="od-sigline">{signature?.image_base64 && <img src={signature.image_base64} alt="signature" />}</div>
        <div className="od-sigmeta"><b>Name:</b> {signature?.typed_name || candidate.name}</div>
        <div className="od-sigmeta"><b>Date:</b> {signature?.signed_at ? fmtDate(signature.signed_at) : "______________"}</div>
      </div>
    </div>,
  ];
}

export function buildHandbookBlocks(data: TemplateData): React.ReactNode[] {
  const { candidate, signatory, signature } = data;
  const body = sliceBlocks(HANDBOOK_BLOCKS, "CHAPTER 1", "INTERN HANDBOOK ACKNOWLEDGEMENT");

  return [
    <h1 className="od-title" key="title">INTERNSHIP HANDBOOK</h1>,
    <p className="od-subtitle" key="sub">Version 1.0 · Issued By: {signatory.companyName}</p>,
    <div className="od-callout" key="callout">
      Prepared for: <b>{candidate.name}</b>{candidate.email ? ` (${candidate.email})` : ""}. This Handbook forms an integral part of your internship engagement and should be read together with your Internship Offer Letter and the Non-Disclosure Agreement.
    </div>,
    ...renderBlocks(body, "hb", { breakSections: true, skipFirstSectionBreak: true }),
    // Acknowledgement + signature (mirrors the format used in Offer Letter and NDA)
    <h2 className="od-section" key="ack-title">INTERN HANDBOOK ACKNOWLEDGEMENT</h2>,
    <p className="od-p" key="ack1">I acknowledge that I have received, read, understood, and agree to comply with the provisions contained in this Internship Handbook and any future updates communicated by the Company. I further acknowledge that failure to comply with applicable Company policies, procedures, compliance requirements, or Handbook provisions may result in appropriate corrective, disciplinary, administrative, or internship-related action.</p>,
    <p className="od-p" key="ack2">I further acknowledge that this Handbook shall be read together with the Internship Offer Letter, Non-Disclosure Agreement (NDA), Company policies, standard operating procedures (SOPs), guidelines, and other applicable Company documents, all of which may collectively govern my internship with the Company.</p>,
    <div className="od-sigwrap" key="sig" style={{ marginTop: "32pt" }}>
      <div className="od-sigcol">
        <div className="od-sigcaps">INTERN DETAILS</div>
        <div className="od-sigmeta" style={{ marginBottom: "4pt" }}>Signature:</div>
        <div className="od-sigline">{signature?.image_base64 && <img src={signature.image_base64} alt="signature" />}</div>
        <div className="od-sigmeta"><b>Name:</b> {signature?.typed_name || candidate.name}</div>
        <div className="od-sigmeta"><b>Date:</b> {signature?.signed_at ? fmtDate(signature.signed_at) : "______________"}</div>
      </div>
      <CompanySignatoryCol signatory={signatory} date={data.offerDate} />
    </div>,
  ];
}
