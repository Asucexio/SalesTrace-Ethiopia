# SalesTrace Ethiopia

**B2B SaaS for influencer marketing attribution and campaign analytics.**

SalesTrace connects creator activity to completed orders for Ethiopian brands: it issues
creator-specific tracking links, coupon codes and QR codes, imports real orders, attributes
eligible orders to creators under explicit and tested rules, and reports attributed revenue,
cost per attributed order and ROAS per campaign and per creator.

> **Attribution is association, not causation.** Every metric in this product is labelled
> *attributed*. The platform does not estimate incrementality and does not report profit.

---

## Table of contents

- [What it does](#what-it-does)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the applications](#running-the-applications)
- [Database migrations](#database-migrations)
- [Demo data](#demo-data)
- [Tests](#tests)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Product principles](#product-principles)

---

## What it does

| Module | Capability |
|---|---|
| **A — Auth & organizations** | Registration, email verification, password reset, session cookies, organization onboarding, invitations, four roles (`owner`, `admin`, `marketer`, `analyst`), organization-scoped access. |
| **B — Campaigns** | CRUD, validated status lifecycle (`draft → active → paused → completed → archived`), budget, attribution window, destination URL, creator assignments with agreed fees, typed campaign costs. |
| **C — Creators** | Profiles, social accounts (marked *manually entered* or *verified*), campaign history, performance. No fabricated follower counts or engagement metrics. |
| **D — Tracking** | Per-creator tracking links (`/r/<code>`), coupon codes, QR codes, referral-event capture with de-duplication, safe redirects. |
| **E — Attribution** | A pure, separately tested engine: 7-day click window, last-eligible-click, coupon attribution, deterministic conflict resolution, rule versioning. |
| **F — Orders** | CSV import with column mapping, per-row validation, preview, duplicate detection, transactional commit, downloadable error report, refunds and cancellations. |
| **G — Analytics** | Dashboard, campaign and creator performance, time series, filtered CSV exports. Every total reconciles with the underlying records. |

---

## Repository layout

```
salestrace/
├── apps/
│   ├── api/        # Node + Express + TypeScript (backend)
│   └── web/        # Next.js App Router (frontend)
├── packages/
│   ├── shared-types/       # enums, DTOs, money & time helpers (no dependencies)
│   ├── validation/         # Zod schemas shared by the API and the web app
│   └── attribution-engine/ # the pure attribution + metrics logic
├── supabase/
│   ├── migrations/         # versioned SQL — the only schema authority
│   └── seed.sql            # clearly labelled demo data
├── docs/                   # requirements, architecture, rules, API, security, tests, plan
└── .env.example
```

See `docs/repository-structure.md` for the ownership rules between packages.

---

## Prerequisites

- **Node.js 20.11+** (developed on Node 24)
- **pnpm 9+**
- **PostgreSQL 15+** — Supabase (recommended) or a local server. The database is only needed for
  the API; the integration test suite runs PostgreSQL in-process via PGlite.

---

## Setup

```bash
pnpm install          # install workspace dependencies
cp .env.example .env  # then fill in DATABASE_URL and IP_HASH_PEPPER
```

At minimum, set:

| Variable | Why |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `IP_HASH_PEPPER` | Salt for hashing visitor IP addresses (≥ 8 characters) |
| `PUBLIC_BASE_URL` | Where the web app is served — tracking links are built from it |

The API validates its configuration at boot and **refuses to start** with a missing or invalid
variable, naming the variable and the expected format without printing any value.

---

## Quick start (local development)

```bash
pnpm install
cp .env.example .env          # edit DATABASE_URL and IP_HASH_PEPPER (AUTH_MODE=local, DATABASE_SSL=false for a local Postgres)
pnpm build                    # builds the shared packages (required once before the API runs)
pnpm db:migrate               # create the tables
pnpm db:seed                  # optional demo data
pnpm dev:api                  # terminal 1 -> http://localhost:4000
pnpm dev:web                  # terminal 2 -> http://localhost:3000
```

In `AUTH_MODE=local` there is no mail server: sign-up verifies the new account automatically,
so you can sign in right after registering.

## Running the applications

Two terminals:

```bash
# Terminal 1 — the API on http://localhost:4000
pnpm dev:api

# Terminal 2 — the web app on http://localhost:3000
pnpm dev:web
```

Open <http://localhost:3000>, register, and create an organization.

### How the two applications talk

The web app proxies `/api/*` **and** `/r/*` to the API (see `apps/web/next.config.mjs`). This
keeps the browser on a single origin, so the session cookie can be `httpOnly` + `SameSite=Lax`
without cross-site cookie problems — and tracking links work on your own domain:

```
https://your-domain.com/r/7K2M9QX4PD
```

### Authentication modes

| `AUTH_MODE` | Provider | Use |
|---|---|---|
| `local` | scrypt password hashing + API-issued sessions | development, CI, the E2E suite |
| `supabase` | Supabase Auth | production |

The API **refuses to boot** with `AUTH_MODE=local` when `NODE_ENV=production`.

---

## Database migrations

Migrations are the only way the schema changes. They live in `supabase/migrations` and are
applied in order; each one is applied inside a transaction and recorded in `schema_migrations`.

```bash
pnpm db:migrate
```

Already-applied migrations are immutable: the runner verifies a checksum and aborts if an
applied file has been edited. Add a new migration instead.

Every organization-owned table carries a Row Level Security policy, and the API switches to the
`salestrace_app` role (`NOBYPASSRLS`) inside every transaction. If the application forgets to
filter by organization, the database still hides other tenants' rows; if the organization
context is missing, **no rows are visible at all**.

Run migrations with the same `DATABASE_URL` used by the API. Migration `0009` grants that
database login membership in `salestrace_app`, which is required for PostgreSQL to allow the API
to switch into the restricted role. If the API and migration runner use different database
logins, grant `salestrace_app` to the API login explicitly.

---

## Demo data

```bash
pnpm db:seed
```

Inserts `supabase/seed.sql`: one demo organization, three demo creators, two demo campaigns,
demo tracking assets and demo costs. It is labelled as demo data and refuses to run in
production.

---

## Tests

```bash
pnpm test              # every package
pnpm test:engine       # the attribution engine and the metric calculators
pnpm test:api          # unit + integration
pnpm test:web          # web components and formatters
```

Current status: **177 tests, all passing** — 38 in the attribution engine, 123 in the API
(8 files) and 16 in the web app.

| Suite | What it proves |
|---|---|
| `packages/attribution-engine/tests` | Every attribution rule and every metric formula, including the window boundaries, conflicts, refunds, rounding and zero denominators. |
| `apps/api/tests/unit` | QR encoding (round-trip verified), CSV column detection, order-row validation. |
| `apps/api/tests/integration` | Migrations, repositories, authentication, the role matrix, **tenant isolation**, campaign lifecycle, tracking redirects, CSV import and idempotency, attribution persistence, refunds, and analytics reconciliation. |
| `apps/web/src/**/__tests__` | Money and rate formatting, the empty state. |
| `apps/web/e2e` | The critical user journey in a real browser, including the cross-organization boundary. Needs a running stack: `pnpm db:migrate`, then the API and the web app, then `pnpm --filter @salestrace/web test:e2e`. |

The integration suite boots **PGlite** — real PostgreSQL compiled to WebAssembly — so the
tests exercise the same SQL, the same RLS policies and the same transaction semantics as
production, without needing Docker.

> **If a Node command fails with `Zone Allocation failed - process out of memory`**, the machine
> has run out of commit memory (this usually means no pagefile is configured). Either enable a
> system-managed pagefile, or constrain the heap:
> `NODE_OPTIONS="--max-old-space-size=300 --max-semi-space-size=2" pnpm test`.

---

## Configuration

Every variable is documented in [`.env.example`](.env.example). The important ones:

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | API port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `DATABASE_SSL` | `false` | Require TLS (must be on in production) |
| `AUTH_MODE` | `local` | `supabase` \| `local` |
| `COOKIE_SECURE` | `false` | Must be `true` in production |
| `CORS_ALLOWED_ORIGINS` | — | Comma-separated allowlist |
| `PUBLIC_BASE_URL` | — | Where the web app is served |
| `IP_HASH_PEPPER` | — | Salt for hashing visitor IPs |
| `TRACKING_DEDUPE_WINDOW_SECONDS` | `30` | Click coalescing window |
| `MAX_UPLOAD_BYTES` | `10485760` | Maximum order-CSV size |

---

## Deployment

| Component | Target | Notes |
|---|---|---|
| `apps/web` | Vercel | Set `API_INTERNAL_URL` and the `NEXT_PUBLIC_*` variables |
| `apps/api` | Any Node host | Long-running Express process; needs `PORT`, `DATABASE_URL`, `AUTH_MODE=supabase`, `COOKIE_SECURE=true` |
| PostgreSQL | Supabase | Managed backups + point-in-time recovery |

**Release order**

1. `pnpm db:migrate` (before the new API version serves traffic)
2. Deploy the API
3. Deploy the web app
4. Verify `GET /api/v1/health/ready` returns `200`

**Health checks** — `GET /api/v1/health` (liveness) and `GET /api/v1/health/ready` (database
reachability).

**Backups** — Supabase automated daily backups with point-in-time recovery. The restore drill
is described in `docs/implementation-plan.md` §7.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/product-requirements.md`](docs/product-requirements.md) | The PRD and the binding product principles |
| [`docs/mvp-scope.md`](docs/mvp-scope.md) | What is in the MVP, what is deferred, and the explicit non-goals |
| [`docs/architecture.md`](docs/architecture.md) | Architecture, diagrams, ADR log, known limitations |
| [`docs/database-schema.md`](docs/database-schema.md) | The ERD and the table-by-table specification |
| [`docs/attribution-rules.md`](docs/attribution-rules.md) | The attribution policy with worked examples and edge cases |
| [`docs/financial-metrics.md`](docs/financial-metrics.md) | Every metric, with formulas and worked examples |
| [`docs/api-specification.md`](docs/api-specification.md) | The endpoint contract and response shapes |
| [`docs/security-and-tenancy.md`](docs/security-and-tenancy.md) | The tenant-isolation model and the security controls |
| [`docs/threat-model.md`](docs/threat-model.md) | STRIDE analysis and the mitigations |
| [`docs/testing-strategy.md`](docs/testing-strategy.md) | The test layers and what each one proves |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | The phased roadmap with acceptance criteria |
| [`docs/assumptions.md`](docs/assumptions.md) | Assumptions, open questions and the decision register |

---

## Product principles

These are enforced in the data model, the calculation layer, the API and the interface copy:

1. **A click is not a sale.** Clicks, eligible clicks, attributed orders and paid orders are
   four different metrics.
2. **An attributed sale is not necessarily an incremental sale.** Nothing in the product claims
   incrementality.
3. **Revenue is not profit.** The platform reports revenue and cost. ROAS is called ROAS; the
   word "ROI" is never used.
4. **Source data is preserved.** Orders keep their imported values; adjustments are appended.
5. **Decisions are deterministic and recorded.** Every attribution stores its method, rule
   version and reason — including the losing candidate when signals conflict.
6. **Data provenance is explicit.** Imported, manually entered and verified data are labelled
   differently. No metric is invented.
7. **Tenant isolation is structural.** Enforced by the database, not by the interface.

---

## Licence

Proprietary — all rights reserved.
#   S a l e s T r a c e - E t h i o p i a  
 