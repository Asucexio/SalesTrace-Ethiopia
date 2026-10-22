/**
 * Pure input/output types for the attribution engine.
 *
 * The engine never touches a database, an HTTP request or a React component. The API layer
 * assembles these structures from persisted rows and persists the decision the engine returns.
 * This keeps the business rules testable in isolation and guarantees that the dashboard, the
 * reports and the exports all agree, because they all consume the same engine output.
 */

import type {
  AttributionDecisionReason,
  AttributionMethod,
  CampaignStatus,
  OrderStatus,
  TrackingChannel,
} from '@salestrace/shared-types';

/** The resolved attribution policy for a decision. */
export interface AttributionPolicy {
  /** Policy version recorded on every attribution row (e.g. `v1.0.0`). */
  version: string;
  /** Fallback window when a campaign does not define one. */
  defaultWindowDays: number;
  /** Only one click model is implemented: the last eligible click. */
  clickModel: 'last_eligible_click';
  /** A creator-specific coupon outranks a conflicting click. */
  couponOverridesLink: boolean;
  /** Precedence order used when several signals are present. */
  signalPrecedence: readonly ['coupon', 'referral_identifier', 'click'];
}

export interface CampaignInput {
  id: string;
  organizationId: string;
  status: CampaignStatus;
  startAt: Date;
  endAt: Date | null;
  attributionWindowDays: number;
  currency: string;
}

export interface CreatorAssignmentInput {
  campaignId: string;
  creatorId: string;
  /** The creator may only be credited for clicks that happened after this instant. */
  assignedAt: Date;
}

export interface TrackingEventInput {
  id: string;
  organizationId: string;
  campaignId: string;
  creatorId: string;
  channel: TrackingChannel;
  occurredAt: Date;
  /** Monotonic insertion order; the deterministic tie-break for identical timestamps. */
  sequence: number;
}

export interface CouponInput {
  id: string;
  organizationId: string;
  code: string;
  campaignId: string;
  creatorId: string;
  isActive: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
}

export interface ReferralLinkInput {
  id: string;
  organizationId: string;
  campaignId: string;
  creatorId: string;
  channel: TrackingChannel;
  isActive: boolean;
}

export interface OrderInput {
  id: string;
  organizationId: string;
  externalOrderId: string;
  orderedAt: Date;
  currency: string;
  totalPaidMinor: number;
  status: OrderStatus;
  couponCode: string | null;
  referralIdentifier: string | null;
  /** Total already refunded for this order. */
  refundMinor: number;
}

export interface AttributionInput {
  order: OrderInput;
  policy: AttributionPolicy;
  /** Every campaign that could plausibly be credited for this order. */
  campaigns: CampaignInput[];
  /** Assignments for the creators of those campaigns. */
  assignments: CreatorAssignmentInput[];
  /** Click events in the candidate campaigns (the engine applies the window rules). */
  clickEvents: TrackingEventInput[];
  /** Coupons whose code matches the order's coupon code or referral identifier. */
  coupons: CouponInput[];
  /** The tracking link matched by the order's referral identifier, if any. */
  referralLink: ReferralLinkInput | null;
}

export interface AttributionDecision {
  /** Whether an attribution row should be written for this order. */
  attributed: boolean;
  campaignId: string | null;
  creatorId: string | null;
  method: AttributionMethod | null;
  reason: AttributionDecisionReason;
  conflictFlag: boolean;
  /** The losing candidate(s) and the evidence behind the decision. */
  conflictDetail: Record<string, unknown> | null;
  /**
   * Non-conflicting observations worth recording (for example: a coupon code was present on the
   * order but was expired or inactive). Notes never mark the order as conflicted.
   */
  notes: Record<string, unknown> | null;
  matchedEventId: string | null;
  matchedCouponId: string | null;
  /** Derived from the order status: only a completed sale counts as a valid sale. */
  isValidSale: boolean;
  ruleVersion: string;
  ruleSnapshot: Record<string, unknown>;
}
