/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getApiUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_SCHEMA } from "./schema";
import type { ConfigCategory, OnboardingSettings } from "./types";

// ════════════════════════════════════════════════════════════════════════════
// Onboarding — server-only helpers (auth actor, settings, schema resolution)
// ════════════════════════════════════════════════════════════════════════════

export interface Actor {
  userId: string;
  role: string;
  name: string;
  email: string;
  zoho_email: string | null;
  zoho_account_id: string | null;
}

/** Resolve the current API caller into an employee actor (or null if unauthenticated). */
export async function getActor(): Promise<Actor | null> {
  const userId = await getApiUserId();
  if (!userId) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("employees")
    .select("id, name, email, role, zoho_email, zoho_account_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    userId,
    role: (data as any).role ?? "",
    name: (data as any).name ?? "",
    email: (data as any).email ?? "",
    zoho_email: (data as any).zoho_email ?? null,
    zoho_account_id: (data as any).zoho_account_id ?? null,
  };
}

export function isAdmin(actor: Actor | null): boolean {
  return actor?.role === "admin";
}

/**
 * Whether the actor may perform full-depth form-builder edits (edit the questions,
 * options, types & structure of the configuration sheet). Admin always can; others
 * need role_permissions.onboarding_builder.can_edit (with employee override).
 */
export async function canEditSchema(actor: Actor | null): Promise<boolean> {
  if (!actor) return false;
  if (actor.role === "admin") return true;
  const supabase = getSupabaseAdmin();
  // Per-employee override takes precedence when present.
  const { data: emp } = await supabase
    .from("employee_permissions")
    .select("can_edit")
    .eq("employee_id", actor.userId)
    .eq("module_key", "onboarding_builder")
    .maybeSingle();
  if (emp && emp.can_edit !== null && emp.can_edit !== undefined) return !!emp.can_edit;
  const { data: rp } = await supabase
    .from("role_permissions")
    .select("can_edit")
    .eq("role", actor.role)
    .eq("module_key", "onboarding_builder")
    .maybeSingle();
  return !!rp?.can_edit;
}

export async function loadSettings(): Promise<OnboardingSettings | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("onboarding_settings").select("*").eq("id", 1).maybeSingle();
  return (data as OnboardingSettings) ?? null;
}

/** The effective A–K schema: settings override if present, else the built-in default. */
export function resolveSchema(settings: OnboardingSettings | null): ConfigCategory[] {
  const s = settings?.config_schema;
  return Array.isArray(s) && s.length ? (s as ConfigCategory[]) : DEFAULT_SCHEMA;
}

/** Absolute base URL for magic links (env override → request origin fallback handled by caller). */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
