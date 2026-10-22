import { Router } from 'express';

import {
  inviteMemberSchema,
  updateMemberSchema,
  updateOrganizationSchema,
} from '@salestrace/validation';

import { requireCapability } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';

import type { OrganizationService } from './organization.service.js';
import type { SessionService } from '../auth/session.service.js';
import { createOrganizationController } from './organization.controller.js';

/**
 * The organization routes that require an active organization.
 *
 * `POST /organizations` is registered separately in `app.ts` because creating the *first*
 * organization happens before the session can name one.
 */
export function createOrganizationRoutes(service: OrganizationService, sessions: SessionService): Router {
  const router = Router();
  const controller = createOrganizationController(service, sessions);

  router.get('/current', requireCapability('org:read'), (req, res, next) => {
    controller.current(req, res).catch(next);
  });

  router.patch('/current', requireCapability('org:write'), validate({ body: updateOrganizationSchema }), (req, res, next) => {
    controller.update(req, res).catch(next);
  });

  router.get('/current/members', requireCapability('member:read'), (req, res, next) => {
    controller.listMembers(req, res).catch(next);
  });

  router.post(
    '/current/members',
    requireCapability('member:write'),
    validate({ body: inviteMemberSchema }),
    (req, res, next) => {
      controller.inviteMember(req, res).catch(next);
    },
  );

  router.patch(
    '/current/members/:memberId',
    requireCapability('member:write'),
    validate({ body: updateMemberSchema }),
    (req, res, next) => {
      controller.updateMember(req, res).catch(next);
    },
  );

  router.delete('/current/members/:memberId', requireCapability('member:write'), (req, res, next) => {
    controller.removeMember(req, res).catch(next);
  });

  return router;
}
