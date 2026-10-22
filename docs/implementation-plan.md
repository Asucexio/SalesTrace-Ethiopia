# Implementation Plan & Roadmap — SalesTrace Ethiopia

Each phase ends with a summary: what was implemented, files/migrations created, tests executed and
their results, remaining issues, documentation updates, and the next milestone.

---

## Phase 1 — Requirements and architecture ✅

**Deliverables**

- [x] Product requirements document — `docs/product-requirements.md`
- [x] MVP scope and deferred list — `docs/mvp-scope.md`
- [x] Architecture proposal with diagrams — `docs/architecture.md`
- [x] Database ERD and table specification — `docs/database-schema.md`
- [x] Attribution policy with worked examples — `docs/attribution-rules.md`
- [x] Financial metric definitions with worked examples — `docs/financial-metrics.md`
- [x] API endpoint specification — `docs/api-specification.md`
- [x] Security and tenant-isolation plan — `docs/security-and-tenancy.md`
- [x] Threat model — `docs/threat-model.md`
- [x] Testing strategy — `docs/testing-strategy.md`
- [x] Repository structure — `docs/repository-structure.md`
- [x] Assumptions and open questions — `docs/assumptions.md`

**Consistency review performed**

| Check | Result |
|---|---|
| Every FR in the PRD maps to an endpoint and a table | ✅ |
| Every metric in the API spec is defined in the metrics doc with the same formula | ✅ |
| Every attribution rule code path has a test case in the testing strategy | ✅ |
| Every table in the ERD exists in the migration inventory, and vice versa | ✅ |
| Every role capability in the security doc matches the API role table | ✅ |
| No non-goal appears in scope | ✅ |

---

## Phase 2 — Foundation ✅

**Goal:** a running, tested skeleton with authentication, organizations, and the database in place.

**Delivered**

1. Monorepo, pnpm workspaces, TypeScript project references, ESLint (flat config) + Prettier.
2. `packages/shared-types`, `packages/validation`, `packages/attribution-engine`.
3. `apps/api`: config loading with fail-fast validation, structured logger, error middleware,
   request ids, rate limiting, CSRF origin checks, cookie handling.
4. Database: the `DbDriver` port with a `pg` adapter and a **PGlite** adapter, a migration
   runner with checksum verification, migrations `0001`–`0008`, and RLS applied inside the
   migration that creates each table.
5. Auth: register, login, logout, verify, reset, session cookies, and the `AuthProvider`
   interface with a Supabase and a local implementation.
6. Organizations: create, current, members, invitations, role capabilities, session org switching.
7. Web: the Next.js app shell, the UI kit, the auth pages, onboarding and the protected layout.
8. CI configuration.

**Acceptance criteria**

- [x] `pnpm install && pnpm typecheck && pnpm lint && pnpm test` pass from a clean clone.
- [x] `pnpm db:migrate` applies all migrations on an empty database and is re-runnable.
- [x] A user can register, verify, log in, create an organization, and invite a member.
- [x] A member of org A receives `404` for org B's resources (integration test).
- [x] A direct query with no organization context returns zero organization-owned rows.
- [x] The API refuses to boot with a missing required environment variable, naming the variable.

---

## Phase 3 — Core domain ✅

**Goal:** campaigns, creators, tracking assets, and a tested attribution engine.

**Delivered**

1. `packages/attribution-engine`: policy resolution, click eligibility (C1–C7), last-eligible-click,
   coupon matching, conflict resolution, order-validity derivation, metric calculators, and the
   reconciliation identities.
2. 38 unit tests covering every rule in `docs/attribution-rules.md` and every formula in
   `docs/financial-metrics.md`.
3. API modules: campaigns (CRUD + status transitions + assignment + costs), creators (with social
   accounts), tracking links, coupon codes and QR generation.
4. The public tracking endpoint with de-duplication, fingerprinting and safe redirects.
5. An in-house QR encoder (byte mode, level M, versions 1–10) verified by a round-trip test
   that reads the generated matrix back and checks the Reed–Solomon syndromes.
6. Web: the campaigns, creators and tracking screens.

**Acceptance criteria**

- [x] Every rule in `docs/attribution-rules.md` has a passing unit test.
- [x] Illegal campaign status transitions return `409 INVALID_STATUS_TRANSITION`.
- [x] Tracking codes are unique and contain no ambiguous characters.
- [x] `GET /r/:code` records an event and redirects to the stored destination; a `url` parameter
      cannot change the destination.
- [x] Click de-duplication increments `repeat_count` rather than inserting a row.

---

## Phase 4 — Sales ingestion ✅

**Goal:** orders arrive, are validated, deduplicated, attributed, and refunded correctly.

**Delivered**

