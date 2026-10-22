/**
 * Tracking repository.
 *
 * All SQL lives here. The repository never decides policy: it receives the organization id from
 * the request context and applies it to every statement — with one deliberate exception: the
 * lookup by public tracking code. That lookup is by an unguessable, globally unique code and
 * happens before any tenant context exists; it returns nothing but the link and its campaign.
 */

import type { DiscountType, TrackingChannel } from '@salestrace/shared-types';

import type { SqlClient } from '../../db/driver.js';

export interface TrackingLinkRow {
  id: string;
  organization_id: string;
  campaign_id: string;
  campaign_name: string;
  creator_id: string;
  creator_name: string;
  code: string;
  channel: TrackingChannel;
  label: string | null;
  destination_url: string;
  is_active: boolean;
  created_at: Date;
}

export interface CouponCodeRow {
  id: string;
  organization_id: string;
  campaign_id: string;
  campaign_name: string;
  creator_id: string;
  creator_name: string;
  code: string;
  discount_type: DiscountType;
  discount_percent: number | null;
  discount_value_minor: number | null;
  max_redemptions: number | null;
  redemption_count: number;
  valid_from: Date | null;
  valid_until: Date | null;
  is_active: boolean;
  created_at: Date;
}

export interface TrackingEventRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  creator_id: string;
  creator_name: string;
  tracking_link_id: string;
  occurred_at: Date;
  repeat_count: number;
  referrer: string | null;
}

/** The public view of a link: the link plus the state of its campaign and organisation. */
export interface PublicTrackingLinkRow {
  id: string;
  organization_id: string;
  campaign_id: string;
  creator_id: string;
  code: string;
  destination_url: string;
  is_active: boolean;
  campaign_status: string;
  organization_settings: Record<string, unknown>;
}

export interface TrackingLinkFilters {
  campaignId?: string | null;
  creatorId?: string | null;
  channel?: TrackingChannel | null;
  isActive?: boolean | null;
  limit: number;
  offset: number;
}

export interface TrackingEventFilters {
  campaignId?: string | null;
  creatorId?: string | null;
  from?: Date | null;
  to?: Date | null;
  limit: number;
  offset: number;
}

const LINK_COLUMNS = `tl.id, tl.organization_id, tl.campaign_id, c.name AS campaign_name,
       tl.creator_id, cr.display_name AS creator_name, tl.code, tl.channel, tl.label,
       tl.destination_url, tl.is_active, tl.created_at`;

const COUPON_COLUMNS = `cc.id, cc.organization_id, cc.campaign_id, c.name AS campaign_name,
       cc.creator_id, cr.display_name AS creator_name, cc.code, cc.discount_type,
       cc.discount_percent, cc.discount_value_minor, cc.max_redemptions, cc.redemption_count,
       cc.valid_from, cc.valid_until, cc.is_active, cc.created_at`;

