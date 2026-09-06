-- 108: System observability — split the single Master Log Sheet into four
-- purpose-built pages. Seed the new module permissions (admin-only by default,
-- grantable per role/employee in /admin/permissions). Master Log Sheet itself
-- was already seeded in migration 107.

do $$
declare
  all_roles   text[] := array['admin','dept_lead','team_lead','employee','intern'];
  all_modules text[] := array['workspace_monitor','sessions','security_audit'];
  r text; m text;
begin
  foreach r in array all_roles loop
    foreach m in array all_modules loop
      insert into role_permissions (role, module_key, can_view, can_create, can_edit, can_delete, can_export)
      values (r, m, false, false, false, false, false)
      on conflict (role, module_key) do nothing;
    end loop;
  end loop;
end $$;

update role_permissions
  set can_view = true
  where role = 'admin'
    and module_key in ('workspace_monitor','sessions','security_audit');
