/**
 * Cross-Site Request Forgery protection.
 *
 * The session cookie is `SameSite=Lax` and the browser only ever talks to one origin (the web
 * app proxies the API), so a cross-site form post cannot carry the cookie. As a second,
 * independent layer, every state-changing request must present an `Origin` (or `Referer`)
 * header that matches an allowed origin.
 */

import type { NextFunction, Request, Response } from 'express';

import { getEnv } from '../config/env.js';
import { AppError } from '../shared/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originAllowed(origin: string, allowed: readonly string[]): boolean {
  if (allowed.length === 0) {
    // Without an explicit allowlist, fall back to the API's own base URL.
    return origin === getEnv().API_BASE_URL.replace(/\/$/, '');
  }
  return allowed.includes(origin.replace(/\/$/, ''));
}

export function createCsrfGuard() {
  return function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    // A bearer token is not an ambient credential: the browser cannot attach it to a
    // cross-site request without a CORS preflight, so CSRF does not apply to it. Only
    // cookie-authenticated requests need the origin check.
    if (req.header('authorization') !== undefined) {
      next();
      return;
    }

    const allowed = getEnv().CORS_ALLOWED_ORIGINS;
    const origin = req.header('origin');
    const referer = req.header('referer');

    const candidate = origin ?? (referer ? safeOriginFromReferer(referer) : undefined);

    if (candidate === undefined) {
      next(
        AppError.forbidden(
          'The request is missing an Origin header. State-changing requests must come from the application.',
        ),
      );
      return;
    }

    if (!originAllowed(candidate, allowed)) {
      next(AppError.forbidden('The request origin is not allowed.'));
      return;
    }

    next();
  };
}

function safeOriginFromReferer(referer: string): string | undefined {
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
