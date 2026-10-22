/**
 * Integration test harness.
 *
 * Boots a real PostgreSQL (PGlite, in-process) with the production migrations, assembles the
 * application container and returns a Supertest-ready Express app plus helpers for creating
 * tenants and sessions.
 *
 * The tests therefore exercise the actual SQL, the actual Row Level Security policies and the
 * actual HTTP middleware chain — not a simulation of them.
 */

import { resolve } from 'node:path';

import type { Express } from 'express';
import supertest from 'supertest';

import { createApp } from '../../src/app.js';
import { createContainer, type AppContainer } from '../../src/container.js';
import { PgliteDriver } from '../../src/db/pglite-driver.js';
import { runMigrations } from '../../src/db/migrate.js';
import { LocalFileStorage } from '../../src/shared/storage.js';

/** The origin a browser would send for a same-origin request from the web app. */
export const TEST_ORIGIN = 'http://localhost:3000';

const MIGRATIONS_DIRECTORY = resolve(
  import.meta.dirname ?? __dirname,
  '..',
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
);

export interface Harness {
  app: Express;
  container: AppContainer;
  request: TestClient;
  close(): Promise<void>;
}

/**
 * A request client that adds the `Origin` header a browser would send.
 *
 * It deliberately does **not** use `supertest.agent()`: an agent keeps a cookie jar, so a
 * session cookie from one "user" would leak into the next request and the isolation tests would
 * silently test the wrong tenant. Every request here is independent and carries exactly the
 * cookie the test sets.
 */
export interface TestClient {
  get(url: string): supertest.Test;
  post(url: string): supertest.Test;
  put(url: string): supertest.Test;
  patch(url: string): supertest.Test;
  delete(url: string): supertest.Test;
}

export async function createHarness(): Promise<Harness> {
  const driver = new PgliteDriver();
  await runMigrations(driver, { directory: MIGRATIONS_DIRECTORY });

  const container = createContainer({
    db: driver,
    storage: new LocalFileStorage(resolve(process.cwd(), '.data', 'test-storage')),
  });

  const app = createApp(container);
  const base = supertest(app);

  const withOrigin = (test: supertest.Test): supertest.Test => test.set('Origin', TEST_ORIGIN);

  const request: TestClient = {
    get: (url) => withOrigin(base.get(url)),
    post: (url) => withOrigin(base.post(url)),
    put: (url) => withOrigin(base.put(url)),
    patch: (url) => withOrigin(base.patch(url)),
    delete: (url) => withOrigin(base.delete(url)),
  };

  return {
    app,
    container,
    request,
    async close(): Promise<void> {
      await container.close();
    },
  };
}

export interface TestUser {
  cookie: string;
  profileId: string;
  email: string;
}

/**
 * Register a user, verify their email and sign in.
 *
 * Returns the session cookie so a test can act as that user.
 */
export async function registerAndLogin(
  harness: Harness,
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
  }

  const login = await harness.request.post('/api/v1/auth/login').send({
    email,
    password: 'Str0ng-Passw0rd',
  });

  if (login.status !== 200) {
    throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.body)}`);
  }

  const cookie = extractCookie(login.headers['set-cookie']);

  return { cookie, profileId: login.body.data.user.id, email };
}

function extractCookie(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) throw new Error('No session cookie was issued.');
  return value.split(';')[0] ?? '';
}

/** Create an organization through the API and make the user its owner and active member. */
export async function createOrganization(
  harness: Harness,
  user: TestUser,
  name: string,
): Promise<string> {
  const response = await harness.request
    .post('/api/v1/organizations')
    .set('Cookie', user.cookie)
    .send({ name, timezone: 'Africa/Addis_Ababa', currency: 'ETB' });

  if (response.status !== 201) {
    throw new Error(`Organization creation failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body.data.id as string;
}

/** A minimal valid order CSV. */
export function ordersCsv(rows: Array<Record<string, string>>): string {
  const headers = [
    'order_id',
    'order_date',
    'currency',
    'subtotal',
    'discount',
    'tax',
    'shipping',
    'total',
    'status',
    'coupon_code',
    'referral_code',
    'customer_email',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => row[header] ?? '').join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Upload, preview and commit a CSV through the import pipeline. */
export async function importOrders(
  harness: Harness,
  user: TestUser,
  csv: string,
): Promise<{ importId: string; commit: ImportCounts }> {
  const uploaded = await harness.request
    .post('/api/v1/orders/imports?fileName=orders.csv')
    .set('Cookie', user.cookie)
    .set('Content-Type', 'text/csv')
    .send(csv);

  if (uploaded.status !== 201) {
    throw new Error(`Upload failed: ${uploaded.status} ${JSON.stringify(uploaded.body)}`);
  }

  const importId = uploaded.body.data.importId as string;

  const committed = await harness.request
    .post(`/api/v1/orders/imports/${importId}/commit`)
    .set('Cookie', user.cookie)
    .send({});

  return { importId, commit: committed.body.data.counts as ImportCounts };
}

/** The counts returned by the import pipeline. */
export interface ImportCounts {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  updatedRows: number;
  skippedRows: number;
  attributedOrders: number;
}
