-- Add status column to user_presence for rich 7-state presence tracking.
-- Status is written by client actions (check-in → available, check-out → offline,
-- pause → break, resume → available). The heartbeat path never overwrites it.
ALTER TABLE user_presence ADD COLUMN IF NOT EXISTS status text;
