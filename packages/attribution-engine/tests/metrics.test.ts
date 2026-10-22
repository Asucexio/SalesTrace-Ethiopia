import { describe, expect, it } from 'vitest';

import {
  checkReconciliation,
  computeMetrics,
  computeOrderNetRevenue,
} from '../src/index.js';

const baseInput = {
  totalClicks: 1240,
  eligibleClicks: 900,
  attributedOrders: 96,
  attributedValidOrders: 88,
  paidOrders: 80,
  cancelledOrders: 6,
  pendingOrders: 2,
  refundedOrders: 5,
  grossAttributedOrderValueMinor: 9_200_000,
  refundAmountMinor: 350_000,
  netAttributedRevenueMinor: 8_850_000,
  campaignCostMinor: 4_000_000,
  creatorCostMinor: 3_000_000,
};

describe('computeMetrics', () => {
  it('computes the documented campaign example (docs example 1)', () => {
    const metrics = computeMetrics(baseInput);

    expect(metrics.netAttributedRevenue).toBe('88500.00');
    expect(metrics.grossAttributedOrderValue).toBe('92000.00');
    expect(metrics.refundAmount).toBe('3500.00');
    expect(metrics.campaignCost).toBe('40000.00');
    expect(metrics.conversionRate).toBe(9.78);
    expect(metrics.costPerAttributedOrder).toBe('454.55');
    expect(metrics.roas).toBe(2.21);
  });

  it('rounds half-up rather than truncating (docs example 2)', () => {
    const metrics = computeMetrics({
      ...baseInput,
      campaignCostMinor: 4_000_000,
      attributedValidOrders: 88,
    });

    // 4000000 / 88 = 454.5454... → 454.55
    expect(metrics.costPerAttributedOrder).toBe('454.55');
  });

  it('returns null for every rate with a zero denominator (docs example 3)', () => {
    const metrics = computeMetrics({
      ...baseInput,
      eligibleClicks: 0,
      attributedValidOrders: 0,
      campaignCostMinor: 0,
      netAttributedRevenueMinor: 0,
    });

    expect(metrics.conversionRate).toBeNull();
    expect(metrics.roas).toBeNull();
    expect(metrics.costPerAttributedOrder).toBeNull();
    expect(metrics.revenuePerCreator).toBeNull();
    expect(metrics.costPerAttributedOrder).not.toBe('0.00');
  });

  it('never produces NaN or Infinity', () => {
    const metrics = computeMetrics({
      ...baseInput,
      eligibleClicks: 0,
      campaignCostMinor: 0,
      creatorCount: 0,
    });

    for (const value of [metrics.conversionRate, metrics.roas, metrics.revenuePerCreator]) {
      if (value !== null) {
        expect(Number.isFinite(value)).toBe(true);
        expect(Number.isNaN(value)).toBe(false);
      }
    }
  });

  it('computes revenue per creator', () => {
    const metrics = computeMetrics({ ...baseInput, creatorCount: 2 });

    expect(metrics.revenuePerCreator).toBe('44250.00');
  });

  it('reports a creator with no recorded cost as null ROAS rather than zero (docs example 4)', () => {
    const metrics = computeMetrics({ ...baseInput, campaignCostMinor: 0, creatorCostMinor: 0 });

    expect(metrics.roas).toBeNull();
    expect(metrics.costPerAttributedOrder).toBe('0.00');
  });
});

describe('computeOrderNetRevenue', () => {
  it('deducts a partial refund', () => {
    expect(computeOrderNetRevenue(200_000, 50_000)).toBe(150_000);
  });

  it('returns zero for a full refund', () => {
    expect(computeOrderNetRevenue(200_000, 200_000)).toBe(0);
  });

  it('never returns a negative amount when refunded beyond the order total', () => {
    expect(computeOrderNetRevenue(200_000, 250_000)).toBe(0);
  });
});

describe('checkReconciliation', () => {
  it('holds when the aggregates agree', () => {
    const results = checkReconciliation({
      attributedValidOrdersTotal: 88,
      attributedValidOrdersByCreator: [40, 28, 20],
      netRevenueTotal: 8_850_000,
      netRevenueByCreator: [4_100_000, 2_250_000, 2_500_000],
      campaignCostTotal: 4_000_000,
      campaignCostByCampaign: [2_500_000, 1_500_000],
      grossTotal: 9_200_000,
      refundTotal: 350_000,
      netTotal: 8_850_000,
    });

    expect(results.every((result) => result.holds)).toBe(true);
  });

  it('detects a mismatch', () => {
    const results = checkReconciliation({
      attributedValidOrdersTotal: 88,
      attributedValidOrdersByCreator: [40, 28],
      netRevenueTotal: 8_850_000,
      netRevenueByCreator: [8_850_000],
      campaignCostTotal: 4_000_000,
      campaignCostByCampaign: [4_000_000],
      grossTotal: 9_200_000,
      refundTotal: 350_000,
      netTotal: 8_850_000,
    });

    const orders = results.find((result) => result.identity === 'creator orders sum to campaign orders');
    expect(orders?.holds).toBe(false);
  });
});
