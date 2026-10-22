/**
 * Integration test helpers for the campaign, creator and tracking modules.
 *
 * The harness boots a real PostgreSQL (PGlite, in-process), applies the production migrations
 * and assembles the real Express application, so the tests exercise the actual SQL, the actual
 * Row Level Security policies and the actual HTTP middleware chain.
 *
 * PGlite's WebAssembly heap is created with a 2 GB ceiling. On a memory-constrained machine
 * that reservation can fail even though the database only needs a fraction of it, so the ceiling
 * can be lowered with `SALESTRACE_WASM_MAX_PAGES` (in 64 KiB pages).
 */

import { resolve } from 'node:path';

import type { Express } from 'express';
import supertest from 'supertest';

import type { AppContainer } from '../../src/container.js';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost/salestrace_test';
process.env.IP_HASH_PEPPER = process.env.IP_HASH_PEPPER ?? 'test-pepper-value-0001';
process.env.AUTH_MODE = process.env.AUTH_MODE ?? 'local';
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
process.env.API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
process.env.CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';

// The application modules read the environment while they are being loaded, so they are imported
// *after* the variables above are set (`tests/setup.ts` does the same for the whole suite).
const { createApp } = await import('../../src/app.js');
const { createContainer } = await import('../../src/container.js');
const { PgliteDriver } = await import('../../src/db/pglite-driver.js');
const { runMigrations } = await import('../../src/db/migrate.js');
const { LocalFileStorage } = await import('../../src/shared/storage.js');

/**
 * The origin a browser sends for a same-origin request from the web app.
 *
 * The CSRF guard accepts it because it is in the allow-list. It is the web app's origin — the
 * API is always reached through the same-origin proxy in production.
 */
export const API_ORIGIN = 'http://localhost:3000';

const MIGRATIONS_DIRECTORY = resolve(
  import.meta.dirname ?? __dirname,
  '..',
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
);

/** Lower the WebAssembly heap ceiling of PGlite when the machine cannot reserve 2 GB. */
function applyWasmMemoryCap(): void {
  const limit = process.env['SALESTRACE_WASM_MAX_PAGES'];
  if (limit === undefined || limit === '') return;

  const maxPages = Number(limit);
  if (!Number.isFinite(maxPages) || maxPages <= 0) return;

  interface MemoryDescriptor {
    initial: number;
    maximum?: number;
  }

  const wasm = (
    globalThis as unknown as {
      WebAssembly: { Memory: new (descriptor: MemoryDescriptor) => object };
    }
  ).WebAssembly;

  const OriginalMemory = wasm.Memory;

  wasm.Memory = class CappedMemory extends OriginalMemory {
    constructor(descriptor: MemoryDescriptor) {
      super({ ...descriptor, maximum: maxPages });
    }
  };
}

applyWasmMemoryCap();

export interface TestHarness {
  app: Express;
  container: AppContainer;
  request: supertest.Agent;
  close(): Promise<void>;
}

/**
 * Boot the database, the container and the application.
 */
export async function createTestHarness(): Promise<TestHarness> {
  const driver = new PgliteDriver();
  await runMigrations(driver, { directory: MIGRATIONS_DIRECTORY });

  const container = createContainer({
    db: driver,
    storage: new LocalFileStorage(resolve(process.cwd(), '.data', 'test-storage')),
  });

  const app = createApp(container);

  return {
    app,
    container,
    request: supertest(app),
    async close(): Promise<void> {
      await container.close();
    },
  };
}

export interface TestUser {
  cookie: string;
  /** The raw session token (the value of the `st_session` cookie). */
  token: string;
  profileId: string;
  email: string;
}

/**
 * A thin client that always carries the session cookie and a permitted `Origin` header.
 *
 * The CSRF guard rejects state-changing requests without an `Origin`, exactly as it does in
 * production.
 */
export class TestClient {
  constructor(
    private readonly request: supertest.Agent,
    private readonly cookie: string,
  ) {}

  get(path: string): supertest.Test {
    return this.request.get(path).set('Cookie', this.cookie);
  }

  post(path: string): supertest.Test {
    return this.request.post(path).set('Cookie', this.cookie).set('Origin', API_ORIGIN);
  }

