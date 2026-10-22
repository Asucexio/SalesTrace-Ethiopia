# Financial Metric Definitions — SalesTrace Ethiopia

**Version:** `v1.0.0` · Implements `packages/attribution-engine` metric calculators.
Every definition below has a unit test. Dashboard totals are asserted to equal the sum of the
underlying rows.

---

## 1. Money representation

- All monetary amounts are stored as **integer minor units** in `BIGINT` columns.
  1 ETB = 100 santim (minor units). 1,500.00 ETB = `150000`.
- **No JavaScript floating point** is used for authoritative monetary values. Division results are
  produced with `BigInt` integer math and rounded **half-up** to the requested precision.
- Every amount-bearing row carries an explicit ISO-4217 `currency` code. The platform never mixes
  currencies in one aggregate and never performs FX conversion.
- Reporting currency: ETB (configurable per organization). An order whose currency differs from
  the campaign's currency is attributed but excluded from that campaign's revenue totals and
  flagged `currency_mismatch`.

---

## 2. Order-level definitions

Let an order have:

- `subtotal_minor` — sum of line items before discount
- `discount_minor` — discounts applied
- `tax_minor` — tax charged
- `shipping_minor` — shipping charged
- `total_paid_minor` — amount actually collected
- `refund_minor` — total refunded (sum of `refunds` rows for the order)

**Reconciliation identity** checked at import:

```
total_paid_minor == subtotal_minor - discount_minor + tax_minor + shipping_minor
```

A mismatch is **not** fatal: the row is imported with the source values intact and a warning
`AMOUNT_MISMATCH` is recorded on the import row, visible in the error report. Source data is never
silently rewritten.

### 2.1 Order status semantics

| Status | Counts as valid sale | In gross revenue | In net revenue | Notes |
|---|---|---|---|---|
| `pending` | No | No | No | Money has not moved. Counted separately as *pending orders*. |
| `paid` | **Yes** | Yes | Yes | Full amount in net. |
| `partially_refunded` | **Yes** | Yes | Yes (reduced) | Net = total_paid − refund. |
| `refunded` | **Yes** | Yes | Yes (= 0 if fully refunded) | A sale happened; the money came back. |
| `cancelled` | No | No | No | Reported under *cancelled orders*. Attribution row retained, revenue 0. |

### 2.2 Order net revenue

```
order_net_revenue_minor = max(0, total_paid_minor - refund_minor)
```

Refunds are capped at the order total, so a refund can never make an order negative.

---

## 3. Revenue definitions

All revenue metrics are computed over **attributed orders** (`attributions` rows) in the selected
scope, restricted to `is_valid_sale = true` and to orders whose currency matches the reporting
currency.

| Metric | Formula (minor units) |
|---|---|
| **Gross attributed order value** | `Σ total_paid_minor` over valid-sale attributed orders |
| **Refund amount** | `Σ refund_minor` over valid-sale attributed orders |
| **Net attributed revenue** | `Σ max(0, total_paid_minor − refund_minor)` over valid-sale attributed orders |
| **Discounts conceded** | `Σ discount_minor` over valid-sale attributed orders *(informational — never added back)* |

### Why `total_paid` and not `subtotal`

`total_paid` is the money the brand actually collected after the influencer-driven discount. Using
`subtotal` would inflate attributed revenue by exactly the discount the brand gave away — the
opposite of what a marketing manager needs. Tax and shipping collected are included, because they
were collected; they are reported separately as `tax_collected_minor` and `shipping_collected_minor`
so a finance reader can see them.

### What net attributed revenue is not

- It is **not profit**. It does not subtract cost of goods, fulfilment, payment fees, or agency fees.
- It is **not incremental revenue**. It is revenue *associated* with a creator under the declared
  attribution rule. Some of it would likely have been earned anyway.
- It is **not cash collected over time** in the accounting sense — refunds are deducted at the
  amount recorded, but the reporting period is the order period, not the cash period.

---

## 4. Traffic and conversion

| Metric | Formula | Notes |
|---|---|---|
| **Total tracked clicks** | count of `tracking_events` (`type = click`) in scope | Raw, includes clicks by unassigned creators and clicks outside campaign windows |
| **Eligible clicks** | count of clicks satisfying C1–C7 in `docs/attribution-rules.md` | The denominator of conversion rate |
| **Attributed orders** | count of `attributions` rows in scope | Includes cancelled/pending orders that carry a decision |
| **Attributed valid orders** | count of attributed orders with `is_valid_sale = true` | The numerator of conversion rate |
| **Paid orders** | attributed valid orders with status `paid` | |
| **Cancelled orders** | orders in scope with status `cancelled` | |
| **Pending orders** | orders in scope with status `pending` | |
| **Refunded orders** | attributed valid orders with `refund_minor > 0` | |
| **Conversion rate** | `attributed_valid_orders ÷ eligible_clicks × 100` | `null` when `eligible_clicks = 0` |
| **Click-to-order rate** | `attributed_orders ÷ total_clicks × 100` | Informational |

**Zero-denominator rule:** every rate is `null` (rendered as `—`, never `NaN`, `Infinity`, or `0`).
This applies to conversion rate, ROAS, cost per order, and every average.

### Scope consistency

