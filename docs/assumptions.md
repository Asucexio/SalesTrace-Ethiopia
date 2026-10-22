# Assumptions, Open Questions, and Decision Register

## 1. Assumptions made (documented, reversible)

Each assumption is stated because it was needed to proceed. None of them is presented as a
validated market fact.

| # | Assumption | Why it was needed | Risk if wrong | How to reverse |
|---|---|---|---|---|
| A1 | A campaign's tracking destination URL is configured **per campaign** (and optionally per link), stored server-side | Required for safe redirects without an open-redirect hole | A brand needs different destinations per creator → per-link override already supported | Add a destination table |
| A2 | The **default attribution window is 7 days** | The brief specifies it as the default policy | A brand needs 14 or 30 days | Per-campaign `attribution_windowDays` already exists |
| A3 | **Last eligible click** is the click model | The brief specifies it | A brand wants first-click or linear | Add a `click_model` policy field; the engine is policy-driven |
| A4 | A **creator-specific coupon outranks a conflicting click** | The brief requires a deterministic conflict rule; the choice was not specified | A brand prefers click precedence | Change one policy constant; documented and versioned |
| A5 | Reporting currency is **one per organization** (ETB) | The brief lists multi-currency reporting as a non-goal | A brand reports in USD | Add FX with a rate source and re-statement policy (deferred) |
| A6 | Orders are ingested via **CSV first** | The brief mandates CSV before integrations | A customer's platform exports an awkward format | The mapper is configuration-driven; new formats are added as presets |
| A7 | A **paid order** is the revenue basis (`total_paid`), not `subtotal` | Prevents inflating revenue by the discount given away | A brand wants gross-before-discount reporting | Add a separate informational metric; never change the revenue basis silently |
| A8 | **Tax and shipping collected are included** in net attributed revenue | They were collected by the brand | Finance wants revenue excluding tax | Report `tax_collected` and `shipping_collected` separately (already stored) |
| A9 | **Refunds are deducted at the order level** and capped at the order total | Simplest correct treatment | Partial refunds need allocation across items | Item-level allocation is deferred |
| A10 | A **pending** order is not a sale | Money has not moved | A brand considers a placed order a sale | Add a reporting toggle (not in MVP) |
| A11 | A **cancelled** order keeps its attribution row but contributes zero revenue | Preserves the "we saw this order" fact | A brand wants cancelled orders hidden | Filter in the UI; the row stays |
| A12 | **Creator fees live in `campaign_costs`**; `campaign_creators.agreed_fee_minor` is the commitment | Prevents double counting cost | A brand only tracks commitments | Both are displayed side by side |
| A13 | **Round half-up to 2 dp** for all rates and averages | Deterministic, conventional in finance | A brand uses bankers' rounding | One helper function |
| A14 | **ETB minor unit = 1/100 ETB** (santim) | Ethiopia uses 1 ETB = 100 santim | — | N/A |
| A15 | The organisation **timezone** defaults to `Africa/Addis_Ababa` (UTC+3) | Ethiopian market | — | Per-organisation setting |
| A16 | **Click de-duplication window of 30 seconds** | Avoids double counting a double-click or a redirect chain | Real distinct visitors are coalesced | Per-link setting |
| A17 | **Attribution is recomputed per import**, not continuously | Imports are the source of truth | A brand expects live attribution | Recompute endpoint exists |
| A18 | The platform uses **one active organization per session**, switchable | Simplifies authorisation | A user needs a split view | Session stores the active org; switching is explicit |
| A19 | **Local auth mode** exists for offline/E2E verification | No Supabase project was available during development | Someone deploys it to production | Boot check blocks it in production |
| A20 | The **web app proxies `/api/*` and `/r/*`** to the API | Same-origin cookies + first-party tracking URLs | A separate API domain is required | The proxy target is configurable; cookies become `SameSite=None` in that case |

## 2. Questions that materially affect the architecture

These should be answered with real customers. Until then, the conservative option is implemented.

