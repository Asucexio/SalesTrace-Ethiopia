# Seven-Day GitHub Commit Plan

This plan groups the project files into **eight commits per day**. Each commit has a suggested
message and a staging command. Use the command for one item, review what is staged, then commit
with the matching message before moving to the next item.

The commands assume PowerShell is open at the repository root:

```powershell
cd "C:\Users\hp\Downloads\SalesTrace-Ethiopia-fixed\SalesTrace-Ethiopia"
```

## Before starting

Check the current branch, remote, and worktree:

```powershell
git status --short --branch
git remote -v
```

Confirm `origin` is the GitHub repository you intend to use. If you want to keep the work off
`main`, use the one-branch-per-day workflow below instead of committing directly to `main`.

Never stage real `.env` files, passwords, tokens, database connection strings, or other secrets.
The root `.env.example` currently has a secret-looking `IP_HASH_PEPPER` value: replace it with a
placeholder before staging the file. If that value was a real secret, rotate it.

## One branch per day

Use a separate branch for each day's commits. Merge each day's pull request into `main` before
starting the next day's branch. This keeps the branches independent and makes each pull request
contain only that day's work.

| Day | Branch | Focus |
|---|---|---|
| 1 | `feature/day-1-project-shared-packages` | Repository setup, documentation, shared packages |
| 2 | `feature/day-2-api-auth` | API foundation and authentication |
| 3 | `feature/day-3-database-organizations` | Migrations, organizations, tenant security |
| 4 | `feature/day-4-campaigns-creators-tracking` | Campaign, creator, and tracking APIs |
| 5 | `feature/day-5-orders-attribution-analytics` | Orders, attribution, analytics, API assembly |
| 6 | `feature/day-6-web-app` | Web application |
| 7 | `feature/day-7-tests-delivery` | Remaining pages, tests, and delivery |

### Start each day's branch

At the start of Day 1, update `main` and create the first branch:

```powershell
git switch main
git pull origin main
git switch -c feature/day-1-project-shared-packages
```

Make and push that day's commits on its branch:

```powershell
git push -u origin feature/day-1-project-shared-packages
```

On GitHub, open a pull request from that day's branch into `main`. After reviewing and merging
the pull request, start the next day from the updated `main`. For example, at the start of Day 2:

```powershell
git switch main
git pull origin main
git switch -c feature/day-2-api-auth
```

Repeat this pattern for each day, substituting the branch name from the table. Merge each pull
request into `main` before creating the next day's branch so later days include the earlier
merged work.

## Repeat this for every commit

1. Run that item's `git add` command.
2. Review the staged paths and changes:

   ```powershell
   git diff --cached --check
   git diff --cached --stat
   git diff --cached
   ```

3. Commit using the exact message shown for that item:

   ```powershell
   git commit -m "commit message from the plan"
   ```

Push the branch after the day's commits:

```powershell
git push
```

For the first push of a new branch, set its upstream:

```powershell
git push -u origin feature/day-1-project-shared-packages
```

For later days, replace the branch name with that day's name from the table.

Only commit changes that you have actually made and reviewed. If files are already committed,
stage only new changes; do not create empty or artificial commits to meet a target count.

---

## Day 1 — Repository setup and shared packages

### 1. Workspace and development tooling

Stage:

```powershell
git add -- .gitignore .npmrc .prettierrc.json eslint.config.js package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json
```

Commit:

```text
chore: configure workspace and development tooling
```

### 2. Project overview and environment templates

Stage after replacing the secret-looking example value with a placeholder:

```powershell
git add -- README.md .env.example apps/web/.env.example
```

Commit:

```text
docs: add project overview and environment setup
```

### 3. Architecture and repository documentation

Stage:

```powershell
git add -- docs/architecture.md docs/repository-structure.md docs/testing-strategy.md
```

Commit:

```text
docs: document architecture and repository structure
```

### 4. Product scope and implementation documentation

Stage:

```powershell
git add -- docs/product-requirements.md docs/mvp-scope.md docs/implementation-plan.md docs/assumptions.md
```

Commit:

```text
docs: describe product scope and implementation plan
```

### 5. Data, API, security, and attribution documentation

Stage:

```powershell
git add -- docs/database-schema.md docs/api-specification.md docs/security-and-tenancy.md docs/threat-model.md docs/attribution-rules.md docs/financial-metrics.md
```

