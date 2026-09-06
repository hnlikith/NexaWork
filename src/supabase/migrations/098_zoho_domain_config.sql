-- ============================================================================
-- 098: Zoho domain config — ensure org_domain column exists
-- org_domain is populated automatically via the Zoho API after OAuth connect,
-- not hardcoded here. Use PUT /api/mail/config/domain to auto-detect.
-- ============================================================================

ALTER TABLE zoho_config ADD COLUMN IF NOT EXISTS org_domain      TEXT;
ALTER TABLE zoho_config ADD COLUMN IF NOT EXISTS domain_synced_at TIMESTAMPTZ;
