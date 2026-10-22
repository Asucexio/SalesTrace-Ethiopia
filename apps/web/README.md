# SalesTrace Ethiopia — web app

Next.js 15 (App Router) front end for SalesTrace Ethiopia, a B2B SaaS that attributes
influencer campaign revenue to creators and campaigns.

The app is a **single-origin client**: the browser only ever talks to the Next.js server, and
the Next.js server proxies `/api/*` and `/r/*` to the API. That keeps the `st_session` cookie
first-party and makes tracking links work on the brand's own domain.

---

## Running it

```bash
# 1. install (already done in this workspace)
pnpm install

# 2. start the API (another terminal) — see apps/api
pnpm --filter @salestrace/api dev

# 3. start the web app
pnpm --filter @salestrace/web dev
# → http://localhost:3000
```

Other scripts:

| Command | What it does |
|---|---|
| `pnpm --filter @salestrace/web dev` | Development server on port 3000 |
| `pnpm --filter @salestrace/web build` | Production build |
| `pnpm --filter @salestrace/web start` | Serve the production build |
| `pnpm --filter @salestrace/web typecheck` | `tsc --noEmit` |
| `pnpm --filter @salestrace/web test` | Vitest (jsdom) |
| `pnpm --filter @salestrace/web test:watch` | Vitest in watch mode |

### Memory note

The build machine is memory constrained. Prefix node commands with a constrained heap, e.g.

```powershell
$env:NODE_OPTIONS="--max-old-space-size=2000 --max-semi-space-size=32"
```

A heap of `--max-old-space-size=300` is **not** enough for `tsc` on this project (React 19 +
Radix + TanStack Table + Zod typings) and for Vitest/Vite (it aborts with
`Committing semi space failed` / `NewSpace::EnsureCurrentCapacity`). The values above are the
smallest that work reliably.

`next.config.mjs` sets `experimental.cpus = 2`. Next otherwise starts one worker per CPU (16
on this machine) for the static-generation phase, and every worker inherits the heap limit —
the build then dies with `Zone Allocation failed - process out of memory` while collecting page
data. Capping the pool keeps the total commit charge inside the machine's limit.

---

## Environment variables

Copy `.env.example` to `.env.local`:

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` | Base path the browser uses for API calls. Always same-origin. |
| `API_INTERNAL_URL` | `http://localhost:4000` | Server-side address of the API. Used by the rewrite proxy. Never exposed to the browser. |
| `NEXT_PUBLIC_APP_NAME` | `SalesTrace Ethiopia` | Product name in the app shell and on the auth screens. |

---

## How the proxy works

`next.config.mjs` registers two rewrites:

```js
{ source: '/api/:path*', destination: `${API_INTERNAL_URL}/api/:path*` },
{ source: '/r/:path*',   destination: `${API_INTERNAL_URL}/r/:path*`   },
```

* **`/api/:path*`** — every REST call the app makes. The browser calls `/api/v1/...` on the
  Next.js origin; Next forwards the request to the API server, including the `st_session`
  cookie and the `Origin` header (the API requires a matching `Origin` for mutating requests).
  Because the response is same-origin the session cookie is never third-party and no CORS
  pre-flight is needed.
* **`/r/:path*`** — the **public tracking redirect**. A creator's link looks like
  `https://<brand-domain>/r/7K2M9QX4PD`; the proxy forwards it to the API, which records the
  click and issues a `302` to the stored destination URL. The destination is always taken from
  the database, so no query parameter can turn it into an open redirect.

Anything that is not rewritten is served by Next.js itself.

---

## Structure

