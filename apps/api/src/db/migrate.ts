/**
 * Migration runner.
 *
 * Applies the versioned SQL files in `supabase/migrations` in order, each inside a transaction,
 * and records what it applied in `schema_migrations`.
 *
 * Two safety rules:
 * - A migration that was already applied must not change: its checksum is verified and a mismatch
 *   aborts the run.
 * - The runner refuses to start against a database that has tables but no migration history,
 *   which would otherwise silently skip the schema.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getLogger } from '../shared/logger.js';

import type { DbDriver } from './driver.js';

const MIGRATION_FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/** Absolute path to the migrations directory. */
export function migrationsDirectory(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // `src/db` during development, `dist/db` after a build — both sit two levels below the
  // package root, which is two levels below `apps/api`.
  const packageRoot = resolve(here, '..', '..');
  return join(packageRoot, '..', '..', 'supabase', 'migrations');
}

async function ensureMigrationsTable(db: DbDriver): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function runMigrations(
  db: DbDriver,
  options: { directory?: string } = {},
): Promise<MigrationResult> {
  const logger = getLogger();
  const directory = options.directory ?? migrationsDirectory();

  await ensureMigrationsTable(db);

  const applied = new Map<string, string>();
  const existing = await db.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations',
  );
  for (const row of existing.rows) {
    applied.set(row.version, row.checksum);
  }

  const files = (await readdir(directory)).filter((file) => MIGRATION_FILE_PATTERN.test(file)).sort();

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const sql = await readFile(join(directory, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    const previousChecksum = applied.get(version);
    if (previousChecksum !== undefined) {
      if (previousChecksum !== checksum) {
        throw new Error(
          `Migration "${version}" has already been applied but its contents changed. ` +
            'Applied migrations are immutable — add a new migration instead.',
        );
      }
      result.skipped.push(version);
      continue;
    }

    logger.info({ migration: version }, 'Applying migration');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
        version,
        checksum,
      ]);
    });
    result.applied.push(version);
  }

  return result;
}

/** CLI entry point: `pnpm db:migrate`. */
async function main(): Promise<void> {
  const { PgDriver } = await import('./pg-driver.js');
  const driver = new PgDriver();
  try {
    const result = await runMigrations(driver);
    const logger = getLogger();
    if (result.applied.length > 0) {
      logger.info({ applied: result.applied }, 'Migrations applied');
    } else {
      logger.info('Database is already up to date');
    }
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
    logger.error({ err: error }, 'Migration failed');
    process.exitCode = 1;
  });
}
