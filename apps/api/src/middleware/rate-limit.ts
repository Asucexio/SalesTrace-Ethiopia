/**
 * Rate limiting.
 *
 * Separate limiters for the public tracking endpoint, the authentication endpoints and the
 * regular API. Keys are hashed before they are used or stored: raw IP addresses are never
 * persisted.
 */

import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';

import { getEnv } from '../config/env.js';

/** A stable, non-reversible key for a request. */
export function requestKey(req: Request): string {
  const userId = req.auth?.profileId;
  if (userId) return `u:${userId}`;

  const forwarded = req.header('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';
  const pepper = getEnv().IP_HASH_PEPPER;

  return `ip:${createHash('sha256').update(`${pepper}:${ip}`).digest('hex').slice(0, 32)}`;
}

/** Respond with the standard error envelope rather than plain text. */
function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
    meta: { requestId: res.getHeader('X-Request-Id') ?? 'unknown' },
  });
}

function limiter(options: Partial<Options>): ReturnType<typeof rateLimit> {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => requestKey(req),
    handler: rateLimitHandler,
    ...options,
  });
}

/** Public tracking endpoint — generous, but bounded. */
export const trackingRateLimiter = limiter({
  windowMs: 60_000,
  limit: 120,
});

/** Authentication endpoints — strict, to blunt credential stuffing. */
export const authRateLimiter = limiter({
  windowMs: 15 * 60_000,
  limit: 10,
});

/** CSV import endpoints — expensive operations, limited per organization. */
export const importRateLimiter = limiter({
  windowMs: 10 * 60_000,
  limit: getEnv().IMPORT_RATE_LIMIT,
  keyGenerator: (req: Request) => `org:${req.auth?.organizationId ?? 'anonymous'}`,
});

/** Everything else. */
export const apiRateLimiter = limiter({
  windowMs: 60_000,
  limit: 300,
});
