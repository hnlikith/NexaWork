-- ============================================================
-- 069: Zoho Mail Integration Schema
-- Full mail module: config, accounts, messages, drafts,
-- templates, file shares, AI cache, delegations, audit
-- ============================================================

-- Zoho org-level OAuth configuration
CREATE TABLE IF NOT EXISTS zoho_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    text NOT NULL,
  client_secret text NOT NULL,
  access_token  text,
  refresh_token text,
  token_expiry  timestamptz,
  redirect_uri  text NOT NULL DEFAULT 'http://localhost:3000/api/mail/auth/callback',
  mail_domain   text NOT NULL DEFAULT 'your-company.com',
  zoho_accounts_url text NOT NULL DEFAULT 'https://accounts.zoho.in',
  zoho_mail_api_url text NOT NULL DEFAULT 'https://mail.zoho.in/api',
  org_id            text,
  admin_account_id  text,
  is_connected      boolean NOT NULL DEFAULT false,
  connected_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Employee Zoho mail account mappings
CREATE TABLE IF NOT EXISTS zoho_mail_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid REFERENCES employees(id) ON DELETE CASCADE,
  zoho_account_id text,
  email_address   text NOT NULL,
  display_name    text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id),
  UNIQUE (email_address)
);

-- Cached email metadata (bodies stay in Zoho)
CREATE TABLE IF NOT EXISTS mail_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_message_id  text UNIQUE NOT NULL,
  zoho_account_id  text NOT NULL,
  employee_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  folder           text NOT NULL DEFAULT 'Inbox',
  subject          text,
  from_address     text,
  from_name        text,
  to_address       text[],
  cc_address       text[],
  preview          text,
  body             text,
  received_at      timestamptz,
  is_read          boolean NOT NULL DEFAULT false,
  is_starred       boolean NOT NULL DEFAULT false,
  has_attachment   boolean NOT NULL DEFAULT false,
  thread_key       text,
  -- Gemma AI fields
  ai_category      text DEFAULT 'GENERAL',  -- URGENT WORK FINANCE FOLLOW_UP GENERAL
  ai_priority      int  DEFAULT 3,           -- 1(highest)–5(lowest)
  ai_sentiment     text DEFAULT 'NEUTRAL',   -- POSITIVE NEGATIVE NEUTRAL
  ai_summary       text,
  ai_processed_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Local drafts (before sending via Zoho)
CREATE TABLE IF NOT EXISTS mail_drafts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid REFERENCES employees(id) ON DELETE CASCADE,
  to_addresses   text[],
  cc_addresses   text[],
  bcc_addresses  text[],
  subject        text,
  body           text,
  attachments    jsonb NOT NULL DEFAULT '[]',
  template_id    uuid,
  last_saved_at  timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Reusable email templates
CREATE TABLE IF NOT EXISTS mail_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  uuid REFERENCES employees(id) ON DELETE SET NULL,
  name        text NOT NULL,
  category    text NOT NULL DEFAULT 'general', -- general hr finance sales ops
  subject     text NOT NULL,
  body        text NOT NULL,
  variables   jsonb NOT NULL DEFAULT '[]',     -- [{name,description}]
  status      text NOT NULL DEFAULT 'active',  -- active archived draft
  usage_count int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- File shares (stored in Supabase Storage)
CREATE TABLE IF NOT EXISTS mail_file_shares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_by      uuid REFERENCES employees(id) ON DELETE CASCADE,
  filename       text NOT NULL,
  file_size      bigint,
  file_type      text,
  storage_path   text NOT NULL,
  storage_url    text,
  shared_with    uuid[],                 -- null = org-wide
  message_id     uuid REFERENCES mail_messages(id) ON DELETE SET NULL,
  expiry_at      timestamptz,
  download_count int NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Gemma AI analysis cache
CREATE TABLE IF NOT EXISTS mail_ai_cache (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_message_id  text UNIQUE NOT NULL,
  category         text,
  priority         int,
  sentiment        text,
  summary          text,
  reply_suggestions jsonb NOT NULL DEFAULT '[]',
  processed_at     timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

-- Email access delegations
CREATE TABLE IF NOT EXISTS mail_delegations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id  uuid REFERENCES employees(id) ON DELETE CASCADE,
  delegate_id   uuid REFERENCES employees(id) ON DELETE CASCADE,
  scope         text NOT NULL DEFAULT 'read',  -- read send full
  is_active     boolean NOT NULL DEFAULT true,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delegator_id, delegate_id)
);

