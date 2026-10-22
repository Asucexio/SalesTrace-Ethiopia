/**
 * Authentication middleware.
 *
 * Resolves the session cookie (or bearer token) into a request context. The active organization
 * comes from the **session**, never from a request body or query parameter — this is the first
 * of the three tenant-isolation layers.
 */

import type { NextFunction, Request, Response } from 'express';

import type { OrganizationRole } from '@salestrace/shared-types';

import { getEnv } from '../config/env.js';
import { AppError } from '../shared/errors.js';
import type { RequestAuth } from '../shared/express.js';
import type { SessionService } from '../modules/auth/session.service.js';

export interface MembershipLookup {
  (organizationId: string, profileId: string): Promise<{ role: OrganizationRole } | null>;
}

export interface AuthMiddlewareDeps {
  sessionService: SessionService;
  resolveMembership: MembershipLookup;
}

/** Read the session token from the cookie jar or the `Authorization` header. */
export function readSessionToken(req: Request): string | null {
  const authorization = req.header('authorization');
  if (authorization && authorization.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    if (token.length > 0) return token;
  }

  const env = getEnv();
  const fromCookie = (req.cookies as Record<string, string> | undefined)?.[env.SESSION_COOKIE_NAME];
  return fromCookie && fromCookie.length > 0 ? fromCookie : null;
}

export function createAuthMiddleware(deps: AuthMiddlewareDeps) {
  return async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const token = readSessionToken(req);
      if (token === null) {
        throw AppError.unauthenticated();
      }

      const session = await deps.sessionService.resolve(token);
      if (session === null) {
        throw AppError.unauthenticated('Your session has expired. Please sign in again.');
      }

      if (session.organizationId === null) {
        throw AppError.forbidden('No organization is selected for this session.');
      }

      const membership = await deps.resolveMembership(session.organizationId, session.profile.id);
      if (membership === null) {
        throw AppError.forbidden('You are not a member of the selected organization.');
      }

      const auth: RequestAuth = {
        profileId: session.profile.id,
        email: session.profile.email,
        fullName: session.profile.fullName,
        emailVerified: session.profile.emailVerified,
        organizationId: session.organizationId,
        role: membership.role,
        sessionToken: token,
      };

      req.auth = auth;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Resolves the session **without** requiring an active organization.
 *
 * Used by the endpoint that creates the first organization: at that point the user is
 * authenticated but cannot yet have an organization in their session.
 */
export function createSessionMiddleware(deps: AuthMiddlewareDeps) {
  return async function sessionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const token = readSessionToken(req);
      if (token === null) {
        throw AppError.unauthenticated();
      }

      const session = await deps.sessionService.resolve(token);
      if (session === null) {
        throw AppError.unauthenticated('Your session has expired. Please sign in again.');
      }

      req.session = {
        profileId: session.profile.id,
        email: session.profile.email,
        fullName: session.profile.fullName,
        emailVerified: session.profile.emailVerified,
        organizationId: session.organizationId,
        sessionToken: token,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
