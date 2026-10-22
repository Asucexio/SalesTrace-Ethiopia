/**
 * Creator service.
 *
 * Business rules enforced here:
 * - The internal code is unique inside the organisation. It is what coupon codes are built from.
 * - A creator is never hard-deleted: deactivating keeps every campaign, cost and attribution
 *   that references the creator intact.
 * - A manually entered social account is `verified = false`. The platform never claims a handle
 *   was verified unless a verified integration supplied it.
 * - Every change is audited.
 */

import {
  type CreatorPerformance,
  type CreatorStatus,
  type OrganizationRole,
} from '@salestrace/shared-types';

import { withOrgContext } from '../../db/context.js';
import type { DbDriver } from '../../db/driver.js';
import { recordAudit, sanitiseForAudit } from '../../shared/audit.js';
import { AppError } from '../../shared/errors.js';

import { creatorPerformance } from '../campaigns/campaign.service.js';

import {
  creatorRepository,
  type CreatorRow,
  type CreatorSocialAccountRow,
  type CreatorSummaryRow,
} from './creator.repository.js';

export interface CreatorServiceDeps {
  db: DbDriver;
}

export class CreatorService {
  constructor(private readonly deps: CreatorServiceDeps) {}

  private get db(): DbDriver {
    return this.deps.db;
  }

