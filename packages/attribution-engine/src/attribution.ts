/**
 * The attribution engine.
 *
 * Implements `docs/attribution-rules.md` (policy `v1.0.0`) as a pure function: same input,
 * same output, every time. No I/O, no clock, no randomness, no framework.
 *
 * Decision pipeline:
 *   1. resolve the coupon signal
 *   2. resolve the referral-identifier signal
 *   3. resolve the click signal (last eligible click)
 *   4. apply the deterministic precedence + conflict rules
 *   5. derive order validity
 */

import { normalizeCouponCode, type AttributionDecisionReason, type AttributionMethod } from '@salestrace/shared-types';

import { buildRuleSnapshot, isValidSaleStatus } from './policy.js';
import type {
  AttributionDecision,
  AttributionInput,
  CampaignInput,
  CouponInput,
  CreatorAssignmentInput,
  TrackingEventInput,
} from './types.js';

interface ClickCandidate {
  event: TrackingEventInput;
  campaign: CampaignInput;
}

/** Milliseconds in a day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Decide the attribution for a single order.
 *
 * The function never throws for business-rule outcomes: an order that cannot be attributed
 * returns `attributed: false` together with the reason, so the caller can record the decision
 * instead of silently dropping the order.
 */
export function decideAttribution(input: AttributionInput): AttributionDecision {
  const { order, policy } = input;

  const campaignById = new Map(input.campaigns.map((campaign) => [campaign.id, campaign]));
  const assignmentsByKey = new Map(
    input.assignments.map((assignment) => [assignmentKey(assignment.campaignId, assignment.creatorId), assignment]),
  );

  const ruleVersion = policy.version;
  const isValidSale = isValidSaleStatus(order.status) && order.totalPaidMinor > 0;

  /* ------------------------------------------------------------ 1. coupon signal */

  const couponCandidate = selectCoupon(input.coupons, order.orderedAt);
  const couponCampaign = couponCandidate ? campaignById.get(couponCandidate.campaignId) : undefined;
  const couponAssigned =
    couponCandidate !== undefined &&
    assignmentsByKey.has(assignmentKey(couponCandidate.campaignId, couponCandidate.creatorId));

  /* ------------------------------------------- 2. referral identifier signal */

  const linkCandidate =
    input.referralLink !== null &&
    input.referralLink.isActive &&
    input.referralLink.organizationId === order.organizationId &&
    campaignById.has(input.referralLink.campaignId) &&
    assignmentsByKey.has(assignmentKey(input.referralLink.campaignId, input.referralLink.creatorId))
      ? input.referralLink
      : null;

  /* ------------------------------------------------------- 3. click signal */

  const clickCandidates = selectEligibleClicks(input, campaignById, assignmentsByKey);
  const winningClick = clickCandidates.length > 0 ? clickCandidates[0] : undefined;

  /* --------------------------------------- 4. precedence + conflict resolution */

  const hasCouponSignal = couponCandidate !== undefined && couponAssigned && couponCampaign !== undefined;
  const hasLinkSignal = linkCandidate !== null;
  const hasClickSignal = winningClick !== undefined;

  let method: AttributionMethod | null = null;
  let reason: AttributionDecisionReason = 'no_creator_signal';
  let campaignId: string | null = null;
  let creatorId: string | null = null;
  let matchedEventId: string | null = null;
  let matchedCouponId: string | null = null;
  let conflictFlag = false;
  let conflictDetail: Record<string, unknown> | null = null;
  let notes: Record<string, unknown> | null = null;

  if (hasCouponSignal && couponCandidate && couponCampaign) {
    method = 'coupon_code';
    reason = 'coupon_only';
    campaignId = couponCandidate.campaignId;
    creatorId = couponCandidate.creatorId;
    matchedCouponId = couponCandidate.id;

    if (hasClickSignal && winningClick) {
      const sameCreator = winningClick.event.creatorId === couponCandidate.creatorId;
      const sameCampaign = winningClick.campaign.id === couponCandidate.campaignId;
      if (sameCreator && sameCampaign) {
        reason = 'click_and_coupon_same_creator';
      } else {
        conflictFlag = true;
        reason = 'conflict_resolved_in_favor_of_coupon';
        conflictDetail = {
          resolvedInFavor: 'coupon',
          coupon: {
            id: couponCandidate.id,
            code: couponCandidate.code,
            campaignId: couponCandidate.campaignId,
            creatorId: couponCandidate.creatorId,
          },
          click: {
            id: winningClick.event.id,
            campaignId: winningClick.event.campaignId,
            creatorId: winningClick.event.creatorId,
            occurredAt: winningClick.event.occurredAt.toISOString(),
            sequence: winningClick.event.sequence,
          },
        };
      }
    } else if (hasLinkSignal && linkCandidate) {
      const sameCreator = linkCandidate.creatorId === couponCandidate.creatorId;
      const sameCampaign = linkCandidate.campaignId === couponCandidate.campaignId;
      if (!sameCreator || !sameCampaign) {
        conflictFlag = true;
        reason = 'conflict_resolved_in_favor_of_coupon';
        conflictDetail = {
          resolvedInFavor: 'coupon',
          coupon: {
            id: couponCandidate.id,
            code: couponCandidate.code,
            campaignId: couponCandidate.campaignId,
            creatorId: couponCandidate.creatorId,
          },
          referralLink: {
            id: linkCandidate.id,
            campaignId: linkCandidate.campaignId,
            creatorId: linkCandidate.creatorId,
          },
        };
      }
    }
  } else if (hasLinkSignal && linkCandidate) {
    method = linkCandidate.channel === 'qr' ? 'qr_link' : 'referral_identifier';
    reason = 'referral_identifier_match';
    campaignId = linkCandidate.campaignId;
    creatorId = linkCandidate.creatorId;
  } else if (hasClickSignal && winningClick) {
    method = winningClick.event.channel === 'qr' ? 'qr_link' : 'link';
    reason = 'last_eligible_click';
    campaignId = winningClick.campaign.id;
    creatorId = winningClick.event.creatorId;
    matchedEventId = winningClick.event.id;

    if (hasCouponSignal === false && input.coupons.length > 0) {
      // A coupon code was present on the order but was not usable (expired / inactive /
      // unassigned). The order is still attributed through the click, but the discrepancy is
      // recorded as a note. It is **not** a conflict: only two usable signals can conflict.
      notes = {
        unusableCoupons: input.coupons.map((coupon) => ({
          id: coupon.id,
          code: coupon.code,
          isActive: coupon.isActive,
          validFrom: coupon.validFrom?.toISOString() ?? null,
          validUntil: coupon.validUntil?.toISOString() ?? null,
        })),
      };
    }
  } else {
    // No signal qualified. Distinguish the reason so the audit trail is meaningful.
    reason = diagnoseNoAttribution(input, campaignById, assignmentsByKey);
  }

  const attributed = campaignId !== null && creatorId !== null;

  const windowDays = campaignById.get(campaignId ?? '')?.attributionWindowDays ?? policy.defaultWindowDays;

  return {
    attributed,
    campaignId,
    creatorId,
    method,
    reason,
    conflictFlag,
    conflictDetail,
    notes,
    matchedEventId,
    matchedCouponId,
    isValidSale,
    ruleVersion,
    ruleSnapshot: buildRuleSnapshot(policy, windowDays),
  };
}

