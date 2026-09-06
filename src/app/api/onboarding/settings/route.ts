/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActor, isAdmin, canEditSchema, loadSettings, resolveSchema } from "@/lib/onboarding/server";
import { DEFAULT_SCHEMA } from "@/lib/onboarding/schema";

// GET /api/onboarding/settings — current settings + effective schema.
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await loadSettings();
  return NextResponse.json({
    settings: {
      signatory_name: settings?.signatory_name ?? "YOUR NAME",
      signatory_designation: settings?.signatory_designation ?? "Founder, Executive Chairman & Managing Director",
      company_name: settings?.company_name ?? "YOUR COMPANY",
      require_approval: settings?.require_approval ?? true,
      signatory_signature_url: settings?.signatory_signature_url ?? null,
      company_seal_url: settings?.company_seal_url ?? null,
    },
    schema: resolveSchema(settings),
    isCustomSchema: Array.isArray(settings?.config_schema) && (settings?.config_schema as any[]).length > 0,
    defaultSchema: DEFAULT_SCHEMA,
    isAdmin: isAdmin(actor),
    canEditSchema: await canEditSchema(actor),
  });
}

// PATCH /api/onboarding/settings — admin only.
export async function PATCH(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const settingsKeys = ["signatory_name", "signatory_designation", "company_name", "company_details", "template_versions", "require_approval", "signatory_signature_url", "company_seal_url"];
  const editsSettings = settingsKeys.some((k) => k in body);
  const editsSchema = "config_schema" in body;

  // Signatory/company settings are admin-only; the configuration sheet (form structure)
  // requires full-depth form-builder access (admin or granted onboarding_builder.can_edit).
  if (editsSettings && !isAdmin(actor)) {
    return NextResponse.json({ error: "Admin only for signatory & company settings" }, { status: 403 });
  }
  if (editsSchema && !(await canEditSchema(actor))) {
    return NextResponse.json({ error: "You don't have form-builder access" }, { status: 403 });
  }

  const patch: Record<string, any> = { id: 1, updated_by: actor.userId, updated_at: new Date().toISOString() };
  for (const k of [...settingsKeys, "config_schema"]) {
    if (k in body) patch[k] = body[k];
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("onboarding_settings").upsert(patch, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
