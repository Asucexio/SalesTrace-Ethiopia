/**
 * Request correlation id.
 *
 * Every request gets an id: the client's `X-Request-Id` when it looks sane, otherwise a fresh
 * one. The id is echoed in the response, attached to every log line and stored on audit events.
 */

import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}
