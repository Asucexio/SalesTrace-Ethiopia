# Attribution Rules — SalesTrace Ethiopia

**Policy version:** `v1.0.0`
**Status:** Authoritative. Code in `packages/attribution-engine` implements exactly this document;
`packages/attribution-engine/tests` proves the examples below.

---

## 1. Vocabulary

| Term | Definition |
|---|---|
| **Order** | A customer order imported from an external source (CSV for MVP), identified by `(organization_id, external_order_id)`. |
| **Valid sale** | An order whose status is `paid`, `partially_refunded`, or `refunded`. Excluded: `pending` (no money moved yet), `cancelled` (order did not stand). |
| **Attributed order** | An order matched to exactly one campaign + creator by this policy. Stored one row per order. |
| **Click** | A `tracking_events` row of type `click` recorded when a tracking link is opened. |
| **Eligible click** | A click that *could* produce attribution: link active, creator assigned to the campaign, click occurred within the campaign's active window, and the click falls inside some order's attribution window. |
| **Coupon candidate** | An order whose `coupon_code` matches an active, in-validity coupon assigned to a creator in a campaign. |
| **Referral identifier** | A tracking code or coupon code carried in the imported order data (`referral_identifier` column). |
| **Attribution window** | The period before the order during which a click counts. Default **7 days**, configurable per campaign (`attribution_window_days`). |

### Timestamps and timezone

All stored timestamps are `TIMESTAMPTZ` in UTC. "Day" in a window means **exactly 7 × 24 hours**,
not a calendar day. A click at `2026-03-01T10:00:00Z` and an order at `2026-03-08T09:59:59Z` are
**outside** the 7-day window (7 days minus 1 second); an order at `2026-03-08T10:00:00Z` is
**inside** (exactly 7 days, inclusive boundary).

---

## 2. Policy pipeline

```
imported order
   │
   ├─(1) determine candidate campaigns & creators
   │      ├─ a. coupon_code  → coupon_codes (org-scoped, active, in validity window)
   │      ├─ b. referral_identifier → tracking_links.code (org-scoped)
   │      └─ c. neither → no campaign signal
   │
   ├─(2) collect click candidates (last-eligible-click model)
   │
   ├─(3) resolve conflicts deterministically
   │
   └─(4) persist exactly one attribution row (or none)
```

### Step 1 — Candidate resolution

An order may present two independent creator signals. Each is resolved independently; the conflict
resolver in step 3 decides which wins.

- **Coupon signal.** `orders.coupon_code` is trimmed, upper-cased, and matched against
  `coupon_codes.code` (also normalised on write). A coupon is a candidate only if
  `is_active = true`, `order.ordered_at` falls within `[valid_from, valid_until]` (open bounds
  allowed), and the coupon's `campaign_id`/`creator_id` still exist.
- **Referral-identifier signal.** `orders.referral_identifier` is matched against
  `tracking_links.code`; a match yields the link's `campaign_id` and `creator_id`.
  If the identifier matches a coupon code instead, it is treated as a coupon signal.
- **Site-wide coupons are not creator signals.** Only coupons bound to a creator count. A coupon
  row with no creator is ignored for attribution (it may still be recorded on the order).

### Step 2 — Click candidates (last eligible click)

For a candidate campaign, a click is eligible when **all** hold:

| ID | Condition |
|---|---|
| C1 | `tracking_events.organization_id = order.organization_id` |
| C2 | `tracking_events.campaign_id = campaign.id` and `event_type = 'click'` |
| C3 | `tracking_events.creator_id` is assigned to the campaign (`campaign_creators` row exists) |
| C4 | `click.occurred_at <= order.ordered_at` (a click cannot precede the order it caused) |
| C5 | `order.ordered_at - click.occurred_at <= attribution_window_days × 24h` |
| C6 | `click.occurred_at` is within the campaign's active window `[start_at, end_at]` |
| C7 | `click.occurred_at >= campaign_creators.assigned_at` for the matching creator |

**Winner selection:** the eligible click with the greatest `occurred_at`. Ties are broken by the
greatest `sequence` (a monotonically increasing `BIGSERIAL` on `tracking_events`, i.e. insertion
order). This makes selection fully deterministic and replayable.

If two different creators were clicked in the same window, **the last click wins** — standard
last-click behaviour, stated explicitly so nobody assumes a different model.

### Step 3 — Conflict resolution (deterministic)

