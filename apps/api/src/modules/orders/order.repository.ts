/**
 * Order repository.
 *
 * Read models for the orders table joined with its attribution, plus the write paths for
 * refunds. Every statement is scoped by the organization id.
 */

import type { OrderStatus } from '@salestrace/shared-types';

import type { SqlClient } from '../../db/driver.js';

export interface OrderListFilters {
  organizationId: string;
  status?: OrderStatus;
  campaignId?: string;
  creatorId?: string;
  attributed?: boolean;
  method?: string;
  search?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
  sort: 'orderedAt' | '-orderedAt' | 'totalPaid' | '-totalPaid' | 'externalOrderId';
}

export interface OrderRow {
  id: string;
  organization_id: string;
  external_order_id: string;
  source: string;
  ordered_at: Date;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  shipping_minor: number;
  total_paid_minor: number;
  status: OrderStatus;
  coupon_code: string | null;
  referral_identifier: string | null;
  refund_minor: number;
  attribution_id: string | null;
  attribution_method: string | null;
  attribution_campaign_id: string | null;
  attribution_campaign_name: string | null;
  attribution_creator_id: string | null;
  attribution_creator_name: string | null;
  attribution_rule_version: string | null;
  attribution_decision_reason: string | null;
  attribution_conflict_flag: boolean | null;
  attribution_is_valid_sale: boolean | null;
  created_at: Date;
  updated_at: Date;
}

const SORT_COLUMNS: Record<OrderListFilters['sort'], string> = {
  orderedAt: 'o.ordered_at',
  '-orderedAt': 'o.ordered_at DESC',
  totalPaid: 'o.total_paid_minor',
  '-totalPaid': 'o.total_paid_minor DESC',
  externalOrderId: 'o.external_order_id',
};

