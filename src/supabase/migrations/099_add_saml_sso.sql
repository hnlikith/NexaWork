-- Migration 099: Add SAML SSO to zoho_config
-- Adds columns for SAML enabling, private/public keys, issuer, and ACS URL.

ALTER TABLE zoho_config
  ADD COLUMN IF NOT EXISTS saml_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saml_private_key TEXT,
  ADD COLUMN IF NOT EXISTS saml_certificate TEXT,
  ADD COLUMN IF NOT EXISTS saml_issuer TEXT NOT NULL DEFAULT 'nexawork',
  ADD COLUMN IF NOT EXISTS saml_acs_url TEXT NOT NULL DEFAULT 'https://accounts.zoho.in/samlresponse';
