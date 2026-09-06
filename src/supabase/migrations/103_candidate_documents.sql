-- 103: Candidate document collection (KYC) — post-interview / manual magic-link uploads.
-- A candidate uploads a face photo + Aadhaar + PAN via a tokenized public page.
-- Files are emailed back to HR and surfaced in the existing File Share module
-- (stored as base64 data URLs in mail_file_shares, mirroring the manual-upload path).

create table if not exists candidate_document_requests (
  id                uuid primary key default gen_random_uuid(),
  application_id    text references applications(application_id) on delete set null,
  candidate_name    text not null,
  candidate_email   text not null,
  candidate_phone   text,
  source            text not null default 'interview' check (source in ('interview','manual')),
  required_docs     text[] not null default array['face_photo','aadhaar','pan']::text[],
  token             text unique not null,
  token_expires_at  timestamptz,
  status            text not null default 'pending' check (status in ('pending','submitted','expired')),
  candidate_message text,
  submitted_at      timestamptz,
  viewed_at         timestamptz,
  last_reminded_at  timestamptz,
  reminder_count    int not null default 0,
  created_by        uuid references employees(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Backfill the tracking columns when the table already existed from an earlier apply.
alter table candidate_document_requests add column if not exists viewed_at        timestamptz;
alter table candidate_document_requests add column if not exists last_reminded_at timestamptz;
alter table candidate_document_requests add column if not exists reminder_count   int not null default 0;

create table if not exists candidate_documents (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references candidate_document_requests(id) on delete cascade,
  document_type text not null check (document_type in ('face_photo','aadhaar','pan','other')),
  file_share_id uuid references mail_file_shares(id) on delete set null,
  filename      text not null,
  file_size     bigint,
  file_type     text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_cdr_token       on candidate_document_requests(token);
create index if not exists idx_cdr_application  on candidate_document_requests(application_id);
create index if not exists idx_cdr_status       on candidate_document_requests(status);
create index if not exists idx_cdoc_request     on candidate_documents(request_id);

-- keep updated_at fresh
create or replace function touch_candidate_document_requests() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_cdr_touch on candidate_document_requests;
create trigger trg_cdr_touch before update on candidate_document_requests
  for each row execute function touch_candidate_document_requests();

alter table candidate_document_requests enable row level security;
alter table candidate_documents          enable row level security;

-- Request metadata (name/email/phone/status) is readable by authenticated staff;
-- all writes go through service-role API routes. Document refs stay service-role only.
drop policy if exists cdr_read on candidate_document_requests;
create policy cdr_read on candidate_document_requests for select using (true);

-- live updates for the interviews/admin views
do $$ begin
  alter publication supabase_realtime add table candidate_document_requests;
exception when duplicate_object then null; end $$;
