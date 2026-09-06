-- 114: Encrypted password vault for deferred Zoho provisioning.
-- When an employee is created WITHOUT a Zoho mailbox (auto-create unchecked), they
-- log in with their personal email and set their own password. If a company mailbox
-- is provisioned later, it must be created with that SAME current password so the
-- one login works everywhere. Supabase only stores a password HASH, so we keep the
-- current password AES-256-GCM encrypted here (never plaintext) and use it at
-- provision time. Updated on every password change.
alter table employees add column if not exists pwd_vault text;
