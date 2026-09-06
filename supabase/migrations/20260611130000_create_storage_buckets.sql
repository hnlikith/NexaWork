-- ============================================================================
-- Create all required Supabase Storage buckets.
-- Safe to run on existing projects — ON CONFLICT DO NOTHING skips duplicates.
-- The API layer uses service_role (getSupabaseAdmin) which bypasses RLS, so
-- no row-level policies are needed for server-side API access.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  -- Profile / legal assets (public read, any mime)
  ('avatars',          'avatars',          true,  5242880,   ARRAY['image/png','image/jpeg','image/webp','image/gif']),
  ('legal',            'legal',            true,  10485760,  NULL),

  -- Private operational buckets
  ('invoices',         'invoices',         false, 10485760,  ARRAY['application/pdf']),
  ('resumes',          'resumes',          false, 10485760,  NULL),
  ('lms-content',      'lms-content',      false, 524288000, NULL),
  ('documents',        'documents',        false, 52428800,  NULL),

  -- Mail compose attachments (used by /api/mail/attachments POST)
  ('mail-attachments', 'mail-attachments', false, 26214400,  NULL),

  -- General-purpose attachments: support tickets, messaging, etc.
  ('attachments',      'attachments',      false, 52428800,  NULL)

ON CONFLICT (id) DO UPDATE SET
  public          = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;
