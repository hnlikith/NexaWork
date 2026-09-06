-- Add status column to user_presence for rich 7-state presence tracking.
ALTER TABLE user_presence ADD COLUMN IF NOT EXISTS status text;
