/**
 * Organization and membership repository.
 *
 * All SQL lives here. The repository never decides policy: it receives the organization id from
 * the request context and applies it to every statement.
 */

import type { OrganizationRole } from '@salestrace/shared-types';

import type { SqlClient } from '../../db/driver.js';

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface MemberRow {
  id: string;
  organization_id: string;
  profile_id: string;
  email: string;
  full_name: string | null;
  role: OrganizationRole;
  status: 'active' | 'invited' | 'suspended';
  invited_email: string | null;
  created_at: Date;
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  email_verified: boolean;
}

export const organizationRepository = {
  async create(
    tx: SqlClient,
    input: { name: string; slug: string; timezone: string; currency: string },
  ): Promise<OrganizationRow> {
    const result = await tx.query<OrganizationRow>(
      `INSERT INTO organizations (name, slug, timezone, currency)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, timezone, currency, settings, created_at, updated_at`,
      [input.name, input.slug, input.timezone, input.currency],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create the organization.');
    return row;
  },

  async findById(tx: SqlClient, organizationId: string): Promise<OrganizationRow | null> {
    const result = await tx.query<OrganizationRow>(
      `SELECT id, name, slug, timezone, currency, settings, created_at, updated_at
       FROM organizations WHERE id = $1`,
      [organizationId],
    );
    return result.rows[0] ?? null;
  },

  async findBySlug(tx: SqlClient, slug: string): Promise<OrganizationRow | null> {
    const result = await tx.query<OrganizationRow>(
      `SELECT id, name, slug, timezone, currency, settings, created_at, updated_at
       FROM organizations WHERE slug = $1`,
      [slug],
    );
    return result.rows[0] ?? null;
  },

  async update(
    tx: SqlClient,
    organizationId: string,
    patch: {
      name?: string;
      timezone?: string;
      currency?: string;
      settings?: Record<string, unknown>;
    },
  ): Promise<OrganizationRow | null> {
    const result = await tx.query<OrganizationRow>(
      `UPDATE organizations SET
         name = COALESCE($2, name),
         timezone = COALESCE($3, timezone),
         currency = COALESCE($4, currency),
         settings = COALESCE($5, settings)
       WHERE id = $1
       RETURNING id, name, slug, timezone, currency, settings, created_at, updated_at`,
      [
        organizationId,
        patch.name ?? null,
        patch.timezone ?? null,
        patch.currency ?? null,
        patch.settings === undefined ? null : JSON.stringify(patch.settings),
      ],
    );
    return result.rows[0] ?? null;
  },

  async listMembers(tx: SqlClient, organizationId: string): Promise<MemberRow[]> {
    const result = await tx.query<MemberRow>(
      `SELECT m.id, m.organization_id, m.profile_id, p.email, p.full_name, m.role, m.status,
              m.invited_email, m.created_at
       FROM organization_members m
       JOIN profiles p ON p.id = m.profile_id
       WHERE m.organization_id = $1
       ORDER BY p.full_name NULLS LAST, p.email`,
      [organizationId],
    );
    return result.rows;
  },

  async findMember(tx: SqlClient, organizationId: string, memberId: string): Promise<MemberRow | null> {
    const result = await tx.query<MemberRow>(
      `SELECT m.id, m.organization_id, m.profile_id, p.email, p.full_name, m.role, m.status,
              m.invited_email, m.created_at
       FROM organization_members m
       JOIN profiles p ON p.id = m.profile_id
       WHERE m.organization_id = $1 AND m.id = $2`,
      [organizationId, memberId],
    );
    return result.rows[0] ?? null;
  },

  async addMember(
    tx: SqlClient,
    input: {
      organizationId: string;
      profileId: string;
      role: OrganizationRole;
      status: 'active' | 'invited';
      invitedEmail?: string | null;
      invitationToken?: string | null;
      invitedBy?: string | null;
    },
  ): Promise<MemberRow> {
    const result = await tx.query<MemberRow>(
      `INSERT INTO organization_members (
         organization_id, profile_id, role, status, invited_email, invitation_token, invited_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, profile_id) DO UPDATE
         SET role = EXCLUDED.role, status = EXCLUDED.status
       RETURNING id, organization_id, profile_id, role, status, invited_email, created_at`,
      [
        input.organizationId,
        input.profileId,
        input.role,
        input.status,
        input.invitedEmail ?? null,
        input.invitationToken ?? null,
        input.invitedBy ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to add the member.');
    // The RETURNING clause does not include the joined profile columns.
    return { ...row, email: input.invitedEmail ?? '', full_name: null };
  },

  async updateMember(
    tx: SqlClient,
    organizationId: string,
    memberId: string,
    patch: { role?: OrganizationRole; status?: 'active' | 'invited' | 'suspended' },
  ): Promise<MemberRow | null> {
    const result = await tx.query<MemberRow>(
      `UPDATE organization_members SET
         role = COALESCE($3, role),
         status = COALESCE($4, status)
       WHERE organization_id = $1 AND id = $2
       RETURNING id, organization_id, profile_id, role, status, invited_email, created_at`,
      [organizationId, memberId, patch.role ?? null, patch.status ?? null],
    );
    const row = result.rows[0];
    if (!row) return null;

    const profile = await tx.query<ProfileRow>(
      'SELECT id, email, full_name, email_verified FROM profiles WHERE id = $1',
      [row.profile_id],
    );
    const profileRow = profile.rows[0];
    return {
      ...row,
      email: profileRow?.email ?? row.invited_email ?? '',
      full_name: profileRow?.full_name ?? null,
    };
  },

  async removeMember(tx: SqlClient, organizationId: string, memberId: string): Promise<boolean> {
    const result = await tx.query(
      'DELETE FROM organization_members WHERE organization_id = $1 AND id = $2',
      [organizationId, memberId],
    );
    return result.rowCount > 0;
  },

  async countOwners(tx: SqlClient, organizationId: string): Promise<number> {
    const result = await tx.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM organization_members
       WHERE organization_id = $1 AND role = 'owner' AND status = 'active'`,
      [organizationId],
    );
    return result.rows[0]?.count ?? 0;
  },

  async findProfileByEmail(tx: SqlClient, email: string): Promise<ProfileRow | null> {
    const result = await tx.query<ProfileRow>(
      'SELECT id, email, full_name, email_verified FROM profiles WHERE lower(email) = lower($1)',
      [email],
    );
    return result.rows[0] ?? null;
  },

  async createProfile(
    tx: SqlClient,
    input: { email: string; fullName?: string | null; emailVerified?: boolean },
  ): Promise<ProfileRow> {
    const result = await tx.query<ProfileRow>(
      `INSERT INTO profiles (auth_user_id, email, full_name, email_verified)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (auth_user_id) DO UPDATE
         SET email = EXCLUDED.email, full_name = COALESCE(profiles.full_name, EXCLUDED.full_name)
       RETURNING id, email, full_name, email_verified`,
      [
        `invite:${input.email.toLowerCase()}`,
        input.email.toLowerCase(),
        input.fullName ?? null,
        input.emailVerified ?? false,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create the profile.');
    return row;
  },

  async findMemberByInvitationToken(
    tx: SqlClient,
    token: string,
  ): Promise<{ id: string; organization_id: string; role: OrganizationRole; status: string } | null> {
    const result = await tx.query<{
      id: string;
      organization_id: string;
      role: OrganizationRole;
      status: string;
    }>(
      `SELECT id, organization_id, role, status FROM organization_members WHERE invitation_token = $1`,
      [token],
    );
    return result.rows[0] ?? null;
  },

  async acceptInvitation(
    tx: SqlClient,
    memberId: string,
    profileId: string,
  ): Promise<void> {
    await tx.query(
      `UPDATE organization_members
       SET status = 'active', invitation_token = NULL, profile_id = $2
       WHERE id = $1`,
      [memberId, profileId],
    );
  },
};
