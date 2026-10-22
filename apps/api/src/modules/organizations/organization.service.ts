/**
 * Organization and membership service.
 *
 * Business rules enforced here:
 * - The last active `owner` of an organization cannot be removed or demoted (prevents locking
 *   the tenant out).
 * - A member's email address identifies the membership: an invitation reuses the existing
 *   profile when the email already exists.
 * - Every membership change is audited.
 */

import { generateSecureToken } from '@salestrace/shared-types';
import type { OrganizationRole } from '@salestrace/shared-types';

import { withOrgContext, withSystemContext } from '../../db/context.js';
import type { DbDriver } from '../../db/driver.js';
import { recordAudit, sanitiseForAudit } from '../../shared/audit.js';
import { AppError } from '../../shared/errors.js';

import {
  organizationRepository,
  type MemberRow,
  type OrganizationRow,
} from './organization.repository.js';

export interface OrganizationServiceDeps {
  db: DbDriver;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);

  return base.length >= 2 ? base : `org-${generateSecureToken(4).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
}

export class OrganizationService {
  constructor(private readonly deps: OrganizationServiceDeps) {}

  private get db(): DbDriver {
    return this.deps.db;
  }

  /**
   * Create an organization and make the caller its owner.
   *
   * Runs in a system transaction because the caller is not a member of the organization yet —
   * the organization and the owner membership are created together.
   */
  async createOrganization(input: {
    profileId: string;
    name: string;
    slug?: string;
    timezone: string;
    currency: string;
    requestId?: string;
  }): Promise<OrganizationRow> {
    return withSystemContext(this.db, async (tx) => {
      const slug = input.slug ?? slugify(input.name);

      const existing = await organizationRepository.findBySlug(tx, slug);
      if (existing !== null) {
        throw AppError.conflict('An organization with this slug already exists.');
      }

      const organization = await organizationRepository.create(tx, {
        name: input.name,
        slug,
        timezone: input.timezone,
        currency: input.currency,
      });

      await organizationRepository.addMember(tx, {
        organizationId: organization.id,
        profileId: input.profileId,
        role: 'owner',
        status: 'active',
        invitedBy: null,
      });

      await recordAudit(tx, {
        organizationId: organization.id,
        actorUserId: input.profileId,
        actorRole: 'owner',
        action: 'organization.created',
        entityType: 'organization',
        entityId: organization.id,
        after: sanitiseForAudit({ name: organization.name, slug: organization.slug }),
        requestId: input.requestId ?? null,
      });

      return organization;
    });
  }

  async getOrganization(organizationId: string): Promise<OrganizationRow | null> {
    return withOrgContext(this.db, { organizationId, userId: null, role: 'analyst' }, (tx) =>
      organizationRepository.findById(tx, organizationId),
    );
  }

  async updateOrganization(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    requestId?: string;
    patch: { name?: string; timezone?: string; currency?: string; settings?: Record<string, unknown> };
  }): Promise<OrganizationRow> {
    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: 'owner' },
      async (tx) => {
        const before = await organizationRepository.findById(tx, input.organizationId);
        const updated = await organizationRepository.update(tx, input.organizationId, input.patch);
        if (updated === null) {
          throw AppError.notFound('Organization');
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'organization.updated',
          entityType: 'organization',
          entityId: input.organizationId,
          before: sanitiseForAudit(before),
          after: sanitiseForAudit(updated),
          requestId: input.requestId ?? null,
        });

        return updated;
      },
    );
  }

  async listMembers(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
  }): Promise<MemberRow[]> {
    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      (tx) => organizationRepository.listMembers(tx, input.organizationId),
    );
  }

  /**
   * Invite a member.
   *
   * When the email already belongs to a registered user the membership is created directly;
   * otherwise a placeholder profile is created and an invitation token is issued.
   */
  async inviteMember(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    requestId?: string;
    email: string;
    role: OrganizationRole;
    fullName?: string;
  }): Promise<MemberRow> {
    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      async (tx) => {
        const profile = await organizationRepository.findProfileByEmail(tx, input.email);

        if (profile !== null) {
          const member = await organizationRepository.addMember(tx, {
            organizationId: input.organizationId,
            profileId: profile.id,
            role: input.role,
            status: 'active',
            invitedBy: input.actorUserId,
          });

          await recordAudit(tx, {
            organizationId: input.organizationId,
            actorUserId: input.actorUserId,
            actorRole: input.actorRole,
            action: 'member.added',
            entityType: 'organization_member',
            entityId: member.id,
            after: sanitiseForAudit({ email: input.email, role: input.role }),
            requestId: input.requestId ?? null,
          });

          return { ...member, email: profile.email, full_name: profile.full_name };
        }

        const created = await organizationRepository.createProfile(tx, {
          email: input.email,
          fullName: input.fullName ?? null,
          emailVerified: false,
        });

        const member = await organizationRepository.addMember(tx, {
          organizationId: input.organizationId,
          profileId: created.id,
          role: input.role,
          status: 'invited',
          invitedEmail: input.email,
          invitationToken: generateSecureToken(32),
          invitedBy: input.actorUserId,
        });

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'member.invited',
          entityType: 'organization_member',
          entityId: member.id,
          after: sanitiseForAudit({ email: input.email, role: input.role }),
          requestId: input.requestId ?? null,
        });

        return { ...member, email: input.email, full_name: created.full_name };
      },
    );
  }

  async updateMember(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    requestId?: string;
    memberId: string;
    role?: OrganizationRole;
    status?: 'active' | 'invited' | 'suspended';
  }): Promise<MemberRow> {
    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      async (tx) => {
        const member = await organizationRepository.findMember(tx, input.organizationId, input.memberId);
        if (member === null) {
          throw AppError.notFound('Member');
        }

        // The last active owner cannot be demoted or suspended.
        const owners = await organizationRepository.countOwners(tx, input.organizationId);
        const isLastOwner = member.role === 'owner' && member.status === 'active' && owners <= 1;
        const losingOwner = isLastOwner && (input.role !== undefined || input.status === 'suspended');

        if (losingOwner) {
          throw AppError.unprocessable(
            'The last owner of an organization cannot be demoted or suspended. Promote another member first.',
          );
        }

        const updated = await organizationRepository.updateMember(
          tx,
          input.organizationId,
          input.memberId,
          {
            ...(input.role === undefined ? {} : { role: input.role }),
            ...(input.status === undefined ? {} : { status: input.status }),
          },
        );
        if (updated === null) {
          throw AppError.notFound('Member');
        }

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'member.updated',
          entityType: 'organization_member',
          entityId: input.memberId,
          before: sanitiseForAudit({ role: member.role, status: member.status }),
          after: sanitiseForAudit({ role: updated.role, status: updated.status }),
          requestId: input.requestId ?? null,
        });

        return updated;
      },
    );
  }

  async removeMember(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    requestId?: string;
    memberId: string;
  }): Promise<void> {
    await withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      async (tx) => {
        const member = await organizationRepository.findMember(tx, input.organizationId, input.memberId);
        if (member === null) {
          throw AppError.notFound('Member');
        }

        const owners = await organizationRepository.countOwners(tx, input.organizationId);
        if (member.role === 'owner' && member.status === 'active' && owners <= 1) {
          throw AppError.unprocessable('The last owner of an organization cannot be removed.');
        }

        await organizationRepository.removeMember(tx, input.organizationId, input.memberId);

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'member.removed',
          entityType: 'organization_member',
          entityId: input.memberId,
          before: sanitiseForAudit({ email: member.email, role: member.role }),
          requestId: input.requestId ?? null,
        });
      },
    );
  }
}
