# API Specification — SalesTrace Ethiopia

**Base URL:** `/api/v1` · **Media type:** `application/json` · **Live OpenAPI:** `GET /api/v1/openapi.json`
**Swagger UI (dev):** `GET /api/v1/docs`

---

## 1. Conventions

### 1.1 Response envelope

Success:

```json
{
  "data": { "...": "resource or collection" },
  "meta": { "requestId": "01JN8Q2R4K7Z3M9Q0T5V6X8YZA", "total": 128, "limit": 25, "offset": 0 }
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request body failed validation.",
    "details": [{ "path": "startAt", "message": "Required" }]
  },
  "meta": { "requestId": "01JN8Q2R4K7Z3M9Q0T5V6X8YZA" }
}
```

`meta.total`, `meta.limit`, `meta.offset` are present only on list endpoints.

### 1.2 Error codes

| HTTP | `error.code` | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request that cannot be parsed |
| 401 | `UNAUTHENTICATED` | Missing or invalid session |
| 403 | `FORBIDDEN` | Authenticated but not permitted (role or cross-tenant access) |
| 404 | `NOT_FOUND` | Resource does not exist **or belongs to another organization** (identical response — no existence leak) |
| 409 | `CONFLICT` | Uniqueness violation, illegal state transition, duplicate order |
| 413 | `PAYLOAD_TOO_LARGE` | Upload exceeds the size limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Unsupported file type |
| 422 | `UNPROCESSABLE_ENTITY` | Semantically invalid (e.g. campaign end before start, currency mismatch) |
| 429 | `RATE_LIMITED` | Rate limit exceeded; `Retry-After` header set |
| 500 | `INTERNAL_ERROR` | Unexpected failure — logged with the request id, never detailed to the client |

### 1.3 Authentication & session

- The API issues an **httpOnly** cookie `st_session` (`SameSite=Lax`, `Secure` in production,
  `Path=/api`).
