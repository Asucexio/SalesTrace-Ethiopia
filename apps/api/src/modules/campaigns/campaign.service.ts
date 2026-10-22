/**
 * Campaign service.
 *
 * Business rules enforced here:
 * - A campaign ends after it starts, and its currency is the organisation currency.
 * - Destinations are always `https` — the platform never redirects a visitor to plain HTTP.
 * - Status changes are validated against `canTransitionCampaignStatus`; `archived` is terminal.
 * - Creator assignments are unique per campaign and the creator must belong to the same tenant.
 * - A campaign cost is recorded in the campaign currency. Costs are never FX-converted.
 * - Every change is audited.
 *
 * The performance aggregation lives here as well, so the campaign report and the creator report
 * are computed from **one** implementation and can never drift apart.
 */

import {
  canTransitionCampaignStatus,
  DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  minorToDecimalString,
  parseAmountToMinor,
  type CampaignPerformance,
  type CampaignStatus,
  type CreatorPerformance,
  type OrganizationRole,
} from '@salestrace/shared-types';
import { computeMetrics } from '@salestrace/attribution-engine';

import { withOrgContext } from '../../db/context.js';
import type { DbDriver, SqlClient } from '../../db/driver.js';
import { recordAudit, sanitiseForAudit } from '../../shared/audit.js';
import { AppError } from '../../shared/errors.js';
import { organizationRepository } from '../organizations/organization.repository.js';

import {
  campaignRepository,
  type CampaignAssignmentRow,
  type CampaignCostRow,
  type CampaignRow,
  type CampaignSummaryRow,
} from './campaign.repository.js';
import { creatorRepository } from '../creators/creator.repository.js';

export interface CampaignServiceDeps {
  db: DbDriver;
}

export interface PerformanceRange {
  from?: Date | null;
  to?: Date | null;
}

function toMinor(amount: string | number): number {
  try {
    return parseAmountToMinor(amount);
  } catch {
    throw AppError.validation('The amount is not a valid monetary value.');
  }
}

function toDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw AppError.validation('The timestamp is not a valid ISO-8601 date.');
  }
  return date;
}

function assertHttps(url: string): void {
  if (!url.startsWith('https://')) {
    throw AppError.unprocessable('The destination URL must use https.');
  }
}

function assertDateOrder(startAt: Date, endAt: Date | null): void {
  if (endAt !== null && endAt.getTime() <= startAt.getTime()) {
    throw AppError.unprocessable('The campaign end date must be after the start date.');
  }
}

export class CampaignService {
  constructor(private readonly deps: CampaignServiceDeps) {}

  private get db(): DbDriver {
    return this.deps.db;
  }

