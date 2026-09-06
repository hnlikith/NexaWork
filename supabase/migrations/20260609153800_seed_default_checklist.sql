-- Seed default onboarding checklist for employee onboarding initialization

INSERT INTO public.onboarding_checklists (id, title, steps)
VALUES ('d0f0d0f0-d0f0-d0f0-d0f0-d0f0d0f0d0f0', 'Default Employee Onboarding', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
