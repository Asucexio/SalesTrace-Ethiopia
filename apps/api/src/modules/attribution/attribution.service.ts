/**
 * Attribution service.
 *
 * Loads the evidence for an order from the database, hands it to the pure attribution engine
 * and persists the decision. The service never decides anything itself — every rule lives in
 * `@salestrace/attribution-engine`.
 *
 * Persistence rules:
 * - Exactly one attribution row per order (`UNIQUE (order_id)`): re-running attribution
 *   updates the existing row, so an order can never be counted twice.
 * - The previous decision is written to the audit trail before it is replaced.
 */

import {
  decideAttribution,
  DEFAULT_ATTRIBUTION_POLICY,
  type AttributionDecision,
  type CampaignInput,
  type CouponInput,
  type CreatorAssignmentInput,
  type OrderInput,
  type ReferralLinkInput,
  type TrackingEventInput,
} from '@salestrace/attribution-engine';
import { normalizeCouponCode, normalizeTrackingCode, type OrderStatus } from '@salestrace/shared-types';

import type { SqlClient } from '../../db/driver.js';
import { recordAudit, sanitiseForAudit } from '../../shared/audit.js';
import { AppError } from '../../shared/errors.js';

interface OrderCandidateRow {
  id: string;
  external_order_id: string;
  ordered_at: Date;
  currency: string;
  total_paid_minor: number;
  status: OrderStatus;
  coupon_code: string | null;
  referral_identifier: string | null;
  refund_minor: number;
}

interface CampaignRow {
  id: string;
  organization_id: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  start_at: Date;
  end_at: Date | null;
  attribution_window_days: number;
  currency: string;
}

interface ClickRow {
  id: string;
  organization_id: string;
  campaign_id: string;
  creator_id: string;
  channel: 'link' | 'qr';
  occurred_at: Date;
  sequence: number;
}

interface CouponRow {
  id: string;
  organization_id: string;
  code: string;
  campaign_id: string;
  creator_id: string;
  is_active: boolean;
  valid_from: Date | null;
  valid_until: Date | null;
}

interface AssignmentRow {
  campaign_id: string;
  creator_id: string;
  assigned_at: Date;
}

interface LinkRow {
  id: string;
  organization_id: string;
  campaign_id: string;
  creator_id: string;
  channel: 'link' | 'qr';
  is_active: boolean;
}

export interface AttributeOrderInput {
  organizationId: string;
  orderId: string;
  requestId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
}

export class AttributionService {
  /**
   * Attribute (or re-attribute) a single order and persist the decision.
   *
   * Returns the decision, or `null` when the order could not be attributed.
   */
  async attributeOrder(tx: SqlClient, input: AttributeOrderInput): Promise<AttributionDecision | null> {
    const orderRow = await tx.query<OrderCandidateRow>(
      `SELECT o.id, o.external_order_id, o.ordered_at, o.currency, o.total_paid_minor, o.status,
              o.coupon_code, o.referral_identifier,
              COALESCE((SELECT sum(r.amount_minor) FROM refunds r WHERE r.order_id = o.id), 0)::bigint AS refund_minor
       FROM orders o
       WHERE o.id = $1 AND o.organization_id = $2`,
      [input.orderId, input.organizationId],
    );

    const row = orderRow.rows[0];
    if (!row) {
      throw AppError.notFound('Order');
    }

    const order: OrderInput = {
      id: row.id,
      organizationId: input.organizationId,
      externalOrderId: row.external_order_id,
      orderedAt: row.ordered_at,
      currency: row.currency,
      totalPaidMinor: row.total_paid_minor,
      status: row.status,
      couponCode: row.coupon_code,
      referralIdentifier: row.referral_identifier,
      refundMinor: row.refund_minor,
    };

    const decision = await this.evaluate(tx, input.organizationId, order);
    await this.persist(tx, input, order, decision);

    return decision;
  }

