# Zoho Mail & Calendar Integration

## Overview
Zoho Mail + Calendar connected via OAuth 2.0. Emails cached locally in Supabase. AI classification via Gemma. Employee mailboxes auto-provisioned.

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `zoho_config` | Org-level OAuth credentials (client_id, secret, tokens) |
| `zoho_mail_accounts` | Employee ↔ Zoho account mapping |
| `mail_messages` | Cached email metadata (subject, sender, AI fields) |
| `mail_drafts` | Local drafts before sending |
| `mail_templates` | Reusable templates by category |
| `mail_file_shares` | File attachments via Supabase Storage |
| `mail_ai_cache` | Gemma AI analysis cache |
| `mail_delegations` | Read/send/full delegation between employees |
| `mail_audit_log` | Full audit trail |
| `account_access` | Tracks owner / shared_read / shared_send per account |
| `zoho_calendar_config` | Calendar OAuth + sync state |
| `calendar_events` | Local event cache (personal / department / statutory) |

**Employees table extended with:** `zoho_email`, `zoho_user_id`, `zoho_account_id`, `zoho_refresh_token`, `status` (active / offboarding / disabled), `personal_email`

---

## Migrations
| File | What it does |
|------|-------------|
| `069_zoho_mail_schema.sql` | Creates all mail + calendar tables, RLS policies |
| `087_zoho_integration_full.sql` | Adds employee Zoho columns, `account_access`, calendar tables |

---

## API Routes (`/api/mail/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/mail/auth/connect` | POST | Start OAuth — takes client_id + client_secret |
| `/mail/auth/callback` | GET | OAuth redirect handler, stores tokens |
| `/mail/inbox` | GET | Fetch + sync inbox from Zoho |
| `/mail/send` | POST | Send email via Zoho API |
| `/mail/drafts` | GET / POST | List drafts / save draft |
| `/mail/templates` | GET / POST | List / create templates |
| `/mail/files` | GET / POST | List / upload file shares |
| `/mail/accounts/create-employee` | POST | Provision new Zoho mailbox for employee |
| `/mail/ai/classify` | POST | Classify email with Gemma AI |

---

## Frontend Pages (`/admin/mail/`)

| Page | What it shows |
|------|--------------|
| `/admin/mail` | Mail hub dashboard |
| `/admin/mail/inbox` | Inbox with AI category badges |
| `/admin/mail/compose` | Email composer |
| `/admin/mail/sent` | Sent folder |
| `/admin/mail/drafts` | Draft management |
| `/admin/mail/files` | File share library |
| `/admin/mail/templates` | Template library |
| `/admin/mail/accounts` | Employee mailbox management |
| `/admin/mail/config` | OAuth setup (enter client_id, secret) |

---

## Service Files

| File | Purpose |
|------|---------|
| `src/lib/zoho-mail.ts` | Token refresh, `zohoGet` / `zohoPost` / `zohoPatch` helpers, email classify |
| `src/lib/zoho-calendar.ts` | Calendar token refresh, Zoho Calendar API calls |
| `src/lib/zoho-provisioning.ts` | Auto-generate email address, create Zoho mailbox for employee |

---

## Setup Steps (Production)

1. **Create Zoho Developer App**
   - Go to [api-console.zoho.com](https://api-console.zoho.com)
   - Create **Server-based App**, set redirect URI to `https://yourdomain.com/api/mail/auth/callback`
   - Copy `Client ID` and `Client Secret`

2. **Configure in Admin Panel**
   - Go to `/admin/mail/config`
   - Paste Client ID + Client Secret → click **Connect**
   - Complete OAuth consent screen (use admin Zoho account)
   - Tokens auto-saved to `zoho_config` table

3. **Provision Employee Mailboxes**
   - Go to `/admin/mail/accounts`
   - Click **Create Mailbox** per employee
   - System auto-generates `firstname.lastname@<your-configured-domain>` via `zoho-provisioning.ts`

---

## AI Classification (Gemma)

Each incoming email is classified with:
- **Category**: work / personal / finance / hr / marketing / support
- **Priority**: low / medium / high / urgent  
- **Sentiment**: positive / neutral / negative
- **Summary**: 1-line auto-summary

Results cached in `mail_ai_cache` to avoid repeated API calls.

---

## Current Status

| Feature | Status |
|---------|--------|
| OAuth connect | ✅ Done |
| Inbox sync (cached) | ✅ Done |
| Send email | ✅ Done |
| Drafts | ✅ Done |
| Templates | ✅ Done |
| File sharing | ✅ Done |
| AI classification | ✅ Done |
| Employee provisioning | ✅ Done |
| Delegations | ✅ Schema done, UI pending |
| Calendar sync | ✅ Schema done, UI pending |
| Audit log UI | ⏳ Pending |
