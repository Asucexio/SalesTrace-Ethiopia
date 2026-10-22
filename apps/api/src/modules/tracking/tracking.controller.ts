/**
 * Tracking controller.
 *
 * HTTP translation only: the service owns the rules, the repository owns the SQL.
 */

import type { Request, Response } from 'express';

import { minorToDecimalString, type DiscountType, type TrackingChannel } from '@salestrace/shared-types';

import { getEnv } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { sendData, sendPaginated } from '../../shared/response.js';
import { encodeQrCode, renderQrCodeSvg } from '../../shared/qrcode.js';

import type { CouponCodeRow, TrackingEventRow, TrackingLinkRow } from './tracking.repository.js';
import type { TrackingService } from './tracking.service.js';

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** The public URL of a tracking link. */
export function trackingLinkUrl(code: string): string {
  return `${getEnv().PUBLIC_BASE_URL.replace(/\/$/, '')}/r/${code}`;
}

/** The URL of the QR code image of a tracking link. */
export function trackingQrCodeUrl(linkId: string): string {
  return `${getEnv().API_BASE_URL.replace(/\/$/, '')}/api/v1/tracking-links/${linkId}/qrcode`;
}

export function mapTrackingLink(link: TrackingLinkRow) {
  return {
    id: link.id,
    organizationId: link.organization_id,
    campaignId: link.campaign_id,
    campaignName: link.campaign_name,
    creatorId: link.creator_id,
    creatorName: link.creator_name,
    code: link.code,
    channel: link.channel,
    label: link.label,
    destinationUrl: link.destination_url,
    url: trackingLinkUrl(link.code),
    qrCodeUrl: trackingQrCodeUrl(link.id),
    isActive: link.is_active,
    createdAt: iso(link.created_at),
  };
}

export function mapCouponCode(coupon: CouponCodeRow) {
  return {
    id: coupon.id,
    organizationId: coupon.organization_id,
    campaignId: coupon.campaign_id,
    campaignName: coupon.campaign_name,
    creatorId: coupon.creator_id,
    creatorName: coupon.creator_name,
    code: coupon.code,
    discountType: coupon.discount_type,
    discountPercent:
      coupon.discount_percent === null || coupon.discount_percent === undefined
        ? null
        : Number(coupon.discount_percent).toFixed(2),
    discountValue:
      coupon.discount_value_minor === null || coupon.discount_value_minor === undefined
        ? null
        : minorToDecimalString(Number(coupon.discount_value_minor)),
    maxRedemptions: coupon.max_redemptions,
    redemptionCount: coupon.redemption_count,
    validFrom: coupon.valid_from === null ? null : iso(coupon.valid_from),
    validUntil: coupon.valid_until === null ? null : iso(coupon.valid_until),
    isActive: coupon.is_active,
    createdAt: iso(coupon.created_at),
  };
}

export function mapTrackingEvent(event: TrackingEventRow) {
  return {
    id: event.id,
    campaignId: event.campaign_id,
    campaignName: event.campaign_name,
    creatorId: event.creator_id,
    creatorName: event.creator_name,
    trackingLinkId: event.tracking_link_id,
    occurredAt: iso(event.occurred_at),
    repeatCount: event.repeat_count,
    referrer: event.referrer,
  };
}