-- Full audit trail
CREATE TABLE IF NOT EXISTS mail_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id         uuid REFERENCES employees(id) ON DELETE SET NULL,
  action           text NOT NULL,  -- send read delete share classify
  zoho_message_id  text,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Row-Level Security ──────────────────────────────────────

ALTER TABLE zoho_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoho_mail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_drafts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_file_shares   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_ai_cache      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_delegations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_audit_log     ENABLE ROW LEVEL SECURITY;

-- zoho_config: service role only
CREATE POLICY "service_zoho_config" ON zoho_config FOR ALL USING (true);

-- zoho_mail_accounts: own or super_admin
CREATE POLICY "own_zoho_account" ON zoho_mail_accounts FOR ALL
  USING (
    employee_id IN (SELECT id FROM employees WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'super_admin')
  );

-- mail_messages: own or super_admin (or delegated)
CREATE POLICY "own_messages" ON mail_messages FOR SELECT
  USING (
    employee_id IN (SELECT id FROM employees WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('super_admin', 'hr'))
    OR employee_id IN (
      SELECT delegator_id FROM mail_delegations
      WHERE delegate_id IN (SELECT id FROM employees WHERE id = auth.uid())
        AND is_active = true
    )
  );
CREATE POLICY "service_messages" ON mail_messages FOR ALL USING (true);

-- mail_drafts: own employee only
CREATE POLICY "own_drafts" ON mail_drafts FOR ALL
  USING (employee_id IN (SELECT id FROM employees WHERE id = auth.uid()));

-- mail_templates: all can read, hr/super_admin can write
CREATE POLICY "all_read_templates"   ON mail_templates FOR SELECT USING (true);
CREATE POLICY "admin_insert_template" ON mail_templates FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('super_admin','hr')));
CREATE POLICY "admin_update_template" ON mail_templates FOR UPDATE
  USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('super_admin','hr')));

-- mail_file_shares: owner or recipient or super_admin
CREATE POLICY "file_share_access" ON mail_file_shares FOR SELECT
  USING (
    shared_by IN (SELECT id FROM employees WHERE id = auth.uid())
    OR (SELECT id FROM employees WHERE id = auth.uid()) = ANY(shared_with)
    OR shared_with IS NULL
    OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'super_admin')
  );
CREATE POLICY "own_file_insert" ON mail_file_shares FOR INSERT
  WITH CHECK (shared_by IN (SELECT id FROM employees WHERE id = auth.uid()));

-- mail_ai_cache: service role
CREATE POLICY "service_ai_cache" ON mail_ai_cache FOR ALL USING (true);

-- mail_delegations: own or super_admin
CREATE POLICY "own_delegations" ON mail_delegations FOR ALL
  USING (
    delegator_id IN (SELECT id FROM employees WHERE id = auth.uid())
    OR delegate_id  IN (SELECT id FROM employees WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'super_admin')
  );

-- mail_audit_log: super_admin reads all, others see own
CREATE POLICY "audit_log_access" ON mail_audit_log FOR SELECT
  USING (
    actor_id IN (SELECT id FROM employees WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'super_admin')
  );
CREATE POLICY "audit_log_insert" ON mail_audit_log FOR INSERT WITH CHECK (true);

