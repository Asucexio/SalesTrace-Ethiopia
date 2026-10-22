/**
 * Tracking routes.
 *
 * Two routers live here:
 *
 * - `createTrackingRoutes` — the tenant API (`/api/v1/tracking-links`, `/api/v1/coupon-codes`,
 *   `/api/v1/tracking-events`). It requires a session.
 * - `createPublicTrackingRoutes` — the public redirect (`GET /r/:code`). It is mounted at the
 *   application root, **not** under `/api/v1`, and needs no session.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';

import {
  createCouponCodeSchema,
  createTrackingLinkSchema,
  trackingEventListQuerySchema,
  trackingLinkListQuerySchema,
  updateCouponCodeSchema,
  updateTrackingLinkSchema,
  z,
} from '@salestrace/validation';

import { requireCapability } from '../../middleware/authorize.js';
import { trackingRateLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { parseCookies, serializeCookie } from '../../shared/cookies.js';

import type { TrackingService } from './tracking.service.js';
import { createTrackingController } from './tracking.controller.js';
import { VISITOR_COOKIE_MAX_AGE, VISITOR_COOKIE_NAME } from './tracking.service.js';

/** Pagination for the coupon list. */
const couponListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** The client IP, honouring the first entry of `x-forwarded-for`. */
export function clientIp(req: {
  header(name: string): string | undefined;
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.header('x-forwarded-for');
  const fromForwarded = forwarded?.split(',')[0]?.trim();
  if (fromForwarded) return fromForwarded;
  if (req.ip) return req.ip;
  return req.socket?.remoteAddress ?? 'unknown';
}

export function createTrackingRoutes(service: TrackingService): Router {
  const router = Router();
  const controller = createTrackingController(service);

  router.get(
    '/tracking-links',
    requireCapability('tracking:read'),
    validate({ query: trackingLinkListQuerySchema }),
    (req, res, next) => {
      controller.listLinks(req, res).catch(next);
    },
  );

  router.post(
    '/tracking-links',
    requireCapability('tracking:write'),
    validate({ body: createTrackingLinkSchema }),
    (req, res, next) => {
      controller.createLink(req, res).catch(next);
    },
  );

  router.get(
    '/tracking-links/:linkId',
    requireCapability('tracking:read'),
    (req, res, next) => {
      controller.getLink(req, res).catch(next);
    },
  );

  router.patch(
    '/tracking-links/:linkId',
    requireCapability('tracking:write'),
    validate({ body: updateTrackingLinkSchema }),
    (req, res, next) => {
      controller.updateLink(req, res).catch(next);
    },
  );

  router.delete(
    '/tracking-links/:linkId',
    requireCapability('tracking:write'),
    (req, res, next) => {
      controller.deactivateLink(req, res).catch(next);
    },
  );

  router.get(
    '/tracking-links/:linkId/qrcode',
    requireCapability('tracking:read'),
    (req, res, next) => {
      controller.qrCode(req, res).catch(next);
    },
  );

  router.get(
    '/coupon-codes',
    requireCapability('tracking:read'),
    validate({ query: couponListQuerySchema }),
    (req, res, next) => {
      controller.listCoupons(req, res).catch(next);
    },
  );

  router.post(
    '/coupon-codes',
    requireCapability('tracking:write'),
    validate({ body: createCouponCodeSchema }),
    (req, res, next) => {
      controller.createCoupon(req, res).catch(next);
    },
  );

  router.patch(
    '/coupon-codes/:couponId',
    requireCapability('tracking:write'),
    validate({ body: updateCouponCodeSchema }),
    (req, res, next) => {
      controller.updateCoupon(req, res).catch(next);
    },
  );

  router.delete(
    '/coupon-codes/:couponId',
    requireCapability('tracking:write'),
    (req, res, next) => {
      controller.deactivateCoupon(req, res).catch(next);
    },
  );

  router.get(
    '/tracking-events',
    requireCapability('tracking:read'),
    validate({ query: trackingEventListQuerySchema }),
    (req, res, next) => {
      controller.listEvents(req, res).catch(next);
    },
  );

  return router;
}

/**
 * The public redirect.
 *
 * Mount this router at the application root (`/r/:code`) or in front of the `/r` prefix
 * (`/:code`); both shapes are registered so the router fits either assembly.
 *
 * The response is a `302` to the destination stored with the tracking link. An unknown, inactive
 * or non-active code answers `404` with a short plain-text body, so the endpoint never reveals
 * whether a code exists.
 */
export function createPublicTrackingRoutes(service: TrackingService): Router {
  const router = Router();

  const handler = (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const code = req.params['code'];
      if (!code) {
        res.status(404).type('text/plain').send('Not found');
        return;
      }

      const cookies = parseCookies(req.headers.cookie);
      const visitorToken = cookies[VISITOR_COOKIE_NAME] ?? null;

      const result = await service.resolvePublicRedirect({
        code,
        ip: clientIp(req),
        userAgent: req.header('user-agent') ?? null,
        referrer: req.header('referer') ?? null,
        visitorToken,
      });

      if (result === null) {
        res.status(404).type('text/plain').send('Not found');
        return;
      }

      if (result.visitorTokenIsNew) {
        res.setHeader(
          'Set-Cookie',
          serializeCookie(VISITOR_COOKIE_NAME, result.visitorToken, {
            maxAge: VISITOR_COOKIE_MAX_AGE,
            httpOnly: false,
            sameSite: 'lax',
            path: '/',
          }),
        );
      }

      // The destination always comes from the database — never from the request.
      res.redirect(302, result.destination);
    })().catch(next);
  };

  // Mounted at the application root.
  router.get('/r/:code', trackingRateLimiter, handler);
  // Mounted in front of the `/r` prefix.
  router.get('/:code', trackingRateLimiter, handler);

  return router;
}