| Situation | Winner | `method` | `conflict_flag` | `decision_reason` |
|---|---|---|---|---|
| Click and coupon resolve to the **same** creator | That creator | `coupon_code` (stronger evidence) | `false` | `click_and_coupon_same_creator` |
| Click → creator A, coupon → creator B | **Coupon** creator B | `coupon_code` | **`true`** | `conflict_resolved_in_favor_of_coupon` |
| Only a click | Clicked creator | `link` or `qr_link` | `false` | `last_eligible_click` |
| Only a coupon | Coupon creator | `coupon_code` | `false` | `coupon_only` |
| Only a referral identifier matching a link | Link creator | `link`/`qr_link` | `false` | `referral_identifier_match` |
| No signal at all | *no attribution* | — | — | — |
| Signals resolve to a creator **not assigned** to the campaign | *no attribution* | — | — | `creator_not_assigned` |
| Click outside the attribution window | *no attribution* | — | — | `no_eligible_click` |

**Why the coupon wins a conflict:** a coupon code is entered by the customer at checkout — a
deliberate act adjacent to the order. A click is earlier and can be incidental (the customer
clicks a creator's link, then later buys from a different creator's code, or from an untagged
channel). The decision is recorded, never silent: the losing candidate is stored in
`attribution.conflict_detail`, and the report flags the order as conflicted.

### Step 4 — Persisting the decision

- Exactly **one** attribution row per order: `UNIQUE (order_id)`. Re-running attribution updates
  the existing row rather than adding another, so an order can never be counted twice in a report.
- Every row stores: `method`, `rule_version` (`v1.0.0`), `rule_snapshot` (JSON of the resolved
  policy), `decision_reason`, `conflict_flag`, `matched_event_id`, `matched_coupon_id`,
  `attributed_at`, `is_valid_sale`.
- `is_valid_sale` is derived from the order status at decision time and re-evaluated when the
  order is updated by a later import. Cancelled and pending orders may carry an attribution row
  (so marketers can see them) but contribute **zero revenue** and are excluded from
  "attributed valid orders".

---

## 3. Worked examples

### Example A — plain link click

- Campaign `C1` (creator `CR1`), window 7 days.
- Click at `2026-03-01T10:00:00Z` on `CR1`'s link.
- Order `EXT-1001` at `2026-03-03T08:00:00Z`, no coupon, status `paid`, total 1,500.00 ETB.

**Result:** attributed to `CR1`, method `link`, reason `last_eligible_click`,
`is_valid_sale = true`. Revenue 1,500.00 ETB. Click is eligible.

### Example B — click outside the window

- Same click at `2026-03-01T10:00:00Z`; order at `2026-03-09T10:00:01Z` (> 7 × 24h later).

**Result:** **no attribution.** Reason (audit) `no_eligible_click`. The order still appears in the
orders list as unattributed.

### Example C — coupon only (no click)

- No click events. Order carries `coupon_code = "MIRA10"` bound to `CR2` in `C1`, valid.

**Result:** attributed to `CR2`, method `coupon_code`, reason `coupon_only`. A coupon is allowed to
attribute an order when no qualifying click exists.

### Example D — conflicting click and coupon

- Click by `CR1` at `2026-03-02T09:00:00Z`; order at `2026-03-02T12:00:00Z` with
  `coupon_code = "MIRA10"` belonging to `CR2`.

**Result:** attributed to **`CR2`**, method `coupon_code`, `conflict_flag = true`,
reason `conflict_resolved_in_favor_of_coupon`. `conflict_detail` retains the losing click
(`CR1`, event id, timestamp). The report marks this order as conflicted and the dashboard
exposes a "conflicted attributions" count so the marketing team can audit it.

### Example E — same creator via both signals

- Click by `CR1` at `2026-03-02T09:00:00Z`; order at `2026-03-02T12:00:00Z` with coupon `"CR1-10"`
  belonging to `CR1`.

**Result:** attributed to `CR1` **once**, method `coupon_code`, reason
`click_and_coupon_same_creator`, `conflict_flag = false`. Order value counted once.

### Example F — two creators clicked, last click wins

- Click `CR1` at `2026-03-02T09:00:00Z`; click `CR2` at `2026-03-02T10:00:00Z`; order at
  `2026-03-02T12:00:00Z`, no coupon.

**Result:** attributed to `CR2`, method `link`, reason `last_eligible_click`.

### Example G — cancelled order

- Attributed to `CR1` on import; a later import reports the same order with status `cancelled`.