```
apps/web
├── next.config.mjs          rewrites, transpilePackages, extensionAlias
├── tsconfig.json            strict TS, `paths` → ../../packages/*/src
├── tailwind.config.ts       CSS-variable theme, dark mode via `.dark`
├── vitest.config.ts         jsdom + single-threaded test runner
├── .env.example
└── src
    ├── app
    │   ├── layout.tsx            root layout: session provider, tooltips, toaster
    │   ├── page.tsx              redirects to /dashboard
    │   ├── login|signup|forgot-password|reset-password|onboarding
    │   └── (app)                 the protected shell
    │       ├── layout.tsx        sidebar + top bar
    │       ├── dashboard/        overview KPIs, campaign performance, recent orders
    │       ├── campaigns/        list, /new, /[id] (7 tabs)
    │       ├── creators/         list, /new, /[id]
    │       ├── tracking/         links, coupon codes, click events
    │       ├── orders/           list, /import (wizard), /imports/[id]
    │       ├── analytics/        filters, KPIs, comparison tables, SVG time series
    │       ├── reports/          report preview + CSV export
    │       └── settings/team/    members, roles, audit trail
    ├── components
    │   ├── ui/                 hand-written shadcn-style primitives
    │   ├── auth/               sign-in, sign-up, reset, onboarding, protected route
    │   ├── layout/             sidebar, top bar, org switcher, user menu
    │   ├── campaigns|tracking/  page-level feature components
    │   ├── charts/             inline SVG time series (no chart library)
    │   └── shared/             error state, badges, tooltips, filters
    └── lib
        ├── api.ts              typed fetch client + ApiError
        ├── session.tsx          session context (user, org, role, memberships)
        ├── format.ts            money / rate / date formatting
        ├── date-range.ts        inclusive-from / exclusive-to helpers
        └── use-api-resource.ts  small data-loading hook
```

---

## API usage

Every call goes through `src/lib/api.ts`, which speaks the envelope contract
(`{ data, meta }` / `{ error: { code, message, details } }`) and throws a typed `ApiError`
with `.code`, `.message`, `.status` and `.details`.

| Helper | Endpoint |
|---|---|
| `api.auth.register` | `POST /api/v1/auth/register` |
| `api.auth.login` | `POST /api/v1/auth/login` |
| `api.auth.logout` | `POST /api/v1/auth/logout` |
| `api.auth.me` | `GET /api/v1/auth/me` |
| `api.auth.forgotPassword` | `POST /api/v1/auth/forgot-password` |
| `api.auth.resetPassword` | `POST /api/v1/auth/reset-password` |
| `api.auth.switchOrganization` | `POST /api/v1/auth/switch-organization` |
| `api.organizations.create` | `POST /api/v1/organizations` |
| `api.organizations.current` | `GET /api/v1/organizations/current` |
| `api.organizations.members` | `GET /api/v1/organizations/current/members` |
| `api.organizations.inviteMember` | `POST /api/v1/organizations/current/members` |
| `api.organizations.updateMember` | `PATCH /api/v1/organizations/current/members/:memberId` |
| `api.organizations.removeMember` | `DELETE /api/v1/organizations/current/members/:memberId` |
| `api.organizations.auditEvents` | `GET /api/v1/organizations/current/audit-events` |
| `api.campaigns.list/create/get/update` | `GET/POST /api/v1/campaigns`, `GET/PATCH /api/v1/campaigns/:id` |
| `api.campaigns.setStatus` | `POST /api/v1/campaigns/:id/status` |
| `api.campaigns.creators/assignCreator` | `GET/POST /api/v1/campaigns/:id/creators` |
| `api.campaigns.costs/addCost` | `GET/POST /api/v1/campaigns/:id/costs` |
| `api.campaigns.performance` | `GET /api/v1/campaigns/:id/performance` |
| `api.campaigns.orders/attributions` | `GET /api/v1/campaigns/:id/orders`, `…/attributions` |
| `api.creators.list/create/get/update` | `GET/POST /api/v1/creators`, `GET/PATCH /api/v1/creators/:id` |
| `api.creators.socialAccounts` | `GET/POST /api/v1/creators/:id/social-accounts` |
| `api.creators.performance` | `GET /api/v1/creators/:id/performance` |
| `api.tracking.links/createLink` | `GET/POST /api/v1/tracking-links` |
| `api.tracking.coupons/createCoupon` | `GET/POST /api/v1/coupon-codes` |
| `api.tracking.events` | `GET /api/v1/tracking-events` |
| `api.orders.list/get` | `GET /api/v1/orders`, `GET /api/v1/orders/:id` |
| `api.orders.upload` | `POST /api/v1/orders/imports` (raw `text/csv` body) |
| `api.orders.setMapping` | `PUT /api/v1/orders/imports/:id/mapping` |
| `api.orders.preview` | `POST /api/v1/orders/imports/:id/preview` |
| `api.orders.commit` | `POST /api/v1/orders/imports/:id/commit` |
| `api.orders.errorsCsvUrl` | `GET /api/v1/orders/imports/:id/errors.csv` |
| `api.attribution.list/get/recompute/rules` | `/api/v1/attributions…`, `/api/v1/attribution/…` |
| `api.analytics.overview/campaigns/creators/timeseries` | `/api/v1/analytics/…` |
| `api.reports.campaigns` | `GET /api/v1/reports/campaigns` |
| `api.reports.export` | `GET /api/v1/reports/export?type=…` (CSV) |