  /**
   * Run the engine for an order without persisting the result.
   *
   * Used by the recomputation endpoint to evaluate many orders before writing.
   */
  async evaluate(
    tx: SqlClient,
    organizationId: string,
    order: OrderInput,
  ): Promise<AttributionDecision> {
    const codes = [order.couponCode, order.referralIdentifier].filter(
      (code): code is string => typeof code === 'string' && code.trim().length > 0,
    );

    // Coupons: match on either the coupon code or the referral identifier.
    const coupons = codes.length === 0 ? [] : await this.loadCoupons(tx, organizationId, codes);

    // The tracking link referenced by the order (if the identifier is a tracking code).
    const referralLink = await this.loadReferralLink(tx, organizationId, order.referralIdentifier);

    // Candidate campaigns: from the coupon, the link and the click events.
    const campaignIds = new Set<string>();
    for (const coupon of coupons) campaignIds.add(coupon.campaignId);
    if (referralLink !== null) campaignIds.add(referralLink.campaignId);

    const clicks = await this.loadClicks(tx, organizationId, order.orderedAt);
    for (const click of clicks) campaignIds.add(click.campaignId);

    const campaigns = await this.loadCampaigns(tx, organizationId, [...campaignIds]);
    const assignments = await this.loadAssignments(tx, organizationId, [...campaignIds]);

    return decideAttribution({
      order,
      policy: DEFAULT_ATTRIBUTION_POLICY,
      campaigns,
      assignments,
      clickEvents: clicks,
      coupons,
      referralLink,
    });
  }

  private async persist(
    tx: SqlClient,
    input: AttributeOrderInput,
    order: OrderInput,
    decision: AttributionDecision,
  ): Promise<void> {
    const previous = await tx.query<{
      id: string;
      method: string;
      decision_reason: string;
      rule_version: string;
    }>(
      'SELECT id, method, decision_reason, rule_version FROM attributions WHERE order_id = $1',
      [order.id],
    );
    const before = previous.rows[0];

    if (before !== undefined) {
      await recordAudit(tx, {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        action: 'attribution.replaced',
        entityType: 'attribution',
        entityId: before.id,
        before: sanitiseForAudit({
          method: before.method,
          decisionReason: before.decision_reason,
          ruleVersion: before.rule_version,
        }),
        after: sanitiseForAudit({
          method: decision.method,
          decisionReason: decision.reason,
          ruleVersion: decision.ruleVersion,
        }),
        requestId: input.requestId ?? null,
      });
    }

    if (!decision.attributed) {
      // The order keeps its previous decision if there is one; it is never silently discarded.
      return;
    }

    const conflictDetail =
      decision.conflictDetail !== null || decision.notes !== null
        ? JSON.stringify({ conflict: decision.conflictDetail, notes: decision.notes })
        : null;

    await tx.query(
      `INSERT INTO attributions (
         organization_id, order_id, campaign_id, creator_id, method, rule_version, rule_snapshot,
         decision_reason, conflict_flag, conflict_detail, matched_event_id, matched_coupon_id,
         is_valid_sale, attributed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
       ON CONFLICT (order_id) DO UPDATE SET
         campaign_id = EXCLUDED.campaign_id,
         creator_id = EXCLUDED.creator_id,
         method = EXCLUDED.method,
         rule_version = EXCLUDED.rule_version,
         rule_snapshot = EXCLUDED.rule_snapshot,
         decision_reason = EXCLUDED.decision_reason,
         conflict_flag = EXCLUDED.conflict_flag,
         conflict_detail = EXCLUDED.conflict_detail,
         matched_event_id = EXCLUDED.matched_event_id,
         matched_coupon_id = EXCLUDED.matched_coupon_id,
         is_valid_sale = EXCLUDED.is_valid_sale,
         attributed_at = EXCLUDED.attributed_at,
         updated_at = now()`,
      [
        input.organizationId,
        order.id,
        decision.campaignId,
        decision.creatorId,
        decision.method,
        decision.ruleVersion,
        JSON.stringify(decision.ruleSnapshot),
        decision.reason,
        decision.conflictFlag,
        conflictDetail,
        decision.matchedEventId,
        decision.matchedCouponId,
        decision.isValidSale,
      ],
    );
  }

