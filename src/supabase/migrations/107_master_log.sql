-- 107: Master Log Sheet — universal activity/change log + live presence.

-- Enrich the existing audit_logs table for the Master Log Sheet (idempotent).
alter table audit_logs add column if not exists actor_name   text;
alter table audit_logs add column if not exists actor_emp_id text;
alter table audit_logs add column if not exists actor_role   text;
alter table audit_logs add column if not exists section      text;
alter table audit_logs add column if not exists summary      text;
alter table audit_logs add column if not exists changes      jsonb;
create index if not exists audit_logs_section_idx on audit_logs(section);

-- Live presence — who is active in the workspace right now.
create table if not exists user_presence (
  user_id      uuid primary key references employees(id) on delete cascade,
  last_seen    timestamptz not null default now(),
  current_path text,
  updated_at   timestamptz not null default now()
);
alter table user_presence enable row level security;
drop policy if exists user_presence_read on user_presence;
create policy user_presence_read on user_presence for select
  using ((select role::text from employees where id = auth.uid()) = 'admin' or user_id = auth.uid());

-- Realtime for the Master Log Sheet (live log + live presence).
alter table audit_logs    replica identity full;
alter table user_presence replica identity full;
do $$ begin alter publication supabase_realtime add table audit_logs;    exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table user_presence; exception when duplicate_object then null; end $$;

-- Master Log Sheet permission (admin-only by default; grantable in /admin/permissions).
do $$
declare all_roles text[] := array['admin','dept_lead','team_lead','employee','intern']; r text;
begin
  foreach r in array all_roles loop
    insert into role_permissions (role, module_key, can_view, can_create, can_edit, can_delete, can_export)
    values (r, 'master_log', false, false, false, false, false)
    on conflict (role, module_key) do nothing;
  end loop;
end $$;
update role_permissions set can_view = true where role = 'admin' and module_key = 'master_log';
