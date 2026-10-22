/**
 * Tracking service.
 *
 * Business rules enforced here:
 * - A tracking link belongs to a campaign and to a creator that is **assigned** to that campaign.
 *   A link to an unassigned creator would never produce an attribution, so it is rejected.
 * - The destination URL of a link defaults to the campaign destination and is always `https`.
 * - A coupon code is unique inside the organisation and belongs to an assigned creator.
 * - The public redirect resolves the destination from the database. **No query parameter can
 *   change the redirect target** — that closes the open-redirect class of attacks.
 * - Raw IP addresses are never stored: only salted hashes.
 */

import { createHash } from 'node:crypto';

import {
  generateCouponCode,
  generateSecureToken,
  generateTrackingCode,
  normalizeTrackingCode,
  parseAmountToMinor,
  type DiscountType,
  type OrganizationRole,
  type TrackingChannel,
} from '@salestrace/shared-types';

import { getEnv } from '../../config/env.js';
import { withOrgContext, withSystemContext } from '../../db/context.js';
import type { DbDriver } from '../../db/driver.js';
import { recordAudit, sanitiseForAudit } from '../../shared/audit.js';
import { AppError } from '../../shared/errors.js';

import {
  trackingRepository,
  type CouponCodeRow,
  type TrackingEventRow,
  type TrackingLinkRow,
} from './tracking.repository.js';

export interface TrackingServiceDeps {
  db: DbDriver;
}

/** The name of the first-party visitor cookie. */
export const VISITOR_COOKIE_NAME = 'st_vid';

/** One year, in seconds. */
export const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** How many times a code collision is retried before the write is abandoned. */
const CODE_GENERATION_ATTEMPTS = 5;

function toMinor(amount: string | number): number {
  try {
    return parseAmountToMinor(amount);
  } catch {
    throw AppError.validation('The amount is not a valid monetary value.');
  }
}

function toDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw AppError.validation('The timestamp is not a valid ISO-8601 date.');
  }
  return date;
}

function assertHttps(url: string): void {
  if (!url.startsWith('https://')) {
    throw AppError.unprocessable('The destination URL must use https.');
  }
}

/** PostgreSQL error code for a unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '23505'
  );
}

export interface PublicRedirectResult {
  destination: string;
  visitorToken: string;
  /** `true` when the visitor did not present a cookie and a new one was issued. */
  visitorTokenIsNew: boolean;
  /** `true` when the click was folded into an existing event instead of creating a new row. */
  deduplicated: boolean;
}

export class TrackingService {
  constructor(private readonly deps: TrackingServiceDeps) {}

  private get db(): DbDriver {
    return this.deps.db;
  }

  /* -------------------------------------------------------- tracking links */

