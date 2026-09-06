-- Migration: Add SAML SSO to zoho_config
-- Adds columns for SAML enabling, private/public keys, issuer, and ACS URL.
--
-- saml_issuer is the SAML <Issuer> value this app sends as an Identity
-- Provider when generating SSO assertions for Zoho (src/lib/saml.ts,
-- src/app/api/auth/saml/sso/route.ts). It is NOT a Supabase project
-- identifier and is not constrained by Zoho to any specific value — it's an
-- arbitrary, self-chosen label fully overridable via the app's own SAML
-- settings UI (/api/mail/config/saml). The default below was the original
-- org's chosen label; replaced with a generic placeholder for an
-- independent deployment (see DATABASE_IMPLEMENTATION_REPORT.md
-- "INDEPENDENT PROJECT IDENTITY CLEANUP").
ALTER TABLE zoho_config
  ADD COLUMN IF NOT EXISTS saml_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saml_private_key TEXT,
  ADD COLUMN IF NOT EXISTS saml_certificate TEXT,
  ADD COLUMN IF NOT EXISTS saml_issuer TEXT NOT NULL DEFAULT 'your-organization-sso',
  ADD COLUMN IF NOT EXISTS saml_acs_url TEXT NOT NULL DEFAULT 'https://accounts.zoho.in/samlresponse';
