-- Add progress tracking to applications table
ALTER TABLE applications ADD COLUMN IF NOT EXISTS processing_progress INT DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS processing_step TEXT;
