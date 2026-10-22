/**
 * Attribution controller.
 *
 * Exposes the recorded decisions and the recomputation entry point.
 */

import type { Request, Response } from 'express';

import { withOrgContext } from '../../db/context.js';
import type { DbDriver } from '../../db/driver.js';
import { recordAudit, sanitiseForAudit } from '../../shared/audit.js';
import { AppError } from '../../shared/errors.js';
import { sendData, sendPaginated } from '../../shared/response.js';

import type { AttributionService } from './attribution.service.js';

export interface AttributionControllerDeps {
  db: DbDriver;
  service: AttributionService;
}

interface AttributionRow {
  id: string;
  order_id: string;
  external_order_id: string;
  campaign_id: string;
  campaign_name: string;
  creator_id: string;
  creator_name: string;
  method: string;
  rule_version: string;
  rule_snapshot: Record<string, unknown>;
  decision_reason: string;
  conflict_flag: boolean;
  conflict_detail: Record<string, unknown> | null;
  matched_event_id: string | null;
  matched_coupon_id: string | null;
  is_valid_sale: boolean;
  attributed_at: Date;
  ordered_at: Date;
  total_paid_minor: number;
  currency: string;
}

function mapAttribution(row: AttributionRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    externalOrderId: row.external_order_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    method: row.method,
    ruleVersion: row.rule_version,
    ruleSnapshot: row.rule_snapshot ?? {},
    decisionReason: row.decision_reason,
    conflictFlag: row.conflict_flag,
    conflictDetail: row.conflict_detail,
    matchedEventId: row.matched_event_id,
    matchedCouponId: row.matched_coupon_id,
    isValidSale: row.is_valid_sale,
    attributedAt: row.attributed_at.toISOString(),
    orderedAt: row.ordered_at.toISOString(),
    totalPaid: (row.total_paid_minor / 100).toFixed(2),
    currency: row.currency,
  };
}

