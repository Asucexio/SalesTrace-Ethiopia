/**
 * Local identity provider.
 *
 * Implements the `AuthProvider` interface against the `profiles`, `auth_identities`,
 * `auth_tokens` and `sessions` tables. Passwords are hashed with scrypt.
 *
 * In this mode the API is responsible for "delivering" verification and reset tokens: they are
 * returned by the service and logged (in development) or surfaced in the API response, because
 * there is no mail provider in the local environment.
 */

import { createHash, randomBytes } from 'node:crypto';

import { generateSecureToken } from '@salestrace/shared-types';

import { AppError } from '../../shared/errors.js';
import type { DbDriver } from '../../db/driver.js';
import { withSystemContext } from '../../db/context.js';

import { hashPassword, validatePasswordStrength, verifyPassword } from './password.js';
import type {
  AuthIdentity,
  AuthProvider,
  ProviderTokens,
  RegisterInput,
  RegisterResult,
} from './auth.provider.js';

interface ProfileRow {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string | null;
  email_verified: boolean;
}

interface AuthIdentityRow {
  profile_id: string;
  password_hash: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class LocalAuthProvider implements AuthProvider {
  readonly mode = 'local' as const;

  constructor(private readonly db: DbDriver) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    const problems = validatePasswordStrength(input.password);
    if (problems.length > 0) {
      throw AppError.validation('Password does not meet the policy.', [
        { path: 'password', message: problems.join(' ') },
      ]);
    }

    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);

    return withSystemContext(this.db, async (tx) => {
      const existing = await tx.query<{ id: string }>('SELECT id FROM profiles WHERE lower(email) = $1', [
        email,
      ]);
      if (existing.rows.length > 0) {
        throw AppError.conflict('An account with this email already exists.');
      }

      const profile = await tx.query<ProfileRow>(
        `INSERT INTO profiles (auth_user_id, email, full_name, email_verified)
         VALUES ($1, $2, $3, false)
         RETURNING id, auth_user_id, email, full_name, email_verified`,
        [`local:${randomBytes(16).toString('hex')}`, email, input.fullName],
      );
      const created = profile.rows[0];
      if (!created) {
        throw new Error('Failed to create the profile.');
      }

      await tx.query('INSERT INTO auth_identities (profile_id, password_hash) VALUES ($1, $2)', [
        created.id,
        passwordHash,
      ]);

      const verificationToken = generateSecureToken(32);
      await tx.query(
        `INSERT INTO auth_tokens (profile_id, purpose, token_hash, expires_at)
         VALUES ($1, 'verify_email', $2, now() + interval '24 hours')`,
        [created.id, hashToken(verificationToken)],
      );

      return {
        identity: toIdentity(created),
        verificationRequired: true,
        verificationToken,
      };
    });
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ identity: AuthIdentity; tokens: ProviderTokens | null }> {
    const normalized = email.trim().toLowerCase();

    return withSystemContext(this.db, async (tx) => {
      const result = await tx.query<ProfileRow & { password_hash: string }>(
        `SELECT p.id, p.auth_user_id, p.email, p.full_name, p.email_verified, i.password_hash
         FROM profiles p
         JOIN auth_identities i ON i.profile_id = p.id
         WHERE lower(p.email) = $1`,
        [normalized],
      );

      const row = result.rows[0];
      if (!row) {
        // Spend a comparable amount of time so the response time does not reveal whether the
        // account exists.
        await verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
        throw AppError.unauthenticated('Incorrect email or password.');
      }

      const valid = await verifyPassword(password, row.password_hash);
      if (!valid) {
        throw AppError.unauthenticated('Incorrect email or password.');
      }

      if (!row.email_verified) {
        throw AppError.forbidden('Please verify your email address before signing in.');
      }

      return { identity: toIdentity(row), tokens: null };
    });
  }

  async verifyEmail(token: string): Promise<void> {
    await withSystemContext(this.db, async (tx) => {
      const tokenRow = await tx.query<{ id: string; profile_id: string }>(
        `SELECT id, profile_id FROM auth_tokens
         WHERE token_hash = $1 AND purpose = 'verify_email' AND consumed_at IS NULL AND expires_at > now()`,
        [hashToken(token)],
      );
      const row = tokenRow.rows[0];
      if (!row) {
        throw AppError.validation('This verification link is invalid or has expired.');
      }

      await tx.query('UPDATE profiles SET email_verified = true WHERE id = $1', [row.profile_id]);
      await tx.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [row.id]);
    });
  }

  async requestPasswordReset(email: string): Promise<string | null> {
    const normalized = email.trim().toLowerCase();

    return withSystemContext(this.db, async (tx) => {
      const profile = await tx.query<{ id: string }>(
        'SELECT id FROM profiles WHERE lower(email) = $1',
        [normalized],
      );
      const row = profile.rows[0];
      if (!row) {
        // Do not reveal that the account does not exist.
        return null;
      }

      const token = generateSecureToken(32);
      await tx.query(
        `INSERT INTO auth_tokens (profile_id, purpose, token_hash, expires_at)
         VALUES ($1, 'reset_password', $2, now() + interval '1 hour')`,
        [row.id, hashToken(token)],
      );
      return token;
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const problems = validatePasswordStrength(newPassword);
    if (problems.length > 0) {
      throw AppError.validation('Password does not meet the policy.', [
        { path: 'newPassword', message: problems.join(' ') },
      ]);
    }

    const passwordHash = await hashPassword(newPassword);

    await withSystemContext(this.db, async (tx) => {
      const tokenRow = await tx.query<{ id: string; profile_id: string }>(
        `SELECT id, profile_id FROM auth_tokens
         WHERE token_hash = $1 AND purpose = 'reset_password' AND consumed_at IS NULL AND expires_at > now()`,
        [hashToken(token)],
      );
      const row = tokenRow.rows[0];
      if (!row) {
        throw AppError.validation('This password reset link is invalid or has expired.');
      }

      await tx.query(
        `INSERT INTO auth_identities (profile_id, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (profile_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
        [row.profile_id, passwordHash],
      );
      await tx.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [row.id]);
      // Every existing session is revoked after a password reset.
      await tx.query('UPDATE sessions SET revoked_at = now() WHERE profile_id = $1 AND revoked_at IS NULL', [
        row.profile_id,
      ]);
    });
  }

  async refreshTokens(): Promise<ProviderTokens | null> {
    return null;
  }

  /** Reads the stored profile for an external identity id (used by the session service). */
  async findIdentity(externalId: string): Promise<AuthIdentity | null> {
    const result = await this.db.query<ProfileRow>(
      'SELECT id, auth_user_id, email, full_name, email_verified FROM profiles WHERE auth_user_id = $1',
      [externalId],
    );
    const row = result.rows[0];
    return row ? toIdentity(row) : null;
  }
}

function toIdentity(row: ProfileRow): AuthIdentity {
  return {
    externalId: row.auth_user_id,
    email: row.email,
    fullName: row.full_name,
    emailVerified: row.email_verified,
  };
}

export type { AuthIdentityRow };
