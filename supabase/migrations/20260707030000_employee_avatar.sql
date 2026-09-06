-- Employee display picture. When a candidate is converted to an employee via
-- onboarding, their uploaded Profile Photo is copied here so the same DP that
-- appeared throughout onboarding carries into the permanent employee record.
alter table employees add column if not exists avatar_url text;
