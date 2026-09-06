-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 079: Force Constraint Name for Ticket Linking
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Drop existing FK if it exists under unknown name ────────────────────
-- We'll try to drop by column and recreate with explicit name
ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_linked_ticket_id_fkey;

-- ─── 2. Add with explicit name ───────────────────────────────────────────────
ALTER TABLE support_tickets 
ADD CONSTRAINT support_tickets_linked_ticket_id_fkey 
FOREIGN KEY (linked_ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