/* ------------------------------------------------------------------ helpers */

function assignmentKey(campaignId: string, creatorId: string): string {
  return `${campaignId}:${creatorId}`;
}

/**
 * Select the usable coupon for the order.
 *
 * A coupon qualifies when it is active and the order was placed inside its validity window.
 * The order's own code must match (case-insensitive, trimmed).
 */
function selectCoupon(coupons: CouponInput[], orderedAt: Date): CouponInput | undefined {
  const orderedAtMs = orderedAt.getTime();
  return coupons.find((coupon) => {
    if (!coupon.isActive) return false;
    if (coupon.validFrom !== null && orderedAtMs < coupon.validFrom.getTime()) return false;
    if (coupon.validUntil !== null && orderedAtMs > coupon.validUntil.getTime()) return false;
    return true;
  });
}

/**
 * Select the eligible clicks and return them ordered by the last-eligible-click rule.
 *
 * Eligibility conditions C1–C7 from `docs/attribution-rules.md`.
 */
function selectEligibleClicks(
  input: AttributionInput,
  campaignById: Map<string, CampaignInput>,
  assignmentsByKey: Map<string, CreatorAssignmentInput>,
): ClickCandidate[] {
  const orderTime = input.order.orderedAt.getTime();
  const candidates: ClickCandidate[] = [];

  for (const event of input.clickEvents) {
    // C1 — same organisation.
    if (event.organizationId !== input.order.organizationId) continue;

    const campaign = campaignById.get(event.campaignId);
    if (!campaign) continue;

    // C2 — the campaign must belong to the same organisation as the order.
    if (campaign.organizationId !== input.order.organizationId) continue;

    // C3 — the creator must be assigned to the campaign.
    const assignment = assignmentsByKey.get(assignmentKey(event.campaignId, event.creatorId));
    if (!assignment) continue;

    const eventTime = event.occurredAt.getTime();

    // C4 — a click cannot precede the order it caused.
    if (eventTime > orderTime) continue;

    // C5 — the click must fall inside the attribution window.
    const windowDays = campaign.attributionWindowDays > 0 ? campaign.attributionWindowDays : input.policy.defaultWindowDays;
    if (orderTime - eventTime > windowDays * MS_PER_DAY) continue;

    // C6 — the click must fall inside the campaign's active window.
    if (eventTime < campaign.startAt.getTime()) continue;
    if (campaign.endAt !== null && eventTime > campaign.endAt.getTime()) continue;

    // C7 — the creator must already have been assigned when the click happened.
    if (eventTime < assignment.assignedAt.getTime()) continue;

    candidates.push({ event, campaign });
  }

  // Last eligible click wins; ties are broken by insertion order (sequence).
  candidates.sort((a, b) => {
    const byTime = b.event.occurredAt.getTime() - a.event.occurredAt.getTime();
    if (byTime !== 0) return byTime;
    return b.event.sequence - a.event.sequence;
  });

  return candidates;
}

