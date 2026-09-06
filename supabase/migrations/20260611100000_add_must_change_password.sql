-- Replaces onboarding flow: new employees must change their temp password
-- before they can use the dashboard. After changing, personal email is blocked.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
