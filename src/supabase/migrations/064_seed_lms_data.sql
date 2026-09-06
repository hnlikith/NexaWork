-- NAMAAH ACADEMY SEED DATA
-- Version: 1.1 (Idempotent)

DO $$ 
DECLARE
    course_id UUID;
    mod_1_id UUID;
    mod_2_id UUID;
BEGIN
    -- 1. Seed Engineering Course
    INSERT INTO lms_courses (title, slug, category, description, level, status)
    VALUES (
        'Engineering Excellence', 
        'engineering-excellence', 
        'Engineering', 
        'Master the Namaah Tech stack from internal workflows to production architecture.', 
        'intermediate', 
        'published'
    )
    ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO course_id;

    -- 2. Seed Sales Course
    INSERT INTO lms_courses (title, slug, category, description, level, status)
    VALUES (
        'Sales Mastery', 
        'sales-mastery', 
        'Sales', 
        'Learn the art of closing high-ticket enterprise contracts at Namaah.', 
        'beginner', 
        'published'
    )
    ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title;

    -- 3. Seed Modules for Engineering
    INSERT INTO lms_modules (course_id, title, order_index)
    VALUES (course_id, 'System Design Fundamentals', 1)
    ON CONFLICT DO NOTHING
    RETURNING id INTO mod_1_id;

    IF mod_1_id IS NULL THEN
        SELECT id INTO mod_1_id FROM lms_modules WHERE course_id = course_id AND title = 'System Design Fundamentals';
    END IF;

    -- 4. Seed Lessons for Engineering
    INSERT INTO lms_lessons (module_id, title, duration_minutes, order_index)
    VALUES (mod_1_id, 'Introduction to Microservices', 15, 1)
    ON CONFLICT DO NOTHING;

    INSERT INTO lms_lessons (module_id, title, duration_minutes, order_index)
    VALUES (mod_1_id, 'Event Driven Architecture', 30, 2)
    ON CONFLICT DO NOTHING;

END $$;
