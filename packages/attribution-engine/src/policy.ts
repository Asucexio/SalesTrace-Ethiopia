/**
 * The default attribution policy.
 *
 * The policy is data, not code: the engine reads it, records it in `rule_snapshot` on every
 * attribution row, and can be changed (with a new version) without touching business logic.
 */

import {
  ATTRIBUTION_POLICY_VERSION,
  DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  type OrderStatus,
  VALID_SALE_STATUSES,
} from '@salestrace/shared-types';

import type { AttributionPolicy } from './types.js';

export const DEFAULT_ATTRIBUTION_POLICY: AttributionPolicy = {
  version: ATTRIBUTION_POLICY_VERSION,
  defaultWindowDays: DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  clickModel: 'last_eligible_click',
  couponOverridesLink: true,
  signalPrecedence: ['coupon', 'referral_identifier', 'click'],
};

/**
 * A sale is valid when the money changed hands at least once and something was actually paid.
 *
 * `pending` (money has not moved) and `cancelled` (the order did not stand) are excluded.
 */
export function isValidSaleStatus(status: OrderStatus): boolean {
  return VALID_SALE_STATUSES.includes(status);
}

/** Serialisable snapshot of the policy used for a decision. */
export function buildRuleSnapshot(policy: AttributionPolicy, windowDays: number): Record<string, unknown> {
  return {
    version: policy.version,
    clickModel: policy.clickModel,
    couponOverridesLink: policy.couponOverridesLink,
    signalPrecedence: [...policy.signalPrecedence],
    attributionWindowDays: windowDays,
  };
}
