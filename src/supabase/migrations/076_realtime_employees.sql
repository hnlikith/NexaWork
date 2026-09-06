-- Migration 076: Enable Realtime for Employees
-- Ensures that any changes to the employees table are broadcast via Supabase Realtime
-- This allows the Support Hub and other modules to update their assignee/role lists instantly.

DO $$ BEGIN
  BEGIN 
    ALTER PUBLICATION supabase_realtime ADD TABLE employees;
  EXCEPTION 
    WHEN duplicate_object THEN NULL; 
    WHEN OTHERS THEN 
      -- If publication doesn't exist or other error, just ignore
      NULL;
  END;
END $$;
