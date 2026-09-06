-- Migration: Track one-time Zoho SSO activation per employee
-- When a consultant logs in for the FIRST time with their company (Zoho) mail ID,
-- the workspace silently fires a SAML assertion to Zoho so the user's
-- "Last Sign In" flips from "Never signed in" to a real timestamp in the
-- Zoho Admin Console. This column records that the one-time trigger has fired
-- so it never re-fires on subsequent logins.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS zoho_activated_at TIMESTAMPTZ;

COMMENT ON COLUMN employees.zoho_activated_at IS
  'Timestamp of the first company-mail login that triggered the silent Zoho SAML SSO activation. NULL = not yet activated (silent SSO will fire on next professional login).';
