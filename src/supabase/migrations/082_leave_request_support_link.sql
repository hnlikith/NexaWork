-- 082_leave_request_support_link.sql

-- 1. Add tracking columns to leave_requests
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS support_ticket_id UUID REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 2. Create trigger to auto-approve leave when ticket is resolved
CREATE OR REPLACE FUNCTION trg_approve_leave_on_ticket_resolve()
RETURNS TRIGGER AS $$
BEGIN
  -- If ticket was just resolved or closed
  IF NEW.status IN ('resolved', 'closed') AND NEW.category = 'Leave Extension' AND OLD.status NOT IN ('resolved', 'closed') THEN
    UPDATE leave_requests
    SET status = 'Approved',
        approved_by = NEW.resolved_by,
        approved_at = NEW.resolved_at
    WHERE support_ticket_id = NEW.id AND status = 'Pending';
  
  -- If ticket was rejected
  ELSIF NEW.status = 'rejected' AND NEW.category = 'Leave Extension' AND OLD.status != 'rejected' THEN
    UPDATE leave_requests
    SET status = 'Rejected',
        approved_by = NEW.resolved_by,
        approved_at = NEW.resolved_at
    WHERE support_ticket_id = NEW.id AND status = 'Pending';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS approve_leave_on_ticket_resolve ON support_tickets;
CREATE TRIGGER approve_leave_on_ticket_resolve
  AFTER UPDATE OF status ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION trg_approve_leave_on_ticket_resolve();
