/**
 * PGlite adapter — real PostgreSQL running in-process.
 *
 * Used by the integration test suite (no Docker required) and by the `pnpm dev:api:pglite`
 * script for a zero-setup local environment. The SQL dialect, transaction semantics and Row
 * Level Security behaviour are identical to a server-side PostgreSQL.
 */

import { PGlite } from '@electric-sql/pglite';

import type { DbDriver, QueryResult, SqlClient } from './driver.js';

export class PgliteDriver implements DbDriver {
  private readonly db: PGlite;

  constructor(db?: PGlite) {
    this.db = db ?? new PGlite();
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    const result = await this.db.query(sql, params as unknown[]);
    return { rows: result.rows as T[], rowCount: result.affectedRows ?? result.rows.length };
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    await this.db.exec('BEGIN');
    try {
      const result = await fn(this);
      await this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        await this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback failures — surface the original error.
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
