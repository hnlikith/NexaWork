-- LMS RLS POLICY EXTENSION (PERMISSIVE)
-- Version: 1.3

-- 1. Modules
ALTER TABLE lms_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Employees can view modules" ON lms_modules;
CREATE POLICY "Employees can view modules" ON lms_modules FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage modules" ON lms_modules;
CREATE POLICY "Admins manage modules" ON lms_modules FOR ALL USING (true);

-- 2. Lessons
ALTER TABLE lms_lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Employees can view lessons" ON lms_lessons;
CREATE POLICY "Employees can view lessons" ON lms_lessons FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage lessons" ON lms_lessons;
CREATE POLICY "Admins manage lessons" ON lms_lessons FOR ALL USING (true);

-- 3. Enrollments
ALTER TABLE lms_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Employees can view own enrollments" ON lms_enrollments;
CREATE POLICY "Employees can view own enrollments" ON lms_enrollments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage enrollments" ON lms_enrollments;
CREATE POLICY "Admins manage enrollments" ON lms_enrollments FOR ALL USING (true);

-- 4. Certifications
ALTER TABLE lms_certifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Employees can view own certifications" ON lms_certifications;
CREATE POLICY "Employees can view own certifications" ON lms_certifications FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage certifications" ON lms_certifications;
CREATE POLICY "Admins manage certifications" ON lms_certifications FOR ALL USING (true);

-- 5. Fix Courses
DROP POLICY IF EXISTS "Employees can view courses" ON lms_courses;
CREATE POLICY "Employees can view courses" ON lms_courses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage courses" ON lms_courses;
CREATE POLICY "Admins manage courses" ON lms_courses FOR ALL USING (true);
