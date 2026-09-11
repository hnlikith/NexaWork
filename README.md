# NexaWork

A full-stack workforce management and internal operations platform built with Next.js, TypeScript, and Supabase/PostgreSQL.

NexaWork brings the systems a company normally spreads across half a dozen SaaS tools — HR, attendance, payroll, recruitment, onboarding, projects, learning, and internal communication — into a single role-aware web application backed by a single PostgreSQL schema.

---

## Overview

Most internal-operations tooling is fragmented: attendance lives in one product, payroll in another, recruitment in a third, and none of them share an identity model or a permission model. NexaWork is an attempt to build those modules against one database, one authentication layer, and one authorization model, so that a role defined once applies consistently across every module.

The application is organised around three surfaces:

- **Employee dashboard** — the day-to-day surface: attendance, payslips, leave and reimbursement requests, projects, calendar, messaging, and learning.
- **Administrative console** — management surfaces for HR, payroll, recruitment, finance, permissions, and auditing.
- **Public-facing routes** — careers/job listings, application flow, and authentication.

---

## Key Features

Each of the areas below is backed by dedicated routes, API endpoints, and database tables in this repository.

### People & Organisation
- Employee and user records with a defined role model
- Team and department structures, with an org-chart view
- Shift management and scheduling
- Attendance capture and review, including camera-based verification helpers

### Payroll & Finance
- Payroll processing, including a dedicated internship/stipend track
- Payslip generation and employee-facing payslip access
- Salary slab configuration
- Reimbursements and expense claims
- Invoicing, vendors, purchases, budgets, and subscription tracking
- Incentive grants and payout calculation

### Recruitment & Onboarding
- Applicant tracking (ATS) and recruitment pipelines
- Job listings with a public careers route and application flow
- Interview scheduling and evaluation
- Structured onboarding flows with generated documents and e-signature routes

### Productivity & Collaboration
- Projects, tasks, and project membership
- Priority and KPI tracking, with performance views
- Meetings with video sessions, plus calendar integration
- Internal messaging and a workspace activity feed
- A rich-text document workspace built on TipTap
- Support ticketing with a hierarchical escalation model

### Learning
- An LMS / academy module with course and learning content structures

### Integrations & Communication
- Zoho Mail and Zoho Calendar integration, with OAuth configuration stored per organisation
- Google APIs integration (Calendar / service-account based)
- SMTP email delivery via Nodemailer, with an in-app SMTP connection test
- SAML SSO support

### AI-Assisted Communication
- Automatic email classification into a fixed category set, with a 1–5 priority score and sentiment label
- One-sentence email summaries and multi-message thread summarisation
- Three context-specific reply suggestions per message
- Tone improvement and length-reduction rewriting for outbound mail, returned as formatted HTML
- Subject-line suggestion from message body
- An executive digest across unread priority mail
- An AI assistant inside the document and spreadsheet workspace (rewrite, summarise, expand, tone shift, formula explanation, data analysis, chart suggestion, natural-language query)
- Meeting-transcript analysis producing structured minutes: summary, key topics, decisions, and assignable action items
- Cached AI results with a time-to-live, so repeat views do not re-run inference

### Administration & Governance
- A module-level permission matrix with per-employee overrides
- Centralised audit logging of state-changing API calls
- Session and security management views
- Analytics and reporting surfaces

---

## AI & Intelligent Email

NexaWork embeds AI directly into the internal mail workflow rather than exposing a general-purpose chatbot. The model is called for specific, bounded tasks — classify this message, summarise this thread, tighten this draft — and the results are written back into the application's own data model, so they behave like ordinary message metadata that the UI can sort and filter on.

### Pipeline

```
Zoho Mail API
      │  messages synced into the NexaWork mail layer
      ▼
/api/mail/ai/classify     ← one endpoint, task selected by `type`
      │
      ├── cache lookup: mail_ai_cache (by message id, unexpired)  ──► hit: return, no inference
      │
      ▼  miss
callGemma()  →  provider chain (see below)
      │
      ▼  structured result (JSON / delimited blocks), parsed with fallbacks
      ├── mail_ai_cache        upsert, 1-hour TTL
      └── mail_messages        ai_category · ai_priority · ai_sentiment · ai_summary · ai_processed_at
      │
      ▼
Inbox and compose UI — category chips, priority ordering, summaries, reply chips, AI rewrite buttons
```