/** Explain precisely why no attribution could be made. */
function diagnoseNoAttribution(
  input: AttributionInput,
  campaignById: Map<string, CampaignInput>,
  assignmentsByKey: Map<string, CreatorAssignmentInput>,
): AttributionDecisionReason {
  if (input.coupons.length === 0 && input.clickEvents.length === 0 && input.referralLink === null) {
    return 'no_creator_signal';
  }

  // A click existed but no creator was assigned to its campaign.
  const unassigned = input.clickEvents.some(
    (event) =>
      campaignById.has(event.campaignId) &&
      !assignmentsByKey.has(assignmentKey(event.campaignId, event.creatorId)),
  );
  if (unassigned) {
    return 'creator_not_assigned';
  }

  // A click existed but fell outside the window / campaign dates.
  const hasClick = input.clickEvents.length > 0;
  if (hasClick) {
    return 'no_eligible_click';
  }

  // Only a coupon was present, but it could not be used.
  if (input.coupons.length > 0) {
    const anyAssigned = input.coupons.some((coupon) =>
      assignmentsByKey.has(assignmentKey(coupon.campaignId, coupon.creatorId)),
    );
    if (!anyAssigned) {
      return 'creator_not_assigned';
    }
    return 'no_eligible_click';
  }

  // A referral identifier was present but did not resolve to an active link.
  if (input.referralLink !== null) {
    const link = input.referralLink;
    const assigned = assignmentsByKey.has(assignmentKey(link.campaignId, link.creatorId));
    if (!assigned) {
      return 'creator_not_assigned';
    }
    if (!link.isActive) {
      return 'campaign_not_eligible';
    }
  }

  return 'no_creator_signal';
}

/**
 * Resolve the creator-specific coupon that matches an order's coupon code or referral identifier.
 *
 * Exposed for the service layer so the same normalisation rules are applied to the order row.
 */
export function matchCouponCode(
  coupons: CouponInput[],
  candidateCodes: Array<string | null | undefined>,
): CouponInput | undefined {
  const codes = new Set(
    candidateCodes
      .filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
      .map((code) => normalizeCouponCode(code)),
  );
  if (codes.size === 0) return undefined;
  return coupons.find((coupon) => codes.has(normalizeCouponCode(coupon.code)));
}