  patch(path: string): supertest.Test {
    return this.request.patch(path).set('Cookie', this.cookie).set('Origin', API_ORIGIN);
  }

  delete(path: string): supertest.Test {
    return this.request.delete(path).set('Cookie', this.cookie).set('Origin', API_ORIGIN);
  }
}

export function clientFor(harness: TestHarness, user: TestUser): TestClient {
  return new TestClient(harness.request, user.cookie);
}

/** Register a user, verify the address and sign in. */
export async function registerUser(
  harness: TestHarness,
  email: string,
  fullName = 'Test User',
): Promise<TestUser> {
  const registered = await harness.request.post('/api/v1/auth/register').send({
    email,
    password: 'Str0ng-Passw0rd',
    fullName,
  });

  if (registered.status !== 201) {
    throw new Error(`Registration failed: ${registered.status} ${JSON.stringify(registered.body)}`);
  }

  const verificationToken = registered.body?.data?.verificationToken as string | undefined;
  if (verificationToken !== undefined) {
    const verified = await harness.request
      .post('/api/v1/auth/verify-email')
      .send({ token: verificationToken });
    if (verified.status !== 204) {
      throw new Error(`Verification failed: ${verified.status} ${JSON.stringify(verified.body)}`);
    }
  } else {
    // The registration response only carries the user, so the verification token of the local
    // identity provider never reaches the client. The flag is therefore set directly.
    await harness.container.db.query(
      'UPDATE profiles SET email_verified = true WHERE lower(email) = lower($1)',
      [email],
    );
  }

  const login = await harness.request.post('/api/v1/auth/login').send({
    email,
    password: 'Str0ng-Passw0rd',
  });

  if (login.status !== 200) {
    throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.body)}`);
  }

  const setCookie = login.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (raw === undefined) throw new Error('No session cookie was issued.');

  const cookie = raw.split(';')[0] ?? '';
  const token = cookie.includes('=') ? cookie.slice(cookie.indexOf('=') + 1) : cookie;

  return {
    cookie,
    token,
    profileId: login.body.data.user.id as string,
    email,
  };
}

/** Create an organization through the API and make the user its owner and active member. */
export async function createOrganization(
  harness: TestHarness,
  user: TestUser,
  name: string,
  currency = 'ETB',
): Promise<string> {
  const client = clientFor(harness, user);

  const response = await client.post('/api/v1/organizations').send({
    name,
    timezone: 'Africa/Addis_Ababa',
    currency,
  });

  if (response.status !== 201) {
    throw new Error(`Organization creation failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body.data.id as string;
}

/** Create a creator through the API and return its id. */
export async function createCreator(
  client: TestClient,
  input: { internalCode: string; displayName: string; platform?: string; niche?: string },
): Promise<string> {
  const response = await client.post('/api/v1/creators').send({
    internalCode: input.internalCode,
    displayName: input.displayName,
    platform: input.platform ?? 'instagram',
    niche: input.niche ?? 'beauty',
  });

  if (response.status !== 201) {
    throw new Error(`Creator creation failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body.data.id as string;
}

/** Create a campaign through the API and return its id. */
export async function createCampaign(
  client: TestClient,
  input: {
    name: string;
    startAt?: string;
    endAt?: string | null;
    destinationUrl?: string;
    budget?: string | null;
    currency?: string;
  },
): Promise<string> {
  const response = await client.post('/api/v1/campaigns').send({
    name: input.name,
    startAt: input.startAt ?? '2026-03-01T00:00:00.000Z',
    endAt: input.endAt === undefined ? '2026-04-01T00:00:00.000Z' : input.endAt,
    destinationUrl: input.destinationUrl ?? 'https://shop.brand.et/summer',
    ...(input.budget === undefined ? {} : { budget: input.budget }),
    ...(input.currency === undefined ? {} : { currency: input.currency }),
  });

  if (response.status !== 201) {
    throw new Error(`Campaign creation failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body.data.id as string;
}

/** Move a campaign into the `active` state so that its tracking links resolve. */
export async function activateCampaign(client: TestClient, campaignId: string): Promise<void> {
  const response = await client.post(`/api/v1/campaigns/${campaignId}/status`).send({ status: 'active' });
  if (response.status !== 200) {
    throw new Error(`Campaign activation failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
}
