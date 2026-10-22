/**
 * Authorisation middleware.
 *
 * Checks the capability required by the route against the role carried in the request context.
 * Runs before the handler, so an unauthorised request never reaches business logic.
 */

import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../shared/errors.js';
import { roleHasCapability, type Capability } from '../shared/capabilities.js';

export function requireCapability(capability: Capability) {
  return function capabilityMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const auth = req.auth;
    if (!auth) {
      next(AppError.unauthenticated());
      return;
    }

    if (!roleHasCapability(auth.role, capability)) {
      next(
        AppError.forbidden(
          `Your role (${auth.role}) is not permitted to perform this action. Required capability: ${capability}.`,
        ),
      );
      return;
    }

    next();
  };
}
