-- ─── Add RLS policies for user_onboarding table ─────────────────────────────

-- Drop existing policies if they happen to exist
DROP POLICY IF EXISTS "Allow users to read their own onboarding" ON public.user_onboarding;
DROP POLICY IF EXISTS "Allow users to insert their own onboarding" ON public.user_onboarding;
DROP POLICY IF EXISTS "Allow users to update their own onboarding" ON public.user_onboarding;
DROP POLICY IF EXISTS "Allow admins to read all onboarding" ON public.user_onboarding;
DROP POLICY IF EXISTS "Allow admins to insert onboarding" ON public.user_onboarding;
DROP POLICY IF EXISTS "Allow admins to update onboarding" ON public.user_onboarding;

-- Allow users to read their own onboarding row
CREATE POLICY "Allow users to read their own onboarding" 
ON public.user_onboarding 
FOR SELECT 
USING (auth.uid() = user_id);

-- Allow users to insert their own onboarding row
CREATE POLICY "Allow users to insert their own onboarding" 
ON public.user_onboarding 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own onboarding row
CREATE POLICY "Allow users to update their own onboarding" 
ON public.user_onboarding 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow admins to read all onboarding rows
CREATE POLICY "Allow admins to read all onboarding"
ON public.user_onboarding
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  )
);

-- Allow admins to insert onboarding rows
CREATE POLICY "Allow admins to insert onboarding"
ON public.user_onboarding
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  )
);

-- Allow admins to update onboarding rows
CREATE POLICY "Allow admins to update onboarding"
ON public.user_onboarding
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  )
);
