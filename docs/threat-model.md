# Threat Model — SalesTrace Ethiopia

**Scope:** the MVP web application, the public tracking endpoint, and the API.
**Method:** STRIDE per trust boundary, with abuse cases drawn from the domain.

---

## 1. Assets

| Asset | Impact if compromised |
|---|---|
| Order and revenue data | Competitive and financial harm to the brand |
| Creator compensation data | Privacy harm to creators; contractual harm to the brand |
| Organization membership | Unauthorized access to a tenant's entire workspace |
| Session tokens | Account takeover |
| Database credentials | Full data breach across tenants |
| Attribution rules | Manipulated marketing decisions (the product's whole value) |

## 2. Threat actors

| Actor | Capability |
|---|---|
| Anonymous visitor | Can call `GET /r/:code` and the auth endpoints |
| Authenticated user of org A | Full access to org A; attempts to reach org B |
| Malicious member (insider) | Can import CSVs, create campaigns, export reports within their org |
| Opportunistic attacker | Credential stuffing, IDOR probing, file-upload probing, open-redirect phishing |
| Compromised dependency | Arbitrary code execution in the API process |

## 3. STRIDE analysis

### S — Spoofing

| Threat | Mitigation |
|---|---|
| Session theft / fixation | Random 256-bit session tokens, stored hashed; regenerated on login and password reset; `HttpOnly` + `SameSite=Lax` + `Secure` |
| Forged `x-user-id` headers | The API never trusts identity headers; identity comes from the session cookie/JWT verified against the provider |
| Impersonating an organization | The organization is derived from the session membership, never from the request |
| Spoofed referral identifier | A referral identifier only attributes to a creator that exists in the caller's own organization; it cannot inject an arbitrary creator |

### T — Tampering

| Threat | Mitigation |
|---|---|
| Client-supplied revenue in an API body | Money fields are computed server-side from stored orders and costs; the API accepts no client-supplied totals for analytics |
| Altering an order after import | Orders are updated only by the import pipeline (audited); refunds are append-only |
| Mass assignment of `is_valid_sale`, `organization_id`, `rule_version` | Zod schemas strip unknown keys; sensitive fields are never accepted from clients |
| Editing the audit trail | `UPDATE`/`DELETE` revoked for the application role; a trigger raises on attempt |
| Editing attribution decisions | Recomputation is audited and keeps `rule_version`; direct edits are not exposed by the API |

### R — Repudiation

| Threat | Mitigation |
|---|---|
| "We never charged that creator fee" | `campaign_costs` rows carry actor, timestamp, and amount; deletions are audited (soft delete + audit) |
| "That order was never imported" | `import_jobs` + `import_job_rows` record every row's outcome |
| "I didn't do that" | Every mutating request carries a `requestId` present in structured logs and audit events |

### I — Information disclosure

| Threat | Mitigation |
|---|---|
| IDOR across tenants | Three-layer isolation (§2 of the security plan); cross-tenant requests return `404` |
| Stack traces / SQL in errors | Centralised error handler; production handler returns a generic message + `requestId` |
| Secrets in logs | Redaction by key name; auth bodies never logged |
| Raw visitor IPs | Hashed at write time; raw IP never stored |
| Customer PII | Stored only as `customer_ref_hash` |
| Open redirect via tracking links | The redirect target comes from the database and must be `https`; request parameters cannot influence it |
| Exposing creator contact details to other tenants | RLS + organisation-scoped queries |

### D — Denial of service

| Threat | Mitigation |
|---|---|
| Click flood on `/r/:code` | Rate limiting (120/min/IP), click de-duplication, payload size limits |
| Huge CSV upload | 10 MB cap, streaming parse, row-level validation, transaction-bounded insert |
| Expensive analytics queries | Indexed filters, pagination, maximum date-range span |
| Many failed logins | Auth rate limits + per-account counters |
| Database connection exhaustion | A bounded pool (`max: 10`), `statement_timeout`, graceful shutdown |

### E — Elevation of privilege

| Threat | Mitigation |
|---|---|
| `analyst` performing writes | Capability middleware rejects before the handler; role changes require `owner` |
| A member of org A becoming `owner` of org B | Membership is per organization; the role is stored on `organization_members`, not on the profile |
| Privilege escalation through a crafted body | Unknown fields are stripped; role changes are restricted to `owner` and audited |
| Service-role key exposure to the browser | The key exists only in the API process; the web app has no Supabase service credentials |

### Cross-cutting abuse cases

| Abuse | Mitigation |
|---|---|
| **Attribution inflation** — a customer manufactures clicks/orders to inflate a creator's performance | Every attributed order must correspond to a real imported order; clicks are de-duplicated; attribution is association-only and explicitly not presented as incrementality; conflicting signals are flagged for review |
| **Coupon abuse** — a creator shares a code publicly | Coupon conflicts are flagged; redemption counts are capped when `max_redemptions` is set |
| **Import tampering** — a member imports fabricated orders | Audited; reconciliation warnings surface amount mismatches; the platform never presents imported data as "verified" |
| **Data exfiltration via export** — an insider exports everything | Exports are audited and role-gated; exports carry the same org scope and filters as the UI |

---

## 4. Mitigations not implemented in the MVP (accepted risk)

| Item | Risk | Why accepted |
|---|---|---|
| WAF / bot management on `/r/:code` | Click fraud | Deferred to the deployment provider's edge rules |
| Two-factor authentication | Account takeover | Deferred; Supabase supports enabling it later |
| IP allow-listing for admins | Insider risk | Deferred to enterprise plans |
| Field-level encryption for creator PII | Data breach impact | Deferred; data is org-scoped and hashed where it is sensitive |
| Automated anomaly detection on orders | Import tampering | Manual review of conflict/warning counters is the MVP control |

## 5. Verification

Each mitigation above maps to a test:

| Mitigation | Verification |
|---|---|
| Cross-tenant isolation | `apps/api/tests/integration/tenant-isolation.test.ts` |
| RLS fail-closed | `apps/api/tests/integration/rls.test.ts` |
| Role matrix | `apps/api/tests/integration/authorization.test.ts` |
| Session handling | `apps/api/tests/integration/auth.test.ts` |
| Open redirect | `apps/api/tests/integration/tracking.test.ts` |
| Upload limits | `apps/api/tests/integration/imports.test.ts` |
| Click de-duplication | `apps/api/tests/integration/tracking.test.ts` |
| Audit append-only | `apps/api/tests/integration/audit.test.ts` |
| Error redaction | `apps/api/tests/integration/errors.test.ts` |
| End-to-end tenant boundary | `apps/web/e2e/journey-isolation.spec.ts` |
