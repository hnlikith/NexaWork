-- LMS EXTENDED SCHEMA — Migration 067
-- Adds: learning paths, lesson progress, quiz engine, badges, announcements
-- Extends: lms_lessons with type/lesson_type, lms_courses with instructor/tags

-- ─── Extend Existing Tables ─────────────────────────────────────────────────

ALTER TABLE lms_lessons
  ADD COLUMN IF NOT EXISTS lesson_type TEXT CHECK (lesson_type IN ('lesson', 'quiz', 'assignment')) DEFAULT 'lesson';

ALTER TABLE lms_courses
  ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(4,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS cover_color TEXT DEFAULT 'blue';

-- ─── Learning Paths ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lms_learning_paths (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  description   TEXT,
  thumbnail_url TEXT,
  cover_color   TEXT DEFAULT 'violet',
  status        TEXT CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  created_by    UUID REFERENCES employees(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_path_courses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  path_id     UUID REFERENCES lms_learning_paths(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES lms_courses(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  UNIQUE(path_id, course_id)
);

-- ─── Lesson Progress (per-lesson completion per employee) ────────────────────

CREATE TABLE IF NOT EXISTS lms_lesson_progress (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id           UUID REFERENCES lms_lessons(id) ON DELETE CASCADE,
  employee_id         UUID REFERENCES employees(id) ON DELETE CASCADE,
  completed_at        TIMESTAMPTZ DEFAULT NOW(),
  time_spent_seconds  INTEGER DEFAULT 0,
  UNIQUE(lesson_id, employee_id)
);

-- ─── Quiz Engine ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lms_quiz_questions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id     UUID REFERENCES lms_lessons(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  options       JSONB NOT NULL DEFAULT '[]',    -- array of strings
  correct_index INTEGER NOT NULL DEFAULT 0,
  explanation   TEXT,
  order_index   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_quiz_attempts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id     UUID REFERENCES lms_lessons(id) ON DELETE CASCADE,
  employee_id   UUID REFERENCES employees(id) ON DELETE CASCADE,
  score_percent INTEGER DEFAULT 0,
  answers       JSONB DEFAULT '[]',             -- array of selected option indices
  passed        BOOLEAN DEFAULT FALSE,
  attempted_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Announcements ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lms_announcements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  body        TEXT,
  priority    TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  created_by  UUID REFERENCES employees(id),
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Badges / Achievements ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lms_badges (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT '🏆',
  color       TEXT DEFAULT 'amber',
  criteria    JSONB DEFAULT '{}',              -- e.g. { "courses_completed": 5 }
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_employee_badges (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  badge_id    UUID REFERENCES lms_badges(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  awarded_at  TIMESTAMPTZ DEFAULT NOW(),
  awarded_by  UUID REFERENCES employees(id),
  UNIQUE(badge_id, employee_id)
);

-- ─── Enable RLS ──────────────────────────────────────────────────────────────

ALTER TABLE lms_learning_paths    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_path_courses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_lesson_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_quiz_questions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_quiz_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_badges            ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_employee_badges   ENABLE ROW LEVEL SECURITY;

-- ─── Permissive RLS Policies (development) ───────────────────────────────────

DROP POLICY IF EXISTS "All select lms_learning_paths"  ON lms_learning_paths;
CREATE POLICY "All select lms_learning_paths"  ON lms_learning_paths  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage lms_learning_paths" ON lms_learning_paths;
CREATE POLICY "Admins manage lms_learning_paths" ON lms_learning_paths FOR ALL USING (true);

DROP POLICY IF EXISTS "All select lms_path_courses"    ON lms_path_courses;
CREATE POLICY "All select lms_path_courses"    ON lms_path_courses    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage lms_path_courses" ON lms_path_courses;
CREATE POLICY "Admins manage lms_path_courses" ON lms_path_courses    FOR ALL USING (true);

DROP POLICY IF EXISTS "All select lms_lesson_progress" ON lms_lesson_progress;
CREATE POLICY "All select lms_lesson_progress" ON lms_lesson_progress FOR SELECT USING (true);
DROP POLICY IF EXISTS "All manage lms_lesson_progress" ON lms_lesson_progress;
CREATE POLICY "All manage lms_lesson_progress" ON lms_lesson_progress FOR ALL USING (true);

DROP POLICY IF EXISTS "All select lms_quiz_questions"  ON lms_quiz_questions;
CREATE POLICY "All select lms_quiz_questions"  ON lms_quiz_questions  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage lms_quiz_questions" ON lms_quiz_questions;
CREATE POLICY "Admins manage lms_quiz_questions" ON lms_quiz_questions FOR ALL USING (true);

DROP POLICY IF EXISTS "All select lms_quiz_attempts"   ON lms_quiz_attempts;
CREATE POLICY "All select lms_quiz_attempts"   ON lms_quiz_attempts   FOR SELECT USING (true);
DROP POLICY IF EXISTS "All manage lms_quiz_attempts"   ON lms_quiz_attempts;
CREATE POLICY "All manage lms_quiz_attempts"   ON lms_quiz_attempts   FOR ALL USING (true);

DROP POLICY IF EXISTS "All select lms_announcements"   ON lms_announcements;
CREATE POLICY "All select lms_announcements"   ON lms_announcements   FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage lms_announcements" ON lms_announcements;
CREATE POLICY "Admins manage lms_announcements" ON lms_announcements  FOR ALL USING (true);

DROP POLICY IF EXISTS "All select lms_badges"          ON lms_badges;
CREATE POLICY "All select lms_badges"          ON lms_badges          FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage lms_badges"       ON lms_badges;
CREATE POLICY "Admins manage lms_badges"       ON lms_badges          FOR ALL USING (true);

DROP POLICY IF EXISTS "All select lms_employee_badges" ON lms_employee_badges;
CREATE POLICY "All select lms_employee_badges" ON lms_employee_badges FOR SELECT USING (true);
DROP POLICY IF EXISTS "All manage lms_employee_badges" ON lms_employee_badges;
CREATE POLICY "All manage lms_employee_badges" ON lms_employee_badges FOR ALL USING (true);

-- ─── Seed Default Badges ─────────────────────────────────────────────────────

INSERT INTO lms_badges (name, description, icon, color, criteria) VALUES
  ('First Step',     'Completed your first lesson',            '🚀', 'blue',    '{"lessons_completed": 1}'),
  ('Quick Learner',  'Completed 5 lessons in a single day',    '⚡', 'amber',   '{"lessons_per_day": 5}'),
  ('Course Champion','Completed an entire course',             '🏆', 'amber',   '{"courses_completed": 1}'),
  ('Quiz Master',    'Scored 100% on a quiz',                  '🎯', 'emerald', '{"quiz_perfect_score": 1}'),
  ('Certified Pro',  'Earned 3 or more certifications',        '🎓', 'violet',  '{"certifications": 3}'),
  ('Academy Legend', 'Completed all available courses',        '👑', 'rose',    '{"all_courses": true}')
ON CONFLICT DO NOTHING;

-- ─── Realtime Publication ────────────────────────────────────────────────────
-- Run in Supabase dashboard if not already set up:
-- ALTER PUBLICATION supabase_realtime ADD TABLE lms_learning_paths;
-- ALTER PUBLICATION supabase_realtime ADD TABLE lms_lesson_progress;
-- ALTER PUBLICATION supabase_realtime ADD TABLE lms_quiz_attempts;
-- ALTER PUBLICATION supabase_realtime ADD TABLE lms_announcements;
-- ALTER PUBLICATION supabase_realtime ADD TABLE lms_employee_badges;
