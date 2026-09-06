-- Add a dedicated "profile_photo" candidate document type.
-- The candidate now uploads TWO face images during KYC:
--   • face_photo    — the live selfie, used ONLY for e-sign face verification
--   • profile_photo — a clean passport-style photo, used as the display picture
--                     (DP) / ID-card photo everywhere across onboarding.
-- Both continue to be surfaced in the File Share module like every other doc.

-- Widen the allowed document types (the original inline CHECK is auto-named).
alter table candidate_documents
  drop constraint if exists candidate_documents_document_type_check;
alter table candidate_documents
  add constraint candidate_documents_document_type_check
  check (document_type in ('profile_photo','face_photo','aadhaar','pan','other'));

-- New requests collect the profile photo first, then the verification selfie + KYC IDs.
alter table candidate_document_requests
  alter column required_docs
  set default array['profile_photo','face_photo','aadhaar','pan']::text[];