Commit:

```text
docs: document data, APIs, security, and attribution rules
```

### 6. Shared identifiers and enums

Stage:

```powershell
git add -- packages/shared-types/src/ids.ts packages/shared-types/src/enums.ts
```

Commit:

```text
feat: add shared identifiers and enums
```

### 7. Shared DTOs and types package configuration

Stage:

```powershell
git add -- packages/shared-types/src/dto.ts packages/shared-types/src/money.ts packages/shared-types/src/time.ts packages/shared-types/src/index.ts packages/shared-types/package.json packages/shared-types/tsconfig.json
```

Commit:

```text
feat: define shared DTOs and common types
```

### 8. Shared validation package

Stage:

```powershell
git add -- packages/validation/
```

Commit:

```text
feat: add shared request validation schemas
```

## Day 2 — API foundation and authentication

### 1. API workspace configuration

Stage:

```powershell
git add -- apps/api/package.json apps/api/tsconfig.json
```

Commit:

```text
chore: configure API workspace
```

### 2. Environment configuration and database interface

Stage:

```powershell
git add -- apps/api/src/config/env.ts apps/api/src/db/driver.ts
```

Commit:

```text
feat: add API environment validation and database interface
```

### 3. PostgreSQL database driver

Stage:

```powershell
git add -- apps/api/src/db/pg-driver.ts
```

Commit:

```text
feat: add PostgreSQL database driver
```

### 4. Migrations, test database, and seed runner

Stage:

```powershell
git add -- apps/api/src/db/migrate.ts apps/api/src/db/pglite-driver.ts apps/api/src/db/seed.ts
```

Commit:

```text
feat: add migration runner and test database driver
```

### 5. Request validation and security middleware

Stage:

```powershell
git add -- apps/api/src/middleware/csrf.ts apps/api/src/middleware/rate-limit.ts apps/api/src/middleware/request-id.ts apps/api/src/middleware/validate.ts apps/api/src/middleware/error-handler.ts
```

Commit:

```text
feat: add API validation and security middleware
```

### 6. API shared utilities

Stage:

```powershell
git add -- apps/api/src/shared/cookies.ts apps/api/src/shared/errors.ts apps/api/src/shared/express.ts apps/api/src/shared/logger.ts apps/api/src/shared/response.ts apps/api/src/shared/storage.ts
```

Commit:

```text
feat: add shared API responses and logging
```

### 7. Authentication providers

Stage:

```powershell
git add -- apps/api/src/modules/auth/auth.provider.ts apps/api/src/modules/auth/local-auth.provider.ts apps/api/src/modules/auth/supabase-auth.provider.ts apps/api/src/modules/auth/password.ts
```

Commit:

```text
feat: add local and Supabase authentication providers
```

### 8. Authentication and session endpoints

Stage:

```powershell
git add -- apps/api/src/modules/auth/auth.controller.ts apps/api/src/modules/auth/auth.routes.ts apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/session.service.ts
```

Commit:

```text
feat: add authentication services and routes
```

## Day 3 — Database, organizations, and tenant security

### 1. Identity and organization schema

Stage:

```powershell
git add -- supabase/migrations/0001_init.sql
```

Commit:

```text
feat: create initial identity and organization schema
```

### 2. Campaign and creator schema

Stage:

```powershell
git add -- supabase/migrations/0002_core_domain.sql
```

Commit:

```text
feat: add core campaign and creator schema
```

### 3. Tracking and orders schema

Stage:

```powershell
git add -- supabase/migrations/0003_tracking.sql supabase/migrations/0004_orders.sql
```

Commit:

```text
feat: add tracking and order database schema
```

### 4. Attribution and import schema

Stage:

```powershell
git add -- supabase/migrations/0005_attribution.sql supabase/migrations/0006_imports.sql
```

Commit:

```text
feat: add attribution and import database schema
```

### 5. Governance and local-auth schema

Stage:

```powershell
git add -- supabase/migrations/0007_governance.sql supabase/migrations/0008_local_auth.sql
```

Commit:

```text
feat: add governance and local authentication schema
```

### 6. Database role and organization context

Stage:

```powershell
git add -- supabase/migrations/0009_api_role_membership.sql apps/api/src/db/context.ts
```

Commit:

```text
fix: allow API login to switch into the RLS role
```

