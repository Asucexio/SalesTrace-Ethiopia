/**
 * node-postgres adapter.
 *
 * `int8` (bigint) values are parsed into JavaScript numbers. Minor-unit amounts are integers far
 * below `Number.MAX_SAFE_INTEGER`, so this is exact — and it keeps the application code free of
 * string-to-number conversions on every monetary column.
 */

import { Pool, types } from 'pg';

import { getEnv } from '../config/env.js';
import type { DbDriver, QueryResult, SqlClient } from './driver.js';

types.setTypeParser(types.builtins.INT8, (value: string) => Number.parseInt(value, 10));
types.setTypeParser(types.builtins.NUMERIC, (value: string) => Number.parseFloat(value));

export class PgDriver implements DbDriver {
  private readonly pool: Pool;

  constructor(connectionString?: string) {
    const env = getEnv();
    this.pool = new Pool({
      connectionString: connectionString ?? env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
      statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
      application_name: 'salestrace-api',
    });
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, params as unknown[]);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const scoped: SqlClient = {
      query: async <T = Record<string, unknown>>(
        sql: string,
        params?: readonly unknown[],
      ): Promise<QueryResult<T>> => {
        const result = await client.query(sql, (params ?? []) as unknown[]);
        return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
      },
      exec: async (sql: string) => {
        await client.query(sql);
      },
    };

    try {
      await client.query('BEGIN');
      const result = await fn(scoped);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The connection is already broken; the original error is the useful one.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