The "in scope" set for traffic metrics and the "in scope" set for order metrics must be the same
selection: the same campaign filter, creator filter, and date range. The date range applies to
**order `ordered_at`** for order metrics and to **`occurred_at`** for click metrics. A click on
day 9 of a campaign that is converted by an order on day 12 is therefore outside a same-day-range
report — this is expected and stated in the UI ("clicks and orders are filtered on their own
timestamps").

---

## 5. Cost and efficiency

| Metric | Formula | Notes |
|---|---|---|
| **Campaign cost** | `Σ campaign_costs.amount_minor` for the campaign | Typed: creator fee, content production, product gifting, platform fee, agency fee, other |
| **Creator cost** | `Σ campaign_costs.amount_minor WHERE cost_type = 'creator_fee'` (scoped to that creator) | |
| **Total creator costs** | `Σ campaign_costs.amount_minor WHERE cost_type = 'creator_fee'` across scope | |
| **Cost per attributed order** | `campaign_cost ÷ attributed_valid_orders` | `null` when no attributed valid orders |
| **Creator cost per attributed order** | `creator_cost ÷ that creator's attributed_valid_orders` | |
| **ROAS** | `net_attributed_revenue ÷ campaign_cost` | `null` when campaign cost is 0. Rounded to 2 dp, half-up |
| **Creator ROAS** | `creator_net_attributed_revenue ÷ creator_cost` | `null` when creator cost is 0 |
| **Revenue per creator** | `net_attributed_revenue` attributed to that creator | A revenue figure, not a per-unit average |
| **Revenue per creator per campaign** | same, scoped to one campaign | |
| **Agreements vs actuals** | `campaign_creators.agreed_fee_minor` vs `Σ creator_fee` costs | Reported side by side, never summed together |

**ROAS is not ROI.** ROI requires incremental profit, which the platform does not estimate. The UI
labels this metric *ROAS (attributed revenue ÷ campaign cost)* and never shows "ROI" or "return on
investment". The documentation, the API field name (`roas`), and the exported CSV header all use
"ROAS" and "attributed revenue".

### Cost currency

`campaign_costs.currency` must equal the campaign currency. A mismatch is rejected at write time
(422). Costs are never FX-converted.

---

## 6. Worked examples

### Example 1 — campaign-level report

Campaign `C1` (ETB), window 7 days, March 2026:

| Input | Value |
|---|---|
| Tracked clicks | 1,240 |
| Eligible clicks | 900 |
| Attributed orders | 96 |
| Attributed valid orders | 88 |
| Paid orders | 80 |
| Cancelled orders | 6 |
| Pending orders | 2 |
| Refunded orders | 5 |
| Gross attributed order value | 92,000.00 ETB |
| Refund amount | 3,500.00 ETB |
| Campaign cost | 40,000.00 ETB |

| Output | Value | Derivation |
|---|---|---|
| Net attributed revenue | 88,500.00 ETB | 92,000.00 − 3,500.00 |
| Conversion rate | 9.78 % | 88 ÷ 900 × 100 = 9.777… → 9.78 |
| Cost per attributed order | 454.55 ETB | 40,000.00 ÷ 88 = 454.545… → 454.55 (half-up) |
| ROAS | 2.21 | 88,500.00 ÷ 40,000.00 = 2.2125 → 2.21 |
| Click-to-order rate | 7.74 % | 96 ÷ 1,240 × 100 |

### Example 2 — rounding

- Cost per order: 40,000.00 ÷ 88 → 454.5454… → **454.55** (half-up, not 454.54).
- ROAS: 88,500.00 ÷ 40,000.00 = 2.2125 → **2.21**.
- Conversion rate: 88 ÷ 900 = 0.09777… × 100 = 9.7777… → **9.78**.

### Example 3 — zero denominators

- Campaign with cost 0 and 12 attributed orders → ROAS = `null` (shown as `—`), cost per order = 0.00.
- Campaign with 0 eligible clicks and 0 orders → conversion rate = `null` (shown as `—`), not `0 %`.

### Example 4 — creator comparison

| Creator | Attributed valid orders | Net attributed revenue | Creator cost | ROAS | Cost per order |
|---|---|---|---|---|---|
| CR1 | 40 | 41,000.00 | 12,000.00 | 3.42 | 300.00 |
| CR2 | 28 | 22,500.00 | 15,000.00 | 1.50 | 535.71 |
| CR3 | 20 | 25,000.00 | 0.00 | **—** | **—** |

CR3's ROAS is `null` because there is no recorded cost — not because performance was zero. The
UI renders `—` with the tooltip "No recorded campaign cost".

### Example 5 — cancellation and refund interaction

Order total 1,000.00, later cancelled → contributes 0 to gross and net, excluded from valid orders
and from the conversion-rate numerator. The order still appears in the orders table, marked
*cancelled*.

Order total 2,000.00, refunded 1,200.00 → gross 2,000.00, refund 1,200.00, net 800.00, and it
remains a *valid sale* (money changed hands and came back partially).

---

## 7. Reconciliation guarantees

1. `Σ attributed_valid_orders` across creators in a campaign = the campaign's attributed valid
   orders. (Asserted in integration tests.)
2. `Σ net_attributed_revenue` across creators = campaign net attributed revenue.
3. `Σ campaign_costs` = campaign cost.
4. `Σ gross − Σ refunds = Σ net`.
5. The orders table row count for an import job equals the job's `imported_rows` after a
   successful import, and re-running the import does not change it.

These five identities are the definition of "dashboard totals agree with the underlying records".
