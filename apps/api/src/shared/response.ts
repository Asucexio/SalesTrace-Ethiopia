/**
 * Response envelope helpers.
 *
 * Every successful response is `{ data, meta }` and every failure is `{ error, meta }`
 * (see `docs/api-specification.md` §1.1).
 */

import type { Response } from 'express';

import type { ApiMeta, ApiSuccess, Paginated } from '@salestrace/shared-types';

export function requestIdOf(res: Response): string {
  const existing = res.getHeader('X-Request-Id');
  return typeof existing === 'string' && existing.length > 0 ? existing : 'unknown';
}

export function sendData<T>(res: Response, data: T, status = 200, meta?: Partial<ApiMeta>): void {
  const body: ApiSuccess<T> = {
    data,
    meta: { requestId: requestIdOf(res), ...meta },
  };
  res.status(status).json(body);
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  total: number,
  limit: number,
  offset: number,
): void {
  const body: ApiSuccess<Paginated<T>> = {
    data: { items, total, limit, offset },
    meta: { requestId: requestIdOf(res), total, limit, offset },
  };
  res.status(200).json(body);
}