  async listLinks(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    campaignId?: string | null;
    creatorId?: string | null;
    channel?: TrackingChannel | null;
    isActive?: boolean | null;
    limit: number;
    offset: number;
  }): Promise<{ items: TrackingLinkRow[]; total: number; limit: number; offset: number }> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const { rows, total } = await trackingRepository.listLinks(tx, input.organizationId, {
          campaignId: input.campaignId ?? null,
          creatorId: input.creatorId ?? null,
          channel: input.channel ?? null,
          isActive: input.isActive ?? null,
          limit: input.limit,
          offset: input.offset,
        });
        return { items: rows, total, limit: input.limit, offset: input.offset };
      },
    );
  }

  async getLink(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    linkId: string;
  }): Promise<TrackingLinkRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const link = await trackingRepository.findLinkById(tx, input.organizationId, input.linkId);
        if (link === null) {
          throw AppError.notFound('Tracking link');
        }
        return link;
      },
    );
  }

  async createLink(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    campaignId: string;
    creatorId: string;
    channel: TrackingChannel;
    label?: string | null;
    destinationUrl?: string;
  }): Promise<TrackingLinkRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const campaign = await trackingRepository.findCampaign(
          tx,
          input.organizationId,
          input.campaignId,
        );
        if (campaign === null) {
          throw AppError.notFound('Campaign');
        }

        const creator = await trackingRepository.findCreator(tx, input.organizationId, input.creatorId);
        if (creator === null) {
          throw AppError.notFound('Creator');
        }

        // The creator must be assigned to the campaign: a link to an unassigned creator could
        // never produce an attribution.
        const assignment = await trackingRepository.findAssignment(
          tx,
          input.organizationId,
          input.campaignId,
          input.creatorId,
        );
        if (assignment === null) {
          throw AppError.unprocessable(
            'The creator is not assigned to this campaign, so the link could never attribute a sale.',
          );
        }

        const destinationUrl = input.destinationUrl ?? campaign.destination_url;
        assertHttps(destinationUrl);

        // The public code is globally unique; a collision is retried.
        let created: { id: string; code: string; created_at: Date } | null = null;
        let lastError: unknown = null;

        for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt += 1) {
          try {
            created = await trackingRepository.createLink(tx, {
              organizationId: input.organizationId,
              campaignId: input.campaignId,
              creatorId: input.creatorId,
              code: generateTrackingCode(),
              channel: input.channel,
              label: input.label ?? null,
              destinationUrl,
            });
            break;
          } catch (error) {
            lastError = error;
            if (!isUniqueViolation(error)) throw error;
          }
        }

        if (created === null) {
          throw AppError.conflict(
            'Could not generate a unique tracking code. Please try again.',
            lastError instanceof Error ? lastError.message : undefined,
          );
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'tracking_link.created',
          entityType: 'tracking_link',
          entityId: created.id,
          after: sanitiseForAudit({
            campaignId: input.campaignId,
            creatorId: input.creatorId,
            code: created.code,
            channel: input.channel,
            label: input.label ?? null,
            destinationUrl,
          }),
          requestId: input.requestId ?? null,
        });

        const link = await trackingRepository.findLinkById(tx, input.organizationId, created.id);
        if (link === null) {
          throw AppError.notFound('Tracking link');
        }
        return link;
      },
    );
  }

  async updateLink(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    linkId: string;
    label?: string | null;
    destinationUrl?: string;
    isActive?: boolean;
  }): Promise<TrackingLinkRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const before = await trackingRepository.findLinkById(tx, input.organizationId, input.linkId);
        if (before === null) {
          throw AppError.notFound('Tracking link');
        }

        if (input.destinationUrl !== undefined) {
          assertHttps(input.destinationUrl);
        }

        const updated = await trackingRepository.updateLink(tx, input.organizationId, input.linkId, {
          ...(input.label === undefined ? {} : { label: input.label }),
          ...(input.destinationUrl === undefined ? {} : { destinationUrl: input.destinationUrl }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        });
        if (!updated) {
          throw AppError.notFound('Tracking link');
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'tracking_link.updated',
          entityType: 'tracking_link',
          entityId: input.linkId,
          before: sanitiseForAudit({
            label: before.label,
            destinationUrl: before.destination_url,
            isActive: before.is_active,
          }),
          after: sanitiseForAudit({
            label: input.label === undefined ? before.label : input.label,
            destinationUrl: input.destinationUrl ?? before.destination_url,
            isActive: input.isActive ?? before.is_active,
          }),
          requestId: input.requestId ?? null,
        });

        const link = await trackingRepository.findLinkById(tx, input.organizationId, input.linkId);
        if (link === null) {
          throw AppError.notFound('Tracking link');
        }
        return link;
      },
    );
  }

  /** Soft delete — the link is deactivated so that history is preserved. */
  async deactivateLink(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    linkId: string;
  }): Promise<void> {
    await withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const before = await trackingRepository.findLinkById(tx, input.organizationId, input.linkId);
        if (before === null) {
          throw AppError.notFound('Tracking link');
        }

        await trackingRepository.deactivateLink(tx, input.organizationId, input.linkId);

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'tracking_link.deactivated',
          entityType: 'tracking_link',
          entityId: input.linkId,
          before: sanitiseForAudit({ isActive: before.is_active }),
          after: sanitiseForAudit({ isActive: false }),
          requestId: input.requestId ?? null,
        });
      },
    );
  }

  /* ---------------------------------------------------------- coupon codes */

  async listCoupons(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    limit: number;
    offset: number;
  }): Promise<{ items: CouponCodeRow[]; total: number; limit: number; offset: number }> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const { rows, total } = await trackingRepository.listCoupons(tx, input.organizationId, {
          limit: input.limit,
          offset: input.offset,
        });
        return { items: rows, total, limit: input.limit, offset: input.offset };
      },
    );
  }

  async createCoupon(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    campaignId: string;
    creatorId: string;
    code?: string;
    discountType: DiscountType;
    discountValue?: string | null;
    discountPercent?: number | null;
    maxRedemptions?: number | null;
    validFrom?: string | null;
    validUntil?: string | null;
  }): Promise<CouponCodeRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const campaign = await trackingRepository.findCampaign(
          tx,
          input.organizationId,
          input.campaignId,
        );
        if (campaign === null) {
          throw AppError.notFound('Campaign');
        }

        const creator = await trackingRepository.findCreator(tx, input.organizationId, input.creatorId);
        if (creator === null) {
          throw AppError.notFound('Creator');
        }

        const assignment = await trackingRepository.findAssignment(
          tx,
          input.organizationId,
          input.campaignId,
          input.creatorId,
        );
        if (assignment === null) {
          throw AppError.unprocessable(
            'The creator is not assigned to this campaign, so the coupon could never attribute a sale.',
          );
        }

        const code =
          input.code === undefined || input.code === null || input.code === ''
            ? generateCouponCode(creator.internal_code)
            : input.code.trim().toUpperCase();

        const existing = await trackingRepository.findCouponByCode(tx, input.organizationId, code);
        if (existing !== null) {
          throw AppError.conflict('A coupon with this code already exists.');
        }

        const discountValueMinor =
          input.discountValue === undefined || input.discountValue === null
            ? null
            : toMinor(input.discountValue);

        if (input.discountType === 'percentage' && input.discountPercent === undefined) {
          throw AppError.validation('A percentage coupon needs a discount percentage.');
        }
        if (input.discountType === 'fixed' && discountValueMinor === null) {
          throw AppError.validation('A fixed coupon needs a discount amount.');
        }

        const validFrom = input.validFrom ? toDate(input.validFrom) : null;
        const validUntil = input.validUntil ? toDate(input.validUntil) : null;
        if (validFrom !== null && validUntil !== null && validUntil.getTime() < validFrom.getTime()) {
          throw AppError.unprocessable('The coupon validity window ends before it starts.');
        }

        let created: { id: string; code: string; created_at: Date } | null = null;
        let lastError: unknown = null;

        for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt += 1) {
          try {
            created = await trackingRepository.createCoupon(tx, {
              organizationId: input.organizationId,
              campaignId: input.campaignId,
              creatorId: input.creatorId,
              code,
              discountType: input.discountType,
              discountValueMinor,
              discountPercent: input.discountPercent ?? null,
              maxRedemptions: input.maxRedemptions ?? null,
              validFrom,
              validUntil,
            });
            break;
          } catch (error) {
            lastError = error;
            if (!isUniqueViolation(error)) throw error;
          }
        }

        if (created === null) {
          throw AppError.conflict(
            'Could not generate a unique coupon code. Please try again.',
            lastError instanceof Error ? lastError.message : undefined,
          );
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'coupon.created',
          entityType: 'coupon_code',
          entityId: created.id,
          after: sanitiseForAudit({
            campaignId: input.campaignId,
            creatorId: input.creatorId,
            code: created.code,
            discountType: input.discountType,
            discountPercent: input.discountPercent ?? null,
            maxRedemptions: input.maxRedemptions ?? null,
          }),
          requestId: input.requestId ?? null,
        });

        const coupon = await trackingRepository.findCouponById(tx, input.organizationId, created.id);
        if (coupon === null) {
          throw AppError.notFound('Coupon code');
        }
        return coupon;
      },
    );
  }

  async updateCoupon(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    couponId: string;
    discountType?: DiscountType;
    discountValue?: string | null;
    discountPercent?: number | null;
    maxRedemptions?: number | null;
    validFrom?: string | null;
    validUntil?: string | null;
    isActive?: boolean;
  }): Promise<CouponCodeRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const before = await trackingRepository.findCouponById(tx, input.organizationId, input.couponId);
        if (before === null) {
          throw AppError.notFound('Coupon code');
        }

        const discountValueMinor =
          input.discountValue === undefined
            ? undefined
            : input.discountValue === null
              ? null
              : toMinor(input.discountValue);

        const validFrom =
          input.validFrom === undefined ? undefined : input.validFrom === null ? null : toDate(input.validFrom);
        const validUntil =
          input.validUntil === undefined ? undefined : input.validUntil === null ? null : toDate(input.validUntil);

        const updated = await trackingRepository.updateCoupon(tx, input.organizationId, input.couponId, {
          ...(input.discountType === undefined ? {} : { discountType: input.discountType }),
          ...(discountValueMinor === undefined ? {} : { discountValueMinor }),
          ...(input.discountPercent === undefined ? {} : { discountPercent: input.discountPercent }),
          ...(input.maxRedemptions === undefined ? {} : { maxRedemptions: input.maxRedemptions }),
          ...(validFrom === undefined ? {} : { validFrom }),
          ...(validUntil === undefined ? {} : { validUntil }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        });
        if (!updated) {
          throw AppError.notFound('Coupon code');
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'coupon.updated',
          entityType: 'coupon_code',
          entityId: input.couponId,
          before: sanitiseForAudit({
            discountType: before.discount_type,
            discountPercent: before.discount_percent,
            maxRedemptions: before.max_redemptions,
            isActive: before.is_active,
          }),
          after: sanitiseForAudit({
            discountType: input.discountType ?? before.discount_type,
            discountPercent:
              input.discountPercent === undefined ? before.discount_percent : input.discountPercent,
            maxRedemptions:
              input.maxRedemptions === undefined ? before.max_redemptions : input.maxRedemptions,
            isActive: input.isActive ?? before.is_active,
          }),
          requestId: input.requestId ?? null,
        });

        const coupon = await trackingRepository.findCouponById(tx, input.organizationId, input.couponId);
        if (coupon === null) {
          throw AppError.notFound('Coupon code');
        }
        return coupon;
      },
    );
  }

  async deactivateCoupon(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    couponId: string;
  }): Promise<void> {
    await withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const before = await trackingRepository.findCouponById(tx, input.organizationId, input.couponId);
        if (before === null) {
          throw AppError.notFound('Coupon code');
        }

        await trackingRepository.deactivateCoupon(tx, input.organizationId, input.couponId);

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'coupon.deactivated',
          entityType: 'coupon_code',
          entityId: input.couponId,
          before: sanitiseForAudit({ isActive: before.is_active }),
          after: sanitiseForAudit({ isActive: false }),
          requestId: input.requestId ?? null,
        });
      },
    );
  }

  /* -------------------------------------------------------- tracking events */

  async listEvents(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    campaignId?: string | null;
    creatorId?: string | null;
    from?: Date | null;
    to?: Date | null;
    limit: number;
    offset: number;
  }): Promise<{ items: TrackingEventRow[]; total: number; limit: number; offset: number }> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const { rows, total } = await trackingRepository.listEvents(tx, input.organizationId, {
          campaignId: input.campaignId ?? null,
          creatorId: input.creatorId ?? null,
          from: input.from ?? null,
          to: input.to ?? null,
          limit: input.limit,
          offset: input.offset,
        });
        return { items: rows, total, limit: input.limit, offset: input.offset };
      },
    );
  }

  /* ------------------------------------------------------- public redirect */

  /**
   * Resolve a public tracking code.
   *
   * Returns `null` when the code does not exist, the link is inactive or the campaign is not
   * active. The caller must answer `404` in all three cases — the response never reveals
   * whether the code exists.
   *
   * The destination always comes from the database. Nothing in the request (query string
   * included) can influence it.
   */
  async resolvePublicRedirect(input: {
    code: string;
    ip: string;
    userAgent?: string | null;
    referrer?: string | null;
    visitorToken?: string | null;
  }): Promise<PublicRedirectResult | null> {
    const code = normalizeTrackingCode(input.code);

    const link = await withSystemContext(this.db, async (tx) =>
      trackingRepository.findLinkByCode(tx, code),
    );

    if (link === null) return null;
    if (!link.is_active) return null;
    if (link.campaign_status !== 'active') return null;

    const env = getEnv();
    const userAgent = truncate(input.userAgent ?? null, 512);
    const referrer = truncate(input.referrer ?? null, 1024);

    // Raw IP addresses are never stored.
    const fingerprint = createHash('sha256').update(`${input.ip}${userAgent ?? ''}`).digest('hex');
    const ipHash = createHash('sha256').update(`${input.ip}${env.IP_HASH_PEPPER}`).digest('hex');

    const visitorTokenIsNew = input.visitorToken === null || input.visitorToken === '';
    const visitorToken = visitorTokenIsNew ? generateSecureToken(16) : (input.visitorToken as string);

    const windowSeconds = env.TRACKING_DEDUPE_WINDOW_SECONDS;
    const since = new Date(Date.now() - windowSeconds * 1000);

    const deduplicated = await withOrgContext(
      this.db,
      { organizationId: link.organization_id, userId: null, role: 'analyst' },
      async (tx) => {
        const existing = await trackingRepository.findRecentEventByFingerprint(
          tx,
          link.id,
          fingerprint,
          since,
        );

        if (existing !== null) {
          await trackingRepository.incrementRepeatCount(tx, existing.id);
          return true;
        }

        await trackingRepository.insertEvent(tx, {
          organizationId: link.organization_id,
          trackingLinkId: link.id,
          campaignId: link.campaign_id,
          creatorId: link.creator_id,
          occurredAt: new Date(),
          visitorToken,
          fingerprint,
          ipHash,
          userAgent,
          referrer,
        });
        return false;
      },
    );

    const destination = appendReferralParameter(
      link.destination_url,
      code,
      env.TRACKING_PROPAGATE_REF_PARAM && propagateRefEnabled(link.organization_settings),
    );

    return { destination, visitorToken, visitorTokenIsNew, deduplicated };
  }
}

function truncate(value: string | null, maxLength: number): string | null {
  if (value === null) return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * The organisation may switch the referral parameter off explicitly.
 *
 * `settings.propagateRefParam === false` disables it; the setting is absent by default, so the
 * platform-level switch (`TRACKING_PROPAGATE_REF_PARAM`) decides.
 */
function propagateRefEnabled(settings: Record<string, unknown>): boolean {
  if (!settings || typeof settings !== 'object') return true;
  return settings['propagateRefParam'] !== false;
}

/**
 * Append `st_ref=<code>` to the destination.
 *
 * This is the documented cookie-less attribution strategy: the brand's site echoes `st_ref` into
 * the order's `referral_identifier` column.
 */
export function appendReferralParameter(
  destinationUrl: string,
  code: string,
  enabled: boolean,
): string {
  if (!enabled) return destinationUrl;
  const separator = destinationUrl.includes('?') ? '&' : '?';
  return `${destinationUrl}${separator}st_ref=${encodeURIComponent(code)}`;
}