| # | Question | Current conservative choice | What would change |
|---|---|---|---|
| Q1 | Which ecommerce platform(s) do the first customers use? | CSV only | A native connector + webhook signature validation |
| Q2 | How do offline/physical-shop orders carry a referral signal? | Coupon codes and a manual `referral_identifier` column | A POS integration or a QR-at-till flow |
| Q3 | What proportion of revenue is creator-driven in a realistic pilot? | Unknown — no incrementality claim is made | A measurement design and possibly holdout capability |
| Q4 | Do customers pay per order, per creator, or per campaign? | A `billing` field is **not** implemented (billing is a non-goal) | A billing module (explicitly out of scope for the MVP) |
| Q5 | Who may see creator contact details and agreed fees? | All members of the owning organisation | A finer-grained field policy |
| Q6 | Is a multi-campaign, multi-currency brand realistic in year 1? | No | Currency + FX policy + re-statement rules |
| Q7 | Do creators need their own login to see their performance? | No | A read-only external portal — a new auth surface with new isolation rules |
| Q8 | Should a click count as eligible if the customer later buys a different product? | Yes, the click is eligible; the order decides attribution | A stricter product-scope policy |
| Q9 | How should a *partially* refunded order split across creators (if ever split)? | An order is attributed to exactly one creator | Multi-creator attribution (explicitly out of scope) |
| Q10 | What is the acceptable import latency for a 50k-row CSV? | Synchronous within a request (batched transaction) | A background job queue |

## 3. Explicitly *not* assumed (no invented evidence)

The following were **not** assumed, because there is no evidence for them in the brief and
inventing them would be dishonest product work:

- Market size, willingness to pay, or competitor capabilities.
- Customer interviews, survey results, or demand validation.
- Typical Ethiopian influencer campaign budgets or conversion benchmarks.
- That any specific social platform API is available or permitted for this use.
- That Ethiopian brands have an existing attribution problem they will pay to solve (the brief
  frames these as hypotheses to validate).

The only numeric defaults in this repository are the ones the brief specifies (7-day window,
last-eligible-click, role names, statuses) plus engineering defaults that are documented in
`docs/financial-metrics.md` and `docs/attribution-rules.md`.

## 4. Decision register

| Date | Decision | Rationale | Reversible? |
|---|---|---|---|
| 2026-10-21 | Money as `BIGINT` minor units | Exact arithmetic, no float drift | Yes, with a migration |
| 2026-10-21 | Pure `attribution-engine` package, no I/O | Testable in isolation, reusable by any caller | Yes |
| 2026-10-21 | `DbDriver` port with `pg` and PGlite adapters | Lets integration tests run real Postgres semantics without Docker | Yes |
| 2026-10-21 | RLS via `app.current_org_id` GUC + `SET LOCAL ROLE salestrace_app` | Database-enforced isolation that fails closed | Requires a migration |
| 2026-10-21 | Cookie sessions proxied through Next.js | Same-origin CSRF posture, first-party tracking URLs | Yes (cookie flags change) |
| 2026-10-21 | Coupon outranks click on conflict | Deterministic and defensible; recorded, not silent | Yes (policy constant + version) |
| 2026-10-21 | `is_valid_sale` derived from order status at decision time and re-evaluated on update | Cancelled/refunded handling stays consistent with reporting | Yes |
| 2026-10-21 | Audit trail is append-only at the application level, not tamper-proof | Honest about the guarantee actually provided | n/a |
| 2026-10-21 | The **QR encoder is implemented in-house** (`src/shared/qrcode.ts`, byte mode, level M, versions 1–10) | The deployment environment could not install a QR package, and a 60-character URL does not justify a dependency. Verified by a round-trip test that decodes the generated matrix and checks the Reed–Solomon syndromes | Yes — swap for a library |
| 2026-10-21 | **Cookie parsing and the CSV upload body are handled in-house** | Avoids `cookie-parser` and a multipart parser. The upload sends the raw CSV as the request body, which is simpler for the client than multipart | Yes |
| 2026-10-21 | The **OpenAPI document is hand-written** | A schema-to-OpenAPI generator could not be installed; the document is a developer-facing contract already specified in prose | Yes — generate it from the Zod schemas |
| 2026-10-21 | The **CSV upload body is `text/csv`, not `multipart/form-data`** | Removes a multipart parser and a dependency; the client sends the file directly | Yes — the route accepts either |

## 5. Review checklist before a pilot

- [ ] At least two pilot brands confirm the 7-day window and the click/coupon precedence rule.
- [ ] The primary ecommerce export format is captured as a named CSV preset with a fixture.
- [ ] A monthly reconciliation between the platform's net attributed revenue and the brand's own
      order export matches for one full campaign.
- [ ] The refund treatment matches how each brand's finance team records refunds.
- [ ] The UI copy has been reviewed by someone who will present the numbers to management.
