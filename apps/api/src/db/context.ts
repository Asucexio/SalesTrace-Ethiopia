/**
 * Organization request context.
 *
 * This is where tenant isolation is actually enforced at the database level:
 *
 * 1. The transaction switches to the `salestrace_app` role, which has `NOBYPASSRLS` — so every
 *    statement in the transaction is evaluated against the Row Level Security policies.
 * 2. The organization id is published as the transaction-local setting `app.current_org_id`.
 *    Policies compare `organization_id` against it.
 * 3. If the setting is missing, the policies match nothing: the system fails closed.
 */

import type { OrganizationRole } from '@salestrace/shared-types';

import type { DbDriver, SqlClient } from './driver.js';

export interface RequestContext {
  organizationId: string;
  userId: string | null;
  role: OrganizationRole;
}

/**
 * Runs `fn` inside a transaction that carries the organization context.
 *
 * The organization id comes from the authenticated session, never from request input.
 */
export async function withOrgContext<T>(
  db: DbDriver,
  context: RequestContext,
  fn: (tx: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query('SET LOCAL ROLE salestrace_app');

    await tx.query(`SELECT set_config('app.current_org_id', $1, true)`, [context.organizationId]);

    if (context.userId !== null) {
      await tx.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
    }

    return fn(tx);
  });
}

/**
 * Runs `fn` in a transaction **without** the application role.
 *
 * Used for operations that are not tenant scoped (session lookup, the migration runner) and for
 * maintenance operations that legitimately need to see across tenants. It must not be used for
 * customer-facing reads of tenant data.
 */
export async function withSystemContext<T>(
  db: DbDriver,
  fn: (tx: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(fn);
}
