-- Enable Supabase Realtime on the employees table so the permissions page
-- can receive instant postgres_changes events when employees are added,
-- updated (role/department/status change), or deleted.

ALTER PUBLICATION supabase_realtime ADD TABLE employees;
