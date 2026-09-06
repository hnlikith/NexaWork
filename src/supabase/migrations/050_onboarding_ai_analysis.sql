-- Add Consultant Agreement Text to System Config
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS consultant_agreement_text TEXT;

-- Create Onboarding Analysis Queue Table
CREATE TABLE IF NOT EXISTS onboarding_analysis_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pdf_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    analyzed_text TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime for the queue (optional but good for UI updates)
ALTER TABLE onboarding_analysis_queue REPLICA IDENTITY FULL;