  async listCampaigns(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    status?: CampaignStatus | null;
    creatorId?: string | null;
    search?: string | null;
    from?: Date | null;
    to?: Date | null;
    limit: number;
    offset: number;
    sort: string;
  }): Promise<{ items: CampaignSummaryRow[]; total: number; limit: number; offset: number }> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const { rows, total } = await campaignRepository.list(tx, {
          organizationId: input.organizationId,
          status: input.status ?? null,
          creatorId: input.creatorId ?? null,
          search: input.search ?? null,
          from: input.from ?? null,
          to: input.to ?? null,
          limit: input.limit,
          offset: input.offset,
          sort: input.sort,
        });
        return { items: rows, total, limit: input.limit, offset: input.offset };
      },
    );
  }

  async createCampaign(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    name: string;
    objective?: string | null;
    description?: string | null;
    startAt: string;
    endAt?: string | null;
    budget?: string | null;
    currency?: string;
    attributionWindowDays?: number;
    destinationUrl: string;
  }): Promise<CampaignRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const organization = await organizationRepository.findById(tx, input.organizationId);
        if (organization === null) {
          throw AppError.notFound('Organization');
        }

        const currency = input.currency ?? organization.currency;
        if (currency !== organization.currency) {
          throw AppError.unprocessable(
            `The campaign currency must match the organisation currency (${organization.currency}).`,
          );
        }

        assertHttps(input.destinationUrl);

        const startAt = toDate(input.startAt);
        const endAt = input.endAt === undefined || input.endAt === null ? null : toDate(input.endAt);
        assertDateOrder(startAt, endAt);

        const budgetMinor = input.budget === undefined || input.budget === null ? null : toMinor(input.budget);

        const campaign = await campaignRepository.create(tx, {
          organizationId: input.organizationId,
          createdBy: input.actorUserId,
          name: input.name,
          objective: input.objective ?? null,
          description: input.description ?? null,
          startAt,
          endAt,
          budgetMinor,
          currency,
          attributionWindowDays:
            input.attributionWindowDays ?? DEFAULT_ATTRIBUTION_WINDOW_DAYS,
          destinationUrl: input.destinationUrl,
        });

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'campaign.created',
          entityType: 'campaign',
          entityId: campaign.id,
          after: sanitiseForAudit({
            name: campaign.name,
            status: campaign.status,
            currency: campaign.currency,
            startAt: campaign.start_at.toISOString(),
            endAt: campaign.end_at ? campaign.end_at.toISOString() : null,
            destinationUrl: campaign.destination_url,
          }),
          requestId: input.requestId ?? null,
        });

        return campaign;
      },
    );
  }

  async getCampaign(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    campaignId: string;
  }): Promise<CampaignSummaryRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const campaign = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (campaign === null) {
          throw AppError.notFound('Campaign');
        }
        return campaign;
      },
    );
  }

  async updateCampaign(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    campaignId: string;
    name?: string;
    objective?: string | null;
    description?: string | null;
    startAt?: string;
    endAt?: string | null;
    budget?: string | null;
    attributionWindowDays?: number;
    destinationUrl?: string;
    currency?: string;
  }): Promise<CampaignRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const before = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (before === null) {
          throw AppError.notFound('Campaign');
        }

        if (input.destinationUrl !== undefined) {
          assertHttps(input.destinationUrl);
        }

        if (input.currency !== undefined) {
          const organization = await organizationRepository.findById(tx, input.organizationId);
          if (organization === null) {
            throw AppError.notFound('Organization');
          }
          if (input.currency !== organization.currency) {
            throw AppError.unprocessable(
              `The campaign currency must match the organisation currency (${organization.currency}).`,
            );
          }
          const conflictingCosts = await campaignRepository.countCostsInOtherCurrency(
            tx,
            input.organizationId,
            input.campaignId,
            input.currency,
          );
          if (conflictingCosts > 0) {
            throw AppError.unprocessable(
              'The campaign currency cannot change while costs are recorded in another currency.',
            );
          }
        }

        const startAt = input.startAt === undefined ? before.start_at : toDate(input.startAt);
        const endAt =
          input.endAt === undefined ? before.end_at : input.endAt === null ? null : toDate(input.endAt);
        assertDateOrder(startAt, endAt);

        const budgetMinor =
          input.budget === undefined ? undefined : input.budget === null ? null : toMinor(input.budget);

        const updated = await campaignRepository.update(tx, input.organizationId, input.campaignId, {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.objective === undefined ? {} : { objective: input.objective }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.startAt === undefined ? {} : { startAt }),
          ...(input.endAt === undefined ? {} : { endAt }),
          ...(input.budget === undefined ? {} : { budgetMinor }),
          ...(input.attributionWindowDays === undefined
            ? {}
            : { attributionWindowDays: input.attributionWindowDays }),
          ...(input.destinationUrl === undefined ? {} : { destinationUrl: input.destinationUrl }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
        });

        if (updated === null) {
          throw AppError.notFound('Campaign');
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'campaign.updated',
          entityType: 'campaign',
          entityId: input.campaignId,
          before: sanitiseForAudit({
            name: before.name,
            status: before.status,
            currency: before.currency,
            startAt: before.start_at.toISOString(),
            endAt: before.end_at ? before.end_at.toISOString() : null,
            destinationUrl: before.destination_url,
          }),
          after: sanitiseForAudit({
            name: updated.name,
            status: updated.status,
            currency: updated.currency,
            startAt: updated.start_at.toISOString(),
            endAt: updated.end_at ? updated.end_at.toISOString() : null,
            destinationUrl: updated.destination_url,
          }),
          requestId: input.requestId ?? null,
        });

        return updated;
      },
    );
  }

  async transitionStatus(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    campaignId: string;
    status: CampaignStatus;
  }): Promise<CampaignRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const before = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (before === null) {
          throw AppError.notFound('Campaign');
        }

        if (!canTransitionCampaignStatus(before.status, input.status)) {
          throw new AppError(
            'INVALID_STATUS_TRANSITION',
            `A campaign cannot move from "${before.status}" to "${input.status}".`,
          );
        }

        const updated = await campaignRepository.setStatus(
          tx,
          input.organizationId,
          input.campaignId,
          input.status,
          input.status === 'archived',
        );
        if (updated === null) {
          throw AppError.notFound('Campaign');
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'campaign.status_changed',
          entityType: 'campaign',
          entityId: input.campaignId,
          before: sanitiseForAudit({ status: before.status }),
          after: sanitiseForAudit({ status: updated.status }),
          requestId: input.requestId ?? null,
        });

        return updated;
      },
    );
  }

  async archiveCampaign(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    campaignId: string;
  }): Promise<CampaignRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const before = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (before === null) {
          throw AppError.notFound('Campaign');
        }

        if (!canTransitionCampaignStatus(before.status, 'archived')) {
          throw new AppError(
            'INVALID_STATUS_TRANSITION',
            `A campaign cannot move from "${before.status}" to "archived".`,
          );
        }

        const updated = await campaignRepository.setStatus(
          tx,
          input.organizationId,
          input.campaignId,
          'archived',
          true,
        );
        if (updated === null) {
          throw AppError.notFound('Campaign');
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'campaign.archived',
          entityType: 'campaign',
          entityId: input.campaignId,
          before: sanitiseForAudit({ status: before.status }),
          after: sanitiseForAudit({ status: updated.status, archivedAt: updated.archived_at?.toISOString() ?? null }),
          requestId: input.requestId ?? null,
        });

        return updated;
      },
    );
  }

  /* ------------------------------------------------------------- creators */

  async listCreators(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    campaignId: string;
  }): Promise<CampaignAssignmentRow[]> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const campaign = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (campaign === null) {
          throw AppError.notFound('Campaign');
        }
        return campaignRepository.listAssignments(tx, input.organizationId, input.campaignId);
      },
    );
  }

  async assignCreator(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    campaignId: string;
    creatorId: string;
    agreedFee?: string | null;
    currency?: string;
    assignedAt?: string;
    notes?: string | null;
  }): Promise<CampaignAssignmentRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const campaign = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (campaign === null) {
          throw AppError.notFound('Campaign');
        }

        const creator = await creatorRepository.findById(tx, input.organizationId, input.creatorId);
        if (creator === null) {
          throw AppError.notFound('Creator');
        }

        const currency = input.currency ?? campaign.currency;
        if (currency !== campaign.currency) {
          throw AppError.unprocessable(
            `The assignment currency must match the campaign currency (${campaign.currency}).`,
          );
        }

        const existing = await campaignRepository.findAssignment(
          tx,
          input.organizationId,
          input.campaignId,
          input.creatorId,
        );
        if (existing !== null) {
          throw AppError.conflict('This creator is already assigned to the campaign.');
        }

        const agreedFeeMinor =
          input.agreedFee === undefined || input.agreedFee === null ? null : toMinor(input.agreedFee);

        // `assigned_at` is the lower bound for click eligibility and may be back-dated.
        const assignedAt = input.assignedAt === undefined ? new Date() : toDate(input.assignedAt);

        await campaignRepository.createAssignment(tx, {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          creatorId: input.creatorId,
          agreedFeeMinor,
          currency,
          assignedAt,
          notes: input.notes ?? null,
        });

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'campaign.creator_assigned',
          entityType: 'campaign_creator',
          entityId: input.creatorId,
          after: sanitiseForAudit({
            campaignId: input.campaignId,
            creatorId: input.creatorId,
            agreedFee: agreedFeeMinor === null ? null : minorToDecimalString(agreedFeeMinor),
            currency,
            assignedAt: assignedAt.toISOString(),
          }),
          requestId: input.requestId ?? null,
        });

        const assignment = await campaignRepository.findAssignment(
          tx,
          input.organizationId,
          input.campaignId,
          input.creatorId,
        );
        if (assignment === null) {
          throw AppError.notFound('Creator');
        }
        return assignment;
      },
    );
  }

  async updateAssignment(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    campaignId: string;
    creatorId: string;
    agreedFee?: string | null;
    assignedAt?: string;
    notes?: string | null;
    status?: string;
  }): Promise<CampaignAssignmentRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const campaign = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (campaign === null) {
          throw AppError.notFound('Campaign');
        }

        const before = await campaignRepository.findAssignment(
          tx,
          input.organizationId,
          input.campaignId,
          input.creatorId,
        );
        if (before === null) {
          throw AppError.notFound('Creator assignment');
        }

        const agreedFeeMinor =
          input.agreedFee === undefined
            ? undefined
            : input.agreedFee === null
              ? null
              : toMinor(input.agreedFee);
        const assignedAt = input.assignedAt === undefined ? undefined : toDate(input.assignedAt);

        const updated = await campaignRepository.updateAssignment(
          tx,
          input.organizationId,
          input.campaignId,
          input.creatorId,
          {
            ...(agreedFeeMinor === undefined ? {} : { agreedFeeMinor }),
            ...(assignedAt === undefined ? {} : { assignedAt }),
            ...(input.notes === undefined ? {} : { notes: input.notes }),
            ...(input.status === undefined ? {} : { status: input.status }),
          },
        );
        if (!updated) {
          throw AppError.notFound('Creator assignment');
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'campaign.creator_updated',
          entityType: 'campaign_creator',
          entityId: input.creatorId,
          before: sanitiseForAudit({
            agreedFee:
              before.agreed_fee_minor === null ? null : minorToDecimalString(before.agreed_fee_minor),
            assignedAt: before.assigned_at.toISOString(),
            status: before.status,
            notes: before.notes,
          }),
          after: sanitiseForAudit({
            agreedFee: agreedFeeMinor === undefined ? undefined : agreedFeeMinor === null ? null : minorToDecimalString(agreedFeeMinor),
            assignedAt: assignedAt === undefined ? undefined : assignedAt.toISOString(),
            status: input.status ?? before.status,
            notes: input.notes ?? before.notes,
          }),
          requestId: input.requestId ?? null,
        });

        const assignment = await campaignRepository.findAssignment(
          tx,
          input.organizationId,
          input.campaignId,
          input.creatorId,
        );
        if (assignment === null) {
          throw AppError.notFound('Creator assignment');
        }
        return assignment;
      },
    );
  }

  async removeAssignment(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    campaignId: string;
    creatorId: string;
  }): Promise<void> {
    await withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const campaign = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (campaign === null) {
          throw AppError.notFound('Campaign');
        }

        const assignment = await campaignRepository.findAssignment(
          tx,
          input.organizationId,
          input.campaignId,
          input.creatorId,
        );
        if (assignment === null) {
          throw AppError.notFound('Creator assignment');
        }

        await campaignRepository.deleteAssignment(
          tx,
          input.organizationId,
          input.campaignId,
          input.creatorId,
        );

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'campaign.creator_removed',
          entityType: 'campaign_creator',
          entityId: input.creatorId,
          before: sanitiseForAudit({
            campaignId: input.campaignId,
            creatorId: input.creatorId,
            agreedFee:
              assignment.agreed_fee_minor === null
                ? null
                : minorToDecimalString(assignment.agreed_fee_minor),
            assignedAt: assignment.assigned_at.toISOString(),
          }),
          requestId: input.requestId ?? null,
        });
      },
    );
  }

  /* --------------------------------------------------------------- costs */

  async listCosts(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    campaignId: string;
  }): Promise<CampaignCostRow[]> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const campaign = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (campaign === null) {
          throw AppError.notFound('Campaign');
        }
        return campaignRepository.listCosts(tx, input.organizationId, input.campaignId);
      },
    );
  }

  async addCost(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    campaignId: string;
    creatorId?: string | null;
    costType: string;
    description?: string | null;
    amount: string;
    currency?: string;
    incurredAt?: string;
  }): Promise<CampaignCostRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const campaign = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (campaign === null) {
          throw AppError.notFound('Campaign');
        }

        const currency = input.currency ?? campaign.currency;
        if (currency !== campaign.currency) {
          throw AppError.unprocessable(
            `The cost currency must match the campaign currency (${campaign.currency}).`,
          );
        }

        if (input.creatorId !== undefined && input.creatorId !== null) {
          const creator = await creatorRepository.findById(tx, input.organizationId, input.creatorId);
          if (creator === null) {
            throw AppError.notFound('Creator');
          }
        }

        const amountMinor = toMinor(input.amount);
        const incurredAt = input.incurredAt === undefined ? new Date() : toDate(input.incurredAt);

        const cost = await campaignRepository.createCost(tx, {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          creatorId: input.creatorId ?? null,
          costType: input.costType as CampaignCostRow['cost_type'],
          description: input.description ?? null,
          amountMinor,
          currency,
          incurredAt,
        });

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'campaign.cost_added',
          entityType: 'campaign_cost',
          entityId: cost.id,
          after: sanitiseForAudit({
            campaignId: input.campaignId,
            costType: cost.cost_type,
            amount: minorToDecimalString(amountMinor),
            currency,
            incurredAt: incurredAt.toISOString(),
          }),
          requestId: input.requestId ?? null,
        });

        return cost;
      },
    );
  }

  async removeCost(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    campaignId: string;
    costId: string;
  }): Promise<void> {
    await withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const campaign = await campaignRepository.findById(tx, input.organizationId, input.campaignId);
        if (campaign === null) {
          throw AppError.notFound('Campaign');
        }

        const cost = await campaignRepository.findCost(tx, input.organizationId, input.campaignId, input.costId);
        if (cost === null) {
          throw AppError.notFound('Campaign cost');
        }

        await campaignRepository.deleteCost(tx, input.organizationId, input.campaignId, input.costId);

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'campaign.cost_removed',
          entityType: 'campaign_cost',
          entityId: input.costId,
          before: sanitiseForAudit({
            campaignId: input.campaignId,
            costType: cost.cost_type,
            amount: minorToDecimalString(cost.amount_minor),
            currency: cost.currency,
          }),
          requestId: input.requestId ?? null,
        });
      },
    );
  }

  async performance(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    campaignId: string;
    from?: Date | null;
    to?: Date | null;
  }): Promise<CampaignPerformance> {
    return campaignPerformance(this.db, input.organizationId, input.campaignId, {
      from: input.from ?? null,
      to: input.to ?? null,
    });
  }
}