  async listCreators(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    platform?: string | null;
    niche?: string | null;
    status?: CreatorStatus | null;
    search?: string | null;
    limit: number;
    offset: number;
    sort: string;
  }): Promise<{
    items: Array<CreatorSummaryRow & { social_accounts: CreatorSocialAccountRow[] }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const { rows, total } = await creatorRepository.list(tx, {
          organizationId: input.organizationId,
          platform: input.platform ?? null,
          niche: input.niche ?? null,
          status: input.status ?? null,
          search: input.search ?? null,
          limit: input.limit,
          offset: input.offset,
          sort: input.sort,
        });

        const accounts = await creatorRepository.listSocialAccountsForCreators(
          tx,
          input.organizationId,
          rows.map((row) => row.id),
        );

        const items = rows.map((row) => ({
          ...row,
          social_accounts: accounts.filter((account) => account.creator_id === row.id),
        }));

        return { items, total, limit: input.limit, offset: input.offset };
      },
    );
  }

  async createCreator(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
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
  }): Promise<CreatorRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const existing = await creatorRepository.findByInternalCode(
          tx,
          input.organizationId,
          input.internalCode,
        );
        if (existing !== null) {
          throw AppError.conflict('A creator with this internal code already exists.');
        }

        const creator = await creatorRepository.create(tx, {
          organizationId: input.organizationId,
          internalCode: input.internalCode,
          displayName: input.displayName,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          platform: input.platform ?? null,
          niche: input.niche ?? null,
          profileUrl: input.profileUrl ?? null,
          audienceLocation: input.audienceLocation ?? null,
          audienceLanguage: input.audienceLanguage ?? null,
          notes: input.notes ?? null,
        });

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'creator.created',
          entityType: 'creator',
          entityId: creator.id,
          after: sanitiseForAudit({
            internalCode: creator.internal_code,
            displayName: creator.display_name,
            platform: creator.platform,
            niche: creator.niche,
          }),
          requestId: input.requestId ?? null,
        });

        return creator;
      },
    );
  }

  async getCreator(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    creatorId: string;
  }): Promise<{
    creator: CreatorSummaryRow;
    socialAccounts: CreatorSocialAccountRow[];
    performance: CreatorPerformance;
  }> {
    const { creator, socialAccounts } = await withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const found = await creatorRepository.findById(tx, input.organizationId, input.creatorId);
        if (found === null) {
          throw AppError.notFound('Creator');
        }

        const accounts = await creatorRepository.listSocialAccounts(
          tx,
          input.organizationId,
          input.creatorId,
        );

        return { creator: found, socialAccounts: accounts };
      },
    );

    // The performance report opens its own tenant transaction — it must not be nested inside the
    // read above.
    const performance = await creatorPerformance(this.db, input.organizationId, input.creatorId, {});

    return { creator, socialAccounts, performance };
  }

  async updateCreator(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    creatorId: string;
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
  }): Promise<CreatorRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const before = await creatorRepository.findById(tx, input.organizationId, input.creatorId);
        if (before === null) {
          throw AppError.notFound('Creator');
        }

        if (input.internalCode !== undefined) {
          const clash = await creatorRepository.findByInternalCode(
            tx,
            input.organizationId,
            input.internalCode,
          );
          if (clash !== null && clash.id !== input.creatorId) {
            throw AppError.conflict('A creator with this internal code already exists.');
          }
        }

        const updated = await creatorRepository.update(tx, input.organizationId, input.creatorId, {
          ...(input.internalCode === undefined ? {} : { internalCode: input.internalCode }),
          ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          ...(input.contactEmail === undefined ? {} : { contactEmail: input.contactEmail }),
          ...(input.contactPhone === undefined ? {} : { contactPhone: input.contactPhone }),
          ...(input.platform === undefined ? {} : { platform: input.platform }),
          ...(input.niche === undefined ? {} : { niche: input.niche }),
          ...(input.profileUrl === undefined ? {} : { profileUrl: input.profileUrl }),
          ...(input.audienceLocation === undefined
            ? {}
            : { audienceLocation: input.audienceLocation }),
          ...(input.audienceLanguage === undefined
            ? {}
            : { audienceLanguage: input.audienceLanguage }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
          ...(input.status === undefined ? {} : { status: input.status }),
        });

        if (updated === null) {
          throw AppError.notFound('Creator');
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'creator.updated',
          entityType: 'creator',
          entityId: input.creatorId,
          before: sanitiseForAudit({
            internalCode: before.internal_code,
            displayName: before.display_name,
            status: before.status,
            platform: before.platform,
            niche: before.niche,
          }),
          after: sanitiseForAudit({
            internalCode: updated.internal_code,
            displayName: updated.display_name,
            status: updated.status,
            platform: updated.platform,
            niche: updated.niche,
          }),
          requestId: input.requestId ?? null,
        });

        return updated;
      },
    );
  }

  /**
   * Soft delete.
   *
   * The creator becomes `inactive`; campaigns, costs and attributions keep their history.
   */
  async deactivateCreator(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    creatorId: string;
  }): Promise<CreatorRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const before = await creatorRepository.findById(tx, input.organizationId, input.creatorId);
        if (before === null) {
          throw AppError.notFound('Creator');
        }

        const updated = await creatorRepository.deactivate(tx, input.organizationId, input.creatorId);
        if (updated === null) {
          throw AppError.notFound('Creator');
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'creator.deactivated',
          entityType: 'creator',
          entityId: input.creatorId,
          before: sanitiseForAudit({ status: before.status }),
          after: sanitiseForAudit({ status: updated.status }),
          requestId: input.requestId ?? null,
        });

        return updated;
      },
    );
  }

  async listSocialAccounts(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    creatorId: string;
  }): Promise<CreatorSocialAccountRow[]> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const creator = await creatorRepository.findById(tx, input.organizationId, input.creatorId);
        if (creator === null) {
          throw AppError.notFound('Creator');
        }
        return creatorRepository.listSocialAccounts(tx, input.organizationId, input.creatorId);
      },
    );
  }

  async addSocialAccount(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    creatorId: string;
    platform: string;
    handle: string;
    url?: string | null;
    isPrimary?: boolean;
    verified?: boolean;
  }): Promise<CreatorSocialAccountRow> {
    return withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const creator = await creatorRepository.findById(tx, input.organizationId, input.creatorId);
        if (creator === null) {
          throw AppError.notFound('Creator');
        }

        const account = await creatorRepository.createSocialAccount(tx, {
          organizationId: input.organizationId,
          creatorId: input.creatorId,
          platform: input.platform,
          handle: input.handle,
          url: input.url ?? null,
          isPrimary: input.isPrimary ?? false,
          // A manually entered account is never "verified".
          verified: input.verified ?? false,
        });

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'creator.social_account_added',
          entityType: 'creator_social_account',
          entityId: account.id,
          after: sanitiseForAudit({
            creatorId: input.creatorId,
            platform: account.platform,
            handle: account.handle,
            url: account.url,
            isPrimary: account.is_primary,
            verified: account.verified,
          }),
          requestId: input.requestId ?? null,
        });

        return account;
      },
    );
  }

  async removeSocialAccount(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: string;
    requestId?: string;
    creatorId: string;
    accountId: string;
  }): Promise<void> {
    await withOrgContext(
      this.db,
      {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        role: input.actorRole as OrganizationRole,
      },
      async (tx) => {
        const creator = await creatorRepository.findById(tx, input.organizationId, input.creatorId);
        if (creator === null) {
          throw AppError.notFound('Creator');
        }

        const account = await creatorRepository.findSocialAccount(
          tx,
          input.organizationId,
          input.creatorId,
          input.accountId,
        );
        if (account === null) {
          throw AppError.notFound('Social account');
        }

        await creatorRepository.deleteSocialAccount(
          tx,
          input.organizationId,
          input.creatorId,
          input.accountId,
        );

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'creator.social_account_removed',
          entityType: 'creator_social_account',
          entityId: input.accountId,
          before: sanitiseForAudit({
            creatorId: input.creatorId,
            platform: account.platform,
            handle: account.handle,
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
    creatorId: string;
    from?: Date | null;
    to?: Date | null;
  }): Promise<CreatorPerformance> {
    return creatorPerformance(this.db, input.organizationId, input.creatorId, {
      from: input.from ?? null,
      to: input.to ?? null,
    });
  }
}
