/**
 * Organization controller.
 *
 * HTTP translation only: the service owns the rules, the repository owns the SQL.
 */

import type { Request, Response } from 'express';

import { AppError } from '../../shared/errors.js';
import { sendData } from '../../shared/response.js';

import type { OrganizationService } from './organization.service.js';
import type { SessionService } from '../auth/session.service.js';

export function createOrganizationController(service: OrganizationService, sessions: SessionService) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      const session = req.session;
      if (!session) throw AppError.unauthenticated();

      const body = req.body as {
        name: string;
        slug?: string;
        timezone: string;
        currency: string;
      };

      const organization = await service.createOrganization({
        profileId: session.profileId,
        name: body.name,
        ...(body.slug === undefined ? {} : { slug: body.slug }),
        timezone: body.timezone,
        currency: body.currency,
        requestId: req.requestId,
      });

      await sessions.switchOrganization(session.sessionToken, organization.id);
      sendData(res, mapOrganization(organization), 201);
    },

    async current(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const organization = await service.getOrganization(auth.organizationId);
      if (organization === null) {
        throw AppError.notFound('Organization');
      }

      sendData(res, mapOrganization(organization));
    },

    async update(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const body = req.body as {
        name?: string;
        timezone?: string;
        currency?: string;
        settings?: Record<string, unknown>;
      };

      const organization = await service.updateOrganization({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        patch: body,
      });

      sendData(res, mapOrganization(organization));
    },

    async listMembers(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const members = await service.listMembers({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
      });

      sendData(
        res,
        members.map((member) => ({
          id: member.id,
          organizationId: member.organization_id,
          profileId: member.profile_id,
          email: member.email,
          fullName: member.full_name,
          role: member.role,
          status: member.status,
          invitedEmail: member.invited_email,
          createdAt: member.created_at.toISOString(),
        })),
      );
    },

    async inviteMember(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const body = req.body as { email: string; role: 'owner' | 'admin' | 'marketer' | 'analyst'; fullName?: string };

      const member = await service.inviteMember({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        email: body.email,
        role: body.role,
        ...(body.fullName === undefined ? {} : { fullName: body.fullName }),
      });

      sendData(
        res,
        {
          id: member.id,
          organizationId: member.organization_id,
          profileId: member.profile_id,
          email: member.email,
          fullName: member.full_name,
          role: member.role,
          status: member.status,
          invitedEmail: member.invited_email,
          createdAt: member.created_at.toISOString(),
        },
        201,
      );
    },

    async updateMember(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const memberId = req.params['memberId'];
      if (!memberId) throw AppError.notFound('Member');

      const body = req.body as {
        role?: 'owner' | 'admin' | 'marketer' | 'analyst';
        status?: 'active' | 'invited' | 'suspended';
      };

      const member = await service.updateMember({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        memberId,
        ...body,
      });

      sendData(res, {
        id: member.id,
        organizationId: member.organization_id,
        profileId: member.profile_id,
        email: member.email,
        fullName: member.full_name,
        role: member.role,
        status: member.status,
        invitedEmail: member.invited_email,
        createdAt: member.created_at.toISOString(),
      });
    },

    async removeMember(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const memberId = req.params['memberId'];
      if (!memberId) throw AppError.notFound('Member');

      await service.removeMember({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        memberId,
      });

      res.status(204).end();
    },
  };
}

function mapOrganization(organization: {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    timezone: organization.timezone,
    currency: organization.currency,
    settings: organization.settings ?? {},
    createdAt: organization.created_at.toISOString(),
    updatedAt: organization.updated_at.toISOString(),
  };
}