**Result:** the attribution row is **kept** (history preserved) and re-evaluated:
`is_valid_sale = false`. The order is reported under *cancelled orders*, contributes **0** to
gross and net revenue, and is excluded from *attributed valid orders* and the conversion-rate
numerator.

### Example H — refunded order

- Attributed order, total 2,000.00 ETB, status `paid`. A later import reports refund of 500.00.

**Result:** attribution retained. Gross attributed value 2,000.00 (still counts as a valid sale),
net attributed revenue **1,500.00**. `refund_total = 500.00`. A full refund of 2,000.00 yields net
revenue 0.00 while the order still counts as a valid sale.

### Example I — discount and tax

- Order subtotal 2,000.00, discount 200.00, tax 150.00, shipping 50.00, `total_paid` 2,000.00.

**Result:** revenue basis is **`total_paid`** = 2,000.00 (the money actually collected). The
discount is *not* added back — see `docs/financial-metrics.md` §3.

### Example J — order whose creator was not assigned

- Click on a link for `CR9`, but `CR9` was never added to the campaign (no `campaign_creators`
  row).

**Result:** **no attribution.** Reason `creator_not_assigned`. Click counts as a *tracked click*
but not an *eligible click*.

### Example K — link opened before the creator was assigned

- `campaign_creators.assigned_at = 2026-03-05T00:00:00Z`; click at `2026-03-01T10:00:00Z`.

**Result:** **no attribution** (condition C7). Marketers can back-date `assigned_at` when a creator
was genuinely part of the campaign earlier; the assignment edit is audited.

### Example L — expired coupon

- Coupon valid until `2026-03-01`; order dated `2026-03-05` uses it.

**Result:** the coupon is not a candidate. If no other signal exists → no attribution.

---

## 4. Edge cases and their handling

| Edge case | Handling |
|---|---|
| Order with no creator signal | Stored unattributed. Visible in the orders list with "Not attributed". Never counted as a campaign sale. |
| Order before the campaign start | No eligible click (C6) → unattributed, unless a valid coupon exists. |
| Click after the campaign end | Not eligible (C6). |
| Order in a different currency than the campaign | Attribution is still recorded (the creator is real), but **revenue is not aggregated into that campaign's currency**; the order is flagged `currency_mismatch` and excluded from the campaign's revenue total. No FX conversion is performed anywhere. |
| Order total of zero | `is_valid_sale = false` (nothing was sold). Shown, not counted. |
| Negative or malformed amounts | Rejected at import (row-level validation error). Never persisted. |
| Duplicate external order ID in the same import | Second occurrence is flagged as a duplicate row and skipped; the first is imported. |
| Same order imported twice with different data | Reconciled by `external_order_id`; values are updated, `refunds` are appended (never overwritten), and the change is audited. |
| Campaign deleted/archived after attribution | Attributions are retained; archived campaigns remain reportable (read-only) and cannot gain new attributions once archived. |
| Order re-imported with a coupon added later | Attribution is recomputed for the order; the previous decision is replaced and the change is audited. |
| Two clicks at the identical timestamp | Tie broken by `tracking_events.sequence` (insertion order) — deterministic. |
| Tracking code reused across campaigns | Rejected at creation: `code` is unique per organization. |

---

## 5. Recomputation

- Attribution is computed **on import** (per order) and can be recomputed for a campaign or the
  whole organization (`POST /api/v1/attribution/recompute`).
- Recomputation is **idempotent**: it upserts one row per order, so running it twice changes
  nothing.
- Recomputation never deletes historical decisions silently — the previous `method`, `reason` and
  `rule_version` are written to `audit_events` before being replaced.
- When the policy version changes (`v1.0.0` → `v1.1.0`), existing rows keep their original
  `rule_version` until recomputed; the dashboard can therefore show "attributed under v1.0.0".

---

## 6. What this policy deliberately does not claim

- It does **not** claim causality or incrementality. "Attributed" means *matched under the
  declared rule*, nothing more. Every report, export, and UI label uses that word.
- It does not model multi-touch journeys beyond last-click + coupon precedence.
- It does not deduplicate across campaigns: an order matching two campaigns would be a data
  conflict; the order is attributed to exactly one campaign (the resolved one) and the conflict is
  flagged.
- It does not apply discounts, taxes, or fees to the revenue basis beyond what the source order
  states. Discounts reduce `total_paid`; they are never added back.
