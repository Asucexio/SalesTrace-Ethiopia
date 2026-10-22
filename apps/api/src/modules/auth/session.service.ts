/**
 * Session store.
 *
 * The API issues its own opaque session token and stores only its SHA-256 hash, so a database
 * leak does not hand out usable sessions. The token travels in an httpOnly cookie.
 *
 * Sessions are global (not tenant owned): they identify a *user*, and the active organization is
 * a property of the session. Access control for tenant data is enforced by the organization
 * context, never by the session row.
 */

import { generateSecureToken } from '@salestrace/shared-types';

import { withSystemContext } from '../../db/context.js';
import type { DbDriver } from '../../db/driver.js';
import { getEnv } from '../../config/env.js';

import { hashToken } from './local-auth.provider.js';

export interface SessionProfile {
  id: string;
  email: string;
  fullName: string | null;
  emailVerified: boolean;
}

export interface SessionRecord {
  profile: SessionProfile;
  organizationId: string | null;
  expiresAt: Date;
}

interface SessionRow {
  id: string;
  profile_id: string;
  organization_id: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  provider_access_token: string | null;
  provider_refresh_token: string | null;
  provider_expires_at: Date | null;
  email: string;
  full_name: string | null;
  email_verified: boolean;
}

export class SessionService {
  constructor(private readonly db: DbDriver) {}

  async create(
    profileId: string,
    organizationId: string | null,
    provider?: { accessToken: string; refreshToken: string | null; expiresAt: Date | null },
  ): Promise<{ token: string; expiresAt: Date }> {
    const env = getEnv();
    const token = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await withSystemContext(this.db, async (tx) => {
      await tx.query(
        `INSERT INTO sessions (
           profile_id, organization_id, token_hash,
           provider_access_token, provider_refresh_token, provider_expires_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          profileId,
          organizationId,
          hashToken(token),
          provider?.accessToken ?? null,
          provider?.refreshToken ?? null,
          provider?.expiresAt ?? null,
          expiresAt,
        ],
      );
    });

    return { token, expiresAt };
  }

  async resolve(token: string): Promise<SessionRecord | null> {
    return withSystemContext(this.db, async (tx) => {
      const result = await tx.query<SessionRow>(
        `SELECT s.id, s.profile_id, s.organization_id, s.expires_at, s.revoked_at,
                s.provider_access_token, s.provider_refresh_token, s.provider_expires_at,
                p.email, p.full_name, p.email_verified
         FROM sessions s
         JOIN profiles p ON p.id = s.profile_id
         WHERE s.token_hash = $1`,
        [hashToken(token)],
      );

      const row = result.rows[0];
      if (!row) return null;
      if (row.revoked_at !== null) return null;
      if (row.expires_at.getTime() <= Date.now()) return null;

      return {
        profile: {
          id: row.profile_id,
          email: row.email,
          fullName: row.full_name,
          emailVerified: row.email_verified,
        },
        organizationId: row.organization_id,
        expiresAt: row.expires_at,
      };
    });
  }

  async revoke(token: string): Promise<void> {
    await withSystemContext(this.db, async (tx) => {
      await tx.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
        hashToken(token),
      ]);
    });
  }

  async revokeAllForProfile(profileId: string): Promise<void> {
    await withSystemContext(this.db, async (tx) => {
      await tx.query('UPDATE sessions SET revoked_at = now() WHERE profile_id = $1 AND revoked_at IS NULL', [
        profileId,
      ]);
    });
  }

  async switchOrganization(token: string, organizationId: string): Promise<void> {
    await withSystemContext(this.db, async (tx) => {
      await tx.query('UPDATE sessions SET organization_id = $2 WHERE token_hash = $1', [
        hashToken(token),
        organizationId,
      ]);
    });
  }
}
