/**
 * Supabase Auth identity provider (production).
 *
 * Uses `@supabase/supabase-js` with the **service role key** on the server side only. The key is
 * never exposed to the browser and never logged.
 *
 * Verification and reset links are delivered by Supabase's own mail delivery. The API receives
 * the resulting token from the browser and completes the exchange server-side.
 *
 * LIMITATION: this provider could not be exercised against a live Supabase project while the
 * MVP was built (no project credentials were available in the development environment). It is
 * isolated behind the `AuthProvider` interface for exactly that reason, and the local provider
 * is the one covered by the automated test suite. See `docs/assumptions.md` (A19).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';

import type {
  AuthIdentity,
  AuthProvider,
  ProviderTokens,
  RegisterInput,
  RegisterResult,
} from './auth.provider.js';

interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export class SupabaseAuthProvider implements AuthProvider {
  readonly mode = 'supabase' as const;

  private readonly client: SupabaseClient;
  private readonly adminClient: SupabaseClient;

  constructor() {
    const env = getEnv();
    const url = env.SUPABASE_URL;
    const anonKey = env.SUPABASE_ANON_KEY;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey || !serviceKey) {
      throw new Error('SupabaseAuthProvider requires SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.');
    }

    this.client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async register(input: RegisterInput): Promise<RegisterResult> {
    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: { data: { full_name: input.fullName } },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        throw AppError.conflict('An account with this email already exists.');
      }
      throw AppError.unprocessable(error.message);
    }

    const user = data.user as SupabaseUser | null;
    if (!user) {
      throw AppError.unprocessable('The identity provider did not return a user.');
    }

    const verificationRequired = data.session === null;

    return {
      identity: {
        externalId: user.id,
        email: user.email ?? input.email.trim().toLowerCase(),
        fullName: input.fullName,
        emailVerified: !verificationRequired,
      },
      verificationRequired,
    };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ identity: AuthIdentity; tokens: ProviderTokens | null }> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.user || !data.session) {
      throw AppError.unauthenticated('Incorrect email or password.');
    }

    const user = data.user as SupabaseUser;
    const fullName =
      typeof user.user_metadata?.['full_name'] === 'string'
        ? (user.user_metadata['full_name'] as string)
        : null;

    return {
      identity: {
        externalId: user.id,
        email: user.email ?? email.trim().toLowerCase(),
        fullName,
        emailVerified: true,
      },
      tokens: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token ?? null,
        expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000) : null,
      },
    };
  }

  async verifyEmail(tokenHash: string): Promise<void> {
    const { error } = await this.client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });

    if (error) {
      throw AppError.validation('This verification link is invalid or has expired.');
    }
  }

  async requestPasswordReset(email: string): Promise<string | null> {
    const env = getEnv();
    const redirectTo = `${env.PUBLIC_BASE_URL}/reset-password`;

    const { error } = await this.client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    });

    if (error) {
      // Never reveal whether the account exists.
      return null;
    }

    // Supabase delivers the link by email; there is no token for the API to return.
    return null;
  }

  async resetPassword(tokenHash: string, newPassword: string): Promise<void> {
    const { data, error } = await this.client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });

    if (error || !data.user) {
      throw AppError.validation('This password reset link is invalid or has expired.');
    }

    const { error: updateError } = await this.adminClient.auth.admin.updateUserById(data.user.id, {
      password: newPassword,
    });

    if (updateError) {
      throw AppError.unprocessable(updateError.message);
    }
  }

  async refreshTokens(tokens: ProviderTokens): Promise<ProviderTokens | null> {
    if (!tokens.refreshToken) {
      return null;
    }

    const { data, error } = await this.client.auth.refreshSession({ refresh_token: tokens.refreshToken });
    if (error || !data.session) {
      return null;
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token ?? tokens.refreshToken,
      expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000) : null,
    };
  }
}
