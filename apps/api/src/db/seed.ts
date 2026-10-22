/**
 * Demo seed.
 *
 * Applies `supabase/seed.sql` — clearly labelled demo data for evaluation only.
 * It refuses to run against a production database.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getEnv } from '../config/env.js';
import { getLogger } from '../shared/logger.js';

import { PgDriver } from './pg-driver.js';

async function main(): Promise<void> {
  const env = getEnv();
  const logger = getLogger();

  if (env.NODE_ENV === 'production') {
    throw new Error('The demo seed must never run against a production database.');
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const seedPath = resolve(here, '..', '..', '..', '..', 'supabase', 'seed.sql');
  const sql = await readFile(seedPath, 'utf8');

  const driver = new PgDriver();
  try {
    const existing = await driver.query('SELECT 1 FROM organizations LIMIT 1');
    if (existing.rows.length > 0) {
      logger.info('The database already contains data; the demo seed was skipped.');
      return;
    }
    await driver.transaction(async (tx) => {
      await tx.exec(sql);
    });
    logger.info({ seedPath }, 'Demo data inserted');
  } finally {
    await driver.close();
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((error: unknown) => {
    const logger = getLogger();
    logger.error({ err: error }, 'Seeding failed');
    process.exitCode = 1;
  });
}