### 7. Organization and membership services

Stage:

```powershell
git add -- apps/api/src/modules/organizations/organization.repository.ts apps/api/src/modules/organizations/organization.service.ts
```

Commit:

```text
feat: add organization and membership services
```

### 8. Organization routes and active-session handling

Stage:

```powershell
git add -- apps/api/src/modules/organizations/organization.controller.ts apps/api/src/modules/organizations/organization.routes.ts apps/api/src/middleware/auth.ts apps/api/src/middleware/authorize.ts apps/api/src/shared/capabilities.ts
```

Commit:

```text
fix: activate new organizations in the current session
```

## Day 4 — Campaigns, creators, and tracking APIs

### 1. Campaign repository and service

Stage:

```powershell
git add -- apps/api/src/modules/campaigns/campaign.repository.ts apps/api/src/modules/campaigns/campaign.service.ts
```

Commit:

```text
feat: implement campaign data access and business rules
```

### 2. Campaign routes and controller

Stage:

```powershell
git add -- apps/api/src/modules/campaigns/campaign.controller.ts apps/api/src/modules/campaigns/campaign.routes.ts
```

Commit:

```text
feat: add campaign API endpoints
```

### 3. Creator repository and service

Stage:

```powershell
git add -- apps/api/src/modules/creators/creator.repository.ts apps/api/src/modules/creators/creator.service.ts
```

Commit:

```text
feat: implement creator data access and business rules
```

### 4. Creator routes and controller

Stage:

```powershell
git add -- apps/api/src/modules/creators/creator.controller.ts apps/api/src/modules/creators/creator.routes.ts
```

Commit:

```text
feat: add creator API endpoints
```

### 5. Tracking repository and service

Stage:

```powershell
git add -- apps/api/src/modules/tracking/tracking.repository.ts apps/api/src/modules/tracking/tracking.service.ts
```

Commit:

```text
feat: implement tracking link and coupon services
```

### 6. Tracking routes, controller, and QR support

Stage:

```powershell
git add -- apps/api/src/modules/tracking/tracking.controller.ts apps/api/src/modules/tracking/tracking.routes.ts apps/api/src/shared/qrcode.ts
```

Commit:

```text
feat: add tracking API and QR code support
```

### 7. Campaign integration tests

Stage:

```powershell
git add -- apps/api/tests/integration/campaigns.test.ts
```

Commit:

```text
test: cover campaign API behavior
```

### 8. Creator and tracking integration tests

Stage:

```powershell
git add -- apps/api/tests/integration/creators.test.ts apps/api/tests/integration/tracking.test.ts
```

Commit:

```text
test: cover creator and tracking API behavior
```

## Day 5 — Orders, attribution, analytics, and API assembly

### 1. CSV parsing and order repository

Stage:

```powershell
git add -- apps/api/src/modules/orders/csv.ts apps/api/src/modules/orders/order.repository.ts
```

Commit:

```text
feat: add order CSV parsing and persistence
```

### 2. Order import service

Stage:

```powershell
git add -- apps/api/src/modules/orders/order-import.service.ts
```

Commit:

```text
feat: add order import processing
```

### 3. Order API routes and controller

Stage:

```powershell
git add -- apps/api/src/modules/orders/order.controller.ts apps/api/src/modules/orders/order.routes.ts
```

Commit:

```text
feat: add order and import API endpoints
```

### 4. Attribution engine

Stage:

```powershell
git add -- packages/attribution-engine/
```

Commit:

```text
feat: add attribution calculation engine
```

### 5. API attribution module

Stage:

```powershell
git add -- apps/api/src/modules/attribution/
```

Commit:

```text
feat: add API attribution services and endpoints
```

### 6. Analytics API module

Stage:

```powershell
git add -- apps/api/src/modules/analytics/
```

Commit:

```text
feat: add analytics API services and endpoints
```

### 7. API application and server

Stage:

```powershell
git add -- apps/api/src/app.ts apps/api/src/container.ts apps/api/src/server.ts apps/api/src/openapi.ts
```

Commit:

```text
feat: assemble API application and server
```

### 8. Database seed data

Stage:

```powershell
git add -- supabase/seed.sql
```

Commit:

```text
feat: add demo database seed data
```

## Day 6 — Web application

### 1. API client and resource hook

Stage:

