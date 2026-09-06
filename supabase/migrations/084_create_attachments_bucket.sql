-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Create the 'attachments' storage bucket
-- Run this in the Supabase SQL Editor OR via `supabase db push`
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Create the bucket (idempotent via ON CONFLICT)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,           -- NOT public — authenticated access only
  52428800,        -- 50 MB per file
  NULL             -- NULL = all MIME types allowed (PDF, DOCX, PNG, ZIP, etc.)
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. RLS: Any authenticated user can READ files (ticket viewer can see attachments)
DROP POLICY IF EXISTS "auth_read_attachments"   ON storage.objects;
DROP POLICY IF EXISTS "auth_write_attachments"  ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_attachments" ON storage.objects;

CREATE POLICY "auth_read_attachments" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'attachments' AND auth.role() = 'authenticated');

-- 3. RLS: Any authenticated user can UPLOAD files
CREATE POLICY "auth_write_attachments" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'attachments' AND auth.role() = 'authenticated');

-- 4. RLS: Authenticated users can DELETE their own files
CREATE POLICY "auth_delete_attachments" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'attachments' AND auth.role() = 'authenticated');
