-- Migration: Allow nullable user_id in audit_logs
-- Allows setting user_id to NULL when employees are deleted to preserve audit trails.
-- Originally targeted actor_id; the reconstructed local baseline uses user_id
-- as the actor-identifying column (see DATABASE_COMPATIBILITY_BLOCKERS.md).
-- The baseline already defines this column as nullable, so this statement is
-- a harmless idempotent no-op here — kept for parity with the original intent.

ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;
