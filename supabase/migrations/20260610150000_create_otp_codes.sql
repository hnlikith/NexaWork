-- ─── Create otp_codes table for Forgot Credentials OTP ───────────────────────

CREATE TABLE IF NOT EXISTS public.otp_codes (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR NOT NULL,
  otp VARCHAR NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Allow read/write access for service role only
CREATE POLICY "Allow service role only" ON public.otp_codes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
