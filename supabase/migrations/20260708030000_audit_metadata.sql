-- 117: Add metadata column to audit_logs
alter table audit_logs add column if not exists metadata jsonb default '{}';
