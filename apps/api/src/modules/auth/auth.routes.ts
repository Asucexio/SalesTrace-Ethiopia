import { Router } from 'express';

import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@salestrace/validation';

import { authRateLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';

import type { AuthService } from './auth.service.js';
import { createAuthController } from './auth.controller.js';

export function createAuthRoutes(service: AuthService): Router {
  const router = Router();
  const controller = createAuthController(service);

  router.post('/register', authRateLimiter, validate({ body: registerSchema }), (req, res, next) => {
    controller.register(req, res).catch(next);
  });

  router.post('/login', authRateLimiter, validate({ body: loginSchema }), (req, res, next) => {
    controller.login(req, res).catch(next);
  });

  router.post('/logout', (req, res, next) => {
    controller.logout(req, res).catch(next);
  });

  router.get('/me', (req, res, next) => {
    controller.me(req, res).catch(next);
  });

  router.post('/verify-email', authRateLimiter, validate({ body: verifyEmailSchema }), (req, res, next) => {
    controller.verifyEmail(req, res).catch(next);
  });

  router.post('/forgot-password', authRateLimiter, validate({ body: forgotPasswordSchema }), (req, res, next) => {
    controller.forgotPassword(req, res).catch(next);
  });

  router.post('/reset-password', authRateLimiter, validate({ body: resetPasswordSchema }), (req, res, next) => {
    controller.resetPassword(req, res).catch(next);
  });

  // `POST /auth/switch-organization` is registered in `app.ts`: it resolves the session itself,
  // because the target organization may not be the one the session currently points at.

  return router;
}
