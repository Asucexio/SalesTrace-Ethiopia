import { Router } from 'express';

import { analyticsQuerySchema, reportQuerySchema } from '@salestrace/validation';

import { requireCapability } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';

import type { AnalyticsControllerDeps } from './analytics.controller.js';
import { createAnalyticsController } from './analytics.controller.js';

export function createAnalyticsRoutes(deps: AnalyticsControllerDeps): Router {
  const router = Router();
  const controller = createAnalyticsController(deps);

  router.get('/analytics/overview', requireCapability('report:read'), validate({ query: analyticsQuerySchema }), (req, res, next) => {
    controller.overview(req, res).catch(next);
  });

  router.get('/analytics/campaigns', requireCapability('report:read'), validate({ query: analyticsQuerySchema }), (req, res, next) => {
    controller.campaigns(req, res).catch(next);
  });

  router.get('/analytics/creators', requireCapability('report:read'), validate({ query: analyticsQuerySchema }), (req, res, next) => {
    controller.creators(req, res).catch(next);
  });

  router.get('/analytics/timeseries', requireCapability('report:read'), validate({ query: analyticsQuerySchema }), (req, res, next) => {
    controller.timeseries(req, res).catch(next);
  });

  router.get('/reports/campaigns', requireCapability('report:read'), validate({ query: reportQuerySchema }), (req, res, next) => {
    controller.campaigns(req, res).catch(next);
  });

  router.get('/reports/export', requireCapability('report:read'), validate({ query: reportQuerySchema }), (req, res, next) => {
    controller.export(req, res).catch(next);
  });

  return router;
}
