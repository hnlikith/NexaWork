-- Migration 010: Add Issued Date to Projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS issued_date DATE;
