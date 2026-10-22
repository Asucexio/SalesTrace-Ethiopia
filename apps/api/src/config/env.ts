/**
 * Environment configuration.
 *
 * The API refuses to start with a missing or malformed variable. The error message names the
 * variable and the expected format but never prints a value — secrets must not leak into logs.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load the environment file. `pnpm --filter` runs scripts with `apps/api` as the working
// directory, but the README tells you to create `.env` in the repository root, so look in both
// places. dotenv never overrides a variable that is already set, so the order is the priority.
if (process.env.DOTENV_PATH) {
  loadDotenv({ path: process.env.DOTENV_PATH });
} else {
  const here = dirname(fileURLToPath(import.meta.url));
  // `src/config` (dev) and `dist/config` (build) both sit three levels below the repository root.
  const repoRoot = resolve(here, '..', '..', '..', '..');
  loadDotenv({ path: '.env' });
  loadDotenv({ path: resolve(repoRoot, '.env') });
}

const booleanString = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : value.trim().toLowerCase() === 'true'));

const csvList = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),

  /** PostgreSQL connection string (Supabase or a local Postgres). */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanString.default('false'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(50).default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  /** `supabase` (production) or `local` (development, CI, E2E). */
  AUTH_MODE: z.enum(['supabase', 'local']).default('local'),
  SESSION_COOKIE_NAME: z.string().min(1).default('st_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: booleanString.default('false'),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  /** Origins allowed to call the API directly (the web app proxies, so usually just itself). */
  CORS_ALLOWED_ORIGINS: csvList,

  /** Public base URL used to build tracking links (e.g. https://app.salestrace.et). */
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  /** Base URL of the API itself, used by the web app proxy and in OpenAPI. */
  API_BASE_URL: z.string().url().default('http://localhost:4000'),

  /** Salt for hashing visitor IPs. Changing it invalidates existing fingerprints. */
  IP_HASH_PEPPER: z.string().min(8, 'IP_HASH_PEPPER must be at least 8 characters'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),

  /** Maximum CSV imports per organization per 10 minutes. */
  IMPORT_RATE_LIMIT: z.coerce.number().int().positive().default(5),

  /** Click de-duplication window in seconds. */
  TRACKING_DEDUPE_WINDOW_SECONDS: z.coerce.number().int().positive().default(30),

  /** Append the referral code to the destination URL as `st_ref`. */
  TRACKING_PROPAGATE_REF_PARAM: booleanString.default('true'),
});

export type Env = z.infer<typeof envSchema>;

export class ConfigurationError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function formatProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new ConfigurationError(
      'Invalid environment configuration.',
      formatProblems(parsed.error),
    );
  }

  const env = parsed.data;

  if (env.AUTH_MODE === 'supabase') {
    const missing = (['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const).filter(
      (key) => !env[key],
    );
    if (missing.length > 0) {
      throw new ConfigurationError(
        'Invalid environment configuration.',
        missing.map((key) => `${key}: required when AUTH_MODE=supabase`),
      );
    }
  }

  if (env.NODE_ENV === 'production') {
    const problems: string[] = [];

    if (env.AUTH_MODE === 'local') {
      problems.push('AUTH_MODE: the local identity provider must not be used in production');
    }
    if (!env.COOKIE_SECURE) {
      problems.push('COOKIE_SECURE: must be true in production');
    }
    if (!env.DATABASE_SSL && !env.DATABASE_URL.includes('sslmode=require')) {
      problems.push('DATABASE_SSL: TLS must be required for the database connection in production');
    }
    if (env.CORS_ALLOWED_ORIGINS.length === 0) {
      problems.push('CORS_ALLOWED_ORIGINS: at least one origin must be allowed in production');
    }

    if (problems.length > 0) {
      throw new ConfigurationError('Invalid production configuration.', problems);
    }
  }

  return env;
}

let cached: Env | null = null;

/** The validated environment. Throws `ConfigurationError` when the configuration is invalid. */
export function getEnv(): Env {
  if (cached === null) {
    cached = loadEnv();
  }
  return cached;
}

/** Test helper: forget the cached environment so a new one is loaded. */
export function resetEnvCache(): void {
  cached = null;
}
