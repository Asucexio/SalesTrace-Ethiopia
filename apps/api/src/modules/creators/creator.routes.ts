/**
 * Creator routes.
 *
 * Mounted under `/api/v1/creators`. The organisation always comes from the session.
 */

import { Router } from 'express';

import {
  createCreatorSchema,
  creatorListQuerySchema,
  isoDateSchema,
  socialAccountSchema,
  updateCreatorSchema,
  z,
} from '@salestrace/validation';

import { requireCapability } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';

import type { CreatorService } from './creator.service.js';
import { createCreatorController } from './creator.controller.js';

/** The optional date range of a performance report. */
const performanceQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export function createCreatorRoutes(service: CreatorService): Router {
  const router = Router();
  const controller = createCreatorController(service);

  router.get(
    '/',
    requireCapability('creator:read'),
    validate({ query: creatorListQuerySchema }),
    (req, res, next) => {
      controller.list(req, res).catch(next);
    },
  );

  router.post(
    '/',
    requireCapability('creator:write'),
    validate({ body: createCreatorSchema }),
    (req, res, next) => {
      controller.create(req, res).catch(next);
    },
  );

  router.get(
    '/:creatorId',
    requireCapability('creator:read'),
    (req, res, next) => {
      controller.get(req, res).catch(next);
    },
  );

  router.patch(
    '/:creatorId',
    requireCapability('creator:write'),
    validate({ body: updateCreatorSchema }),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  router.delete(
    '/:creatorId',
    requireCapability('creator:write'),
    (req, res, next) => {
      controller.deactivate(req, res).catch(next);
    },
  );

  router.get(
    '/:creatorId/social-accounts',
    requireCapability('creator:read'),
    (req, res, next) => {
      controller.listSocialAccounts(req, res).catch(next);
    },
  );

  router.post(
    '/:creatorId/social-accounts',
    requireCapability('creator:write'),
    validate({ body: socialAccountSchema }),
    (req, res, next) => {
      controller.addSocialAccount(req, res).catch(next);
    },
  );

  router.delete(
    '/:creatorId/social-accounts/:accountId',
    requireCapability('creator:write'),
    (req, res, next) => {
      controller.removeSocialAccount(req, res).catch(next);
    },
  );

  router.get(
    '/:creatorId/performance',
    requireCapability('creator:read'),
    validate({ query: performanceQuerySchema }),
    (req, res, next) => {
      controller.performance(req, res).catch(next);
    },
  );

  return router;
}
