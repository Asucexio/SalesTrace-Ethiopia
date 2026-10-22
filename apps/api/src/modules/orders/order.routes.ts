import express, { Router, type RequestHandler } from 'express';

import { orderListQuerySchema } from '@salestrace/validation';

import { getEnv } from '../../config/env.js';
import { requireCapability } from '../../middleware/authorize.js';
import { importRateLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';

import type { OrderControllerDeps } from './order.controller.js';
import { createOrderController } from './order.controller.js';

/**
 * Accepts the uploaded CSV as the raw request body.
 *
 * The client sends the file directly with `Content-Type: text/csv`, which avoids a multipart
 * parser and keeps the upload size bounded by Express.
 */
function csvUpload(): RequestHandler {
  const limit = getEnv().MAX_UPLOAD_BYTES;

  return express.raw({
    type: ['text/csv', 'application/csv', 'application/octet-stream'],
    limit,
  });
}

export function createOrderRoutes(deps: OrderControllerDeps): Router {
  const router = Router();
  const controller = createOrderController(deps);

  router.get('/', requireCapability('order:read'), validate({ query: orderListQuerySchema }), (req, res, next) => {
    controller.list(req, res).catch(next);
  });

  router.get(
    '/imports',
    requireCapability('order:read'),
    validate({ query: orderListQuerySchema.pick({ limit: true, offset: true }) }),
    (req, res, next) => {
      controller.listImports(req, res).catch(next);
    },
  );

  router.post(
    '/imports',
    requireCapability('order:write'),
    importRateLimiter,
    csvUpload(),
    (req, res, next) => {
      controller.createImport(req, res).catch(next);
    },
  );

  router.get('/imports/:importId', requireCapability('order:read'), (req, res, next) => {
    controller.importDetail(req, res).catch(next);
  });

  router.put(
    '/imports/:importId/mapping',
    requireCapability('order:write'),
    (req, res, next) => {
      controller.setMapping(req, res).catch(next);
    },
  );

  router.post('/imports/:importId/preview', requireCapability('order:write'), (req, res, next) => {
    controller.previewImport(req, res).catch(next);
  });

  router.post('/imports/:importId/commit', requireCapability('order:write'), (req, res, next) => {
    controller.commitImport(req, res).catch(next);
  });

  router.get('/imports/:importId/errors.csv', requireCapability('order:read'), (req, res, next) => {
    controller.errorReport(req, res).catch(next);
  });

  router.get('/:orderId', requireCapability('order:read'), (req, res, next) => {
    controller.detail(req, res).catch(next);
  });

  router.post('/:orderId/refunds', requireCapability('order:write'), (req, res, next) => {
    controller.recordRefund(req, res).catch(next);
  });

  return router;
}
