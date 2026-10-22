/**
 * Audit trail.
 *
 * Records the important events: organisation and membership changes, campaign and creator
 * changes, tracking asset changes, cost changes, order imports, refunds, and attribution
 * recomputation.
 *
 * The trail is append-only at the application level — `audit_events` revokes UPDATE and DELETE
 * for the application role and a trigger raises on any attempt. It is a strong deterrent and an
 * accurate record of what the application did; it is **not** a claim of tamper-proofing.
 */

import type { SqlClient } from '../db/driver.js';

export interface AuditEntry {
  organizationId: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ipHash?: string | null;
}

/**
 * Append an audit event.
 *
 * The insert runs in the caller's transaction so the audit entry and the change it describes are
 * committed together.
 */
export async function recordAudit(tx: SqlClient, entry: AuditEntry): Promise<void> {
  await tx.query(
    `INSERT INTO audit_events (
       organization_id, actor_user_id, actor_role, action, entity_type,
       entity_id, before, after, request_id, ip_hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.organizationId,
      entry.actorUserId ?? null,
      entry.actorRole ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.requestId ?? null,
      entry.ipHash ?? null,
    ],
  );
}

/** Remove secrets and bulky fields from a value before it is written to the trail. */
export function sanitiseForAudit(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => sanitiseForAudit(entry));

  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    if (key === 'password' || key === 'passwordHash' || key === 'token' || key === 'sessionToken') {
      continue;
    }
    output[key] = sanitiseForAudit(entry);
  }

  return output;
}