### Implemented operations

| Task | What it produces |
|---|---|
| `classify` | Category (`URGENT`, `WORK`, `FINANCE`, `FOLLOW_UP`, `GENERAL`), priority `1`–`5`, sentiment (`POSITIVE`/`NEGATIVE`/`NEUTRAL`), one-sentence summary |
| `reply_suggest` | Three short replies, deliberately varied (acknowledge / request detail / propose next step) |
| `summarize_thread` | 2–3 sentence summary across up to 5 messages, covering topic, decisions, pending actions |
| `digest` | A 3-sentence executive digest over up to 10 unread priority emails |
| `improve_tone` | Rewritten subject + inline-CSS HTML body, meaning preserved |
| `shorten` | Same, reduced 30–50% by cutting filler rather than dropping facts |
| `suggest_subject` | A single subject line of at most 60 characters |

Beyond mail, the same inference layer backs an AI sidebar in the document and spreadsheet workspace (`/api/workspace/ai`) covering summarise, rewrite, expand, formality shift, formula explanation and suggestion, data cleaning, chart suggestion, and natural-language queries. Meeting minutes are produced by a separate route that sends a transcript to the Anthropic Claude API and returns structured JSON — summary, key topics, decisions, and action items with assignee and due date.

### Inference architecture

The shared entry point is `callGemma()` in `src/lib/zoho-mail.ts`. It resolves a provider in this order:

1. **Local fast path (opt-in).** When a caller passes `preferLocal` and a local endpoint is configured, the Ollama-compatible endpoint is tried first under a 25-second timeout — this skips the remote chain entirely for latency-sensitive calls.
2. **OpenRouter model chain.** If an OpenRouter key is configured, the request walks a chain of 18 free-tier models arranged in four capability tiers, strongest first. Models are tried **one at a time, in order — never in parallel**: each gets a hard 10-second timeout, and a `429`, non-OK status, timeout, or empty completion moves immediately to the next. The first usable completion wins and the chain stops. The chain is overridable per call.
3. **Local fallback.** If the chain is exhausted or no OpenRouter key is set, the request falls back to the Ollama-compatible endpoint.

If nothing is reachable the helper returns an empty string, and callers degrade rather than fail: classification falls back to a neutral `GENERAL`/priority-3 record, reply suggestions fall back to three generic professional replies, and the rewrite endpoints return a `503` telling the user to retry.

Supporting details:

- **Structured outputs.** A shared system prompt pins the model to English and to the exact requested shape. Classification and reply generation request strict JSON and are parsed by extracting the first JSON object or array, tolerating models that wrap output in prose. The rewrite tasks use `===SUBJECT===` / `===BODY===` / `===END===` delimiters instead, with three layered fallbacks — JSON parse, raw-HTML detection, then plain-text-to-HTML wrapping — because smaller models frequently ignore delimiters.
- **Caching.** `mail_ai_cache` is keyed uniquely on the Zoho message id with a one-hour expiry; lookups filter on `expires_at`. Classification results are additionally denormalised onto `mail_messages` so list views can sort and filter without touching the cache table. Responses carry a `source` field (`cache` or `gemma`), making cache behaviour observable from the client.
- **Provider-agnostic configuration.** No provider is hardcoded as mandatory. The deployment supplies whichever endpoints and keys it wants through environment variables; with none configured, AI features degrade to their fallbacks and the rest of the application is unaffected.

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19, Tailwind CSS v4, Radix UI / shadcn-style components, Framer Motion |
| Language | TypeScript 5 |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (`@supabase/ssr`, `@supabase/auth-helpers-nextjs`), `iron-session`, JWT |
| Authorization | PostgreSQL Row Level Security + a server-side module permission gate |
| Forms & validation | React Hook Form, Zod |
| Rich text | TipTap |
| Charts | Recharts |
| Documents / PDF | Puppeteer (`puppeteer-core` + `@sparticuz/chromium`), `pdf-lib`, `jsPDF`, `pdfjs-dist` |
| Realtime video | LiveKit |
| Vision | MediaPipe Tasks Vision, `face-api` (attendance verification helpers) |
| Email | Nodemailer, Zoho Mail API |
| SSO | SAML via `xml-crypto` |
| AI / LLM | OpenRouter multi-model inference with an Ollama-compatible local endpoint as fallback; Anthropic Claude API for meeting-transcript analysis |

