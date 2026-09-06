-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 083: Hierarchical Support System V2
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Update Enum Values ──────────────────────────────────────────────────
-- In PostgreSQL, ALTER TYPE ADD VALUE cannot run inside a transaction block in some contexts,
-- so we run it directly. Supabase handles this automatically.
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'in_review';

-- ─── 2. Add New Columns to support_tickets ────────────────────────────────────
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS attachments TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS current_handler_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS tracking_log JSONB DEFAULT '[]'::jsonb;

-- ─── 3. Add Indexes for Performance ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_handler ON public.support_tickets(current_handler_id);

-- ─── 4. Comments for Documentation ──────────────────────────────────────────
COMMENT ON COLUMN public.support_tickets.attachments IS 'Array of file attachment URLs or paths raised with the ticket.';
COMMENT ON COLUMN public.support_tickets.current_handler_id IS 'The specific employee currently assigned to solve or route the ticket.';
COMMENT ON COLUMN public.support_tickets.rejection_reason IS 'Mandatory explanation logged if the ticket is rejected by any handler.';
COMMENT ON COLUMN public.support_tickets.tracking_log IS 'Chronological log containing the complete routing path and handler notes.';
