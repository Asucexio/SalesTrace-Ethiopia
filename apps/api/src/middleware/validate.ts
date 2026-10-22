/**
 * Request validation middleware.
 *
 * Every untrusted input — body, query and path parameters — is parsed with a Zod schema at the
 * system boundary. Unknown keys are stripped rather than passed through, which prevents mass
 * assignment of fields such as `organization_id` or `is_valid_sale`.
 */

import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';

import { AppError } from '../shared/errors.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function toFieldIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function validate(schemas: ValidationSchemas) {
  return function validationMiddleware(req: Request, _res: Response, next: NextFunction): void {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        // Express 4 exposes `req.query` as a getter-only property in some versions; assign
        // through a cast to keep the parsed value.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
        });
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body ?? {});
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(AppError.validation('Request validation failed.', toFieldIssues(error)));
        return;
      }
      next(error);
    }
  };
}