---

## Architecture

The application is a single Next.js App Router project. There is no separate backend service — server-side logic runs as Next.js API route handlers and server components, with Supabase providing the database, authentication, and storage layer.

```
Browser (React 19 client components)
        │
        ▼
Next.js App Router  ──  middleware.ts  (session refresh + audit capture)
        │
        ├── Server Components / Server Actions
        └── API Route Handlers  (/src/app/api/**)
                 │
                 ├── Supabase client (user-scoped)   → RLS enforced
                 └── Supabase admin client (service) → privileged operations
                            │
                            ▼
                  PostgreSQL (Supabase)
                  tables · RLS policies · functions
```

Key architectural points:

- **Two client postures.** A user-scoped Supabase client is used for ordinary reads and writes so that Row Level Security applies. A service-role client is used only in server-side code paths that legitimately need to bypass RLS, such as audit writes and administrative operations.
- **Middleware-level auditing.** `middleware.ts` intercepts state-changing requests (`POST`, `PATCH`, `PUT`, `DELETE`) and records the actor, originating page, and endpoint centrally, rather than relying on every route to log itself. High-frequency infrastructure routes are explicitly skipped to avoid noise and duplication.
- **Modular feature areas.** Each business domain owns its route segment under `src/app/admin` or `src/app/dashboard`, its API surface under `src/app/api`, and its schema in the migration chain.
- **Migration-driven schema.** The database is defined by an ordered SQL migration chain rather than by ad-hoc changes, so a fresh environment can be built from source.

---

## Security

The following mechanisms are implemented in the codebase:

- **Authentication** — Supabase Auth with SSR-aware session handling; sessions are refreshed in middleware so server components and API routes see a consistent identity.
- **Row Level Security** — RLS is enabled across the schema, with policies defined alongside the tables they protect in the migration chain.
- **Server-side authorization gate** — `src/lib/authz.ts` exposes `requireModule(moduleKey, action)`, which resolves the caller's real role from the database and checks it against a `role_permissions` matrix, with per-employee overrides taking precedence. This is deliberately separate from the client-side route guard: the UI guard controls what is *shown*, while this gate is the authoritative layer that stops a user calling a privileged endpoint directly via curl, devtools, or a tampered client.
- **Least-privilege credentials** — the service-role key is only read server-side and is never exposed to the browser; only `NEXT_PUBLIC_`-prefixed values reach the client.
- **Audit trail** — state-changing API calls are recorded centrally with actor attribution.
- **Environment-based secrets** — all credentials are supplied through environment variables. No secrets are committed to this repository; `.env.example` contains placeholder values only.

> This project has not undergone a formal third-party security audit or certification. The above describes implemented application-level controls.

---

## Database

The data layer is PostgreSQL, managed through Supabase.

- The schema is defined as an ordered SQL migration chain covering the full domain model — employees and roles, teams and departments, attendance and shifts, payroll and payslips, recruitment and onboarding, projects and tasks, mail and calendar, permissions, and audit logging.
- **Row Level Security is enabled table-by-table**, with policies declared in the same migration that creates the table. Policies are generally written against the authenticated user's employee record and resolved role, so access rules are enforced by the database rather than only by application code.
- Integration configuration (for example, the organisation mail domain used by the Zoho module) is stored as configurable table columns rather than hardcoded constants, so a deployment supplies its own values.
- Supabase Storage is used for file attachments, with dedicated buckets created via migration.

No connection strings, project identifiers, or credentials are included in this repository.

---

## Performance / Engineering

Engineering work reflected in the codebase includes:

- **Reduced redundant Supabase round-trips** — consolidating repeated per-row lookups into batched queries in list-heavy admin views.
- **Configuration-driven integration settings** — organisation-specific values such as mail domain and OAuth endpoints are read from configuration rather than compiled in, so the same build serves any deployment.
- **Explicit relationship disambiguation** — where a table has multiple foreign keys to the same target, PostgREST embedding is qualified explicitly so queries resolve deterministically.
- **Serverless-aware PDF generation** — `next.config.ts` keeps Chromium and PDF libraries external and force-includes the Chromium binary for the routes that generate documents, so `executablePath()` resolves correctly in a serverless function rather than failing on a traced-away binary.
- **Build-memory tuning** — the production build raises the Node heap limit to accommodate the size of the compiled route graph.
- **Type and build verification** — the project is validated with `tsc --noEmit` and a full production build.