```powershell
git add -- apps/web/src/lib/api.ts apps/web/src/lib/use-api-resource.ts
```

Commit:

```text
feat: add web API client and data hooks
```

### 2. Session and formatting utilities

Stage:

```powershell
git add -- apps/web/src/lib/session.tsx apps/web/src/lib/date-range.ts apps/web/src/lib/format.ts apps/web/src/lib/utils.ts
```

Commit:

```text
feat: add web session and formatting utilities
```

### 3. Reusable UI components

Stage:

```powershell
git add -- apps/web/src/components/ui/
```

Commit:

```text
feat: add reusable web interface components
```

### 4. Sign-in and sign-up forms

Stage:

```powershell
git add -- apps/web/src/components/auth/auth-card.tsx apps/web/src/components/auth/sign-in-form.tsx apps/web/src/components/auth/sign-up-form.tsx apps/web/src/components/auth/protected-route.tsx
```

Commit:

```text
feat: add sign-in and sign-up forms
```

### 5. Account recovery and workspace onboarding

Stage:

```powershell
git add -- apps/web/src/components/auth/forgot-password-form.tsx apps/web/src/components/auth/reset-password-form.tsx apps/web/src/components/auth/organization-onboarding.tsx
```

Commit:

```text
feat: add account recovery and workspace onboarding
```

### 6. Application navigation and shell

Stage:

```powershell
git add -- apps/web/src/components/layout/ "apps/web/src/app/(app)/layout.tsx"
```

Commit:

```text
feat: add application navigation and organization switcher
```

### 7. Campaign pages and components

Stage:

```powershell
git add -- "apps/web/src/app/(app)/campaigns/" apps/web/src/components/campaigns/
```

Commit:

```text
feat: add campaign pages and detail views
```

### 8. Dashboard, analytics, and reporting

Stage:

```powershell
git add -- "apps/web/src/app/(app)/dashboard/page.tsx" "apps/web/src/app/(app)/analytics/page.tsx" "apps/web/src/app/(app)/reports/page.tsx" apps/web/src/components/charts/
```

Commit:

```text
feat: add dashboard analytics and reporting pages
```

## Day 7 — Remaining pages, tests, and delivery

### 1. Creator pages

Stage:

```powershell
git add -- "apps/web/src/app/(app)/creators/"
```

Commit:

```text
feat: add creator list and profile pages
```

### 2. Order pages

Stage:

```powershell
git add -- "apps/web/src/app/(app)/orders/"
```

Commit:

```text
feat: add order import and order history pages
```

### 3. Tracking pages and components

Stage:

```powershell
git add -- "apps/web/src/app/(app)/tracking/" apps/web/src/components/tracking/
```

Commit:

```text
feat: add tracking management pages
```

### 4. Team settings page

Stage:

```powershell
git add -- "apps/web/src/app/(app)/settings/"
```

Commit:

```text
feat: add team settings page
```

### 5. Public and authentication entry pages

Stage:

```powershell
git add -- apps/web/src/app/layout.tsx apps/web/src/app/page.tsx apps/web/src/app/login/ apps/web/src/app/signup/ apps/web/src/app/onboarding/ apps/web/src/app/forgot-password/ apps/web/src/app/reset-password/
```

Commit:

```text
feat: add public and authentication pages
```

### 6. Attribution engine and API unit tests

Stage:

```powershell
git add -- packages/attribution-engine/tests/ apps/api/tests/unit/
```

Commit:

```text
test: add attribution and API unit coverage
```

### 7. API integration tests and support

Stage:

```powershell
git add -- apps/api/tests/integration/ apps/api/tests/support/ apps/api/tests/setup.ts
```

Commit:

```text
test: add API integration and tenant isolation coverage
```

### 8. Web tests, browser tests, and CI

Stage:

```powershell
git add -- apps/web/src/components/__tests__/ apps/web/src/lib/__tests__/ apps/web/src/test/ apps/web/e2e/ .github/
```

Commit:

```text
test: add web journeys and CI coverage
```

## Final checks

After the final day's work, review the branch and recent commits:

```powershell
git status --short --branch
git log --oneline -20
```

Run project checks before opening a pull request:

```powershell
pnpm build
pnpm typecheck
```

When the branch is ready, open a pull request on GitHub from
`salestrace-seven-day-buildout` into `main`.