A `401` from any call (except on the auth screens) redirects the browser to
`/login?next=…`.

---

## Conventions this app enforces

* **Money** is transported as decimal strings (`"88500.00"`). It is parsed into exact integer
  minor units with `parseAmountToMinor` and only then handed to
  `Intl.NumberFormat('en-ET', { style: 'currency', currency })` for display. `parseFloat` is
  never used to make a display decision.
* **Rates** may be `null` (zero denominator). `null` renders as an em dash `—` — never `NaN`,
  `Infinity` or a misleading `0 %`.
* **Revenue is labelled "attributed revenue"** and the efficiency metric is labelled **"ROAS"**
  with the tooltip *“Attributed net revenue ÷ campaign cost. Not ROI.”* The word “ROI” never
  appears in the UI.
* **Empty states** always use `<EmptyState>` with an icon, a title, a description and a call to
  action. No placeholder metrics are ever rendered.
* **Forms** are validated with the shared Zod schemas from `@salestrace/validation`
  (`createCampaignSchema`, `assignCreatorSchema`, `createCampaignCostSchema`,
  `createCreatorSchema`, `createTrackingLinkSchema`, `createCouponCodeSchema`,
  `importMappingSchema`, `createOrganizationSchema`, `inviteMemberSchema`, `loginSchema`,
  `registerSchema`, `forgotPasswordSchema`) and every field has a `<Label>` linked with
  `htmlFor`/`id` plus an `aria-describedby` error message.

---

## Tests

```bash
$env:NODE_OPTIONS="--max-old-space-size=2000 --max-semi-space-size=32"
pnpm --filter @salestrace/web test
```

The test runner is configured with `fileParallelism: false` and a single worker thread
(`vitest.config.ts`) so the suite fits in the machine's memory budget.

* `src/lib/__tests__/format.test.ts` — money formatting, exact minor-unit parsing, `null`
  rate rendering, date formatting.
* `src/components/__tests__/empty-state.test.tsx` — the empty state renders an icon, a title, a
  description and a call to action, and never invents a metric.

> `@testing-library/jest-dom` is **not** installed in this workspace. The matchers the suite
> needs (`toBeInTheDocument`, `toHaveTextContent`, `toHaveAttribute`, `toBeVisible`,
> `toBeDisabled`, `toBeEnabled`) are implemented in `src/test/matchers.ts` with a jest-dom
> compatible API and registered in `src/test/setup.ts`; their types live in
> `src/test/assertions.ts`. If the dependency is added later, the setup file can simply be
> swapped for `import '@testing-library/jest-dom/vitest'`.
