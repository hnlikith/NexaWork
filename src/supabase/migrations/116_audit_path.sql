-- 116: Master Log Sheet — capture the page path on every audit entry.
-- The middleware auto-logger records the URL a mutation came from; the module name
-- is derived from this path at display time (screenLabel). Rich logAudit() calls may
-- also set it. Nullable + idempotent.
alter table audit_logs add column if not exists path text;