/* ==================================================================== */
/* Shared performance aggregation                                       */
/* ==================================================================== */

interface PerformanceScope {
  organizationId: string;
  campaignId?: string | null;
  creatorId?: string | null;
  from?: Date | null;
  to?: Date | null;
}

interface PerformanceAggregates {
  totalClicks: number;
  eligibleClicks: number;
  attributedOrders: number;
  attributedValidOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  refundedOrders: number;
  grossMinor: number;
  refundMinor: number;
  netMinor: number;
  costMinor: number;
  creatorCostMinor: number;
}

/**
 * Collect the click, order and cost aggregates for a scope.
 *
 * Both the campaign report and the creator report go through this function, so the two views are
 * computed from identical SQL.
 */
async function collectAggregates(tx: SqlClient, scope: PerformanceScope): Promise<PerformanceAggregates> {
  const clicks = await campaignRepository.clickAggregates(tx, scope);
  const orders = await campaignRepository.orderAggregates(tx, scope);
  const costs = await campaignRepository.costAggregates(tx, scope);

  return {
    totalClicks: clicks.total_clicks,
    eligibleClicks: clicks.eligible_clicks,
    attributedOrders: orders.attributed_orders,
    attributedValidOrders: orders.attributed_valid_orders,
    paidOrders: orders.paid_orders,
    cancelledOrders: orders.cancelled_orders,
    pendingOrders: orders.pending_orders,
    refundedOrders: orders.refunded_orders,
    grossMinor: orders.gross_minor,
    refundMinor: orders.refund_minor,
    netMinor: orders.net_minor,
    costMinor: costs.total_minor,
    creatorCostMinor: costs.creator_minor,
  };
}

