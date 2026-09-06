-- 105: E-sign identity gate — email OTP + live-face-verification stamp on the sign flow.
alter table onboarding_packets add column if not exists sign_otp_hash         text;
alter table onboarding_packets add column if not exists sign_otp_expires_at   timestamptz;
alter table onboarding_packets add column if not exists sign_otp_attempts     int not null default 0;
alter table onboarding_packets add column if not exists sign_face_verified_at timestamptz;