export function createTrackingController(service: TrackingService) {
  return {
    async listLinks(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const query = req.query as unknown as {
        campaignId?: string;
        creatorId?: string;
        channel?: TrackingChannel;
        isActive?: boolean;
        limit: number;
        offset: number;
      };

      const result = await service.listLinks({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        campaignId: query.campaignId ?? null,
        creatorId: query.creatorId ?? null,
        channel: query.channel ?? null,
        isActive: query.isActive ?? null,
        limit: query.limit,
        offset: query.offset,
      });

      sendPaginated(res, result.items.map(mapTrackingLink), result.total, result.limit, result.offset);
    },

    async createLink(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const body = req.body as {
        campaignId: string;
        creatorId: string;
        channel: TrackingChannel;
        label?: string | null;
        destinationUrl?: string;
      };

      const link = await service.createLink({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        campaignId: body.campaignId,
        creatorId: body.creatorId,
        channel: body.channel,
        label: body.label ?? null,
        ...(body.destinationUrl === undefined ? {} : { destinationUrl: body.destinationUrl }),
      });

      sendData(res, mapTrackingLink(link), 201);
    },

    async getLink(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const linkId = req.params['linkId'];
      if (!linkId) throw AppError.notFound('Tracking link');

      const link = await service.getLink({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        linkId,
      });

      sendData(res, mapTrackingLink(link));
    },

    async updateLink(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const linkId = req.params['linkId'];
      if (!linkId) throw AppError.notFound('Tracking link');

      const body = req.body as {
        label?: string | null;
        destinationUrl?: string;
        isActive?: boolean;
      };

      const link = await service.updateLink({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        linkId,
        ...body,
      });

      sendData(res, mapTrackingLink(link));
    },

    async deactivateLink(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const linkId = req.params['linkId'];
      if (!linkId) throw AppError.notFound('Tracking link');

      await service.deactivateLink({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        linkId,
      });

      res.status(204).end();
    },

    async qrCode(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const linkId = req.params['linkId'];
      if (!linkId) throw AppError.notFound('Tracking link');

      const link = await service.getLink({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        linkId,
      });

      const svg = renderQrCodeSvg(encodeQrCode(trackingLinkUrl(link.code)));
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type('image/svg+xml').send(svg);
    },

    async listCoupons(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const query = req.query as unknown as { limit: number; offset: number };

      const result = await service.listCoupons({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        limit: query.limit,
        offset: query.offset,
      });

      sendPaginated(res, result.items.map(mapCouponCode), result.total, result.limit, result.offset);
    },

    async createCoupon(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const body = req.body as {
        campaignId: string;
        creatorId: string;
        code?: string;
        discountType: DiscountType;
        discountValue?: string | null;
        discountPercent?: number | null;
        maxRedemptions?: number | null;
        validFrom?: string | null;
        validUntil?: string | null;
      };

      const coupon = await service.createCoupon({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        campaignId: body.campaignId,
        creatorId: body.creatorId,
        ...(body.code === undefined ? {} : { code: body.code }),
        discountType: body.discountType,
        discountValue: body.discountValue ?? null,
        discountPercent: body.discountPercent ?? null,
        maxRedemptions: body.maxRedemptions ?? null,
        validFrom: body.validFrom ?? null,
        validUntil: body.validUntil ?? null,
      });

      sendData(res, mapCouponCode(coupon), 201);
    },

    async updateCoupon(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const couponId = req.params['couponId'];
      if (!couponId) throw AppError.notFound('Coupon code');

      const body = req.body as {
        discountType?: DiscountType;
        discountValue?: string | null;
        discountPercent?: number | null;
        maxRedemptions?: number | null;
        validFrom?: string | null;
        validUntil?: string | null;
        isActive?: boolean;
      };

      const coupon = await service.updateCoupon({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        couponId,
        ...body,
      });

      sendData(res, mapCouponCode(coupon));
    },

    async deactivateCoupon(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const couponId = req.params['couponId'];
      if (!couponId) throw AppError.notFound('Coupon code');

      await service.deactivateCoupon({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        couponId,
      });

      res.status(204).end();
    },

    async listEvents(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const query = req.query as unknown as {
        campaignId?: string;
        creatorId?: string;
        from?: string;
        to?: string;
        limit: number;
        offset: number;
      };

      const result = await service.listEvents({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        campaignId: query.campaignId ?? null,
        creatorId: query.creatorId ?? null,
        from: query.from ? new Date(query.from) : null,
        to: query.to ? new Date(query.to) : null,
        limit: query.limit,
        offset: query.offset,
      });

      sendPaginated(res, result.items.map(mapTrackingEvent), result.total, result.limit, result.offset);
    },
  };
}
