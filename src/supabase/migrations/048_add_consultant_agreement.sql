-- Add Consultant Agreement URL to System Config
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_config' AND column_name='consultant_agreement_url') THEN
        ALTER TABLE system_config ADD COLUMN consultant_agreement_url TEXT;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- STORAGE BUCKET CONFIGURATION (legal)
-- This creates the bucket and sets up security policies
-- ─────────────────────────────────────────────────────────

-- 1. Create the 'legal' bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal', 'legal', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if they exist to avoid errors on re-run
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete" ON storage.objects;

-- 4. Public Access: Allow anyone to read files from the 'legal' bucket
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'legal' );

-- 5. Admin Upload: Allow authenticated users to upload to 'legal'
-- We check for authenticated status. For stricter security, you can check roles.
CREATE POLICY "Admin Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'legal' );

-- 6. Admin Update: Allow authenticated users to update in 'legal'
CREATE POLICY "Admin Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'legal' )
WITH CHECK ( bucket_id = 'legal' );

-- 7. Admin Delete: Allow authenticated users to delete in 'legal'
CREATE POLICY "Admin Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'legal' );
