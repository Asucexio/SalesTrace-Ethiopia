/**
 * Campaign routes.
 *
 * Mounted under `/api/v1/campaigns`. The organisation always comes from the session — never from
 * the request body or a query parameter.
 */

import { Router } from 'express';

import {
  assignCreatorSchema,
  campaignListQuerySchema,
  createCampaignCostSchema,
  createCampaignSchema,
  currencySchema,
  isoDateSchema,
  transitionCampaignSchema,
  updateAssignmentSchema,
  updateCampaignSchema,
  z,
} from '@salestrace/validation';

import { requireCapability } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';

import type { CampaignService } from './campaign.service.js';
import { createCampaignController } from './campaign.controller.js';

/**
 * The shared update schema does not carry `currency`; the API does allow the campaign currency to
 * change (validated against the organisation currency), so the schema is extended here rather
 * than duplicated.
 *
 * `updateCampaignSchema` is a refined schema (a `ZodEffects`), which has no `extend()` — the
 * currency field is therefore combined with it instead. The shared refinements still apply.
 */
const updateCampaignBodySchema = z
  .object({ currency: currencySchema.optional() })
  .and(updateCampaignSchema);

/** The optional date range of a performance report. */
const performanceQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export function createCampaignRoutes(service: CampaignService): Router {
  const router = Router();
  const controller = createCampaignController(service);

  router.get(
    '/',
    requireCapability('campaign:read'),
    validate({ query: campaignListQuerySchema }),
    (req, res, next) => {
      controller.list(req, res).catch(next);
    },
  );

  router.post(
    '/',
    requireCapability('campaign:write'),
    validate({ body: createCampaignSchema }),
    (req, res, next) => {
      controller.create(req, res).catch(next);
    },
  );

  router.get(
    '/:campaignId',
    requireCapability('campaign:read'),
    (req, res, next) => {
      controller.get(req, res).catch(next);
    },
  );

  router.patch(
    '/:campaignId',
    requireCapability('campaign:write'),
    validate({ body: updateCampaignBodySchema }),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  router.post(
    '/:campaignId/status',
    requireCapability('campaign:write'),
    validate({ body: transitionCampaignSchema }),
    (req, res, next) => {
      controller.transitionStatus(req, res).catch(next);
    },
  );

  router.post(
    '/:campaignId/archive',
    requireCapability('campaign:write'),
    (req, res, next) => {
      controller.archive(req, res).catch(next);
    },
  );

  router.get(
    '/:campaignId/creators',
    requireCapability('campaign:read'),
    (req, res, next) => {
      controller.listCreators(req, res).catch(next);
    },
  );

  router.post(
    '/:campaignId/creators',
    requireCapability('campaign:write'),
    validate({ body: assignCreatorSchema }),
    (req, res, next) => {
      controller.assignCreator(req, res).catch(next);
    },
  );

  router.patch(
    '/:campaignId/creators/:creatorId',
    requireCapability('campaign:write'),
    validate({ body: updateAssignmentSchema }),
    (req, res, next) => {
      controller.updateAssignment(req, res).catch(next);
    },
  );

  router.delete(
    '/:campaignId/creators/:creatorId',
    requireCapability('campaign:write'),
    (req, res, next) => {
      controller.removeAssignment(req, res).catch(next);
    },
  );

  router.get(
    '/:campaignId/costs',
    requireCapability('campaign:read'),
    (req, res, next) => {
      controller.listCosts(req, res).catch(next);
    },
  );

  router.post(
    '/:campaignId/costs',
    requireCapability('campaign:write'),
    validate({ body: createCampaignCostSchema }),
    (req, res, next) => {
      controller.addCost(req, res).catch(next);
    },
  );

  router.delete(
    '/:campaignId/costs/:costId',
    requireCapability('campaign:write'),
    (req, res, next) => {
      controller.removeCost(req, res).catch(next);
    },
  );

  router.get(
    '/:campaignId/performance',
    requireCapability('campaign:read'),
    validate({ query: performanceQuerySchema }),
    (req, res, next) => {
      controller.performance(req, res).catch(next);
    },
  );

  return router;
}
