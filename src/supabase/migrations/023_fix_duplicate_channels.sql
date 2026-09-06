-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 023: Fix duplicate channels + enforce team name as channel name
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Remove duplicate global channels (keep the oldest) ───────────────────
DELETE FROM channels
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM channels
  ORDER BY name, created_at ASC
);

-- ─── 2. Fix team channel names to use actual team name (not slugified) ────────
UPDATE channels c
SET name = t.name
FROM teams t
WHERE c.team_id = t.id;

-- ─── 3. Drop the name unique constraint (team names may not be globally unique)
-- Instead enforce: one channel per team (already have UNIQUE on team_id)
-- and one channel per global name
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_name_unique;

-- ─── 4. Re-add admin memberships after dedup ─────────────────────────────────
INSERT INTO channel_members (channel_id, employee_id)
SELECT c.id, e.id
  FROM channels c
  CROSS JOIN employees e
 WHERE e.role IN ('super_admin', 'accounts')
   AND e.is_active = true
ON CONFLICT (channel_id, employee_id) DO NOTHING;

-- ─── 5. Fix the seed insert in future runs to use ON CONFLICT on team_id ──────
-- Update trg_team_create_channel to use team name directly (not slugified)
CREATE OR REPLACE FUNCTION trg_team_create_channel()
RETURNS TRIGGER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  INSERT INTO channels (name, description, type, team_id, is_global)
  VALUES (
    NEW.name,
    'Channel for ' || NEW.name || ' team',
    'text',
    NEW.id,
    false
  )
  ON CONFLICT (team_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_channel_id;

  IF v_channel_id IS NOT NULL THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT v_channel_id, e.id
      FROM employees e
     WHERE e.team_id = NEW.id AND e.is_active = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;

    -- Add admins to new team channel
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT v_channel_id, e.id
      FROM employees e
     WHERE e.role IN ('super_admin', 'accounts') AND e.is_active = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 6. Verify result ────────────────────────────────────────────────────────
SELECT c.name, c.type, c.is_global, t.name as team_name, COUNT(cm.employee_id) as members
FROM channels c
LEFT JOIN teams t ON t.id = c.team_id
LEFT JOIN channel_members cm ON cm.channel_id = c.id
GROUP BY c.id, c.name, c.type, c.is_global, t.name
ORDER BY c.is_global DESC, c.name;