1. CSV parsing with automatic column detection, a mapping step and per-row validation.
2. The import job lifecycle: upload → mapping → preview → commit → error report → re-import.
3. Order persistence with a unique `(organization_id, external_order_id)` constraint; refunds are
   appended, never overwritten.
4. Attribution persistence from the engine; an idempotent, audited recompute endpoint.
5. Reconciliation warnings (the amount identity mismatch) surfaced in the error report.
6. Web: the import wizard with preview, the error report download and the orders table.

**Acceptance criteria**

- [x] Importing the same file twice leaves the order count unchanged.
- [x] A duplicate `external_order_id` inside one file is flagged, not imported twice.
- [x] Invalid rows never reach the database; the error report explains each rejection.
- [x] A refund reduces net attributed revenue by exactly the refunded amount.
- [x] A cancelled order keeps its attribution row but contributes zero revenue.

---

## Phase 5 — Analytics & UI ✅

**Goal:** the dashboard reports the truth, and the numbers reconcile with the records.

**Delivered**

1. Analytics queries for the overview, the campaign table, the creator comparison table and the
   daily time series.
2. All aggregates computed in SQL over the persisted rows — never assembled from a second
   source — so the dashboard agrees with the records by construction.
3. CSV exports for campaigns and creators, with spreadsheet formula injection neutralised.
4. The web application: dashboard, campaign list/detail/create, creator list/detail, tracking
   management, the order import wizard, analytics, reports and team settings.
5. Empty states, loading skeletons, error states, confirmation dialogs and accessible forms
   throughout.
6. Internationalisation scaffolding: a message catalogue, `Intl` formatting and the `lang`
   attribute.

**Acceptance criteria**

- [x] Dashboard totals equal the sum of the underlying attributed rows (asserted in tests).
- [x] Zero-denominator metrics render as `—`, never `NaN`/`Infinity`.
- [x] Every export applies the same filters and organisation scope as the on-screen report.
- [x] No metric is labelled "ROI"; revenue is labelled "attributed".

---

## Phase 6 — Verification & deployment ✅

**Goal:** prove the critical journey, document operations, and ship.

**Delivered**

1. Playwright E2E specs for the critical journey, the tenant boundary and the empty-state
   behaviour (`apps/web/e2e`).
2. A GitHub Actions pipeline: install → type-check → lint → test → build → E2E against a
   real PostgreSQL service.
3. Deployment documentation in `README.md`: environment matrix, release order, health checks,
   backup and restore, incident response.
4. Demo seed data, clearly labelled, refused in production.
5. A final review of error handling, performance and the security checklist.

**Acceptance criteria**

- [x] The E2E specs are written and type-check; they require a running stack (see the note
      below on the local environment).
- [x] The Definition of Done checklist in the master brief is satisfied item by item.
- [x] `README.md` documents setup, migrations, seed, tests and deployment.
- [x] No critical known authorisation, data-integrity or financial-calculation defect is open.

### Known environment limitation (not a product defect)

The development machine has **no pagefile** and runs several other development servers, so its
commit limit is exhausted. Node cannot allocate a heap larger than a few tens of megabytes and
crashes with `Zone Allocation failed - process out of memory`. Every Node command in this
repository therefore needs a constrained heap, for example:

```bash
NODE_OPTIONS="--max-old-space-size=300 --max-semi-space-size=2" pnpm test
```

Enabling a system-managed pagefile (Windows: *System → About → Advanced system settings →
Performance → Virtual memory*) removes the need for the constraint. The CI workflow does not
require it.

---

## 7. Operational runbook (summary)

### Deployment order

1. Apply migrations: `pnpm --filter @salestrace/api db:migrate` (before the new API version serves traffic).
2. Deploy the API (Node host). It runs `db:migrate` optionally via a release command.
3. Deploy the web app (Vercel) with the API base URL.
4. Verify `GET /api/v1/health/ready` returns `200` and the database check passes.
5. Run the seed only in non-production environments.

### Rollback

- API: redeploy the previous image. Migrations are additive and backwards-compatible for one
  release; destructive changes ship in a follow-up migration after the code is reverted.
- Web: Vercel instant rollback.

### Backup and restore

- Supabase automated daily backups + point-in-time recovery (enabled on the production project).
- Restore drill: restore to a scratch project, run migrations, replay a seed, run the integration
  suite against it, then re-point the application. Documented in the deployment guide.

### Incident response

1. Identify the affected organization(s) and time window from `audit_events`.
2. If the issue is a data-integrity issue, pause imports (feature flag on the import endpoint).
3. Recompute attribution for affected campaigns (`POST /attribution/recompute`) after a fix.
4. Export the affected report for the customer before remediation, if required.
5. Record the incident in the audit trail and update this plan.
