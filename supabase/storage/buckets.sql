-- ============================================================================
-- Storage Buckets + RLS Policies
-- Run AFTER migrations, ONCE per Supabase project.
-- Idempotent — safe to re-run.
-- ============================================================================

-- ─── Create buckets ─────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('avatars',          'avatars',          true,  5  * 1024 * 1024, ARRAY['image/png','image/jpeg','image/webp','image/gif']),
  ('legal',            'legal',            true,  10 * 1024 * 1024, ARRAY['application/pdf']),
  ('invoices',         'invoices',         false, 10 * 1024 * 1024, ARRAY['application/pdf']),
  ('lms-content',      'lms-content',      false, 500 * 1024 * 1024, NULL),
  ('mail-attachments', 'mail-attachments', false, 25 * 1024 * 1024, NULL),
  ('documents',        'documents',        false, 50 * 1024 * 1024, NULL),
  -- General-purpose attachments bucket: used by support tickets, messages, etc.
  ('attachments',      'attachments',      false, 50 * 1024 * 1024, NULL),
  -- Mail file-sharing feature (mail_file_shares table, src/app/api/mail/files/**).
  -- Distinct from 'mail-attachments' (email-compose attachments,
  -- src/app/api/mail/attachments/**) — both are real, independent buckets
  -- confirmed by separate application code; this one was never defined in
  -- SQL until now. See DATABASE_IMPLEMENTATION_REPORT.md "BLOCKER REPAIR
  -- VALIDATION" for the repo-wide search that established this.
  ('mail-files',       'mail-files',       false, 100 * 1024 * 1024, NULL)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── Helper: is the requesting user an admin? ───────────────────────────────
CREATE OR REPLACE FUNCTION storage.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

-- ─── Public buckets (avatars, legal): anyone authenticated can READ ─────────
DROP POLICY IF EXISTS "public_read_avatars"     ON storage.objects;
DROP POLICY IF EXISTS "public_read_legal"       ON storage.objects;
DROP POLICY IF EXISTS "auth_write_avatars"      ON storage.objects;
DROP POLICY IF EXISTS "admin_write_legal"       ON storage.objects;

CREATE POLICY "public_read_avatars" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "public_read_legal" ON storage.objects FOR SELECT
  USING (bucket_id = 'legal');

CREATE POLICY "auth_write_avatars" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "admin_write_legal" ON storage.objects FOR ALL
  USING (bucket_id = 'legal' AND storage.is_admin())
  WITH CHECK (bucket_id = 'legal' AND storage.is_admin());

-- ─── Private buckets: authenticated users only ──────────────────────────────
DROP POLICY IF EXISTS "auth_read_invoices"          ON storage.objects;
DROP POLICY IF EXISTS "auth_read_lms"               ON storage.objects;
DROP POLICY IF EXISTS "auth_read_mail_attachments"  ON storage.objects;
DROP POLICY IF EXISTS "auth_read_documents"         ON storage.objects;
DROP POLICY IF EXISTS "auth_write_invoices"         ON storage.objects;
DROP POLICY IF EXISTS "auth_write_lms"              ON storage.objects;
DROP POLICY IF EXISTS "auth_write_mail_attachments" ON storage.objects;
DROP POLICY IF EXISTS "auth_write_documents"        ON storage.objects;

CREATE POLICY "auth_read_invoices"         ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices'         AND auth.role() = 'authenticated');
CREATE POLICY "auth_read_lms"              ON storage.objects FOR SELECT
  USING (bucket_id = 'lms-content'      AND auth.role() = 'authenticated');
CREATE POLICY "auth_read_mail_attachments" ON storage.objects FOR SELECT
  USING (bucket_id = 'mail-attachments' AND auth.role() = 'authenticated');
CREATE POLICY "auth_read_documents"        ON storage.objects FOR SELECT
  USING (bucket_id = 'documents'        AND auth.role() = 'authenticated');

CREATE POLICY "auth_write_invoices"         ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices'         AND auth.role() = 'authenticated');
CREATE POLICY "auth_write_lms"              ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lms-content'      AND auth.role() = 'authenticated');
CREATE POLICY "auth_write_mail_attachments" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'mail-attachments' AND auth.role() = 'authenticated');
CREATE POLICY "auth_write_documents"        ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents'        AND auth.role() = 'authenticated');

-- ─── General-purpose attachments bucket (support tickets, messages) ───────────
DROP POLICY IF EXISTS "auth_read_attachments"  ON storage.objects;
DROP POLICY IF EXISTS "auth_write_attachments" ON storage.objects;

-- Any authenticated employee can upload or read files in this bucket.
-- Row-level access control is handled at the application layer (ticket ownership).
CREATE POLICY "auth_read_attachments" ON storage.objects FOR SELECT
  USING (bucket_id = 'attachments' AND auth.role() = 'authenticated');

CREATE POLICY "auth_write_attachments" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'attachments' AND auth.role() = 'authenticated');

CREATE POLICY "auth_delete_attachments" ON storage.objects FOR DELETE
  USING (bucket_id = 'attachments' AND auth.role() = 'authenticated');

-- ─── Mail file-sharing bucket (mail-files) ──────────────────────────────────
-- Same access shape as 'attachments': uploads/reads/deletes happen through
-- the service-role client in src/app/api/mail/files/**, with real ownership
-- and sharing scoped in application code (mail_file_shares.shared_by /
-- .shared_with) — these policies exist for parity with every other bucket
-- and for any future client-side access, matching the pattern already used.
DROP POLICY IF EXISTS "auth_read_mail_files"   ON storage.objects;
DROP POLICY IF EXISTS "auth_write_mail_files"  ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_mail_files" ON storage.objects;

CREATE POLICY "auth_read_mail_files" ON storage.objects FOR SELECT
  USING (bucket_id = 'mail-files' AND auth.role() = 'authenticated');

CREATE POLICY "auth_write_mail_files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'mail-files' AND auth.role() = 'authenticated');

CREATE POLICY "auth_delete_mail_files" ON storage.objects FOR DELETE
  USING (bucket_id = 'mail-files' AND auth.role() = 'authenticated');
