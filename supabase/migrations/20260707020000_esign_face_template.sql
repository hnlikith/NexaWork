-- Encrypted biometric face template for the e-sign gate.
-- Instead of re-deriving the reference face from the raw selfie on every attempt,
-- the candidate's 128-D face embedding is frozen on first verification and stored
-- AES-256-GCM encrypted here (iv:tag:ciphertext, base64). No raw image is kept in
-- this column. The server decrypts it to compare against the live capture, so the
-- match threshold + reference are server-authoritative (not client-trusted).
alter table onboarding_packets add column if not exists sign_face_template text;