export const trackingRepository = {
  /* ------------------------------------------------------- campaign checks */

  /** The campaign a tracking asset belongs to. */
  async findCampaign(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
  ): Promise<{ id: string; destination_url: string } | null> {
    const result = await tx.query<{ id: string; destination_url: string }>(
      'SELECT id, destination_url FROM campaigns WHERE organization_id = $1 AND id = $2',
      [organizationId, campaignId],
    );
    return result.rows[0] ?? null;
  },

  /** The creator a tracking asset belongs to. */
  async findCreator(
    tx: SqlClient,
    organizationId: string,
    creatorId: string,
  ): Promise<{ id: string; internal_code: string } | null> {
    const result = await tx.query<{ id: string; internal_code: string }>(
      'SELECT id, internal_code FROM creators WHERE organization_id = $1 AND id = $2',
      [organizationId, creatorId],
    );
    return result.rows[0] ?? null;
  },

  /** The assignment of a creator to a campaign — the precondition of every tracking asset. */
  async findAssignment(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
    creatorId: string,
  ): Promise<{ id: string } | null> {
    const result = await tx.query<{ id: string }>(
      'SELECT id FROM campaign_creators WHERE organization_id = $1 AND campaign_id = $2 AND creator_id = $3',
      [organizationId, campaignId, creatorId],
    );
    return result.rows[0] ?? null;
  },

  /* -------------------------------------------------------- tracking links */

  async listLinks(
    tx: SqlClient,
    organizationId: string,
    filters: TrackingLinkFilters,
  ): Promise<{ rows: TrackingLinkRow[]; total: number }> {
    const result = await tx.query<TrackingLinkRow>(
      `SELECT ${LINK_COLUMNS}
       FROM tracking_links tl
       JOIN campaigns c ON c.id = tl.campaign_id
       JOIN creators cr ON cr.id = tl.creator_id
       WHERE tl.organization_id = $1
         AND ($2::uuid IS NULL OR tl.campaign_id = $2)
         AND ($3::uuid IS NULL OR tl.creator_id = $3)
         AND ($4::text IS NULL OR tl.channel = $4)
         AND ($5::boolean IS NULL OR tl.is_active = $5)
       ORDER BY tl.created_at DESC
       LIMIT $6 OFFSET $7`,
      [
        organizationId,
        filters.campaignId ?? null,
        filters.creatorId ?? null,
        filters.channel ?? null,
        filters.isActive ?? null,
        filters.limit,
        filters.offset,
      ],
    );

    const count = await tx.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM tracking_links tl
       WHERE tl.organization_id = $1
         AND ($2::uuid IS NULL OR tl.campaign_id = $2)
         AND ($3::uuid IS NULL OR tl.creator_id = $3)
         AND ($4::text IS NULL OR tl.channel = $4)
         AND ($5::boolean IS NULL OR tl.is_active = $5)`,
      [
        organizationId,
        filters.campaignId ?? null,
        filters.creatorId ?? null,
        filters.channel ?? null,
        filters.isActive ?? null,
      ],
    );

    return { rows: result.rows, total: count.rows[0]?.count ?? 0 };
  },

  async findLinkById(
    tx: SqlClient,
    organizationId: string,
    linkId: string,
  ): Promise<TrackingLinkRow | null> {
    const result = await tx.query<TrackingLinkRow>(
      `SELECT ${LINK_COLUMNS}
       FROM tracking_links tl
       JOIN campaigns c ON c.id = tl.campaign_id
       JOIN creators cr ON cr.id = tl.creator_id
       WHERE tl.organization_id = $1 AND tl.id = $2`,
      [organizationId, linkId],
    );
    return result.rows[0] ?? null;
  },

  /**
   * Look up a link by its public code.
   *
   * The code is globally unique and unguessable; this lookup is what the public redirect needs
   * before any tenant context exists.
   */
  async findLinkByCode(tx: SqlClient, code: string): Promise<PublicTrackingLinkRow | null> {
    const result = await tx.query<PublicTrackingLinkRow>(
      `SELECT tl.id, tl.organization_id, tl.campaign_id, tl.creator_id, tl.code,
              tl.destination_url, tl.is_active, c.status AS campaign_status,
              o.settings AS organization_settings
       FROM tracking_links tl
       JOIN campaigns c ON c.id = tl.campaign_id
       JOIN organizations o ON o.id = tl.organization_id
       WHERE tl.code = $1`,
      [code],
    );
    return result.rows[0] ?? null;
  },

  async createLink(
    tx: SqlClient,
    input: {
      organizationId: string;
      campaignId: string;
      creatorId: string;
      code: string;
      channel: TrackingChannel;
      label: string | null;
      destinationUrl: string;
    },
  ): Promise<{ id: string; code: string; created_at: Date }> {
    const result = await tx.query<{ id: string; code: string; created_at: Date }>(
      `INSERT INTO tracking_links (
         organization_id, campaign_id, creator_id, code, channel, label, destination_url
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, code, created_at`,
      [
        input.organizationId,
        input.campaignId,
        input.creatorId,
        input.code,
        input.channel,
        input.label,
        input.destinationUrl,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create the tracking link.');
    return row;
  },

  async updateLink(
    tx: SqlClient,
    organizationId: string,
    linkId: string,
    patch: { label?: string | null; destinationUrl?: string | null; isActive?: boolean | null },
  ): Promise<boolean> {
    const result = await tx.query(
      `UPDATE tracking_links SET
         label = CASE WHEN $3::boolean THEN $4 ELSE label END,
         destination_url = CASE WHEN $5::boolean THEN $6 ELSE destination_url END,
         is_active = CASE WHEN $7::boolean THEN $8 ELSE is_active END
       WHERE organization_id = $1 AND id = $2`,
      [
        organizationId,
        linkId,
        patch.label !== undefined,
        patch.label ?? null,
        patch.destinationUrl !== undefined,
        patch.destinationUrl ?? null,
        patch.isActive !== undefined,
        patch.isActive ?? null,
      ],
    );
    return result.rowCount > 0;
  },

  /** Soft delete — the link is deactivated, its history is kept. */
  async deactivateLink(tx: SqlClient, organizationId: string, linkId: string): Promise<boolean> {
    const result = await tx.query(
      'UPDATE tracking_links SET is_active = false WHERE organization_id = $1 AND id = $2',
      [organizationId, linkId],
    );
    return result.rowCount > 0;
  },

  /* ---------------------------------------------------------- coupon codes */

  async listCoupons(
    tx: SqlClient,
    organizationId: string,
    filters: { limit: number; offset: number },
  ): Promise<{ rows: CouponCodeRow[]; total: number }> {
    const result = await tx.query<CouponCodeRow>(
      `SELECT ${COUPON_COLUMNS}
       FROM coupon_codes cc
       JOIN campaigns c ON c.id = cc.campaign_id
       JOIN creators cr ON cr.id = cc.creator_id
       WHERE cc.organization_id = $1
       ORDER BY cc.created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, filters.limit, filters.offset],
    );

    const count = await tx.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM coupon_codes WHERE organization_id = $1',
      [organizationId],
    );

    return { rows: result.rows, total: count.rows[0]?.count ?? 0 };
  },

  async findCouponById(
    tx: SqlClient,
    organizationId: string,
    couponId: string,
  ): Promise<CouponCodeRow | null> {
    const result = await tx.query<CouponCodeRow>(
      `SELECT ${COUPON_COLUMNS}
       FROM coupon_codes cc
       JOIN campaigns c ON c.id = cc.campaign_id
       JOIN creators cr ON cr.id = cc.creator_id
       WHERE cc.organization_id = $1 AND cc.id = $2`,
      [organizationId, couponId],
    );
    return result.rows[0] ?? null;
  },

  async findCouponByCode(
    tx: SqlClient,
    organizationId: string,
    code: string,
  ): Promise<CouponCodeRow | null> {
    const result = await tx.query<CouponCodeRow>(
      `SELECT ${COUPON_COLUMNS}
       FROM coupon_codes cc
       JOIN campaigns c ON c.id = cc.campaign_id
       JOIN creators cr ON cr.id = cc.creator_id
       WHERE cc.organization_id = $1 AND cc.code = $2`,
      [organizationId, code],
    );
    return result.rows[0] ?? null;
  },

  async createCoupon(
    tx: SqlClient,
    input: {
      organizationId: string;
      campaignId: string;
      creatorId: string;
      code: string;
      discountType: DiscountType;
      discountValueMinor: number | null;
      discountPercent: number | null;
      maxRedemptions: number | null;
      validFrom: Date | null;
      validUntil: Date | null;
    },
  ): Promise<{ id: string; code: string; created_at: Date }> {
    const result = await tx.query<{ id: string; code: string; created_at: Date }>(
      `INSERT INTO coupon_codes (
         organization_id, campaign_id, creator_id, code, discount_type, discount_value_minor,
         discount_percent, max_redemptions, valid_from, valid_until
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, code, created_at`,
      [
        input.organizationId,
        input.campaignId,
        input.creatorId,
        input.code,
        input.discountType,
        input.discountValueMinor,
        input.discountPercent,
        input.maxRedemptions,
        input.validFrom,
        input.validUntil,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create the coupon code.');
    return row;
  },

  async updateCoupon(
    tx: SqlClient,
    organizationId: string,
    couponId: string,
    patch: {
      discountType?: DiscountType | null;
      discountValueMinor?: number | null;
      discountPercent?: number | null;
      maxRedemptions?: number | null;
      validFrom?: Date | null;
      validUntil?: Date | null;
      isActive?: boolean | null;
    },
  ): Promise<boolean> {
    const result = await tx.query(
      `UPDATE coupon_codes SET
         discount_type = CASE WHEN $3::boolean THEN $4 ELSE discount_type END,
         discount_value_minor = CASE WHEN $5::boolean THEN $6 ELSE discount_value_minor END,
         discount_percent = CASE WHEN $7::boolean THEN $8 ELSE discount_percent END,
         max_redemptions = CASE WHEN $9::boolean THEN $10 ELSE max_redemptions END,
         valid_from = CASE WHEN $11::boolean THEN $12 ELSE valid_from END,
         valid_until = CASE WHEN $13::boolean THEN $14 ELSE valid_until END,
         is_active = CASE WHEN $15::boolean THEN $16 ELSE is_active END
       WHERE organization_id = $1 AND id = $2`,
      [
        organizationId,
        couponId,
        patch.discountType !== undefined,
        patch.discountType ?? null,
        patch.discountValueMinor !== undefined,
        patch.discountValueMinor ?? null,
        patch.discountPercent !== undefined,
        patch.discountPercent ?? null,
        patch.maxRedemptions !== undefined,
        patch.maxRedemptions ?? null,
        patch.validFrom !== undefined,
        patch.validFrom ?? null,
        patch.validUntil !== undefined,
        patch.validUntil ?? null,
        patch.isActive !== undefined,
        patch.isActive ?? null,
      ],
    );
    return result.rowCount > 0;
  },

  async deactivateCoupon(
    tx: SqlClient,
    organizationId: string,
    couponId: string,
  ): Promise<boolean> {
    const result = await tx.query(
      'UPDATE coupon_codes SET is_active = false WHERE organization_id = $1 AND id = $2',
      [organizationId, couponId],
    );
    return result.rowCount > 0;
  },

  /* -------------------------------------------------------- tracking events */

  async listEvents(
    tx: SqlClient,
    organizationId: string,
    filters: TrackingEventFilters,
  ): Promise<{ rows: TrackingEventRow[]; total: number }> {
    const result = await tx.query<TrackingEventRow>(
      `SELECT te.id, te.campaign_id, c.name AS campaign_name, te.creator_id,
              cr.display_name AS creator_name, te.tracking_link_id, te.occurred_at,
              te.repeat_count, te.referrer
       FROM tracking_events te
       JOIN campaigns c ON c.id = te.campaign_id
       JOIN creators cr ON cr.id = te.creator_id
       WHERE te.organization_id = $1
         AND ($2::uuid IS NULL OR te.campaign_id = $2)
         AND ($3::uuid IS NULL OR te.creator_id = $3)
         AND ($4::timestamptz IS NULL OR te.occurred_at >= $4)
         AND ($5::timestamptz IS NULL OR te.occurred_at < $5)
       ORDER BY te.occurred_at DESC, te.sequence DESC
       LIMIT $6 OFFSET $7`,
      [
        organizationId,
        filters.campaignId ?? null,
        filters.creatorId ?? null,
        filters.from ?? null,
        filters.to ?? null,
        filters.limit,
        filters.offset,
      ],
    );

    const count = await tx.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM tracking_events te
       WHERE te.organization_id = $1
         AND ($2::uuid IS NULL OR te.campaign_id = $2)
         AND ($3::uuid IS NULL OR te.creator_id = $3)
         AND ($4::timestamptz IS NULL OR te.occurred_at >= $4)
         AND ($5::timestamptz IS NULL OR te.occurred_at < $5)`,
      [
        organizationId,
        filters.campaignId ?? null,
        filters.creatorId ?? null,
        filters.from ?? null,
        filters.to ?? null,
      ],
    );

    return { rows: result.rows, total: count.rows[0]?.count ?? 0 };
  },

  /** The most recent event of the same link and fingerprint inside the de-duplication window. */
  async findRecentEventByFingerprint(
    tx: SqlClient,
    trackingLinkId: string,
    fingerprint: string,
    since: Date,
  ): Promise<{ id: string; repeat_count: number } | null> {
    const result = await tx.query<{ id: string; repeat_count: number }>(
      `SELECT id, repeat_count FROM tracking_events
       WHERE tracking_link_id = $1 AND fingerprint = $2 AND occurred_at >= $3
       ORDER BY occurred_at DESC, sequence DESC
       LIMIT 1`,
      [trackingLinkId, fingerprint, since],
    );
    return result.rows[0] ?? null;
  },

  async insertEvent(
    tx: SqlClient,
    input: {
      organizationId: string;
      trackingLinkId: string;
      campaignId: string;
      creatorId: string;
      occurredAt: Date;
      visitorToken: string | null;
      fingerprint: string | null;
      ipHash: string | null;
      userAgent: string | null;
      referrer: string | null;
    },
  ): Promise<{ id: string }> {
    const result = await tx.query<{ id: string }>(
      `INSERT INTO tracking_events (
         organization_id, tracking_link_id, campaign_id, creator_id, event_type, occurred_at,
         visitor_token, fingerprint, ip_hash, user_agent, referrer
       ) VALUES ($1, $2, $3, $4, 'click', $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.organizationId,
        input.trackingLinkId,
        input.campaignId,
        input.creatorId,
        input.occurredAt,
        input.visitorToken,
        input.fingerprint,
        input.ipHash,
        input.userAgent,
        input.referrer,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record the tracking event.');
    return row;
  },

  async incrementRepeatCount(tx: SqlClient, eventId: string): Promise<void> {
    await tx.query(
      'UPDATE tracking_events SET repeat_count = repeat_count + 1 WHERE id = $1',
      [eventId],
    );
  },
};
