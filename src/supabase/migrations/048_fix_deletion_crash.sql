-- ============================================================
-- CRITICAL DATABASE FIX: Employee Deletion & Progress Sync
-- ============================================================

-- 1. FIX: Add missing updated_at column to project_members
-- This was causing "record 'new' has no field 'updated_at'" crashes
ALTER TABLE public.project_members 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. FIX: Robust updated_at function (Handles cases where NEW might be NULL or missing column)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Only attempt to set updated_at if TG_OP is not DELETE and NEW is not NULL
    IF (TG_OP <> 'DELETE') AND (NEW IS NOT NULL) THEN
        BEGIN
            NEW.updated_at = NOW();
        EXCEPTION WHEN undefined_column THEN
            -- If the table truly doesn't have the column, just ignore
            NULL;
        END;
    END IF;
    
    -- In a BEFORE trigger, returning NEW allows the operation
    -- In a DELETE trigger, NEW is NULL, so we return OLD
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. FIX: Progress Calculation (Handles DELETE operations)
CREATE OR REPLACE FUNCTION public.calculate_project_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_project_id UUID;
    total_tasks INTEGER;
    completed_tasks INTEGER;
    progress_percent NUMERIC;
BEGIN
    -- Use OLD for DELETE, NEW for INSERT/UPDATE
    IF (TG_OP = 'DELETE') THEN
        v_project_id := OLD.project_id;
    ELSE
        v_project_id := NEW.project_id;
    END IF;

    -- If no project_id, exit
    IF v_project_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Calculate stats
    SELECT COUNT(*) INTO total_tasks FROM public.project_tasks WHERE project_id = v_project_id;

    IF total_tasks = 0 THEN
        UPDATE public.projects SET progress = 0 WHERE id = v_project_id;
    ELSE
        SELECT COUNT(*) INTO completed_tasks FROM public.project_tasks
        WHERE project_id = v_project_id AND status = 'COMPLETED';

        progress_percent := ROUND((completed_tasks::NUMERIC / total_tasks) * 100);
        UPDATE public.projects SET progress = progress_percent WHERE id = v_project_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 4. Re-apply triggers to ensure they use the corrected functions
DROP TRIGGER IF EXISTS tr_update_project_members_at ON public.project_members;
CREATE TRIGGER tr_update_project_members_at
    BEFORE UPDATE ON public.project_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_update_project_progress ON public.project_tasks;
CREATE TRIGGER tr_update_project_progress
    AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION calculate_project_progress();

-- 5. RELOAD SCHEMA
NOTIFY pgrst, 'reload schema';