  private async loadCampaigns(
    tx: SqlClient,
    organizationId: string,
    campaignIds: string[],
  ): Promise<CampaignInput[]> {
    if (campaignIds.length === 0) return [];

    const result = await tx.query<CampaignRow>(
      `SELECT id, organization_id, status, start_at, end_at, attribution_window_days, currency
       FROM campaigns
       WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [organizationId, campaignIds],
    );

    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      status: row.status,
      startAt: row.start_at,
      endAt: row.end_at,
      attributionWindowDays: row.attribution_window_days,
      currency: row.currency,
    }));
  }

  private async loadAssignments(
    tx: SqlClient,
    organizationId: string,
    campaignIds: string[],
  ): Promise<CreatorAssignmentInput[]> {
    if (campaignIds.length === 0) return [];

    const result = await tx.query<AssignmentRow>(
      `SELECT campaign_id, creator_id, assigned_at
       FROM campaign_creators
       WHERE organization_id = $1 AND campaign_id = ANY($2::uuid[]) AND status = 'active'`,
      [organizationId, campaignIds],
    );

    return result.rows.map((row) => ({
      campaignId: row.campaign_id,
      creatorId: row.creator_id,
      assignedAt: row.assigned_at,
    }));
  }

  private async loadClicks(
    tx: SqlClient,
    organizationId: string,
    orderedAt: Date,
  ): Promise<TrackingEventInput[]> {
    // Only clicks inside the longest configured attribution window can matter.
    const result = await tx.query<ClickRow & { max_window_days: number }>(
      `SELECT te.id, te.organization_id, te.campaign_id, te.creator_id, tl.channel,
              te.occurred_at, te.sequence,
              COALESCE((SELECT max(c.attribution_window_days) FROM campaigns c
                        WHERE c.organization_id = te.organization_id), 7) AS max_window_days
       FROM tracking_events te
       JOIN tracking_links tl ON tl.id = te.tracking_link_id
       WHERE te.organization_id = $1
         AND te.occurred_at <= $2
         AND te.occurred_at >= $2::timestamptz - (COALESCE((SELECT max(c.attribution_window_days) FROM campaigns c
                                                            WHERE c.organization_id = te.organization_id), 7) || ' days')::interval
       ORDER BY te.occurred_at DESC
       LIMIT 2000`,
      [organizationId, orderedAt],
    );

    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      campaignId: row.campaign_id,
      creatorId: row.creator_id,
      channel: row.channel,
      occurredAt: row.occurred_at,
      sequence: row.sequence,
    }));
  }

  private async loadCoupons(
    tx: SqlClient,
    organizationId: string,
    codes: string[],
  ): Promise<CouponInput[]> {
    const normalised = codes.map((code) => normalizeCouponCode(code));
    const result = await tx.query<CouponRow>(
      `SELECT id, organization_id, code, campaign_id, creator_id, is_active, valid_from, valid_until
       FROM coupon_codes
       WHERE organization_id = $1 AND upper(code) = ANY($2::text[])`,
      [organizationId, normalised],
    );

    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      code: row.code,
      campaignId: row.campaign_id,
      creatorId: row.creator_id,
      isActive: row.is_active,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
    }));
  }

  private async loadReferralLink(
    tx: SqlClient,
    organizationId: string,
    identifier: string | null,
  ): Promise<ReferralLinkInput | null> {
    if (identifier === null || identifier.trim().length === 0) return null;

    const result = await tx.query<LinkRow>(
      `SELECT id, organization_id, campaign_id, creator_id, channel, is_active
       FROM tracking_links
       WHERE organization_id = $1 AND upper(code) = $2`,
      [organizationId, normalizeTrackingCode(identifier)],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      organizationId: row.organization_id,
      campaignId: row.campaign_id,
      creatorId: row.creator_id,
      channel: row.channel,
      isActive: row.is_active,
    };
  }
}
