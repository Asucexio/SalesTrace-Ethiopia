/**
 * Analytics service.
 *
 * Every metric is computed in SQL from the persisted rows, never assembled from a different
 * source, so the dashboard totals agree with the underlying records by construction.
 *
 * The definitions implemented here are `docs/financial-metrics.md` §3–§5.
 */

import { computeMetrics } from '@salestrace/attribution-engine';
import { minorToDecimalString } from '@salestrace/shared-types';

import { withOrgContext } from '../../db/context.js';
import type { DbDriver, SqlClient } from '../../db/driver.js';

export interface AnalyticsFilters {
  organizationId: string;
  from?: Date;
  to?: Date;
  campaignIds?: string[];
  creatorIds?: string[];
  status?: string;
  method?: string;
  platform?: string;
  currency?: string;
}

interface ClickScopeRow {
  id: string;
  campaign_id: string;
  creator_id: string;
  occurred_at: Date;
  repeat_count: number;
  eligible: boolean;
}

interface OrderScopeRow {
  organization_id: string;
  id: string;
  ordered_at: Date;
  status: string;
  currency: string;
  total_paid_minor: number;
  refund_minor: number;
  net_revenue_minor: number;
  campaign_id: string | null;
  creator_id: string | null;
  method: string | null;
}

/**
 * The scoped order set with its attribution and refunds.
 *
 * `net_revenue_minor` is `greatest(total_paid − refunded, 0)`, which is the documented
 * order-level net revenue.
 */
const ORDER_SCOPE_SQL = `
  SELECT o.organization_id, o.id, o.ordered_at, o.status, o.currency, o.total_paid_minor,
         COALESCE(r.refund_total, 0)::bigint AS refund_minor,
         a.campaign_id, a.creator_id, a.method,
         GREATEST(o.total_paid_minor - COALESCE(r.refund_total, 0), 0)::bigint AS net_revenue_minor
  FROM orders o
  LEFT JOIN attributions a ON a.order_id = o.id
  LEFT JOIN (SELECT order_id, sum(amount_minor) AS refund_total FROM refunds GROUP BY order_id) r
    ON r.order_id = o.id
  WHERE o.organization_id = $1
`;

export class AnalyticsService {
  constructor(private readonly db: DbDriver) {}

