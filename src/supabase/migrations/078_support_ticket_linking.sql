-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 078: Support Ticket Linking System
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Add Linked Ticket Column ─────────────────────────────────────────────
ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS linked_ticket_id UUID REFERENCES support_tickets(id) ON DELETE SET NULL;

-- ─── 2. Add Index for Performance ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_linked_id ON support_tickets(linked_ticket_id);

-- ─── 3. Documentation ────────────────────────────────────────────────────────
COMMENT ON COLUMN support_tickets.linked_ticket_id IS 'UUID of a related previous ticket for historical context.';
