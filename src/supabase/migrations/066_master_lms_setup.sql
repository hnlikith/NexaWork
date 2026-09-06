-- MASTER NAMAAH ACADEMY SETUP (COMBINED)
-- This script creates the tables if they don't exist and applies the RLS policies.
-- Run this in your Supabase SQL Editor.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Courses Table
CREATE TABLE IF NOT EXISTS lms_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'Engineering',
    thumbnail_url TEXT,
    level TEXT CHECK (level IN ('beginner', 'intermediate', 'advanced')) DEFAULT 'beginner',
    status TEXT CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Modules Table
CREATE TABLE IF NOT EXISTS lms_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES lms_courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Lessons Table
CREATE TABLE IF NOT EXISTS lms_lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID REFERENCES lms_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    video_url TEXT,
    duration_minutes INTEGER DEFAULT 0,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enrollments Table
CREATE TABLE IF NOT EXISTS lms_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES lms_courses(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    progress_percent INTEGER DEFAULT 0,
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(course_id, employee_id)
);

-- 5. Certifications Table
CREATE TABLE IF NOT EXISTS lms_certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES lms_courses(id),
    employee_id UUID REFERENCES employees(id),
    certificate_number TEXT UNIQUE NOT NULL,
    issue_date DATE DEFAULT CURRENT_DATE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ENABLE RLS
ALTER TABLE lms_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_certifications ENABLE ROW LEVEL SECURITY;

-- PERMISSIVE RLS POLICIES (FOR TESTING)
-- We use DROP and CREATE to ensure they are updated correctly.

-- Courses
DROP POLICY IF EXISTS "Employees can view courses" ON lms_courses;
CREATE POLICY "Employees can view courses" ON lms_courses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage courses" ON lms_courses;
CREATE POLICY "Admins manage courses" ON lms_courses FOR ALL USING (true);

-- Modules
DROP POLICY IF EXISTS "Employees can view modules" ON lms_modules;
CREATE POLICY "Employees can view modules" ON lms_modules FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage modules" ON lms_modules;
CREATE POLICY "Admins manage modules" ON lms_modules FOR ALL USING (true);

-- Lessons
DROP POLICY IF EXISTS "Employees can view lessons" ON lms_lessons;
CREATE POLICY "Employees can view lessons" ON lms_lessons FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage lessons" ON lms_lessons;
CREATE POLICY "Admins manage lessons" ON lms_lessons FOR ALL USING (true);

-- Enrollments
DROP POLICY IF EXISTS "Employees can view own enrollments" ON lms_enrollments;
CREATE POLICY "Employees can view own enrollments" ON lms_enrollments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage enrollments" ON lms_enrollments;
CREATE POLICY "Admins manage enrollments" ON lms_enrollments FOR ALL USING (true);

-- Certifications
DROP POLICY IF EXISTS "Employees can view own certifications" ON lms_certifications;
CREATE POLICY "Employees can view own certifications" ON lms_certifications FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage certifications" ON lms_certifications;
CREATE POLICY "Admins manage certifications" ON lms_certifications FOR ALL USING (true);
