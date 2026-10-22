/**
 * Creator controller.
 *
 * HTTP translation only: the service owns the rules, the repository owns the SQL.
 */

import type { Request, Response } from 'express';

import type { CreatorStatus } from '@salestrace/shared-types';

import { AppError } from '../../shared/errors.js';
import { sendData, sendPaginated } from '../../shared/response.js';

import type { CreatorSocialAccountRow, CreatorSummaryRow } from './creator.repository.js';
import type { CreatorService } from './creator.service.js';

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function mapSocialAccount(account: CreatorSocialAccountRow) {
  return {
    id: account.id,
    creatorId: account.creator_id,
    platform: account.platform,
    handle: account.handle,
    url: account.url,
    isPrimary: account.is_primary,
    verified: account.verified,
  };
}

export function mapCreator(
  creator: CreatorSummaryRow,
  socialAccounts: CreatorSocialAccountRow[] = [],
) {
  return {
    id: creator.id,
    organizationId: creator.organization_id,
    internalCode: creator.internal_code,
    displayName: creator.display_name,
    contactEmail: creator.contact_email,
    contactPhone: creator.contact_phone,
    platform: creator.platform,
    niche: creator.niche,
    profileUrl: creator.profile_url,
    audienceLocation: creator.audience_location,
    audienceLanguage: creator.audience_language,
    notes: creator.notes,
    status: creator.status,
    campaignCount: Number(creator.campaign_count ?? 0),
    socialAccounts: socialAccounts.map(mapSocialAccount),
    createdAt: iso(creator.created_at),
    updatedAt: iso(creator.updated_at),
  };
}

export function createCreatorController(service: CreatorService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const query = req.query as unknown as {
        platform?: string;
        niche?: string;
        status?: CreatorStatus;
        search?: string;
        limit: number;
        offset: number;
        sort: string;
      };

      const result = await service.listCreators({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        platform: query.platform ?? null,
        niche: query.niche ?? null,
        status: query.status ?? null,
        search: query.search ?? null,
        limit: query.limit,
        offset: query.offset,
        sort: query.sort,
      });

      sendPaginated(
        res,
        result.items.map((item) => mapCreator(item, item.social_accounts)),
        result.total,
        result.limit,
        result.offset,
      );
    },

    async create(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const body = req.body as {
        internalCode: string;
        displayName: string;
        contactEmail?: string | null;
        contactPhone?: string | null;
        platform?: string | null;
        niche?: string | null;
        profileUrl?: string | null;
        audienceLocation?: string | null;
        audienceLanguage?: string | null;
        notes?: string | null;
      };

      const creator = await service.createCreator({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        ...body,
      });

      sendData(res, mapCreator({ ...creator, campaign_count: 0 }), 201);
    },

    async get(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const creatorId = req.params['creatorId'];
      if (!creatorId) throw AppError.notFound('Creator');

      const result = await service.getCreator({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        creatorId,
      });

      sendData(res, {
        ...mapCreator(result.creator, result.socialAccounts),
        performance: result.performance,
      });
    },

    async update(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const creatorId = req.params['creatorId'];
      if (!creatorId) throw AppError.notFound('Creator');

      const body = req.body as {
        internalCode?: string;
        displayName?: string;
        contactEmail?: string | null;
        contactPhone?: string | null;
        platform?: string | null;
        niche?: string | null;
        profileUrl?: string | null;
        audienceLocation?: string | null;
        audienceLanguage?: string | null;
        notes?: string | null;
        status?: CreatorStatus;
      };

      const creator = await service.updateCreator({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        creatorId,
        ...body,
      });

      sendData(res, mapCreator({ ...creator, campaign_count: 0 }));
    },

    async deactivate(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const creatorId = req.params['creatorId'];
      if (!creatorId) throw AppError.notFound('Creator');

      const creator = await service.deactivateCreator({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        creatorId,
      });

      sendData(res, mapCreator({ ...creator, campaign_count: 0 }));
    },

    async listSocialAccounts(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const creatorId = req.params['creatorId'];
      if (!creatorId) throw AppError.notFound('Creator');

      const accounts = await service.listSocialAccounts({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        creatorId,
      });

      sendData(res, accounts.map(mapSocialAccount));
    },

    async addSocialAccount(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const creatorId = req.params['creatorId'];
      if (!creatorId) throw AppError.notFound('Creator');

      const body = req.body as {
        platform: string;
        handle: string;
        url?: string | null;
        isPrimary?: boolean;
        verified?: boolean;
      };

      const account = await service.addSocialAccount({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        creatorId,
        platform: body.platform,
        handle: body.handle,
        url: body.url ?? null,
        isPrimary: body.isPrimary ?? false,
        verified: body.verified ?? false,
      });

      sendData(res, mapSocialAccount(account), 201);
    },

    async removeSocialAccount(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const creatorId = req.params['creatorId'];
      const accountId = req.params['accountId'];
      if (!creatorId || !accountId) throw AppError.notFound('Social account');

      await service.removeSocialAccount({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        creatorId,
        accountId,
      });

      res.status(204).end();
    },

    async performance(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const creatorId = req.params['creatorId'];
      if (!creatorId) throw AppError.notFound('Creator');

      const query = req.query as { from?: string; to?: string };

      const performance = await service.performance({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        creatorId,
        from: query.from ? new Date(query.from) : null,
        to: query.to ? new Date(query.to) : null,
      });

      sendData(res, performance);
    },
  };
}
