-- Drop the existing primary key constraint on user_presence
ALTER TABLE public.user_presence DROP CONSTRAINT IF EXISTS user_presence_pkey;

-- Add columns device_id, user_agent, and device_name if they do not exist
ALTER TABLE public.user_presence ADD COLUMN IF NOT EXISTS device_id text NOT NULL DEFAULT 'default';
ALTER TABLE public.user_presence ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.user_presence ADD COLUMN IF NOT EXISTS device_name text;

-- Create the new composite primary key constraint
ALTER TABLE public.user_presence ADD CONSTRAINT user_presence_pkey PRIMARY KEY (user_id, device_id);
