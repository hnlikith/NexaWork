-- Add routing rules to realtime publication for instant UI updates
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE support_routing_rules; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
