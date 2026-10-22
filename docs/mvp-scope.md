# MVP Scope, Deferred Features, and Explicit Non-Goals

## 1. MVP definition (what ships)

The MVP is a **closed loop** for one organization's influencer campaigns:

```
Campaign → Creators → Tracking assets → Referral events → Order import → Attribution → Reports
```

Everything needed to walk that loop once, end to end, with real numbers, is in scope.

### In scope (shipped)

| Area | Included in MVP |
|---|---|
| Auth | Email/password registration, verification, reset, session management (httpOnly cookie), org onboarding |
| Orgs | Organization create/update, membership, invitations, four roles, org-scoped access |
| Campaigns | CRUD + archive + validated status transitions, budget, attribution window, destination URL |
| Creators | Profiles, social accounts, campaign assignments with agreed fees |
| Costs | Campaign cost entries typed as creator fee / production / gifting / platform / agency / other |
| Tracking | Tracking links with opaque codes, coupon codes, QR code generation, referral event capture, redirect |
| Orders | CSV upload, column mapping, validation, preview, transactional import, error report, re-import reconciliation |
| Attribution | Link / coupon / QR / imported-referral-identifier methods, last-eligible-click, coupon fallback, deterministic conflict rule, rule versioning |
| Analytics | Overview, campaign performance, creator performance, comparison tables, filters, CSV export |
| Governance | Audit trail for financial/attribution/membership changes, idempotency keys, rate limits, structured logs, request IDs |
| Quality | Unit, integration, and E2E tests; reproducible migrations; demo seed data clearly labelled |

### Out of scope for MVP (deferred, with trigger to revisit)

| Deferred item | Why deferred | Revisit when |
|---|---|---|
| Ecommerce platform integrations (Shopify/WooCommerce/native plugins) | Requirement for a specific platform is not validated; CSV import removes the blocking dependency | A pilot customer names a platform and supplies an API key |
| WhatsApp / Telegram click-to-chat tracking | Channel semantics (conversation vs. click) differ; needs its own attribution treatment | A pilot customer reports WhatsApp as the primary channel |
| Automated creator payouts / invoicing | Financial movement + compliance burden; not needed to answer attribution questions | A customer asks the platform to pay creators |
| Creator discovery marketplace | Product non-goal (Section 15 of the master brief) | Never (out of scope) |
| Incremental / lift measurement, holdout tests | Requires meaningful traffic and experimental design; the platform cannot honestly claim incrementality from attribution alone | A customer commits to a measurement design and traffic volume |
| Multi-currency reporting and FX | Explicit non-goal; requires rate sources, rounding policy, and re-statement rules | A customer operates a second currency and accepts FX policy |
| Mobile application | Explicit non-goal; responsive web covers the audience | A pilot customer shows a field team on phones daily |
| AI creator scoring / recommendations | Explicit non-goal; would encourage acting on unauditable scores | After attribution data quality is proven |
| Predictive analytics / forecasting | Non-goal | Never (out of scope) |
| Ad buying automation | Explicit non-goal | Never (out of scope) |
| Public API keys / webhook subscriptions | Not needed for pilot integration | A customer integrates their own BI tool |
| Multi-workspace inside one organization | Adds isolation complexity without MVP value | A large customer needs agency/client separation |
| Automated email/SMS campaign analytics | Out of product boundary | Never (out of scope) |

## 2. Explicit non-goals (restating Section 15)

Not implemented in the MVP, and not implied by any screen or report:

- Public influencer discovery marketplace
- Automated creator payouts
- Native mobile application
- AI-based creator recommendations
- Complex predictive analytics
- Native integrations with every social platform
- Microservices architecture (the MVP is a modular monolith with strict package boundaries)
- Blockchain
- Multi-currency financial reporting
- Automated ad buying
- Generalized marketing automation platform

## 3. MVP quality bar

The MVP is **not** "a UI that renders". It ships when:

1. Every metric on the dashboard is produced by the real calculation layer from persisted data.
2. The attribution engine has unit tests covering window edges, ties, conflicts, refunds, and rounding.
3. Tenant isolation is proven by integration tests that attempt cross-organization reads/writes
   and by RLS policies that fail closed when no organization context is set.
4. Import idempotency is proven: importing the same file twice yields the same order count.
5. Dashboard totals equal the sum of the underlying attributed order rows (asserted in tests).
6. No critical known authorization, data-integrity, or financial-calculation defect is open.
7. `docs/attribution-rules.md` and `docs/financial-metrics.md` match the code that ships.

## 4. How scope decisions are recorded

Every scope change is recorded in `docs/assumptions.md` with: date, decision, rationale, affected
modules, and whether it is reversible. Architectural or stack changes additionally require an ADR
in `docs/architecture.md#adr-log`.
