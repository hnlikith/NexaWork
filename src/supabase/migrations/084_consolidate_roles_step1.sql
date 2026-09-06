-- Migration 084: Consolidate Roles - Step 1 (Enum Extension)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ensure new roles exist in user_role enum
-- These must be committed before they can be used in the next step.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'department_lead';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_lead';
