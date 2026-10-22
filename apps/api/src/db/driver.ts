/**
 * The database port.
 *
 * The API talks to PostgreSQL through this small interface rather than importing `pg` directly.
 * Two adapters implement it:
 *
 * - `PgDriver`      — node-postgres against Supabase / any PostgreSQL server (production).
 * - `PgliteDriver`  — PGlite (real PostgreSQL compiled to WebAssembly) for integration tests and
 *                     for a zero-dependency local environment.
 *
 * Because PGlite is genuine PostgreSQL, the integration suite exercises the same SQL, the same
 * Row Level Security policies and the same transaction semantics as production.
 */

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface SqlClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;

  /**
   * Runs a script that may contain several statements.
   *
   * Used by the migration runner: node-postgres accepts a multi-statement script when no
   * parameters are supplied, and PGlite requires `exec` for the same thing.
   */
  exec(sql: string): Promise<void>;
}

export interface DbDriver extends SqlClient {
  /**
   * Runs `fn` inside a transaction. The transaction is committed when `fn` resolves and rolled
   * back when it throws.
   */
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** A `SqlClient` that simply forwards to another client (used by transaction wrappers). */
export function asSqlClient(driver: SqlClient): SqlClient {
  return {
    query: (sql, params) => driver.query(sql, params),
    exec: (sql) => driver.exec(sql),
  };
}