  /**
   * Headline metrics for the dashboard.
   */
  async overview(filters: AnalyticsFilters): Promise<Record<string, unknown>> {
    return withOrgContext(
      this.db,
      { organizationId: filters.organizationId, userId: null, role: 'analyst' },
      async (tx) => {
        const scoped = await this.scopedOrders(tx, filters);
        const attributed = scoped.filter((row) => row.campaign_id !== null);
        const valid = attributed.filter((row) => isValidSaleStatus(row.status) && row.total_paid_minor > 0);

        const clicks = await this.scopedClicks(tx, filters);

        const cost = await tx.query<{ campaign_cost: number; creator_cost: number }>(
          `SELECT
             COALESCE(sum(cc.amount_minor), 0)::bigint AS campaign_cost,
             COALESCE(sum(cc.amount_minor) FILTER (WHERE cc.cost_type = 'creator_fee'), 0)::bigint AS creator_cost
           FROM campaign_costs cc
           WHERE cc.organization_id = $1
             AND ($2::uuid[] IS NULL OR cc.campaign_id = ANY($2::uuid[]))
             AND ($3::uuid[] IS NULL OR cc.creator_id = ANY($3::uuid[]))`,
          [filters.organizationId, filters.campaignIds ?? null, filters.creatorIds ?? null],
        );

        const gross = valid.reduce((total, row) => total + row.total_paid_minor, 0);
        const refunds = valid.reduce((total, row) => total + row.refund_minor, 0);
        const net = valid.reduce((total, row) => total + row.net_revenue_minor, 0);

        const conflicts = await tx.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM attributions
           WHERE organization_id = $1 AND conflict_flag = true`,
          [filters.organizationId],
        );

        const metrics = computeMetrics({
          totalClicks: clicks.rows.length,
          eligibleClicks: clicks.rows.filter((row) => row.eligible).length,
          attributedOrders: attributed.length,
          attributedValidOrders: valid.length,
          paidOrders: attributed.filter((row) => row.status === 'paid').length,
          cancelledOrders: scoped.filter((row) => row.status === 'cancelled').length,
          pendingOrders: scoped.filter((row) => row.status === 'pending').length,
          refundedOrders: valid.filter((row) => row.refund_minor > 0).length,
          grossAttributedOrderValueMinor: gross,
          refundAmountMinor: refunds,
          netAttributedRevenueMinor: net,
          campaignCostMinor: cost.rows[0]?.campaign_cost ?? 0,
          creatorCostMinor: cost.rows[0]?.creator_cost ?? 0,
        });

        return {
          range: {
            from: filters.from?.toISOString() ?? null,
            to: filters.to?.toISOString() ?? null,
          },
          currency: filters.currency ?? 'ETB',
          metrics: {
            ...metrics,
            conflictedAttributions: conflicts.rows[0]?.count ?? 0,
          },
        };
      },
    );
  }

  /** Per-campaign performance rows. */
  async campaigns(filters: AnalyticsFilters): Promise<Array<Record<string, unknown>>> {
    return withOrgContext(
      this.db,
      { organizationId: filters.organizationId, userId: null, role: 'analyst' },
      async (tx) => {
        const campaigns = await tx.query<{
          id: string;
          name: string;
          status: string;
          currency: string;
          start_at: Date;
          end_at: Date | null;
          creator_count: number;
          campaign_cost: number;
          creator_cost: number;
        }>(
          `SELECT c.id, c.name, c.status, c.currency, c.start_at, c.end_at,
                  (SELECT count(*)::int FROM campaign_creators cc
                    WHERE cc.campaign_id = c.id AND cc.status = 'active') AS creator_count,
                  COALESCE((SELECT sum(amount_minor) FROM campaign_costs x WHERE x.campaign_id = c.id), 0)::bigint AS campaign_cost,
                  COALESCE((SELECT sum(amount_minor) FROM campaign_costs x
                             WHERE x.campaign_id = c.id AND x.cost_type = 'creator_fee'), 0)::bigint AS creator_cost
           FROM campaigns c
           WHERE c.organization_id = $1
             AND ($2::uuid[] IS NULL OR c.id = ANY($2::uuid[]))
           ORDER BY c.start_at DESC`,
          [filters.organizationId, filters.campaignIds ?? null],
        );

        const orders = await this.scopedOrders(tx, filters);
        const clicks = await this.scopedClicks(tx, filters);

        return campaigns.rows.map((campaign) => {
          const campaignOrders = orders.filter((row) => row.campaign_id === campaign.id);
          const attributed = campaignOrders.filter((row) => row.campaign_id !== null);
          const valid = attributed.filter(
            (row) => isValidSaleStatus(row.status) && row.total_paid_minor > 0,
          );
          const campaignClicks = clicks.rows.filter((row) => row.campaign_id === campaign.id);
          const eligibleClicks = campaignClicks.filter((row) => row.eligible).length;

          const gross = valid.reduce((total, row) => total + row.total_paid_minor, 0);
          const refunds = valid.reduce((total, row) => total + row.refund_minor, 0);
          const net = valid.reduce((total, row) => total + row.net_revenue_minor, 0);

          const metrics = computeMetrics({
            totalClicks: campaignClicks.length,
            eligibleClicks,
            attributedOrders: attributed.length,
            attributedValidOrders: valid.length,
            paidOrders: attributed.filter((row) => row.status === 'paid').length,
            cancelledOrders: campaignOrders.filter((row) => row.status === 'cancelled').length,
            pendingOrders: campaignOrders.filter((row) => row.status === 'pending').length,
            refundedOrders: valid.filter((row) => row.refund_minor > 0).length,
            grossAttributedOrderValueMinor: gross,
            refundAmountMinor: refunds,
            netAttributedRevenueMinor: net,
            campaignCostMinor: campaign.campaign_cost,
            creatorCostMinor: campaign.creator_cost,
          });

          return {
            campaignId: campaign.id,
            campaignName: campaign.name,
            status: campaign.status,
            currency: campaign.currency,
            startAt: campaign.start_at.toISOString(),
            endAt: campaign.end_at?.toISOString() ?? null,
            creatorCount: campaign.creator_count,
            ...metrics,
          };
        });
      },
    );
  }

  /** Per-creator comparison rows. */
  async creators(filters: AnalyticsFilters): Promise<Array<Record<string, unknown>>> {
    return withOrgContext(
      this.db,
      { organizationId: filters.organizationId, userId: null, role: 'analyst' },
      async (tx) => {
        const creators = await tx.query<{
          id: string;
          display_name: string;
          internal_code: string;
          platform: string | null;
          campaign_count: number;
          creator_cost: number;
        }>(
          `SELECT cr.id, cr.display_name, cr.internal_code, cr.platform,
                  (SELECT count(DISTINCT cc.campaign_id)::int FROM campaign_creators cc
                    WHERE cc.creator_id = cr.id AND cc.status = 'active') AS campaign_count,
                  COALESCE((SELECT sum(amount_minor) FROM campaign_costs x
                             WHERE x.creator_id = cr.id AND x.cost_type = 'creator_fee'), 0)::bigint AS creator_cost
           FROM creators cr
           WHERE cr.organization_id = $1
             AND ($2::uuid[] IS NULL OR cr.id = ANY($2::uuid[]))
             AND ($3::text IS NULL OR cr.platform = $3)
           ORDER BY cr.display_name`,
          [filters.organizationId, filters.creatorIds ?? null, filters.platform ?? null],
        );

        const orders = await this.scopedOrders(tx, filters);
        const clicks = await this.scopedClicks(tx, filters);

        return creators.rows.map((creator) => {
          const creatorOrders = orders.filter((row) => row.creator_id === creator.id);
          const attributed = creatorOrders.filter((row) => row.campaign_id !== null);
          const valid = attributed.filter(
            (row) => isValidSaleStatus(row.status) && row.total_paid_minor > 0,
          );
          const creatorClicks = clicks.rows.filter((row) => row.creator_id === creator.id);
          const eligibleClicks = creatorClicks.filter((row) => row.eligible).length;

          const gross = valid.reduce((total, row) => total + row.total_paid_minor, 0);
          const refunds = valid.reduce((total, row) => total + row.refund_minor, 0);
          const net = valid.reduce((total, row) => total + row.net_revenue_minor, 0);

          const metrics = computeMetrics({
            totalClicks: creatorClicks.length,
            eligibleClicks,
            attributedOrders: attributed.length,
            attributedValidOrders: valid.length,
            paidOrders: attributed.filter((row) => row.status === 'paid').length,
            cancelledOrders: creatorOrders.filter((row) => row.status === 'cancelled').length,
            pendingOrders: creatorOrders.filter((row) => row.status === 'pending').length,
            refundedOrders: valid.filter((row) => row.refund_minor > 0).length,
            grossAttributedOrderValueMinor: gross,
            refundAmountMinor: refunds,
            netAttributedRevenueMinor: net,
            campaignCostMinor: creator.creator_cost,
            creatorCostMinor: creator.creator_cost,
          });

          return {
            creatorId: creator.id,
            creatorName: creator.display_name,
            creatorInternalCode: creator.internal_code,
            platform: creator.platform,
            campaignCount: creator.campaign_count,
            ...metrics,
            revenuePerCreator: metrics.netAttributedRevenue,
          };
        });
      },
    );
  }

  /** Daily time series of clicks, orders and net revenue. */
  async timeseries(filters: AnalyticsFilters): Promise<Array<Record<string, unknown>>> {
    return withOrgContext(
      this.db,
      { organizationId: filters.organizationId, userId: null, role: 'analyst' },
      async (tx) => {
        const orders = await this.scopedOrders(tx, filters);
        const clicks = await this.scopedClicks(tx, filters);

        const byDate = new Map<string, Record<string, unknown>>();

        const bucket = (date: Date): string => date.toISOString().slice(0, 10);
        const ensure = (key: string): Record<string, unknown> => {
          const existing = byDate.get(key);
          if (existing) return existing;
          const created: Record<string, unknown> = {
            date: key,
            totalClicks: 0,
            eligibleClicks: 0,
            attributedOrders: 0,
            attributedValidOrders: 0,
            netAttributedRevenue: '0.00',
          };
          byDate.set(key, created);
          return created;
        };

        for (const click of clicks.rows) {
          const entry = ensure(bucket(click.occurred_at));
          entry['totalClicks'] = (entry['totalClicks'] as number) + 1;
          if (click.eligible) {
            entry['eligibleClicks'] = (entry['eligibleClicks'] as number) + 1;
          }
        }

        let totalNet = 0;
        for (const order of orders) {
          if (order.campaign_id === null) continue;
          const entry = ensure(bucket(order.ordered_at));
          entry['attributedOrders'] = (entry['attributedOrders'] as number) + 1;
          if (isValidSaleStatus(order.status) && order.total_paid_minor > 0) {
            entry['attributedValidOrders'] = (entry['attributedValidOrders'] as number) + 1;
            totalNet += order.net_revenue_minor;
          }
        }

        const sorted = [...byDate.values()].sort((a, b) =>
          (a['date'] as string).localeCompare(b['date'] as string),
        );

        // The net revenue per bucket is derived from the same per-order values.
        const netByDate = new Map<string, number>();
        for (const order of orders) {
          if (order.campaign_id === null) continue;
          if (!isValidSaleStatus(order.status) || order.total_paid_minor <= 0) continue;
          const key = bucket(order.ordered_at);
          netByDate.set(key, (netByDate.get(key) ?? 0) + order.net_revenue_minor);
        }
        for (const entry of sorted) {
          entry['netAttributedRevenue'] = minorToDecimalString(netByDate.get(entry['date'] as string) ?? 0);
        }

        void totalNet;
        return sorted;
      },
    );
  }

  /* --------------------------------------------------------------- helpers */

  private async scopedOrders(tx: SqlClient, filters: AnalyticsFilters): Promise<OrderScopeRow[]> {
    const clauses = ['o.organization_id = $1'];
    const params: unknown[] = [filters.organizationId];

    if (filters.from !== undefined) {
      params.push(filters.from);
      clauses.push(`o.ordered_at >= $${params.length}`);
    }
    if (filters.to !== undefined) {
      params.push(filters.to);
      clauses.push(`o.ordered_at < $${params.length}`);
    }
    if (filters.campaignIds !== undefined && filters.campaignIds.length > 0) {
      params.push(filters.campaignIds);
      clauses.push(`a.campaign_id = ANY($${params.length}::uuid[])`);
    }
    if (filters.creatorIds !== undefined && filters.creatorIds.length > 0) {
      params.push(filters.creatorIds);
      clauses.push(`a.creator_id = ANY($${params.length}::uuid[])`);
    }
    if (filters.status !== undefined) {
      params.push(filters.status);
      clauses.push(`o.status = $${params.length}`);
    }
    if (filters.method !== undefined) {
      params.push(filters.method);
      clauses.push(`a.method = $${params.length}`);
    }
    if (filters.currency !== undefined) {
      params.push(filters.currency);
      clauses.push(`o.currency = $${params.length}`);
    }

    const result = await tx.query<OrderScopeRow>(
      `${ORDER_SCOPE_SQL} AND ${clauses.join(' AND ')}`,
      params,
    );
    return result.rows;
  }

  private async scopedClicks(
    tx: SqlClient,
    filters: AnalyticsFilters,
  ): Promise<{ rows: ClickScopeRow[] }> {
    const clauses = ['te.organization_id = $1'];
    const params: unknown[] = [filters.organizationId];

    if (filters.from !== undefined) {
      params.push(filters.from);
      clauses.push(`te.occurred_at >= $${params.length}`);
    }
    if (filters.to !== undefined) {
      params.push(filters.to);
      clauses.push(`te.occurred_at < $${params.length}`);
    }
    if (filters.campaignIds !== undefined && filters.campaignIds.length > 0) {
      params.push(filters.campaignIds);
      clauses.push(`te.campaign_id = ANY($${params.length}::uuid[])`);
    }
    if (filters.creatorIds !== undefined && filters.creatorIds.length > 0) {
      params.push(filters.creatorIds);
      clauses.push(`te.creator_id = ANY($${params.length}::uuid[])`);
    }
    if (filters.platform !== undefined) {
      params.push(filters.platform);
      clauses.push(`cr.platform = $${params.length}`);
    }

    const result = await tx.query<ClickScopeRow>(
      `SELECT te.id, te.campaign_id, te.creator_id, te.occurred_at, te.repeat_count,
              (cc.id IS NOT NULL AND te.occurred_at >= c.start_at
               AND (c.end_at IS NULL OR te.occurred_at <= c.end_at)
               AND te.occurred_at >= cc.assigned_at) AS eligible
       FROM tracking_events te
       JOIN campaigns c ON c.id = te.campaign_id
       JOIN creators cr ON cr.id = te.creator_id
       LEFT JOIN campaign_creators cc
         ON cc.campaign_id = te.campaign_id AND cc.creator_id = te.creator_id AND cc.status = 'active'
       WHERE ${clauses.join(' AND ')}`,
      params,
    );

    return { rows: result.rows };
  }

  private async clickMetrics(
    tx: SqlClient,
    filters: AnalyticsFilters,
  ): Promise<{ totalClicks: number; eligibleClicks: number }> {
    const clicks = await this.scopedClicks(tx, filters);
    return {
      totalClicks: clicks.rows.length,
      eligibleClicks: clicks.rows.filter((row) => row.eligible).length,
    };
  }
}

function isValidSaleStatus(status: string): boolean {
  return status === 'paid' || status === 'partially_refunded' || status === 'refunded';
}