export function createAttributionController(deps: AttributionControllerDeps) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const query = req.query as unknown as {
        campaignId?: string;
        creatorId?: string;
        method?: string;
        conflict?: boolean;
        from?: string;
        to?: string;
        limit: number;
        offset: number;
      };

      const clauses = ['a.organization_id = $1'];
      const params: unknown[] = [auth.organizationId];

      if (query.campaignId !== undefined) {
        params.push(query.campaignId);
        clauses.push(`a.campaign_id = $${params.length}`);
      }
      if (query.creatorId !== undefined) {
        params.push(query.creatorId);
        clauses.push(`a.creator_id = $${params.length}`);
      }
      if (query.method !== undefined) {
        params.push(query.method);
        clauses.push(`a.method = $${params.length}`);
      }
      if (query.conflict !== undefined) {
        params.push(query.conflict);
        clauses.push(`a.conflict_flag = $${params.length}`);
      }
      if (query.from !== undefined) {
        params.push(new Date(query.from));
        clauses.push(`o.ordered_at >= $${params.length}`);
      }
      if (query.to !== undefined) {
        params.push(new Date(query.to));
        clauses.push(`o.ordered_at < $${params.length}`);
      }

      const result = await withOrgContext(
        deps.db,
        { organizationId: auth.organizationId, userId: auth.profileId, role: auth.role },
        async (tx) => {
          const items = await tx.query<AttributionRow>(
            `SELECT a.id, a.order_id, o.external_order_id, a.campaign_id, c.name AS campaign_name,
                    a.creator_id, cr.display_name AS creator_name, a.method, a.rule_version,
                    a.rule_snapshot, a.decision_reason, a.conflict_flag, a.conflict_detail,
                    a.matched_event_id, a.matched_coupon_id, a.is_valid_sale, a.attributed_at,
                    o.ordered_at, o.total_paid_minor, o.currency
             FROM attributions a
             JOIN orders o ON o.id = a.order_id
             JOIN campaigns c ON c.id = a.campaign_id
             JOIN creators cr ON cr.id = a.creator_id
             WHERE ${clauses.join(' AND ')}
             ORDER BY o.ordered_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, query.limit, query.offset],
          );

          const total = await tx.query<{ count: number }>(
            `SELECT count(*)::int AS count
             FROM attributions a
             JOIN orders o ON o.id = a.order_id
             WHERE ${clauses.join(' AND ')}`,
            params,
          );

          return { items: items.rows, total: total.rows[0]?.count ?? 0 };
        },
      );

      sendPaginated(res, result.items.map(mapAttribution), result.total, query.limit, query.offset);
    },

    async detail(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const attributionId = req.params['attributionId'];
      if (!attributionId) throw AppError.notFound('Attribution');

      const result = await withOrgContext(
        deps.db,
        { organizationId: auth.organizationId, userId: auth.profileId, role: auth.role },
        async (tx) => {
          const found = await tx.query<AttributionRow>(
            `SELECT a.id, a.order_id, o.external_order_id, a.campaign_id, c.name AS campaign_name,
                    a.creator_id, cr.display_name AS creator_name, a.method, a.rule_version,
                    a.rule_snapshot, a.decision_reason, a.conflict_flag, a.conflict_detail,
                    a.matched_event_id, a.matched_coupon_id, a.is_valid_sale, a.attributed_at,
                    o.ordered_at, o.total_paid_minor, o.currency
             FROM attributions a
             JOIN orders o ON o.id = a.order_id
             JOIN campaigns c ON c.id = a.campaign_id
             JOIN creators cr ON cr.id = a.creator_id
             WHERE a.organization_id = $1 AND a.id = $2`,
            [auth.organizationId, attributionId],
          );
          return found.rows[0] ?? null;
        },
      );

      if (result === null) throw AppError.notFound('Attribution');
      sendData(res, mapAttribution(result));
    },

    /** Recompute the attribution for a campaign or for the whole organization. */
    async recompute(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const body = req.body as { campaignId?: string };

      const summary = await withOrgContext(
        deps.db,
        { organizationId: auth.organizationId, userId: auth.profileId, role: auth.role },
        async (tx) => {
          const params: unknown[] = [auth.organizationId];
          let clause = 'o.organization_id = $1';

          if (body.campaignId !== undefined) {
            params.push(body.campaignId);
            clause += ` AND a.campaign_id = $${params.length}`;
          }

          const orders = await tx.query<{ id: string }>(
            `SELECT o.id FROM orders o
             LEFT JOIN attributions a ON a.order_id = o.id
             WHERE ${clause}
             ORDER BY o.ordered_at
             LIMIT 5000`,
            params,
          );

          let attributed = 0;
          let updated = 0;

          for (const order of orders.rows) {
            const before = await tx.query<{ id: string }>(
              'SELECT id FROM attributions WHERE order_id = $1',
              [order.id],
            );

            const decision = await deps.service.attributeOrder(tx, {
              organizationId: auth.organizationId,
              orderId: order.id,
              requestId: req.requestId,
              actorUserId: auth.profileId,
              actorRole: auth.role,
            });

            if (decision?.attributed === true) {
              attributed += 1;
              if (before.rows.length > 0) updated += 1;
            }
          }

          await recordAudit(tx, {
            organizationId: auth.organizationId,
            actorUserId: auth.profileId,
            actorRole: auth.role,
            action: 'attribution.recomputed',
            entityType: 'campaign',
            entityId: body.campaignId ?? null,
            after: sanitiseForAudit({ ordersEvaluated: orders.rows.length, attributed, updated }),
            requestId: req.requestId,
          });

          return {
            campaignId: body.campaignId ?? null,
            ruleVersion: 'v1.0.0',
            ordersEvaluated: orders.rows.length,
            attributed,
            updated,
            unattributed: orders.rows.length - attributed,
          };
        },
      );

      sendData(res, summary);
    },

    /** The active policy version and its resolved configuration. */
    async rules(_req: Request, res: Response): Promise<void> {
      sendData(res, {
        version: 'v1.0.0',
        clickModel: 'last_eligible_click',
        couponOverridesLink: true,
        signalPrecedence: ['coupon', 'referral_identifier', 'click'],
        defaultWindowDays: 7,
        description:
          'Attribution is association under a declared rule. It does not claim causality or incrementality.',
      });
    },
  };
}