export const orderRepository = {
  /** Build the shared WHERE clauses for the order list. */
  buildFilters(filters: OrderListFilters): { clauses: string[]; params: unknown[] } {
    const clauses: string[] = ['o.organization_id = $1'];
    const params: unknown[] = [filters.organizationId];

    const push = (clause: string, value: unknown): void => {
      params.push(value);
      clauses.push(clause.replace('?', `$${params.length}`));
    };

    if (filters.status !== undefined) push('o.status = ?', filters.status);
    if (filters.campaignId !== undefined) push('a.campaign_id = ?', filters.campaignId);
    if (filters.creatorId !== undefined) push('a.creator_id = ?', filters.creatorId);
    if (filters.method !== undefined) push('a.method = ?', filters.method);
    if (filters.attributed === true) clauses.push('a.id IS NOT NULL');
    if (filters.attributed === false) clauses.push('a.id IS NULL');
    if (filters.search !== undefined && filters.search.length > 0) {
      params.push(filters.search);
      clauses.push(
        `(o.external_order_id ILIKE '%' || $${params.length} || '%' OR o.coupon_code ILIKE '%' || $${params.length} || '%')`,
      );
    }
    if (filters.from !== undefined) push('o.ordered_at >= ?', filters.from);
    if (filters.to !== undefined) push('o.ordered_at < ?', filters.to);

    return { clauses, params };
  },

  async list(tx: SqlClient, filters: OrderListFilters): Promise<{ items: OrderRow[]; total: number }> {
    const { clauses, params } = orderRepository.buildFilters(filters);
    const where = clauses.join(' AND ');

    const items = await tx.query<OrderRow>(
      `SELECT o.id, o.organization_id, o.external_order_id, o.source, o.ordered_at, o.currency,
              o.subtotal_minor, o.discount_minor, o.tax_minor, o.shipping_minor, o.total_paid_minor,
              o.status, o.coupon_code, o.referral_identifier,
              COALESCE(r.refund_total, 0)::bigint AS refund_minor,
              a.id AS attribution_id, a.method AS attribution_method,
              a.campaign_id AS attribution_campaign_id, c.name AS attribution_campaign_name,
              a.creator_id AS attribution_creator_id, cr.display_name AS attribution_creator_name,
              a.rule_version AS attribution_rule_version,
              a.decision_reason AS attribution_decision_reason,
              a.conflict_flag AS attribution_conflict_flag,
              a.is_valid_sale AS attribution_is_valid_sale,
              o.created_at, o.updated_at
       FROM orders o
       LEFT JOIN attributions a ON a.order_id = o.id
       LEFT JOIN campaigns c ON c.id = a.campaign_id
       LEFT JOIN creators cr ON cr.id = a.creator_id
       LEFT JOIN (
         SELECT order_id, sum(amount_minor) AS refund_total FROM refunds GROUP BY order_id
       ) r ON r.order_id = o.id
       WHERE ${where}
       ORDER BY ${SORT_COLUMNS[filters.sort]}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, filters.offset],
    );

    const total = await tx.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM orders o
       LEFT JOIN attributions a ON a.order_id = o.id
       WHERE ${where}`,
      params,
    );

    return { items: items.rows, total: total.rows[0]?.count ?? 0 };
  },

  async findById(tx: SqlClient, organizationId: string, orderId: string): Promise<OrderRow | null> {
    const result = await tx.query<OrderRow>(
      `SELECT o.id, o.organization_id, o.external_order_id, o.source, o.ordered_at, o.currency,
              o.subtotal_minor, o.discount_minor, o.tax_minor, o.shipping_minor, o.total_paid_minor,
              o.status, o.coupon_code, o.referral_identifier,
              COALESCE(r.refund_total, 0)::bigint AS refund_minor,
              a.id AS attribution_id, a.method AS attribution_method,
              a.campaign_id AS attribution_campaign_id, c.name AS attribution_campaign_name,
              a.creator_id AS attribution_creator_id, cr.display_name AS attribution_creator_name,
              a.rule_version AS attribution_rule_version,
              a.decision_reason AS attribution_decision_reason,
              a.conflict_flag AS attribution_conflict_flag,
              a.is_valid_sale AS attribution_is_valid_sale,
              o.created_at, o.updated_at
       FROM orders o
       LEFT JOIN attributions a ON a.order_id = o.id
       LEFT JOIN campaigns c ON c.id = a.campaign_id
       LEFT JOIN creators cr ON cr.id = a.creator_id
       LEFT JOIN (
         SELECT order_id, sum(amount_minor) AS refund_total FROM refunds GROUP BY order_id
       ) r ON r.order_id = o.id
       WHERE o.organization_id = $1 AND o.id = $2`,
      [organizationId, orderId],
    );
    return result.rows[0] ?? null;
  },

  async listItems(tx: SqlClient, organizationId: string, orderId: string): Promise<
    Array<{
      id: string;
      sku: string | null;
      name: string | null;
      quantity: number;
      unit_price_minor: number;
      line_total_minor: number;
    }>
  > {
    const result = await tx.query<{
      id: string;
      sku: string | null;
      name: string | null;
      quantity: number;
      unit_price_minor: number;
      line_total_minor: number;
    }>(
      `SELECT id, sku, name, quantity, unit_price_minor, line_total_minor
       FROM order_items WHERE organization_id = $1 AND order_id = $2 ORDER BY id`,
      [organizationId, orderId],
    );
    return result.rows;
  },

  async listRefunds(tx: SqlClient, organizationId: string, orderId: string): Promise<
    Array<{
      id: string;
      order_id: string;
      amount_minor: number;
      currency: string;
      reason: string | null;
      external_refund_id: string | null;
      refunded_at: Date;
    }>
  > {
    const result = await tx.query<{
      id: string;
      order_id: string;
      amount_minor: number;
      currency: string;
      reason: string | null;
      external_refund_id: string | null;
      refunded_at: Date;
    }>(
      `SELECT id, order_id, amount_minor, currency, reason, external_refund_id, refunded_at
       FROM refunds WHERE organization_id = $1 AND order_id = $2 ORDER BY refunded_at`,
      [organizationId, orderId],
    );
    return result.rows;
  },

  async insertRefund(
    tx: SqlClient,
    input: {
      organizationId: string;
      orderId: string;
      amountMinor: number;
      currency: string;
      reason: string | null;
      externalRefundId: string | null;
      refundedAt: Date;
    },
  ): Promise<{ id: string }> {
    const result = await tx.query<{ id: string }>(
      `INSERT INTO refunds (organization_id, order_id, amount_minor, currency, reason,
                            external_refund_id, refunded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.organizationId,
        input.orderId,
        input.amountMinor,
        input.currency,
        input.reason,
        input.externalRefundId,
        input.refundedAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record the refund.');
    return row;
  },
};
