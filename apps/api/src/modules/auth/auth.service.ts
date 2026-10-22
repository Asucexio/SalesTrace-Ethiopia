/**
 * Authentication service.
 *
 * Orchestrates the identity provider and the session store:
 * registration, sign-in, sign-out, email verification, password reset and the "current session"
 * lookup used by the authentication middleware.
 */

import { generateSecureToken } from '@salestrace/shared-types';
import type { OrganizationRole, SessionInfo } from '@salestrace/shared-types';

import { withSystemContext } from '../../db/context.js';
import type { DbDriver } from '../../db/driver.js';
import { AppError } from '../../shared/errors.js';

import type { AuthIdentity, AuthProvider } from './auth.provider.js';
import type { SessionService } from './session.service.js';

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  email_verified: boolean;
}

interface MembershipRow {
  organization_id: string;
  organization_name: string;
  role: OrganizationRole;
}

export interface AuthServiceDeps {
  db: DbDriver;
  provider: AuthProvider;
  sessions: SessionService;
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  private get db(): DbDriver {
    return this.deps.db;
  }

  async register(input: {
    email: string;
    password: string;
    fullName?: string;
  }): Promise<{ user: { id: string; email: string; emailVerified: boolean }; verificationRequired: boolean; verificationToken?: string }> {
    const result = await this.deps.provider.register({
      email: input.email,
      password: input.password,
      fullName: input.fullName ?? null,
    });

    const profile = await this.ensureProfile(result.identity);

    return {
      user: { id: profile.id, email: profile.email, emailVerified: profile.emailVerified },
      verificationRequired: result.verificationRequired,
      ...(result.verificationToken === undefined ? {} : { verificationToken: result.verificationToken }),
    };
  }

  async login(input: { email: string; password: string }): Promise<{ token: string; info: SessionInfo }> {
    const { identity, tokens } = await this.deps.provider.login(input.email, input.password);
    const profile = await this.ensureProfile(identity);

    const memberships = await this.listMemberships(profile.id);
    const organizationId = memberships[0]?.organization_id ?? null;

    const session = await this.deps.sessions.create(profile.id, organizationId, tokens ?? undefined);

    const info = await this.buildSessionInfo(profile, organizationId, memberships);
    return { token: session.token, info };
  }

  async logout(sessionToken: string): Promise<void> {
    await this.deps.sessions.revoke(sessionToken);
  }

  async verifyEmail(token: string): Promise<void> {
    await this.deps.provider.verifyEmail(token);
  }

  async forgotPassword(email: string): Promise<string | null> {
    return this.deps.provider.requestPasswordReset(email);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.deps.provider.resetPassword(token, newPassword);
  }

  async switchOrganization(sessionToken: string, organizationId: string): Promise<SessionInfo> {
    const session = await this.deps.sessions.resolve(sessionToken);
    if (session === null) {
      throw AppError.unauthenticated();
    }

    const memberships = await this.listMemberships(session.profile.id);
    const target = memberships.find((membership) => membership.organization_id === organizationId);
    if (!target) {
      throw AppError.forbidden('You are not a member of that organization.');
    }

    await this.deps.sessions.switchOrganization(sessionToken, organizationId);

    return this.buildSessionInfo(session.profile, organizationId, memberships);
  }

  /** Builds the `GET /auth/me` payload for a session token. */
  async sessionInfo(sessionToken: string): Promise<SessionInfo | null> {
    const session = await this.deps.sessions.resolve(sessionToken);
    if (session === null) return null;

    const memberships = await this.listMemberships(session.profile.id);
    const organizationId =
      session.organizationId !== null && memberships.some((m) => m.organization_id === session.organizationId)
        ? session.organizationId
        : (memberships[0]?.organization_id ?? null);

    return this.buildSessionInfo(session.profile, organizationId, memberships);
  }

  /** Look up a membership role. Used by the authentication middleware. */
  async resolveMembership(
    organizationId: string,
    profileId: string,
  ): Promise<{ role: OrganizationRole } | null> {
    const result = await this.db.query<{ role: OrganizationRole }>(
      `SELECT role FROM organization_members
       WHERE organization_id = $1 AND profile_id = $2 AND status = 'active'`,
      [organizationId, profileId],
    );
    return result.rows[0] ?? null;
  }

  private async listMemberships(profileId: string): Promise<MembershipRow[]> {
    const result = await this.db.query<MembershipRow>(
      `SELECT m.organization_id, o.name AS organization_name, m.role
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.profile_id = $1 AND m.status = 'active'
       ORDER BY o.name`,
      [profileId],
    );
    return result.rows;
  }

  /**
   * Map a provider identity onto a local profile row.
   *
   * The profile row is what the rest of the platform uses; the provider id is kept in
   * `profiles.auth_user_id`.
   */
  private async ensureProfile(
    identity: AuthIdentity,
  ): Promise<{ id: string; email: string; fullName: string | null; emailVerified: boolean }> {
    return withSystemContext(this.db, async (tx) => {
      const existing = await tx.query<ProfileRow>(
        `SELECT id, email, full_name, email_verified FROM profiles WHERE auth_user_id = $1`,
        [identity.externalId],
      );
      const found = existing.rows[0];
      if (found) {
        return {
          id: found.id,
          email: found.email,
          fullName: found.full_name,
          emailVerified: found.email_verified,
        };
      }

      const duplicate = await tx.query('SELECT id FROM profiles WHERE lower(email) = lower($1)', [
        identity.email,
      ]);
      if (duplicate.rows.length > 0) {
        throw AppError.conflict('An account with this email already exists.');
      }

      const created = await tx.query<ProfileRow>(
        `INSERT INTO profiles (auth_user_id, email, full_name, email_verified)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, full_name, email_verified`,
        [identity.externalId, identity.email, identity.fullName, identity.emailVerified],
      );
      const row = created.rows[0];
      if (!row) {
        throw new Error('Failed to create the profile.');
      }

      return {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        emailVerified: row.email_verified,
      };
    });
  }

  private async buildSessionInfo(
    profile: { id: string; email: string; fullName: string | null; emailVerified: boolean },
    organizationId: string | null,
    memberships: MembershipRow[],
  ): Promise<SessionInfo> {
    const role = memberships.find((m) => m.organization_id === organizationId)?.role ?? null;

    let organization: SessionInfo['organization'] = null;
    if (organizationId !== null) {
      const result = await this.db.query<{
        id: string;
        name: string;
        slug: string;
        timezone: string;
        currency: string;
        settings: Record<string, unknown>;
        created_at: Date;
        updated_at: Date;
      }>('SELECT id, name, slug, timezone, currency, settings, created_at, updated_at FROM organizations WHERE id = $1', [
        organizationId,
      ]);
      const row = result.rows[0];
      if (row) {
        organization = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          timezone: row.timezone,
          currency: row.currency,
          settings: row.settings ?? {},
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        };
      }
    }

    const profileRow = await this.db.query<{ created_at: Date }>(
      'SELECT created_at FROM profiles WHERE id = $1',
      [profile.id],
    );
    const profileCreatedAt = profileRow.rows[0]?.created_at ?? new Date();

    return {
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        emailVerified: profile.emailVerified,
        createdAt: new Date(profileCreatedAt).toISOString(),
      },
      organization,
      role,
      memberships: memberships.map((membership) => ({
        organizationId: membership.organization_id,
        organizationName: membership.organization_name,
        role: membership.role,
      })),
    };
  }

  /** Create an invitation token for a member who has not registered yet. */
  async createInvitationToken(): Promise<string> {
    return generateSecureToken(32);
  }
}
