# Repository Structure

```
salestrace/
├── apps/
│   ├── api/                              # Node + Express + TS (backend)
│   │   ├── src/
│   │   │   ├── config/                   # env loading + validation, constants
│   │   │   ├── db/                       # driver port, pg driver, pglite driver, migrations runner, seed
│   │   │   ├── middleware/               # auth, org context, roles, validation, rate limit, errors, request id
│   │   │   ├── modules/
│   │   │   │   ├── auth/                 # register, login, logout, verify, reset, session
│   │   │   │   ├── organizations/        # org CRUD, members, invitations
│   │   │   │   ├── campaigns/            # CRUD, status, creators, costs, performance
│   │   │   │   ├── creators/             # CRUD, social accounts, performance
│   │   │   │   ├── tracking/             # tracking links, coupons, QR, public redirect
│   │   │   │   ├── attribution/          # rules, recompute, decision read models
│   │   │   │   ├── orders/               # CSV import pipeline, orders, refunds
│   │   │   │   └── analytics/            # overview, campaigns, creators, exports
│   │   │   ├── shared/                   # errors, money, time, pagination, ids, logger
│   │   │   ├── app.ts                    # express app assembly
│   │   │   └── server.ts                 # bootstrap + graceful shutdown
│   │   └── tests/
│   │       ├── unit/                     # pure logic (no DB)
│   │       └── integration/              # PGlite-backed repositories + HTTP flows
│   └── web/                              # Next.js App Router frontend
│       ├── src/
│       │   ├── app/                      # routes (App Router)
│       │   ├── components/               # ui primitives + shared components
│       │   ├── features/                 # campaigns, creators, attribution, orders, analytics
│       │   ├── hooks/                    # data fetching, session, tables
│       │   ├── lib/                      # api client, formatters, i18n catalog
│       │   └── types/
│       ├── e2e/                          # Playwright specs
│       └── tests/                        # vitest component/unit tests
├── packages/
│   ├── shared-types/                     # enums, DTOs, money + time helpers (no deps)
│   ├── validation/                       # Zod schemas: env, API input, CSV rows
│   └── attribution-engine/               # pure attribution + metrics logic (unit tested)
├── supabase/
│   ├── migrations/                       # versioned SQL migrations (source of truth)
│   └── seed.sql                          # labelled demo data
├── docs/                                 # the artifacts in this directory
├── scripts/                              # CI/dev helper scripts
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Ownership rules

| Package | May import | Must never |
|---|---|---|
| `packages/shared-types` | nothing but TypeScript | Import `express`, `pg`, `zod`, React, or app code |
| `packages/validation` | `shared-types`, `zod` | Import app code or `pg` |
| `packages/attribution-engine` | `shared-types` | Import `express`, `pg`, `zod`, React, or app code; perform I/O |
| `apps/api` | the three packages, third-party libs | Contain business rules in routes/controllers |
| `apps/web` | `shared-types`, `validation` | Import `pg`; call the database directly; duplicate business calculations |

## Why this shape

- **Business rules in one place.** The attribution engine and metric calculators live in packages,
  so the API and any future worker compute identical numbers. The dashboard renders what the API
  computes; it never recomputes revenue.
- **Contracts are shared.** Zod schemas in `packages/validation` are used by the API for runtime
  validation and by the web app for form validation, so client and server agree by construction.
- **Tests sit next to what they test.** `packages/attribution-engine` tests run without any
  infrastructure; `apps/api/tests/integration` boots PGlite in-process.
- **Migrations are the only schema authority.** No `ALTER TABLE` is ever executed by application
  code.
