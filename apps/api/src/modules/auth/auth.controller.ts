/**
 * Authentication controller.
 *
 * Translates HTTP requests into service calls. It contains no business rules beyond the
 * translation of a session into a cookie.
 */

import type { Request, Response } from 'express';

import { getEnv } from '../../config/env.js';
import { readSessionToken } from '../../middleware/auth.js';
import { serializeCookie } from '../../shared/cookies.js';
import { AppError } from '../../shared/errors.js';
import { sendData } from '../../shared/response.js';

import type { AuthService } from './auth.service.js';

export function setSessionCookie(res: Response, token: string): void {
  const env = getEnv();
  res.append(
    'Set-Cookie',
    serializeCookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/api',
      maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
    }),
  );
}

export function clearSessionCookie(res: Response): void {
  const env = getEnv();
  res.append(
    'Set-Cookie',
    serializeCookie(env.SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/api',
      maxAge: 0,
    }),
  );
}

export function createAuthController(service: AuthService) {
  return {
    async register(req: Request, res: Response): Promise<void> {
      const body = req.body as { email: string; password: string; fullName?: string };

      const result = await service.register({
        email: body.email,
        password: body.password,
        ...(body.fullName === undefined ? {} : { fullName: body.fullName }),
      });

      // In local mode there is no mail provider, so the verification token is returned to the
      // caller. In Supabase mode the provider sends the email and no token is included.
      sendData(
        res,
        {
          user: result.user,
          verificationRequired: result.verificationRequired,
          ...(result.verificationToken === undefined ? {} : { verificationToken: result.verificationToken }),
        },
        201,
      );
    },

    async login(req: Request, res: Response): Promise<void> {
      const body = req.body as { email: string; password: string };

      const { token, info } = await service.login({ email: body.email, password: body.password });

      setSessionCookie(res, token);
      sendData(res, info);
    },

    async logout(req: Request, res: Response): Promise<void> {
      const token = req.auth?.sessionToken;
      if (token !== undefined) {
        await service.logout(token);
      }
      clearSessionCookie(res);
      res.status(204).end();
    },

    async me(req: Request, res: Response): Promise<void> {
      const token = readSessionToken(req);
      if (token === null) {
        throw AppError.unauthenticated();
      }

      const info = await service.sessionInfo(token);
      if (info === null) {
        throw AppError.unauthenticated('Your session has expired. Please sign in again.');
      }

      sendData(res, info);
    },

    async verifyEmail(req: Request, res: Response): Promise<void> {
      const body = req.body as { token: string };
      await service.verifyEmail(body.token);
      res.status(204).end();
    },

    async forgotPassword(req: Request, res: Response): Promise<void> {
      const body = req.body as { email: string };
      const token = await service.forgotPassword(body.email);

      // The response is identical whether or not the account exists, so the endpoint cannot be
      // used to discover registered addresses. In local mode the token is returned because
      // there is no mail provider; in Supabase mode the email carries the link.
      sendData(
        res,
        token === null ? { accepted: true } : { accepted: true, verificationToken: token },
        202,
      );
    },

    async resetPassword(req: Request, res: Response): Promise<void> {
      const body = req.body as { token: string; newPassword: string };
      await service.resetPassword(body.token, body.newPassword);
      res.status(204).end();
    },

    async switchOrganization(req: Request, res: Response): Promise<void> {
      const token = req.auth?.sessionToken;
      if (token === undefined) {
        throw AppError.unauthenticated();
      }

      const body = req.body as { organizationId: string };
      const info = await service.switchOrganization(token, body.organizationId);

      sendData(res, info);
    },
  };
}
