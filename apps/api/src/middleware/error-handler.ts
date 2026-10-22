/**
 * Centralised error handling.
 *
 * Deliberate errors (`AppError`) become a stable JSON body. Unexpected errors are logged with
 * their stack and reported as a generic `INTERNAL_ERROR` with the request id — a client never
 * receives a stack trace, SQL statement or infrastructure detail.
 */

import type { NextFunction, Request, Response } from 'express';

import { getLogger } from '../shared/logger.js';
import { AppError, isAppError } from '../shared/errors.js';
import { requestIdOf } from '../shared/response.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound('Endpoint'));
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const logger = getLogger();
  const requestId = requestIdOf(res);

  if (isAppError(error)) {
    if (error.status >= 500) {
      logger.error({ err: error, requestId, path: req.path }, 'Request failed');
    } else {
      logger.warn(
        { code: error.code, requestId, path: req.path, method: req.method },
        'Request rejected',
      );
    }

    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      meta: { requestId },
    });
    return;
  }

  logger.error({ err: error, requestId, path: req.path, method: req.method }, 'Unhandled error');

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please contact support with the request id.',
    },
    meta: { requestId },
  });
}
