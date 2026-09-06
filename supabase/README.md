# Supabase — NexaWork deployment guide

This folder is the **single source of truth** for the Supabase backend.
The old `src/supabase/migrations/` folder (97 layered files) is **deprecated** —
it's preserved for history but is NOT used for new deployments.

## Folder layout

```
supabase/
├── config.toml              # Supabase CLI config
├── migrations/              # Canonical migration files (numbered, deploy in order)
│   ├── 00000000_baseline.sql       # Snapshot of current prod schema (pg_dump output)
│   ├── 00000001_role_model.sql     # 4-role model: admin/hr/accounts/employee + manager flags + employee_permissions
│   └── ...                          # New migrations going forward, dated YYYYMMDDhhmmss_name.sql
├── storage/
│   └── buckets.sql          # Storage bucket creation + RLS policies
├── seed.sql                 # Optional dev/staging seed (NOT auto-applied to prod)
└── README.md                # This file
```

## Deploying to a fresh Supabase project — checklist

### 1. Create the project
1. Go to https://supabase.com/dashboard → New project
2. Region: pick closest to users (e.g. ap-south-1 for India)
3. Postgres version: **15** (matches `config.toml` major_version)
4. Save the project ref slug from the dashboard URL

### 2. Add env vars to `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from dashboard → Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<from dashboard → Settings → API — server-only!>

# Optional integrations (only if used)
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REDIRECT_URI=
GEMINI_API_KEY=                # for Gemma AI legal/ATS scanning
LIVEKIT_API_KEY=               # for video meetings
LIVEKIT_API_SECRET=
LIVEKIT_URL=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

### 3. Link the project locally

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

### 4. Apply migrations in order

```bash
# Pushes everything in supabase/migrations/ to the linked project
npx supabase db push
```

This runs (in alphabetical order, which equals numerical order for our naming):
1. `00000000_baseline.sql` — full schema (tables, types, functions, triggers, RLS)
2. `00000001_role_model.sql` — 4-role model + manager flags + employee_permissions

### 5. Create storage buckets + apply storage RLS

```bash
# Run the bucket creation script via psql or Supabase SQL editor
psql "$DATABASE_URL" -f supabase/storage/buckets.sql
```

Or paste `supabase/storage/buckets.sql` into the SQL editor in the dashboard.

### 6. Create first admin user

Run in the Supabase SQL editor (after migrations + storage):

```sql
-- 1. Create the auth user via Supabase Dashboard → Authentication → Users → Add user
--    Email: admin@yourcompany.com
--    Password: <set a strong one>
--    Tick "Auto Confirm User"
--
-- 2. After the user is created, copy their UUID from the Users list, then run:
INSERT INTO public.employees (
  id, name, email, role, employee_id, is_active, joining_date
) VALUES (
  '<paste-auth-user-uuid-here>',
  'Founder Admin',
  'admin@yourcompany.com',
  'admin',
  'EMP-0001',
  true,
  CURRENT_DATE
);
```

### 7. Verify

```bash
npm run dev
# Visit http://localhost:3000/login → log in as admin@yourcompany.com
# You should land on /admin
```

If the sidebar is empty: open `/admin/permissions`, select Admin role, click Save Permissions. This seeds the `role_permissions` table for the admin role.

## Role model (recap)

| Role | Lands on | Scope |
|------|----------|-------|
| `admin` | `/admin` | Everything |
| `hr` | `/hr` | People: Employees, Recruitment, ATS, Interviews, Job Clusters, Attendance, KPI, LMS, Org Chart, Teams, Shifts |
| `accounts` | `/accounts` | Finance: Invoicing, Vendors, Subscriptions, Budgets, Payroll, Payslips, Claims, Reimbursements, Incentives, Priority Payout |
| `employee` (and `intern`) | `/dashboard` | Self-service |

**Manager-ness is NOT a role.** It's a flag on `employees`:
- `is_dept_lead BOOLEAN` + `managed_department_id UUID` — sees Approvals widget + department-scoped views
- `is_team_lead BOOLEAN` + `managed_team_id UUID` — sees Approvals widget + team-scoped views

Per-employee permission **overrides** live in `employee_permissions` — admin can grant individual exceptions without changing role.

## Writing new migrations

```bash
npx supabase migration new <descriptive_name>
# Edit the generated file in supabase/migrations/
npx supabase db push
```

Use timestamp-prefixed filenames (the CLI does this automatically). Never reuse a number.

## Storage buckets (created by `storage/buckets.sql`)

| Bucket | Public? | Purpose |
|--------|---------|---------|
| `avatars` | yes | Employee profile photos |
| `legal` | yes | Consultant agreements, NDAs (AI-scanned) |
| `invoices` | no | Generated invoice PDFs |
| `lms-content` | no | Course videos, slides, PDFs |
| `mail-attachments` | no | Email file shares |
| `documents` | no | Workspace docs / spreadsheets / presentations |

## Important: the old migrations folder

`src/supabase/migrations/` (97 files) is the **history** — preserved for context. It will NOT be re-run on the new project. The state captured in those 97 files is collapsed into `supabase/migrations/00000000_baseline.sql`.

If you ever need to see how a feature evolved, check the archive. For new work, write new migrations in `supabase/migrations/`.