/**
 * Campaign performance.
 *
 * `conversionRate` is `null` when there are no eligible clicks, `costPerAttributedOrder` is
 * `null` when there are no attributed valid orders and `roas` is `null` when the campaign has no
 * recorded cost. The platform never renders `NaN` or `Infinity`.
 */
export async function campaignPerformance(
  db: DbDriver,
  organizationId: string,
  campaignId: string,
  range: PerformanceRange = {},
): Promise<CampaignPerformance> {
  return withOrgContext(
    db,
    { organizationId, userId: null, role: 'analyst' },
    async (tx) => {
      const campaign = await campaignRepository.findById(tx, organizationId, campaignId);
      if (campaign === null) {
        throw AppError.notFound('Campaign');
      }

      const aggregates = await collectAggregates(tx, {
        organizationId,
        campaignId,
        from: range.from ?? null,
        to: range.to ?? null,
      });

      const metrics = computeMetrics({
        totalClicks: aggregates.totalClicks,
        eligibleClicks: aggregates.eligibleClicks,
        attributedOrders: aggregates.attributedOrders,
        attributedValidOrders: aggregates.attributedValidOrders,
        paidOrders: aggregates.paidOrders,
        cancelledOrders: aggregates.cancelledOrders,
        pendingOrders: aggregates.pendingOrders,
        refundedOrders: aggregates.refundedOrders,
        grossAttributedOrderValueMinor: aggregates.grossMinor,
        refundAmountMinor: aggregates.refundMinor,
        netAttributedRevenueMinor: aggregates.netMinor,
        campaignCostMinor: aggregates.costMinor,
        creatorCostMinor: aggregates.creatorCostMinor,
      });

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: campaign.status,
        currency: campaign.currency,
        startAt: campaign.start_at.toISOString(),
        endAt: campaign.end_at ? campaign.end_at.toISOString() : null,
        creatorCount: Number(campaign.creator_count ?? 0),
        totalClicks: metrics.totalClicks,
        eligibleClicks: metrics.eligibleClicks,
        attributedOrders: metrics.attributedOrders,
        attributedValidOrders: metrics.attributedValidOrders,
        paidOrders: metrics.paidOrders,
        cancelledOrders: metrics.cancelledOrders,
        refundedOrders: metrics.refundedOrders,
        grossAttributedOrderValue: metrics.grossAttributedOrderValue,
        refundAmount: metrics.refundAmount,
        netAttributedRevenue: metrics.netAttributedRevenue,
        campaignCost: metrics.campaignCost,
        creatorCost: metrics.creatorCost,
        conversionRate: metrics.conversionRate,
        costPerAttributedOrder: metrics.costPerAttributedOrder,
        roas: metrics.roas,
      };
    },
  );
}

