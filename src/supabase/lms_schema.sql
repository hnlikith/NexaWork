-- ==========================================
-- NAMAAH LMS: DATABASE SCHEMA
-- ==========================================

-- 1. COURSES
CREATE TABLE IF NOT EXISTS lms_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    category TEXT, -- e.g., 'Engineering', 'Sales', 'HR'
    duration_mins INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. MODULES
CREATE TABLE IF NOT EXISTS lms_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES lms_courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. LESSONS
CREATE TABLE IF NOT EXISTS lms_lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID REFERENCES lms_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT, -- Rich text/Markdown
    video_url TEXT,
    file_attachment_url TEXT,
    "order" INTEGER NOT NULL,
    estimated_mins INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. USER COURSE PROGRESS
CREATE TABLE IF NOT EXISTS lms_user_progress (
    user_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lms_lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, lesson_id)
);

-- 5. ONBOARDING CHECKLISTS
CREATE TABLE IF NOT EXISTS onboarding_checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    role_target user_role, -- Optional: target specific roles
    steps JSONB NOT NULL, -- Array of objects: [{id, title, description, required: bool}]
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. USER ONBOARDING STATUS
CREATE TABLE IF NOT EXISTS user_onboarding (
    user_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    checklist_id UUID REFERENCES onboarding_checklists(id) ON DELETE CASCADE,
    completed_steps JSONB DEFAULT '[]', -- Array of step IDs
    nda_signed_at TIMESTAMPTZ,
    nda_url TEXT,
    status TEXT CHECK (status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, checklist_id)
);

-- 7. CERTIFICATIONS
CREATE TABLE IF NOT EXISTS lms_certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    course_id UUID REFERENCES lms_courses(id) ON DELETE CASCADE,
    certificate_url TEXT NOT NULL,
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    expiry_at TIMESTAMPTZ -- Some certs might expire
);

-- Enable Realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE lms_user_progress;
        ALTER PUBLICATION supabase_realtime ADD TABLE user_onboarding;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
