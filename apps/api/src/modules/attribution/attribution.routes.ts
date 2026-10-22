import { Router } from 'express';

import { attributionListQuerySchema, recomputeAttributionSchema } from '@salestrace/validation';

import { requireCapability } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';

import type { AttributionControllerDeps } from './attribution.controller.js';
import { createAttributionController } from './attribution.controller.js';

export function createAttributionRoutes(deps: AttributionControllerDeps): Router {
  const router = Router();
  const controller = createAttributionController(deps);

  router.get('/attributions', requireCapability('attribution:read'), validate({ query: attributionListQuerySchema }), (req, res, next) => {
    controller.list(req, res).catch(next);
  });

  router.get('/attributions/:attributionId', requireCapability('attribution:read'), (req, res, next) => {
    controller.detail(req, res).catch(next);
  });

  router.get('/attribution/rules', requireCapability('attribution:read'), (req, res, next) => {
    controller.rules(req, res).catch(next);
  });

  router.post(
    '/attribution/recompute',
    requireCapability('attribution:write'),
    validate({ body: recomputeAttributionSchema }),
    (req, res, next) => {
      controller.recompute(req, res).catch(next);
    },
  );

  return router;
}
