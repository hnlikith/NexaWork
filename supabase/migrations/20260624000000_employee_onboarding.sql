-- ════════════════════════════════════════════════════════════════════════════
-- Employee Onboarding Module
-- Candidate offer-letter flow: HR fills onboarding form (Offer Letter Section-1
-- A–K config + candidate details) → admin approval → email (3 PDFs + magic link)
-- → candidate e-signs via magic link → status auto-updates in real-time.
--
-- Idempotent — safe to run multiple times / in the Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Onboarding packets (one row per candidate onboarding) ──────────────────
CREATE TABLE IF NOT EXISTS onboarding_packets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  text REFERENCES applications(application_id) ON DELETE SET NULL,

  -- Candidate details (snapshot, editable)
  candidate_name    text NOT NULL,
  candidate_email   text NOT NULL,
  candidate_phone   text,
  candidate_address text,

  -- Offer Letter Section-1 selections (A–K) + stipend/dates/role, free-form JSON
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Workflow
  status          text NOT NULL DEFAULT 'draft',
  -- draft | pending_approval | changes_requested | approved | sent | viewed | signed | completed
  created_by      uuid REFERENCES employees(id) ON DELETE SET NULL,
  approver_id     uuid REFERENCES employees(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  rejection_note  text,

  -- Magic link / e-signature
  sign_token       text UNIQUE,
  token_expires_at timestamptz,
  signature        jsonb,          -- { image_base64, typed_name, signed_at, ip, user_agent }

  -- Generated PDFs (Supabase Storage paths in the private "onboarding" bucket)
  offer_pdf_url     text,
  nda_pdf_url       text,
  handbook_pdf_url  text,

  -- Send / view / sign audit
  sent_at    timestamptz,
  viewed_at  timestamptz,
  signed_at  timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT onboarding_status_chk CHECK (status IN
    ('draft','pending_approval','changes_requested','approved','sent','viewed','signed','completed'))
);

CREATE INDEX IF NOT EXISTS idx_onboarding_status      ON onboarding_packets(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_created_by  ON onboarding_packets(created_by);
CREATE INDEX IF NOT EXISTS idx_onboarding_application ON onboarding_packets(application_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sign_token  ON onboarding_packets(sign_token);
CREATE INDEX IF NOT EXISTS idx_onboarding_created_at  ON onboarding_packets(created_at DESC);

-- ── 2. Onboarding settings (singleton id = 1) ─────────────────────────────────
-- Holds the editable A–K config schema, signatory + company details, template version.
-- signatory_name/company_name defaults below are placeholders for an
-- independent deployment, not the deploying org's real identity (which this
-- migration cannot know) — set the real values via the app's onboarding
-- settings UI before generating any real offer letter/NDA. See
-- DATABASE_IMPLEMENTATION_REPORT.md "INDEPENDENT PROJECT IDENTITY CLEANUP".
CREATE TABLE IF NOT EXISTS onboarding_settings (
  id                   int PRIMARY KEY DEFAULT 1,
  config_schema        jsonb,                              -- null → app falls back to built-in default schema
  signatory_name       text NOT NULL DEFAULT 'YOUR NAME',
  signatory_designation text NOT NULL DEFAULT 'Founder, Executive Chairman & Managing Director',
  company_name         text NOT NULL DEFAULT 'YOUR COMPANY',
  company_details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_versions    jsonb NOT NULL DEFAULT '{}'::jsonb, -- { offer: "...", nda: "...", handbook: "..." } storage paths
  updated_by           uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_settings_singleton CHECK (id = 1)
);

INSERT INTO onboarding_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── 3. updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.onboarding_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_packets_touch ON onboarding_packets;
CREATE TRIGGER trg_onboarding_packets_touch
  BEFORE UPDATE ON onboarding_packets
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_touch_updated_at();

-- ── 4. Row-Level Security ─────────────────────────────────────────────────────
-- Reads: a user sees their own packets; admins see all (also powers realtime).
-- Writes: handled exclusively by the service-role API (bypasses RLS) which does
-- its own role-based authorization — so no INSERT/UPDATE/DELETE policies here.
ALTER TABLE onboarding_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_packets REPLICA IDENTITY FULL;  -- full old-row payload for realtime UPDATE/DELETE

DROP POLICY IF EXISTS onboarding_select_own_or_admin ON onboarding_packets;
CREATE POLICY onboarding_select_own_or_admin ON onboarding_packets
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR approver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role::text = 'admin')
  );

ALTER TABLE onboarding_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onboarding_settings_select_auth ON onboarding_settings;
CREATE POLICY onboarding_settings_select_auth ON onboarding_settings
  FOR SELECT TO authenticated USING (true);

-- ── 5. Realtime publication ───────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE onboarding_packets;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. Private storage bucket for generated PDFs ──────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('onboarding', 'onboarding', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users may read onboarding files (admin preview / signed-URL access).
-- Uploads/deletes go through the service-role API.
DROP POLICY IF EXISTS onboarding_bucket_read ON storage.objects;
CREATE POLICY onboarding_bucket_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'onboarding');

-- ── 7. Permissions module key: "onboarding" ───────────────────────────────────
DO $$
DECLARE
  all_roles TEXT[] := ARRAY['admin','dept_lead','team_lead','employee','intern'];
  r TEXT;
BEGIN
  FOREACH r IN ARRAY all_roles LOOP
    INSERT INTO role_permissions
      (role, module_key, can_view, can_create, can_edit, can_delete, can_export)
    VALUES (r, 'onboarding', false, false, false, false, false)
    ON CONFLICT (role, module_key) DO NOTHING;
  END LOOP;
END $$;

-- Admin: full control + is the approval authority (enforced in API by role = 'admin').
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=true, can_export=true
WHERE role = 'admin' AND module_key = 'onboarding';

-- Non-admin operational roles: may create & fill onboarding forms and submit for approval.
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=false, can_export=false
WHERE role IN ('dept_lead','team_lead','employee','intern') AND module_key = 'onboarding';
