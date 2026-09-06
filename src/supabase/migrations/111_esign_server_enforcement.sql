-- 111: Server-side enforcement of the e-sign identity gate.
-- Until now OTP + liveness + face-match were all gated CLIENT-SIDE only — the
-- sign POST accepted any submission, so the biometrics could be bypassed by
-- calling the API directly. These columns let the server require proof:
--   • sign_otp_verified_at  — stamped when the emailed OTP is verified server-side
--   • sign_verification     — the biometric evidence bundle recorded at verify time
--                             (liveness pass, face similarity, risk score, quality,
--                              device-fingerprint hash) — NO raw images stored
--   • sign_verify_token     — single-use proof handle issued only after OTP+face pass;
--                             the sign POST must present a matching, unexpired token
--   • sign_verify_expires_at— 2-hour backstop expiry (session presence is enforced
--                             separately by the client exit guard, so this is only a
--                             replay backstop — it does NOT rush the candidate)
alter table onboarding_packets add column if not exists sign_otp_verified_at  timestamptz;
alter table onboarding_packets add column if not exists sign_verification     jsonb;
alter table onboarding_packets add column if not exists sign_verify_token     text;
alter table onboarding_packets add column if not exists sign_verify_expires_at timestamptz;