-- ── Indexes ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_mail_messages_employee   ON mail_messages(employee_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_folder     ON mail_messages(folder);
CREATE INDEX IF NOT EXISTS idx_mail_messages_received   ON mail_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_messages_category   ON mail_messages(ai_category);
CREATE INDEX IF NOT EXISTS idx_mail_messages_thread     ON mail_messages(thread_key);
CREATE INDEX IF NOT EXISTS idx_mail_messages_read       ON mail_messages(is_read);
CREATE INDEX IF NOT EXISTS idx_mail_drafts_employee     ON mail_drafts(employee_id);
CREATE INDEX IF NOT EXISTS idx_mail_templates_category  ON mail_templates(category);
CREATE INDEX IF NOT EXISTS idx_mail_templates_status    ON mail_templates(status);
CREATE INDEX IF NOT EXISTS idx_mail_file_shares_by      ON mail_file_shares(shared_by);
CREATE INDEX IF NOT EXISTS idx_zoho_mail_accounts_emp   ON zoho_mail_accounts(employee_id);

-- ── Seed Default Templates ───────────────────────────────────

INSERT INTO mail_templates (name, category, subject, body, variables, status) VALUES
(
  'Welcome Onboarding', 'hr',
  'Welcome to NexaWork — Your Onboarding Information',
  E'Dear {{employee_name}},\n\nWelcome to the NexaWork family! We are thrilled to have you on board.\n\nYour joining date is {{joining_date}}. Please report to {{office_location}} by {{report_time}}.\n\nYour onboarding buddy {{buddy_name}} will meet you at reception.\n\nLooking forward to working with you!\n\nWarm regards,\nHR Team — NexaWork',
  '[{"name":"employee_name","description":"Employee full name"},{"name":"joining_date","description":"First working day"},{"name":"office_location","description":"Office address"},{"name":"report_time","description":"Reporting time"},{"name":"buddy_name","description":"Assigned buddy"}]',
  'active'
),
(
  'Invoice Payment Reminder', 'finance',
  'Payment Reminder — Invoice #{{invoice_number}}',
  E'Dear {{client_name}},\n\nThis is a friendly reminder that Invoice #{{invoice_number}} for ₹{{amount}} is due on {{due_date}}.\n\nKindly process the payment at your earliest convenience to avoid any delays.\n\nFor any queries, feel free to reach out.\n\nBest regards,\nFinance Team — NexaWork',
  '[{"name":"client_name"},{"name":"invoice_number"},{"name":"amount"},{"name":"due_date"}]',
  'active'
),
(
  'Meeting Follow-Up', 'general',
  'Follow-up: {{meeting_title}} — Action Items',
  E'Hi Team,\n\nThank you for attending {{meeting_title}} on {{meeting_date}}.\n\nKey action items from the meeting:\n{{action_items}}\n\nNext meeting: {{next_meeting_date}}\n\nPlease update your progress before the next session.\n\nBest regards,\n{{sender_name}}',
  '[{"name":"meeting_title"},{"name":"meeting_date"},{"name":"action_items"},{"name":"next_meeting_date"},{"name":"sender_name"}]',
  'active'
),
(
  'Project Kickoff', 'ops',
  'Project Kickoff: {{project_name}} — Let''s Get Started',
  E'Dear {{team_name}},\n\nWe are excited to kick off {{project_name}}!\n\nProject Details:\n• Start Date: {{start_date}}\n• Deadline: {{deadline}}\n• Project Lead: {{project_lead}}\n\nPlease review the project brief shared separately and raise any questions before we begin.\n\nBest regards,\n{{sender_name}}',
  '[{"name":"project_name"},{"name":"team_name"},{"name":"start_date"},{"name":"deadline"},{"name":"project_lead"},{"name":"sender_name"}]',
  'active'
),
(
  'Salary Slip Ready', 'hr',
  'Your Salary Slip for {{month}} {{year}} is Available',
  E'Dear {{employee_name}},\n\nYour salary slip for {{month}} {{year}} has been processed.\n\n• Net Pay: ₹{{net_pay}}\n• Credit Date: {{credit_date}}\n\nPlease log in to NexaWork → Payslips to view the full breakdown.\n\nFor any discrepancies, please reach out to HR within 3 working days.\n\nBest regards,\nPayroll Team — NexaWork',
  '[{"name":"employee_name"},{"name":"month"},{"name":"year"},{"name":"net_pay"},{"name":"credit_date"}]',
  'active'
),
(
  'Leave Approval', 'hr',
  'Leave Request {{status}} — {{leave_dates}}',
  E'Dear {{employee_name}},\n\nYour leave request for {{leave_dates}} has been {{status}}.\n\n{{additional_note}}\n\nFor queries, contact your reporting manager or HR.\n\nBest regards,\nHR Team — NexaWork',
  '[{"name":"employee_name"},{"name":"leave_dates"},{"name":"status"},{"name":"additional_note"}]',
  'active'
)
ON CONFLICT DO NOTHING;
