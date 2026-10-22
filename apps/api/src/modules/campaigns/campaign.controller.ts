/**
 * Campaign controller.
 *
 * HTTP translation only: the service owns the rules, the repository owns the SQL.
 */

import type { Request, Response } from 'express';

import { minorToDecimalString, type CampaignStatus } from '@salestrace/shared-types';

import { AppError } from '../../shared/errors.js';
import { sendData, sendPaginated } from '../../shared/response.js';

import type { CampaignRow, CampaignSummaryRow } from './campaign.repository.js';
import type { CampaignService } from './campaign.service.js';

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function decimal(value: number | string | null): string | null {
  if (value === null || value === undefined) return null;
  return minorToDecimalString(Number(value));
}

export function mapCampaign(row: CampaignRow | CampaignSummaryRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    objective: row.objective,
    description: row.description,
    status: row.status,
    startAt: iso(row.start_at),
    endAt: row.end_at === null ? null : iso(row.end_at),
    budget: decimal(row.budget_minor),
    currency: row.currency,
    attributionWindowDays: row.attribution_window_days,
    attributionPolicyVersion: row.attribution_policy_version,
    destinationUrl: row.destination_url,
    archivedAt: row.archived_at === null ? null : iso(row.archived_at),
    creatorCount: Number((row as CampaignSummaryRow).creator_count ?? 0),
    costTotal: decimal((row as CampaignSummaryRow).cost_total ?? null),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function createCampaignController(service: CampaignService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const query = req.query as unknown as {
        status?: CampaignStatus;
        creatorId?: string;
        search?: string;
        from?: string;
        to?: string;
        limit: number;
        offset: number;
        sort: string;
      };

      const result = await service.listCampaigns({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        status: query.status ?? null,
        creatorId: query.creatorId ?? null,
        search: query.search ?? null,
        from: query.from ? new Date(query.from) : null,
        to: query.to ? new Date(query.to) : null,
        limit: query.limit,
        offset: query.offset,
        sort: query.sort,
      });

      sendPaginated(
        res,
        result.items.map(mapCampaign),
        result.total,
        result.limit,
        result.offset,
      );
    },

    async create(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const body = req.body as {
        name: string;
        objective?: string | null;
        description?: string | null;
        startAt: string;
        endAt?: string | null;
        budget?: string | null;
        currency?: string;
        attributionWindowDays?: number;
        destinationUrl: string;
      };

      const campaign = await service.createCampaign({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        name: body.name,
        objective: body.objective ?? null,
        description: body.description ?? null,
        startAt: body.startAt,
        endAt: body.endAt ?? null,
        budget: body.budget ?? null,
        ...(body.currency === undefined ? {} : { currency: body.currency }),
        ...(body.attributionWindowDays === undefined
          ? {}
          : { attributionWindowDays: body.attributionWindowDays }),
        destinationUrl: body.destinationUrl,
      });

      sendData(res, mapCampaign(campaign), 201);
    },

    async get(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      if (!campaignId) throw AppError.notFound('Campaign');

      const campaign = await service.getCampaign({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        campaignId,
      });

      sendData(res, mapCampaign(campaign));
    },

    async update(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      if (!campaignId) throw AppError.notFound('Campaign');

      const body = req.body as {
        name?: string;
        objective?: string | null;
        description?: string | null;
        startAt?: string;
        endAt?: string | null;
        budget?: string | null;
        attributionWindowDays?: number;
        destinationUrl?: string;
        currency?: string;
      };

      const campaign = await service.updateCampaign({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        campaignId,
        ...body,
      });

      sendData(res, mapCampaign(campaign));
    },

    async transitionStatus(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      if (!campaignId) throw AppError.notFound('Campaign');

      const body = req.body as { status: CampaignStatus };

      const campaign = await service.transitionStatus({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        campaignId,
        status: body.status,
      });

      sendData(res, mapCampaign(campaign));
    },

    async archive(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      if (!campaignId) throw AppError.notFound('Campaign');

      const campaign = await service.archiveCampaign({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        campaignId,
      });

      sendData(res, mapCampaign(campaign));
    },

    async listCreators(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      if (!campaignId) throw AppError.notFound('Campaign');

      const assignments = await service.listCreators({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        campaignId,
      });

      sendData(
        res,
        assignments.map((assignment) => ({
          id: assignment.id,
          campaignId: assignment.campaign_id,
          creatorId: assignment.creator_id,
          creatorName: assignment.creator_name,
          creatorInternalCode: assignment.creator_internal_code,
          agreedFee: decimal(assignment.agreed_fee_minor),
          currency: assignment.currency,
          assignedAt: iso(assignment.assigned_at),
          status: assignment.status,
          notes: assignment.notes,
        })),
      );
    },

    async assignCreator(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      if (!campaignId) throw AppError.notFound('Campaign');

      const body = req.body as {
        creatorId: string;
        agreedFee?: string | null;
        currency?: string;
        assignedAt?: string;
        notes?: string | null;
      };

      const assignment = await service.assignCreator({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        campaignId,
        creatorId: body.creatorId,
        agreedFee: body.agreedFee ?? null,
        ...(body.currency === undefined ? {} : { currency: body.currency }),
        ...(body.assignedAt === undefined ? {} : { assignedAt: body.assignedAt }),
        notes: body.notes ?? null,
      });

      sendData(
        res,
        {
          id: assignment.id,
          campaignId: assignment.campaign_id,
          creatorId: assignment.creator_id,
          creatorName: assignment.creator_name,
          creatorInternalCode: assignment.creator_internal_code,
          agreedFee: decimal(assignment.agreed_fee_minor),
          currency: assignment.currency,
          assignedAt: iso(assignment.assigned_at),
          status: assignment.status,
          notes: assignment.notes,
        },
        201,
      );
    },

    async updateAssignment(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      const creatorId = req.params['creatorId'];
      if (!campaignId || !creatorId) throw AppError.notFound('Creator assignment');

      const body = req.body as {
        agreedFee?: string | null;
        assignedAt?: string;
        notes?: string | null;
        status?: string;
      };

      const assignment = await service.updateAssignment({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        campaignId,
        creatorId,
        ...body,
      });

      sendData(res, {
        id: assignment.id,
        campaignId: assignment.campaign_id,
        creatorId: assignment.creator_id,
        creatorName: assignment.creator_name,
        creatorInternalCode: assignment.creator_internal_code,
        agreedFee: decimal(assignment.agreed_fee_minor),
        currency: assignment.currency,
        assignedAt: iso(assignment.assigned_at),
        status: assignment.status,
        notes: assignment.notes,
      });
    },

    async removeAssignment(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      const creatorId = req.params['creatorId'];
      if (!campaignId || !creatorId) throw AppError.notFound('Creator assignment');

      await service.removeAssignment({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        campaignId,
        creatorId,
      });

      res.status(204).end();
    },

    async listCosts(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      if (!campaignId) throw AppError.notFound('Campaign');

      const costs = await service.listCosts({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        campaignId,
      });

      sendData(
        res,
        costs.map((cost) => ({
          id: cost.id,
          campaignId: cost.campaign_id,
          creatorId: cost.creator_id,
          creatorName: cost.creator_name,
          costType: cost.cost_type,
          description: cost.description,
          amount: minorToDecimalString(Number(cost.amount_minor)),
          currency: cost.currency,
          incurredAt: iso(cost.incurred_at),
          createdAt: iso(cost.created_at),
        })),
      );
    },

    async addCost(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      if (!campaignId) throw AppError.notFound('Campaign');

      const body = req.body as {
        creatorId?: string | null;
        costType: string;
        description?: string | null;
        amount: string;
        currency?: string;
        incurredAt?: string;
      };

      const cost = await service.addCost({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        campaignId,
        creatorId: body.creatorId ?? null,
        costType: body.costType,
        description: body.description ?? null,
        amount: body.amount,
        ...(body.currency === undefined ? {} : { currency: body.currency }),
        ...(body.incurredAt === undefined ? {} : { incurredAt: body.incurredAt }),
      });

      sendData(
        res,
        {
          id: cost.id,
          campaignId: cost.campaign_id,
          creatorId: cost.creator_id,
          creatorName: cost.creator_name,
          costType: cost.cost_type,
          description: cost.description,
          amount: minorToDecimalString(Number(cost.amount_minor)),
          currency: cost.currency,
          incurredAt: iso(cost.incurred_at),
          createdAt: iso(cost.created_at),
        },
        201,
      );
    },

    async removeCost(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      const costId = req.params['costId'];
      if (!campaignId || !costId) throw AppError.notFound('Campaign cost');

      await service.removeCost({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        campaignId,
        costId,
      });

      res.status(204).end();
    },

    async performance(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const campaignId = req.params['campaignId'];
      if (!campaignId) throw AppError.notFound('Campaign');

      const query = req.query as { from?: string; to?: string };

      const performance = await service.performance({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        campaignId,
        from: query.from ? new Date(query.from) : null,
        to: query.to ? new Date(query.to) : null,
      });

      sendData(res, performance);
    },
  };
}
