/**
 * Identity provider abstraction.
 *
 * The API never talks to Supabase Auth directly from a route handler: it goes through this
 * interface. Two implementations exist:
 *
 * - `LocalAuthProvider`  — self-hosted credentials (scrypt) and sessions. Used for development,
 *                          CI and the end-to-end suite. Blocked in production by a boot check.
 * - `SupabaseAuthProvider` — Supabase Auth (production).
 *
 * Everything above this interface is provider agnostic.
 */

export interface AuthIdentity {
  /** The provider's own user identifier (a Supabase uid, or `local:<random>`). */
  externalId: string;
  email: string;
  fullName: string | null;
  emailVerified: boolean;
}

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string | null;
}

export interface RegisterResult {
  identity: AuthIdentity;
  /** True when the identity must verify their email before signing in. */
  verificationRequired: boolean;
  /** Only populated in local mode, where the API is the one that "sends" the email. */
  verificationToken?: string;
}

export interface AuthProvider {
  readonly mode: 'supabase' | 'local';

  register(input: RegisterInput): Promise<RegisterResult>;
  login(email: string, password: string): Promise<{ identity: AuthIdentity; tokens: ProviderTokens | null }>;
  verifyEmail(token: string): Promise<void>;

  /**
   * Start a password reset.
   *
   * Returns the reset token in local mode (the caller is responsible for "delivering" it).
   * Never reveals whether an account exists.
   */
  requestPasswordReset(email: string): Promise<string | null>;

  resetPassword(token: string, newPassword: string): Promise<void>;

  /** Refresh the upstream tokens of an existing session (Supabase mode). */
  refreshTokens(tokens: ProviderTokens): Promise<ProviderTokens | null>;
}
