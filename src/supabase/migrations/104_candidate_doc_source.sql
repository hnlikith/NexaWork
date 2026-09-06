-- 104: Candidate-document → onboarding integration.
-- (a) tag candidate-uploaded File Share rows with the candidate's email as the
--     source "from" (shown in File Share + used to fetch docs by email);
-- (b) a "converted to onboard" flag so a candidate who finished uploading can be
--     surfaced in the onboarding "From Interview" picker.
alter table mail_file_shares add column if not exists external_from text;

alter table candidate_document_requests add column if not exists converted_to_onboard boolean not null default false;
alter table candidate_document_requests add column if not exists converted_at timestamptz;
