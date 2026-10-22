/**
 * Financial metric calculators.
 *
 * Implements `docs/financial-metrics.md` (version `v1.0.0`).
 *
 * Every calculator is pure and works on integer minor units. Rates are returned as numbers
 * rounded half-up to two decimals, or `null` when the denominator is zero — the platform never
 * produces `NaN` or `Infinity`.
 */

import {
  divideRoundHalfUp,
  minorToDecimalString,
  percentage,
  sumMinor,
} from '@salestrace/shared-types';

/** Raw metric inputs, all monetary values in minor units. */
export interface MetricInput {
  totalClicks: number;
  eligibleClicks: number;
  attributedOrders: number;
  attributedValidOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  refundedOrders: number;
  grossAttributedOrderValueMinor: number;
  refundAmountMinor: number;
  netAttributedRevenueMinor: number;
  campaignCostMinor: number;
  creatorCostMinor: number;
  creatorCount?: number;
}

/** Computed metrics ready for API serialisation. */
export interface ComputedMetrics {
  totalClicks: number;
  eligibleClicks: number;
  attributedOrders: number;
  attributedValidOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  refundedOrders: number;
  refundAmount: string;
  grossAttributedOrderValue: string;
  netAttributedRevenue: string;
  campaignCost: string;
  creatorCost: string;
  conversionRate: number | null;
  costPerAttributedOrder: string | null;
  roas: number | null;
  revenuePerCreator: string | null;
}

/**
 * Net revenue of a single order.
 *
 * `max(0, totalPaid − refunded)` — a refund can never make an order negative.
 */
export function computeOrderNetRevenue(totalPaidMinor: number, refundMinor: number): number {
  return Math.max(0, totalPaidMinor - refundMinor);
}

/**
 * Compute the standard metric set.
 *
 * - `conversionRate` = attributedValidOrders ÷ eligibleClicks × 100
 * - `costPerAttributedOrder` = campaignCost ÷ attributedValidOrders
 * - `roas` = netAttributedRevenue ÷ campaignCost
 * - `revenuePerCreator` = netAttributedRevenue ÷ creatorCount (informational)
 */
export function computeMetrics(input: MetricInput): ComputedMetrics {
  const conversionRate = percentage(input.attributedValidOrders, input.eligibleClicks);

  // Monetary quotients are rounded to whole minor units (0 decimals) so the result stays an
  // exact integer amount of cents; ratios (ROAS, conversion rate) keep two decimals.
  const costPerAttributedOrder =
    input.attributedValidOrders === 0
      ? null
      : divideRoundHalfUp(input.campaignCostMinor, input.attributedValidOrders, 0);

  const roas = divideRoundHalfUp(input.netAttributedRevenueMinor, input.campaignCostMinor, 2);

  const revenuePerCreator =
    input.creatorCount === undefined || input.creatorCount === 0
      ? null
      : divideRoundHalfUp(input.netAttributedRevenueMinor, input.creatorCount, 0);

  return {
    totalClicks: input.totalClicks,
    eligibleClicks: input.eligibleClicks,
    attributedOrders: input.attributedOrders,
    attributedValidOrders: input.attributedValidOrders,
    paidOrders: input.paidOrders,
    cancelledOrders: input.cancelledOrders,
    pendingOrders: input.pendingOrders,
    refundedOrders: input.refundedOrders,
    refundAmount: minorToDecimalString(input.refundAmountMinor),
    grossAttributedOrderValue: minorToDecimalString(input.grossAttributedOrderValueMinor),
    netAttributedRevenue: minorToDecimalString(input.netAttributedRevenueMinor),
    campaignCost: minorToDecimalString(input.campaignCostMinor),
    creatorCost: minorToDecimalString(input.creatorCostMinor),
    conversionRate,
    costPerAttributedOrder:
      costPerAttributedOrder === null ? null : minorToDecimalString(costPerAttributedOrder),
    roas,
    revenuePerCreator:
      revenuePerCreator === null ? null : minorToDecimalString(revenuePerCreator),
  };
}

/**
 * Reconciliation identities from `docs/financial-metrics.md` §7.
 *
 * Used by integration tests to prove that the dashboard equals the underlying records.
 */
export interface ReconciliationResult {
  identity: string;
  expected: number;
  actual: number;
  holds: boolean;
}

export function checkReconciliation(input: {
  attributedValidOrdersTotal: number;
  attributedValidOrdersByCreator: readonly number[];
  netRevenueTotal: number;
  netRevenueByCreator: readonly number[];
  campaignCostTotal: number;
  campaignCostByCampaign: readonly number[];
  grossTotal: number;
  refundTotal: number;
  netTotal: number;
}): ReconciliationResult[] {
  const results: ReconciliationResult[] = [];

  const push = (identity: string, expected: number, actual: number): void => {
    results.push({ identity, expected, actual, holds: expected === actual });
  };

  push(
    'creator orders sum to campaign orders',
    input.attributedValidOrdersTotal,
    sumMinor(input.attributedValidOrdersByCreator),
  );
  push(
    'creator revenue sums to campaign revenue',
    input.netRevenueTotal,
    sumMinor(input.netRevenueByCreator),
  );
  push(
    'campaign costs sum to total cost',
    input.campaignCostTotal,
    sumMinor(input.campaignCostByCampaign),
  );
  push(
    'gross minus refunds equals net',
    input.grossTotal - input.refundTotal,
    input.netTotal,
  );

  return results;
}