---

## Project Structure

```
src/
├── app/
│   ├── admin/         Administrative console (HR, payroll, recruitment,
│   │                  finance, permissions, audit, analytics, …)
│   ├── dashboard/     Employee-facing surfaces
│   ├── api/           Route handlers — the application's server API
│   ├── careers/       Public job listings and application flow
│   └── auth/, login/, onboarding/, sign/, meet/
├── components/        Feature components (mail, meetings, onboarding,
│                      projects, workspace, kpi, viz) + shared UI
├── lib/               Supabase clients, authz, audit, session, SAML,
│                      Zoho integration, domain math (payroll, KPI, incentives)
├── services/          Attendance, incentive, payout, wallet services
├── hooks/             Shared React hooks (permissions, messaging, meetings)
├── supabase/          SQL migration chain and schema definitions
├── types/             Shared TypeScript types
└── scripts/           Local seed / bootstrap utilities

supabase/              Supabase project config, baseline migrations, storage
middleware.ts          Session refresh + centralised audit capture
```

---

## Local Development

### Prerequisites
- Node.js 20 or later
- A Supabase project (for database, auth, and storage)

### Setup

```bash
git clone https://github.com/hnlikith/NexaWork.git
cd NexaWork
npm install
```

Create a local environment file from the template and fill in your own values:

```bash
cp .env.example .env.local
```

`.env.example` documents every variable the application reads, including Supabase URL and keys, application base URL, and optional integration credentials (Google, Zoho, SMTP, Power BI, Firebase, and AI inference). The AI variables are optional — with none configured, the AI features fall back to deterministic defaults and the rest of the application runs normally. **All values in the template are placeholders** — you must supply your own. `.env.local` is gitignored and must never be committed.

Apply the SQL migrations in `src/supabase/migrations/` and `supabase/migrations/` to your Supabase project in filename order.

### Run

```bash
npm run dev      # development server on http://localhost:3000
npm run build    # production build
npm start        # serve the production build
npm run lint     # lint
```

---

## Demo

There is no public hosted demo for this project. The application requires a provisioned Supabase backend with the migration chain applied, so it is intended to be run locally against your own instance using the setup steps above.

---

## Engineering Highlights

Aspects of this project most relevant to technical review:

- **Breadth of domain modelling** — a single coherent PostgreSQL schema spanning HR, payroll, recruitment, project management, learning, and communications, built as an ordered migration chain rather than accumulated ad-hoc changes.
- **Defence-in-depth authorization** — database-enforced Row Level Security combined with an independent server-side permission gate, on the explicit assumption that client-side route guards are cosmetic and can be bypassed.
- **A real permission system** — module/action granularity (`can_view`, `can_create`, `can_edit`, `can_delete`, `can_export`) resolved against a role matrix with per-employee overrides, rather than a hardcoded role check at each endpoint.
- **Cross-cutting concerns handled centrally** — auditing implemented once in middleware with explicit skip rules, instead of being scattered across individual handlers.
- **Document generation pipeline** — server-side PDF rendering for onboarding paperwork and invoices, including the serverless packaging work needed to make headless Chromium function in that environment.
- **Third-party integration** — OAuth-based Zoho Mail/Calendar integration, Google service-account calendar access, SAML SSO, and SMTP delivery with in-app diagnostics.
- **Resilient AI inference** — rather than calling a single model and failing when it is unavailable, inference walks an ordered multi-model chain with a per-model timeout and immediate skip on rate-limiting, backed by a local endpoint and by deterministic non-AI fallbacks at every call site. Results are requested as structured output, parsed defensively for models that ignore the format, and cached with a TTL so repeat views cost nothing.
- **Type safety throughout** — end-to-end TypeScript with Zod validation at input boundaries.

Developed and reconstructed as an independent NexaWork application.

---

## Status

Actively developed. This repository is published as a portfolio project for technical review.

The codebase is a working application rather than a finished commercial product: some modules are more complete than others, and it is being iterated on. Issues and observations are welcome.

---

## License

Licensed under the **GNU Affero General Public License v3.0**. See [LICENSE](LICENSE).
