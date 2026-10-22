# SalesTrace Ethiopia — Product Requirements Document

**Status:** v1.0 (MVP baseline) · **Owner:** Product & Engineering · **Market:** Ethiopia · **Currency:** ETB

## 1. Problem statement

Brands running influencer campaigns across Ethiopian creators, physical retail, and ecommerce
cannot reliably connect creator activity to completed orders. Campaign reporting is dominated by
impressions, views, likes, comments, and engagement — metrics that do not answer the only question
the marketing budget actually depends on: *did the creator produce attributable sales?*

Data is fragmented across spreadsheets, coupon codes, referral links, ecommerce order exports,
physical shop receipts, and WhatsApp conversations. No single place holds campaign spend, creator
compensation, order outcomes, refunds, and the rules that link them.

## 2. Product vision

A multi-tenant B2B SaaS where an Ethiopian brand can:

1. Register creator campaigns with real budget and compensation data.
2. Issue creator-specific tracking links, coupon codes, and QR codes.
3. Capture referral events when customers arrive via a creator.
4. Import real orders (CSV first) and reconcile them against source data.
5. Attribute eligible orders to creators using explicit, configurable, **tested** rules.
6. See net attributed revenue, cost per attributed order, and ROAS per campaign and per creator.
7. Export campaign and creator reports for management.

## 3. Product principles (binding on implementation)

These are enforced in the data model, the calculation layer, the API, and the UI copy.

| # | Principle | Practical consequence |
|---|---|---|
| P1 | **A click is not a sale.** | Clicks, eligible clicks, attributed orders, and paid orders are four distinct metrics. |
| P2 | **An attributed sale is not necessarily an incremental sale.** | Every screen, label and export says *attributed*. No incrementality or causal language anywhere. |
| P3 | **Revenue is not profit.** | The platform reports revenue and cost. It never reports profit or ROI. ROAS is labelled ROAS. |
| P4 | **Preserve source data.** | Orders keep their imported values; adjustments are appended, never silently overwritten. |
| P5 | **Deterministic decisions, recorded.** | Every attribution stores method, rule version, and human-readable reason. |
| P6 | **Explicit data provenance.** | UI labels distinguish *imported*, *manually entered*, and *verified*. No fabricated creator metrics. |
| P7 | **Tenant isolation is structural.** | Isolation is enforced by the database, not by the UI. |

## 4. Target users and roles

| Role | Primary job | Access |
|---|---|---|
| `owner` | Owns the organization; billing, membership, settings | Full organization access, including billing and membership administration |
| `admin` | Operates campaigns, integrations, configuration | All campaigns, creators, imports, attribution, analytics; no membership/billing administration |
| `marketer` | Runs campaigns and reports | Create/manage campaigns, creators, tracking assets, imports; read analytics and reports |
| `analyst` | Reads and exports results | Read-only across authorized campaign data; can export |

## 5. Functional requirements

### FR-1 Authentication & organizations
- Email/password registration, email verification, password reset.
- Organization creation during onboarding; membership invitation by email.
- Organization-scoped access on every read and write. Changing an ID in a URL, body, or query
  must never expose another organization's data.
- Role-based authorization enforced server-side (route + service), never only in the UI.

### FR-2 Campaign management
- CRUD, archive, and status lifecycle `draft → active → paused → completed → archived`, with
  server-validated transitions (illegal transitions are rejected, not silently coerced).
- Fields: name, objective, description, start/end datetime, budget, currency, destination URL,
  attribution window, attribution policy version, status.
- Many-to-many with creators through `campaign_creators`, carrying agreed compensation.
- Campaign costs (creator fees, production, gifting, platform fees, agency fees, other).

### FR-3 Creator management
- Profile: display name, unique internal code, contact details, optional public profile URLs,
  social platform, niche, audience location/language.
- Social accounts as child records, each marked *manually entered* or *verified*.
- No follower counts, engagement rates, or audience demographics are fabricated or inferred.

### FR-4 Tracking assets
- Per-creator, per-campaign tracking links (`/r/<code>`), coupon codes, and QR codes that resolve
  to the tracking URL.
- A tracking request validates the code, resolves campaign + creator, records an eligible referral
  event with timestamp, then redirects to the campaign's pre-registered destination.
- Public URLs contain only the opaque code — never internal UUIDs.
- No arbitrary redirect targets (open-redirect prevention), invalid codes 404, duplicate bursts are
  coalesced rather than stored as separate events.

### FR-5 Attribution engine
- A pure, framework-free, separately tested business-logic component.
- Methods: referral link, coupon code, QR link, and imported order carrying a referral identifier
  or coupon code.
- Default policy: 7-day click window, last-eligible-click model, creator-specific coupon may
  attribute when no qualifying click exists, deterministic conflict resolution.
- Stores method, rule version, rule snapshot, and decision reason for every decision.
- One attribution per order (hard database constraint); the same order is never counted twice.

### FR-6 Order ingestion
- CSV upload → column mapping → validation → preview (valid/invalid) → transactional import →
  downloadable error report → import status and counts.
- Duplicate detection on `(organization_id, external_order_id)`; re-imports reconcile rather than
  duplicate, and reprocessing a failed import never re-inserts already imported orders.
- Validation of monetary values, currency, dates, status, identifiers; reconciliation of
  `subtotal − discount + tax + shipping = total_paid` with warnings on mismatch.
- Refunds recorded and deducted; cancellations excluded from valid sales.

### FR-7 Analytics & reporting
- Overview dashboard, campaign summaries, creator comparison tables, and CSV exports.
- Metrics defined precisely in `docs/financial-metrics.md`, with zero-denominator handling that
  never yields `NaN`/`Infinity`.
- Filters: date range, campaign, creator, platform, order status, attribution method.
- Dashboard totals must reconcile to the underlying attributed order rows (verified by tests).
- Every report and export is organization-scoped and role-checked.

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| Isolation | Cross-tenant access impossible without a database-level defect; enforced by RLS + server authorization (defence in depth). |
| Money | Integer minor units only (`BIGINT`). No floating point in authoritative monetary paths. |
| Time | `TIMESTAMPTZ` in UTC; converted to the organization timezone for display. |
| Validation | Every untrusted input validated at the system boundary with Zod. |
| Errors | Safe, stable error codes. No stack traces, SQL, or infrastructure detail to clients. |
| Observability | Structured JSON logs, request correlation IDs on every request and log line. |
| Testing | Unit tests for all business rules; integration tests for isolation and persistence; Playwright E2E for the critical journey. |
| Language | English UI now; message catalog + locale plumbing to support Amharic later. |
| Currency | Single reporting currency (ETB) per organization; multi-currency reporting explicitly out of scope. |

## 7. Acceptance criteria (MVP)

1. A brand can create an organization and manage authorized team members. ✅ verified by integration + E2E tests.
2. A marketer can create a campaign and assign creators with agreed fees. ✅
3. The system generates unique tracking links, coupon codes and QR codes. ✅
4. Eligible referral events are recorded on link open. ✅
5. A valid CSV import creates or updates order records safely. ✅
6. Duplicate orders are rejected or reconciled idempotently. ✅
7. Orders are attributed by documented, tested rules. ✅
8. Refunds and cancellations change reported revenue correctly. ✅
9. Campaign metrics reconcile with underlying order data. ✅
10. Reports filter and export. ✅
11. Organization isolation is tested. ✅
12. Migrations and seed scripts are reproducible. ✅

## 8. Open validation items

See `docs/assumptions.md` for the full register of assumptions, the ones that materially affect
architecture, and how to retire each with a real customer conversation.