- The Next.js app proxies `/api/*` to the API so the browser is always same-origin.
- Mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`) must carry a matching `Origin` header
  (CSRF defence). A missing/mismatched `Origin` yields `403 FORBIDDEN`.
- `Authorization: Bearer <token>` is also accepted (used by scripts and the E2E suite).

### 1.4 Authorization

| Role | Campaigns | Creators | Tracking | Imports | Attribution | Reports | Members | Billing/org settings |
|---|---|---|---|---|---|---|---|---|
| `owner` | write | write | write | write | write | read | **manage** | **manage** |
| `admin` | write | write | write | write | write | read | read | read |
| `marketer` | write | write | write | write | write | read | read | — |
| `analyst` | read | read | read | — | read | read | read | — |

Enforced server-side. A user with no membership in an organization receives `404` for that
organization's resources.

### 1.5 Pagination, filtering, sorting

- List endpoints accept `limit` (default 25, max 100) and `offset`.
- Date filters accept ISO-8601 timestamps; `from`/`to` are inclusive of `from`, exclusive of `to`.
- `sort` accepts `field` or `-field` (leading `-` = descending) and is validated against a
  per-endpoint allowlist.

### 1.6 Idempotency

`POST /orders/imports`, `POST /attribution/recompute` and campaign-cost creation accept an
`Idempotency-Key` header (≤ 128 chars). A repeated key with the same body replays the stored
response; the same key with a different body returns `409 CONFLICT`.

### 1.7 Rate limits

| Scope | Limit |
|---|---|
| `GET /r/:code` (public) | 120 requests / minute / IP |
| `/auth/*` | 10 requests / 15 minutes / IP |
| `/orders/imports` (upload) | 5 requests / 10 minutes / organization |
| All other `/api/v1/*` | 300 requests / minute / user |

### 1.8 Headers

| Header | Direction | Purpose |
|---|---|---|
| `X-Request-Id` | request/response | Correlation id; generated if absent |
| `Idempotency-Key` | request | Idempotent write |
| `Retry-After` | response | Seconds to wait after 429 |

---

## 2. Authentication endpoints

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/auth/register` | public | — | Create account; sends verification (email in `supabase` mode, token in `local` mode) |
| POST | `/auth/login` | public | — | Sets the session cookie; returns the user + memberships |
| POST | `/auth/logout` | session | — | Revokes the session |
| GET | `/auth/me` | session | — | Current user, active organization, role |
| POST | `/auth/verify-email` | public | — | Consumes a verification token |
| POST | `/auth/forgot-password` | public | — | Issues a reset token (always 202, no user enumeration) |
| POST | `/auth/reset-password` | public | — | Sets a new password, revokes all sessions |
| POST | `/auth/switch-organization` | session | — | Switches the active organization for the session |

**Register** `POST /api/v1/auth/register`

```json
{ "email": "marketer@brand.et", "password": "Str0ng-Pass!", "fullName": "Marta Bekele" }
```

`201` → `{ "data": { "user": { "id": "...", "email": "...", "emailVerified": false } } }`

**Login** `POST /api/v1/auth/login` → `200` with `Set-Cookie: st_session=...; HttpOnly`.

Password rules: minimum 10 characters, must contain a letter and a digit. Timing-safe comparison
via scrypt in `local` mode; Supabase Auth performs its own verification in `supabase` mode.

---

## 3. Organizations & membership

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/organizations` | — (creates org, caller becomes `owner`) | Create organization |
| GET | `/organizations/current` | any | Current organization settings |
| PATCH | `/organizations/current` | `owner` | Update name, timezone, currency, settings |
| GET | `/organizations/current/members` | any | List members |
| POST | `/organizations/current/members` | `owner` | Invite a member by email with a role |
| PATCH | `/organizations/current/members/:memberId` | `owner` | Change role / suspend |
| DELETE | `/organizations/current/members/:memberId` | `owner` | Remove a member |
| POST | `/organizations/accept-invitation` | session | Accept a pending invitation |
| GET | `/organizations/current/audit-events` | `owner`/`admin` | Paginated audit trail |

The **active organization** comes from the session, never from a query parameter. Switching
organizations requires the caller to be a member of the target organization.

---

## 4. Campaigns

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/campaigns` | any | List with filters: `status`, `from`, `to`, `creatorId`, `search` |
| POST | `/campaigns` | `marketer`+ | Create |
| GET | `/campaigns/:campaignId` | any | Detail (includes creator count, cost total) |
| PATCH | `/campaigns/:campaignId` | `marketer`+ | Update fields |
| POST | `/campaigns/:campaignId/status` | `marketer`+ | Transition status (validated) |
| POST | `/campaigns/:campaignId/archive` | `marketer`+ | Archive |
| GET | `/campaigns/:campaignId/creators` | any | Assigned creators with agreed fees |
| POST | `/campaigns/:campaignId/creators` | `marketer`+ | Assign a creator (`creatorId`, `agreedFee`, `assignedAt`) |
| PATCH | `/campaigns/:campaignId/creators/:creatorId` | `marketer`+ | Update assignment (fee, `assignedAt`, notes) |
| DELETE | `/campaigns/:campaignId/creators/:creatorId` | `marketer`+ | Remove assignment |
| GET | `/campaigns/:campaignId/costs` | any | List campaign costs |
| POST | `/campaigns/:campaignId/costs` | `marketer`+ | Record a cost |
| DELETE | `/campaigns/:campaignId/costs/:costId` | `marketer`+ | Delete a cost (audited) |
| GET | `/campaigns/:campaignId/performance` | any | Campaign performance metrics |
| GET | `/campaigns/:campaignId/orders` | any | Attributed + unattributed orders for the campaign |
| GET | `/campaigns/:campaignId/attributions` | any | Attribution decisions with reasons |

**Create** `POST /api/v1/campaigns`

```json
{
  "name": "Summer 2026 TikTok Launch",
  "objective": "Drive first-time purchases",
  "description": "Launch campaign",
  "startAt": "2026-03-01T00:00:00Z",
  "endAt": "2026-04-01T00:00:00Z",
  "budget": 250000.00,
  "currency": "ETB",
  "attributionWindowDays": 7,
  "destinationUrl": "https://shop.brand.et/collections/summer"
}
```

Amounts are accepted as **decimal strings** (`"250000.00"`) or numbers and are stored as minor
units; the API never uses floating point for the stored value. `422` if `endAt <= startAt`, if
`currency` ≠ organization currency, or if `destinationUrl` is not `https`.

**Status transitions** `POST /api/v1/campaigns/:id/status` — body `{ "status": "active" }`.
Allowed transitions:

```
draft    → active | archived
active   → paused | completed | archived
paused   → active | completed | archived
completed→ archived
archived → (terminal)
```

Anything else returns `409 CONFLICT` with `error.code = "INVALID_STATUS_TRANSITION"`.

---

## 5. Creators

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/creators` | any | List with `search`, `platform`, `niche`, pagination |
| POST | `/creators` | `marketer`+ | Create |
| GET | `/creators/:creatorId` | any | Profile + campaigns + performance summary |
| PATCH | `/creators/:creatorId` | `marketer`+ | Update |
| DELETE | `/creators/:creatorId` | `admin`+ | Deactivate (never hard-deletes history) |
| GET | `/creators/:creatorId/social-accounts` | any | List social accounts |
| POST | `/creators/:creatorId/social-accounts` | `marketer`+ | Add a social account |
| DELETE | `/creators/:creatorId/social-accounts/:accountId` | `marketer`+ | Remove |
| GET | `/creators/:creatorId/performance` | any | Orders, revenue, ROAS, cost per order |

Create body:

```json
{
  "internalCode": "CR-MIRA",
  "displayName": "Mira Bekele",
  "contactEmail": "mira@example.et",
  "contactPhone": "+251911000000",
  "platform": "instagram",
  "niche": "beauty",
  "profileUrl": "https://instagram.com/mira",
  "audienceLocation": "Addis Ababa",
  "audienceLanguage": "am"
}
```

`internalCode` is unique within the organization and used to build coupon codes.

---

## 6. Tracking assets & the public redirect

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/tracking-links` | any | List links with filters |
| POST | `/tracking-links` | `marketer`+ | Create a link (auto-generates the code) |
| GET | `/tracking-links/:linkId` | any | Detail |
| PATCH | `/tracking-links/:linkId` | `marketer`+ | Update label / deactivate |
| DELETE | `/tracking-links/:linkId` | `marketer`+ | Deactivate (soft) |
| GET | `/tracking-links/:linkId/qrcode` | any | PNG QR code for the tracking URL |
| GET | `/coupon-codes` | any | List coupons |
| POST | `/coupon-codes` | `marketer`+ | Create a coupon |
| PATCH | `/coupon-codes/:couponId` | `marketer`+ | Update / deactivate |
| DELETE | `/coupon-codes/:couponId` | `marketer`+ | Deactivate |
| GET | `/tracking-events` | any | Click events with filters (campaign, creator, date) |

**Public redirect** `GET /r/:code` — outside `/api/v1`, no session required.

1. Look up the code (global unique).
2. `404` if unknown, inactive, or the campaign is not active.
3. Record the click event (with de-duplication) — the visitor token comes from the `st_vid`
   cookie; the fingerprint is `sha256(ip + user-agent)`.
4. `302` to the link's `destination_url` (server-stored, `https` only).

The response also sets a first-party `st_vid` cookie (1 year, `SameSite=Lax`) and appends
`?st_ref=<code>` to the destination **only if** the organization's `settings.propagateRefParam`
is enabled — this is the documented cookie-less attribution strategy: the brand's site echoes
`st_ref` into the order's `referral_identifier` column.

No query parameter can change the redirect target — the destination is always taken from the
database. This closes the open-redirect class of attacks.

**Create link** `POST /api/v1/tracking-links`

```json
{ "campaignId": "…", "creatorId": "…", "channel": "link", "label": "Mira IG Story" }
```

Response includes `url` (e.g. `https://app.salestrace.et/r/7K2M9QX4PD`) and `qrCodeUrl`.

---

## 7. Orders & imports

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/orders/imports` | `marketer`+ | Upload a CSV (multipart) → creates an `import_job` in `pending` |
| GET | `/orders/imports` | any | List import jobs |
| GET | `/orders/imports/:importId` | any | Job status, counts, mapping, per-row errors |
| PUT | `/orders/imports/:importId/mapping` | `marketer`+ | Set the column mapping |
| POST | `/orders/imports/:importId/preview` | `marketer`+ | Validate → counts + sample valid/invalid rows |
| POST | `/orders/imports/:importId/commit` | `marketer`+ | Import the valid rows transactionally |
| GET | `/orders/imports/:importId/errors.csv` | any | Download the error report |
| GET | `/orders` | any | List orders (filters: `status`, `campaignId`, `creatorId`, `attributed`, date range, search) |
| GET | `/orders/:orderId` | any | Order + items + refunds + attribution |
| POST | `/orders/:orderId/refunds` | `admin`+ | Record a refund (append-only) |
| GET | `/orders/:orderId/attribution` | any | Attribution decision + rule snapshot |

**Upload** `POST /api/v1/orders/imports` — the **raw CSV file is the request body**.

- `Content-Type: text/csv` (or `application/octet-stream`), maximum 10 MB.
- The original file name is supplied with the `?fileName=` query parameter (it is sanitised and
  truncated; the stored name is always generated server-side).
- No multipart parser is involved: the client sends the file directly.

```bash
curl -X POST 'http://localhost:4000/api/v1/orders/imports?fileName=march-orders.csv' \
  -H 'Content-Type: text/csv' \
  -H 'Cookie: st_session=…' \
  --data-binary @march-orders.csv
```

`201` →

```json
{ "data": { "importId": "…", "status": "ready", "fileName": "march-orders.csv",
            "detectedColumns": ["order_id","total","status","coupon"],
            "suggestedMapping": { "externalOrderId": "order_id", "totalPaid": "total" },
            "totalRows": 0 } }
```

**Mapping** `PUT /api/v1/orders/imports/:id/mapping` — body
`{ "mapping": { "externalOrderId": "order_id", "totalPaid": "total" } }`. The mapping must include
`externalOrderId` and `totalPaid`; every other canonical field is optional.

**Preview** `POST /api/v1/orders/imports/:id/preview` →

```json
{ "data": { "importId": "…", "status": "ready",
            "counts": { "totalRows": 512, "validRows": 480, "invalidRows": 12,
                        "importedRows": 0, "updatedRows": 0, "skippedRows": 0,
                        "attributedOrders": 0 },
            "samples": { "valid": [ … ], "invalid": [ … ] } } }
```

**Commit** `POST /api/v1/orders/imports/:id/commit` → `200`

```json
{ "data": { "importId": "…", "status": "completed", "totalRows": 512,
            "importedRows": 480, "updatedRows": 12, "skippedRows": 8, "invalidRows": 12,
            "attributedOrders": 133, "errorReportUrl": "/api/v1/orders/imports/<id>/errors.csv" } }
```

Re-running `commit` on a completed job is a no-op that returns the same counts — imports are
idempotent by `(organization_id, external_order_id)`.

### Recognised CSV columns

| Canonical field | Meaning | Required |
|---|---|---|
| `externalOrderId` | The order identifier in the source system | **yes** |
| `orderedAt` | Order date/time; a naive timestamp is interpreted in the organization's timezone | **yes** |
| `totalPaid` | The amount collected | **yes** |
| `currency` | ISO-4217 code; defaults to the organization's currency | no |
| `subtotal`, `discount`, `tax`, `shipping` | Component amounts, default `0` | no |
| `refundAmount` | The refunded amount; appended as a refund row | no |
| `status` | `pending`/`paid`/`cancelled`/`partially_refunded`/`refunded`; defaults to `paid` with a note | no |
| `couponCode` | The coupon used at checkout | no |
| `referralIdentifier` | A tracking code or coupon code carried by the order | no |
| `customerRef` | A customer reference; only its SHA-256 hash is stored | no |

When `subtotal − discount + tax + shipping` does not equal `totalPaid`, the row is imported with
a `AMOUNT_MISMATCH` **warning** and the source values are kept — the importer never silently
rewrites financial data.

---

## 8. Attribution

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/attributions` | any | Filter by campaign, creator, method, conflict, date |
| GET | `/attributions/:attributionId` | any | Decision detail + rule snapshot |
| POST | `/attribution/recompute` | `admin`+ | Recompute for a campaign or the whole org |
| GET | `/attribution/rules` | any | The active policy version + resolved configuration |

**Recompute** `POST /api/v1/attribution/recompute` → body `{ "campaignId": "…" }` (omit for org-wide).

```json
{ "data": { "campaignId": "…", "ruleVersion": "v1.0.0", "ordersEvaluated": 480,
            "attributed": 133, "updated": 12, "unattributed": 347 } }
```

---

## 9. Analytics & reports

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/analytics/overview` | any | Headline metrics for the selected scope |
| GET | `/analytics/campaigns` | any | Per-campaign performance rows |
| GET | `/analytics/creators` | any | Per-creator comparison rows |
| GET | `/analytics/timeseries` | any | Daily clicks / orders / revenue series |
| GET | `/reports/campaigns` | any | Campaign report rows |
| GET | `/reports/export` | any | CSV export (`type=campaigns\|creators\|orders\|attributions`) |

**Shared query parameters**

| Parameter | Type | Notes |
|---|---|---|
| `from` / `to` | ISO-8601 | Applied to order `ordered_at` (and `occurred_at` for clicks) |
| `campaignId` | uuid | Repeatable |
| `creatorId` | uuid | Repeatable |
| `status` | enum | Order status filter |
| `method` | enum | Attribution method filter |
| `platform` | string | Creator platform filter |
| `currency` | ISO-4217 | Defaults to the organization currency |

**`GET /api/v1/analytics/overview`** response `data`:

```json
{
  "range": { "from": "2026-03-01T00:00:00Z", "to": "2026-04-01T00:00:00Z" },
  "currency": "ETB",
  "metrics": {
    "totalClicks": 1240,
    "eligibleClicks": 900,
    "attributedOrders": 96,
    "attributedValidOrders": 88,
    "paidOrders": 80,
    "cancelledOrders": 6,
    "pendingOrders": 2,
    "refundedOrders": 5,
    "refundAmount": "3500.00",
    "grossAttributedOrderValue": "92000.00",
    "netAttributedRevenue": "88500.00",
    "campaignCost": "40000.00",
    "creatorCost": "30000.00",
    "conversionRate": 9.78,
    "costPerAttributedOrder": "454.55",
    "roas": 2.21,
    "conflictedAttributions": 3
  }
}
```

Money is serialised as **decimal strings** (`"88500.00"`) to avoid float round-tripping in JSON
clients. Rates are numbers rounded half-up to 2 dp; `null` when the denominator is zero.

---

## 10. OpenAPI

`GET /api/v1/openapi.json` returns the OpenAPI 3.1 document generated from the same Zod schemas
used for runtime validation. `GET /api/v1/docs` serves Swagger UI (enabled outside production).