/**
 * Creator performance.
 *
 * Uses the same aggregation as the campaign report, scoped to the creator. `costPerAttributedOrder`
 * uses the creator's own recorded cost and `roas` is the creator's net revenue over that cost.
 * `revenuePerCreator` is the net revenue attributed to this creator (`docs/financial-metrics.md`).
 */
export async function creatorPerformance(
  db: DbDriver,
  organizationId: string,
  creatorId: string,
  range: PerformanceRange = {},
): Promise<CreatorPerformance> {
  return withOrgContext(
    db,
    { organizationId, userId: null, role: 'analyst' },
    async (tx) => {
      const creator = await creatorRepository.findById(tx, organizationId, creatorId);
      if (creator === null) {
        throw AppError.notFound('Creator');
      }

      const aggregates = await collectAggregates(tx, {
        organizationId,
        creatorId,
        from: range.from ?? null,
        to: range.to ?? null,
      });

      const campaignCount = await creatorRepository.countCampaigns(tx, organizationId, creatorId);

      const metrics = computeMetrics({
        totalClicks: aggregates.totalClicks,
        eligibleClicks: aggregates.eligibleClicks,
        attributedOrders: aggregates.attributedOrders,
        attributedValidOrders: aggregates.attributedValidOrders,
        paidOrders: aggregates.paidOrders,
        cancelledOrders: aggregates.cancelledOrders,
        pendingOrders: aggregates.pendingOrders,
        refundedOrders: aggregates.refundedOrders,
        grossAttributedOrderValueMinor: aggregates.grossMinor,
        refundAmountMinor: aggregates.refundMinor,
        netAttributedRevenueMinor: aggregates.netMinor,
        campaignCostMinor: aggregates.costMinor,
        creatorCostMinor: aggregates.creatorCostMinor,
        // "Revenue per creator" is the net revenue attributed to this creator, not an average.
        creatorCount: 1,
      });

      return {
        creatorId: creator.id,
        creatorName: creator.display_name,
        creatorInternalCode: creator.internal_code,
        platform: creator.platform,
        campaignCount,
        totalClicks: metrics.totalClicks,
        eligibleClicks: metrics.eligibleClicks,
        attributedOrders: metrics.attributedOrders,
        attributedValidOrders: metrics.attributedValidOrders,
        paidOrders: metrics.paidOrders,
        cancelledOrders: metrics.cancelledOrders,
        refundedOrders: metrics.refundedOrders,
        grossAttributedOrderValue: metrics.grossAttributedOrderValue,
        refundAmount: metrics.refundAmount,
        netAttributedRevenue: metrics.netAttributedRevenue,
        creatorCost: metrics.creatorCost,
        conversionRate: metrics.conversionRate,
        costPerAttributedOrder: metrics.costPerAttributedOrder,
        roas: metrics.roas,
        revenuePerCreator: metrics.revenuePerCreator,
      };
    },
  );
}
