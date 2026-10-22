/**
 * Campaign repository.
 *
 * All SQL lives here. The repository never decides policy: it receives the organization id from
 * the request context and applies it to every statement.
 */

import type { CampaignStatus, CostType } from '@salestrace/shared-types';

import type { SqlClient } from '../../db/driver.js';

export interface CampaignRow {
  id: string;
  organization_id: string;
  name: string;
  objective: string | null;
  description: string | null;
  status: CampaignStatus;
  start_at: Date;
  end_at: Date | null;
  budget_minor: number | null;
  currency: string;
  attribution_window_days: number;
  attribution_policy_version: string;
  destination_url: string;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** A campaign plus the two aggregates the list and detail views show. */
export interface CampaignSummaryRow extends CampaignRow {
  creator_count: number;
  cost_total: number | null;
}

export interface CampaignAssignmentRow {
  id: string;
  campaign_id: string;
  creator_id: string;
  creator_name: string;
  creator_internal_code: string;
  agreed_fee_minor: number | null;
  currency: string;
  assigned_at: Date;
  status: string;
  notes: string | null;
}

export interface CampaignCostRow {
  id: string;
  campaign_id: string;
  creator_id: string | null;
  creator_name: string | null;
  cost_type: CostType;
  description: string | null;
  amount_minor: number;
  currency: string;
  incurred_at: Date;
  created_at: Date;
}

export interface CampaignListFilters {
  organizationId: string;
  status?: CampaignStatus | null;
  creatorId?: string | null;
  search?: string | null;
  from?: Date | null;
  to?: Date | null;
  limit: number;
  offset: number;
  sort: string;
}

/** The only sort expressions the API accepts — never interpolated from raw input. */
const SORT_SQL: Readonly<Record<string, string>> = {
  createdAt: 'c.created_at ASC',
  '-createdAt': 'c.created_at DESC',
  name: 'c.name ASC',
  '-name': 'c.name DESC',
  startAt: 'c.start_at ASC',
  '-startAt': 'c.start_at DESC',
};

const CAMPAIGN_COLUMNS = `c.id, c.organization_id, c.name, c.objective, c.description, c.status,
       c.start_at, c.end_at, c.budget_minor, c.currency, c.attribution_window_days,
       c.attribution_policy_version, c.destination_url, c.archived_at, c.created_at, c.updated_at`;

/** Shared `WHERE` clause. The parameters are always passed (null means "no filter"). */
const CAMPAIGN_FILTER = `c.organization_id = $1
       AND ($2::text IS NULL OR c.status = $2)
       AND ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM campaign_creators f
             WHERE f.campaign_id = c.id AND f.creator_id = $3))
       AND ($4::text IS NULL OR c.name ILIKE '%' || $4 || '%')
       AND ($5::timestamptz IS NULL OR c.start_at >= $5)
       AND ($6::timestamptz IS NULL OR c.start_at < $6)`;

function filterParams(filters: CampaignListFilters): unknown[] {
  return [
    filters.organizationId,
    filters.status ?? null,
    filters.creatorId ?? null,
    filters.search ?? null,
    filters.from ?? null,
    filters.to ?? null,
  ];
}

export const campaignRepository = {
  async list(
    tx: SqlClient,
    filters: CampaignListFilters,
  ): Promise<{ rows: CampaignSummaryRow[]; total: number }> {
    const orderBy = SORT_SQL[filters.sort] ?? SORT_SQL['-createdAt']!;

    const result = await tx.query<CampaignSummaryRow>(
      `SELECT ${CAMPAIGN_COLUMNS},
              (SELECT count(*)::int FROM campaign_creators cc WHERE cc.campaign_id = c.id)
                AS creator_count,
              (SELECT sum(cst.amount_minor) FROM campaign_costs cst WHERE cst.campaign_id = c.id)
                AS cost_total
       FROM campaigns c
       WHERE ${CAMPAIGN_FILTER}
       ORDER BY ${orderBy}
       LIMIT $7 OFFSET $8`,
      [...filterParams(filters), filters.limit, filters.offset],
    );

    const count = await tx.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM campaigns c WHERE ${CAMPAIGN_FILTER}`,
      filterParams(filters),
    );

    return { rows: result.rows, total: count.rows[0]?.count ?? 0 };
  },

  async findById(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
  ): Promise<CampaignSummaryRow | null> {
    const result = await tx.query<CampaignSummaryRow>(
      `SELECT ${CAMPAIGN_COLUMNS},
              (SELECT count(*)::int FROM campaign_creators cc WHERE cc.campaign_id = c.id)
                AS creator_count,
              (SELECT sum(cst.amount_minor) FROM campaign_costs cst WHERE cst.campaign_id = c.id)
                AS cost_total
       FROM campaigns c
       WHERE c.organization_id = $1 AND c.id = $2`,
      [organizationId, campaignId],
    );
    return result.rows[0] ?? null;
  },

  async create(
    tx: SqlClient,
    input: {
      organizationId: string;
      createdBy: string | null;
      name: string;
      objective: string | null;
      description: string | null;
      startAt: Date;
      endAt: Date | null;
      budgetMinor: number | null;
      currency: string;
      attributionWindowDays: number;
      destinationUrl: string;
    },
  ): Promise<CampaignRow> {
    const result = await tx.query<CampaignRow>(
      `INSERT INTO campaigns (
         organization_id, name, objective, description, status, start_at, end_at,
         budget_minor, currency, attribution_window_days, destination_url, created_by
       ) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, organization_id, name, objective, description, status, start_at, end_at,
                 budget_minor, currency, attribution_window_days, attribution_policy_version,
                 destination_url, archived_at, created_at, updated_at`,
      [
        input.organizationId,
        input.name,
        input.objective,
        input.description,
        input.startAt,
        input.endAt,
        input.budgetMinor,
        input.currency,
        input.attributionWindowDays,
        input.destinationUrl,
        input.createdBy,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create the campaign.');
    return row;
  },

  async update(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
    patch: {
      name?: string | null;
      objective?: string | null;
      description?: string | null;
      startAt?: Date | null;
      endAt?: Date | null;
      budgetMinor?: number | null;
      attributionWindowDays?: number | null;
      destinationUrl?: string | null;
      currency?: string | null;
    },
  ): Promise<CampaignRow | null> {
    const result = await tx.query<CampaignRow>(
      `UPDATE campaigns SET
         name = CASE WHEN $3::boolean THEN $4 ELSE name END,
         objective = CASE WHEN $5::boolean THEN $6 ELSE objective END,
         description = CASE WHEN $7::boolean THEN $8 ELSE description END,
         start_at = CASE WHEN $9::boolean THEN $10 ELSE start_at END,
         end_at = CASE WHEN $11::boolean THEN $12 ELSE end_at END,
         budget_minor = CASE WHEN $13::boolean THEN $14 ELSE budget_minor END,
         attribution_window_days = CASE WHEN $15::boolean THEN $16 ELSE attribution_window_days END,
         destination_url = CASE WHEN $17::boolean THEN $18 ELSE destination_url END,
         currency = CASE WHEN $19::boolean THEN $20 ELSE currency END
       WHERE organization_id = $1 AND id = $2
       RETURNING id, organization_id, name, objective, description, status, start_at, end_at,
                 budget_minor, currency, attribution_window_days, attribution_policy_version,
                 destination_url, archived_at, created_at, updated_at`,
      [
        organizationId,
        campaignId,
        patch.name !== undefined,
        patch.name ?? null,
        patch.objective !== undefined,
        patch.objective ?? null,
        patch.description !== undefined,
        patch.description ?? null,
        patch.startAt !== undefined,
        patch.startAt ?? null,
        patch.endAt !== undefined,
        patch.endAt ?? null,
        patch.budgetMinor !== undefined,
        patch.budgetMinor ?? null,
        patch.attributionWindowDays !== undefined,
        patch.attributionWindowDays ?? null,
        patch.destinationUrl !== undefined,
        patch.destinationUrl ?? null,
        patch.currency !== undefined,
        patch.currency ?? null,
      ],
    );
    return result.rows[0] ?? null;
  },

  async setStatus(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
    status: CampaignStatus,
    archived: boolean,
  ): Promise<CampaignRow | null> {
    const result = await tx.query<CampaignRow>(
      `UPDATE campaigns SET
         status = $3,
         archived_at = CASE WHEN $4::boolean THEN now() ELSE archived_at END
       WHERE organization_id = $1 AND id = $2
       RETURNING id, organization_id, name, objective, description, status, start_at, end_at,
                 budget_minor, currency, attribution_window_days, attribution_policy_version,
                 destination_url, archived_at, created_at, updated_at`,
      [organizationId, campaignId, status, archived],
    );
    return result.rows[0] ?? null;
  },

  /* ------------------------------------------------------------ assignments */

  async listAssignments(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
  ): Promise<CampaignAssignmentRow[]> {
    const result = await tx.query<CampaignAssignmentRow>(
      `SELECT cc.id, cc.campaign_id, cc.creator_id, cr.display_name AS creator_name,
              cr.internal_code AS creator_internal_code, cc.agreed_fee_minor, cc.currency,
              cc.assigned_at, cc.status, cc.notes
       FROM campaign_creators cc
       JOIN creators cr ON cr.id = cc.creator_id
       WHERE cc.organization_id = $1 AND cc.campaign_id = $2
       ORDER BY cc.assigned_at ASC, cr.display_name ASC`,
      [organizationId, campaignId],
    );
    return result.rows;
  },

  async findAssignment(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
    creatorId: string,
  ): Promise<CampaignAssignmentRow | null> {
    const result = await tx.query<CampaignAssignmentRow>(
      `SELECT cc.id, cc.campaign_id, cc.creator_id, cr.display_name AS creator_name,
              cr.internal_code AS creator_internal_code, cc.agreed_fee_minor, cc.currency,
              cc.assigned_at, cc.status, cc.notes
       FROM campaign_creators cc
       JOIN creators cr ON cr.id = cc.creator_id
       WHERE cc.organization_id = $1 AND cc.campaign_id = $2 AND cc.creator_id = $3`,
      [organizationId, campaignId, creatorId],
    );
    return result.rows[0] ?? null;
  },

  async createAssignment(
    tx: SqlClient,
    input: {
      organizationId: string;
      campaignId: string;
      creatorId: string;
      agreedFeeMinor: number | null;
      currency: string;
      assignedAt: Date;
      notes: string | null;
    },
  ): Promise<CampaignAssignmentRow> {
    const result = await tx.query<CampaignAssignmentRow>(
      `INSERT INTO campaign_creators (
         organization_id, campaign_id, creator_id, agreed_fee_minor, currency, assigned_at, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, campaign_id, creator_id, agreed_fee_minor, currency, assigned_at, status, notes`,
      [
        input.organizationId,
        input.campaignId,
        input.creatorId,
        input.agreedFeeMinor,
        input.currency,
        input.assignedAt,
        input.notes,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to assign the creator.');
    return {
      ...row,
      creator_name: '',
      creator_internal_code: '',
    };
  },

  async updateAssignment(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
    creatorId: string,
    patch: {
      agreedFeeMinor?: number | null;
      assignedAt?: Date | null;
      notes?: string | null;
      status?: string | null;
    },
  ): Promise<boolean> {
    const result = await tx.query(
      `UPDATE campaign_creators SET
         agreed_fee_minor = CASE WHEN $4::boolean THEN $5 ELSE agreed_fee_minor END,
         assigned_at = CASE WHEN $6::boolean THEN $7 ELSE assigned_at END,
         notes = CASE WHEN $8::boolean THEN $9 ELSE notes END,
         status = CASE WHEN $10::boolean THEN $11 ELSE status END
       WHERE organization_id = $1 AND campaign_id = $2 AND creator_id = $3`,
      [
        organizationId,
        campaignId,
        creatorId,
        patch.agreedFeeMinor !== undefined,
        patch.agreedFeeMinor ?? null,
        patch.assignedAt !== undefined,
        patch.assignedAt ?? null,
        patch.notes !== undefined,
        patch.notes ?? null,
        patch.status !== undefined,
        patch.status ?? null,
      ],
    );
    return result.rowCount > 0;
  },

  async deleteAssignment(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
    creatorId: string,
  ): Promise<boolean> {
    const result = await tx.query(
      'DELETE FROM campaign_creators WHERE organization_id = $1 AND campaign_id = $2 AND creator_id = $3',
      [organizationId, campaignId, creatorId],
    );
    return result.rowCount > 0;
  },

  /* ----------------------------------------------------------------- costs */

  async listCosts(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
  ): Promise<CampaignCostRow[]> {
    const result = await tx.query<CampaignCostRow>(
      `SELECT ct.id, ct.campaign_id, ct.creator_id, cr.display_name AS creator_name,
              ct.cost_type, ct.description, ct.amount_minor, ct.currency, ct.incurred_at,
              ct.created_at
       FROM campaign_costs ct
       LEFT JOIN creators cr ON cr.id = ct.creator_id
       WHERE ct.organization_id = $1 AND ct.campaign_id = $2
       ORDER BY ct.incurred_at DESC, ct.created_at DESC`,
      [organizationId, campaignId],
    );
    return result.rows;
  },

  async findCost(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
    costId: string,
  ): Promise<CampaignCostRow | null> {
    const result = await tx.query<CampaignCostRow>(
      `SELECT ct.id, ct.campaign_id, ct.creator_id, cr.display_name AS creator_name,
              ct.cost_type, ct.description, ct.amount_minor, ct.currency, ct.incurred_at,
              ct.created_at
       FROM campaign_costs ct
       LEFT JOIN creators cr ON cr.id = ct.creator_id
       WHERE ct.organization_id = $1 AND ct.campaign_id = $2 AND ct.id = $3`,
      [organizationId, campaignId, costId],
    );
    return result.rows[0] ?? null;
  },

  async createCost(
    tx: SqlClient,
    input: {
      organizationId: string;
      campaignId: string;
      creatorId: string | null;
      costType: CostType;
      description: string | null;
      amountMinor: number;
      currency: string;
      incurredAt: Date;
    },
  ): Promise<CampaignCostRow> {
    const result = await tx.query<CampaignCostRow>(
      `INSERT INTO campaign_costs (
         organization_id, campaign_id, creator_id, cost_type, description, amount_minor,
         currency, incurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, campaign_id, creator_id, cost_type, description, amount_minor, currency,
                 incurred_at, created_at`,
      [
        input.organizationId,
        input.campaignId,
        input.creatorId,
        input.costType,
        input.description,
        input.amountMinor,
        input.currency,
        input.incurredAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record the campaign cost.');
    return { ...row, creator_name: null };
  },

  async deleteCost(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
    costId: string,
  ): Promise<boolean> {
    const result = await tx.query(
      'DELETE FROM campaign_costs WHERE organization_id = $1 AND campaign_id = $2 AND id = $3',
      [organizationId, campaignId, costId],
    );
    return result.rowCount > 0;
  },

  /** The number of costs of the campaign that are recorded in another currency. */
  async countCostsInOtherCurrency(
    tx: SqlClient,
    organizationId: string,
    campaignId: string,
    currency: string,
  ): Promise<number> {
    const result = await tx.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM campaign_costs
       WHERE organization_id = $1 AND campaign_id = $2 AND currency <> $3`,
      [organizationId, campaignId, currency],
    );
    return result.rows[0]?.count ?? 0;
  },

  /* ----------------------------------------------------------- performance */

  /**
   * Click aggregates for a scope.
   *
   * `eligible` applies rules C3, C6 and C7 of `docs/attribution-rules.md`: the creator must be
   * assigned to the campaign, the click must fall inside the campaign window and after the
   * assignment was recorded.
   */
  async clickAggregates(
    tx: SqlClient,
    scope: {
      organizationId: string;
      campaignId?: string | null;
      creatorId?: string | null;
      from?: Date | null;
      to?: Date | null;
    },
  ): Promise<{ total_clicks: number; eligible_clicks: number }> {
    const result = await tx.query<{ total_clicks: number; eligible_clicks: number }>(
      `SELECT (count(*) FILTER (WHERE cc.id IS NOT NULL
                                 AND te.occurred_at >= c.start_at
                                 AND (c.end_at IS NULL OR te.occurred_at < c.end_at)
                                 AND te.occurred_at >= cc.assigned_at))::int AS eligible_clicks,
              count(*)::int AS total_clicks
       FROM tracking_events te
       JOIN campaigns c ON c.id = te.campaign_id
       LEFT JOIN campaign_creators cc
              ON cc.campaign_id = te.campaign_id AND cc.creator_id = te.creator_id
       WHERE te.organization_id = $1
         AND te.event_type = 'click'
         AND ($2::uuid IS NULL OR te.campaign_id = $2)
         AND ($3::uuid IS NULL OR te.creator_id = $3)
         AND ($4::timestamptz IS NULL OR te.occurred_at >= $4)
         AND ($5::timestamptz IS NULL OR te.occurred_at < $5)`,
      [
        scope.organizationId,
        scope.campaignId ?? null,
        scope.creatorId ?? null,
        scope.from ?? null,
        scope.to ?? null,
      ],
    );
    const row = result.rows[0];
    return {
      total_clicks: Number(row?.total_clicks ?? 0),
      eligible_clicks: Number(row?.eligible_clicks ?? 0),
    };
  },

  /**
   * Order aggregates for a scope.
   *
   * A *valid* order is one whose money changed hands (`paid`, `partially_refunded`, `refunded`)
   * and that actually collected something (`total_paid_minor > 0`). Net revenue is
   * `max(total_paid − refunded, 0)` per order, so a refund can never make an order negative.
   */
  async orderAggregates(
    tx: SqlClient,
    scope: {
      organizationId: string;
      campaignId?: string | null;
      creatorId?: string | null;
      from?: Date | null;
      to?: Date | null;
    },
  ): Promise<{
    attributed_orders: number;
    attributed_valid_orders: number;
    paid_orders: number;
    cancelled_orders: number;
    pending_orders: number;
    refunded_orders: number;
    gross_minor: number;
    refund_minor: number;
    net_minor: number;
  }> {
    const result = await tx.query<{
      attributed_orders: number;
      attributed_valid_orders: number;
      paid_orders: number;
      cancelled_orders: number;
      pending_orders: number;
      refunded_orders: number;
      gross_minor: number;
      refund_minor: number;
      net_minor: number;
    }>(
      `SELECT count(*)::int AS attributed_orders,
              (count(*) FILTER (WHERE o.status IN ('paid', 'partially_refunded', 'refunded')
                                AND o.total_paid_minor > 0))::int AS attributed_valid_orders,
              (count(*) FILTER (WHERE o.status = 'paid'))::int AS paid_orders,
              (count(*) FILTER (WHERE o.status = 'cancelled'))::int AS cancelled_orders,
              (count(*) FILTER (WHERE o.status = 'pending'))::int AS pending_orders,
              (count(*) FILTER (WHERE o.status IN ('partially_refunded', 'refunded')
                                AND coalesce(r.refunded_minor, 0) > 0))::int AS refunded_orders,
              coalesce(sum(o.total_paid_minor) FILTER (WHERE o.status IN ('paid', 'partially_refunded', 'refunded')
                                AND o.total_paid_minor > 0), 0) AS gross_minor,
              coalesce(sum(coalesce(r.refunded_minor, 0)), 0) AS refund_minor,
              coalesce(sum(greatest(o.total_paid_minor - coalesce(r.refunded_minor, 0), 0))
                       FILTER (WHERE o.status IN ('paid', 'partially_refunded', 'refunded')
                                AND o.total_paid_minor > 0), 0) AS net_minor
       FROM attributions a
       JOIN orders o ON o.id = a.order_id
       LEFT JOIN (
         SELECT rf.order_id, sum(rf.amount_minor) AS refunded_minor
         FROM refunds rf GROUP BY rf.order_id
       ) r ON r.order_id = o.id
       WHERE a.organization_id = $1
         AND ($2::uuid IS NULL OR a.campaign_id = $2)
         AND ($3::uuid IS NULL OR a.creator_id = $3)
         AND ($4::timestamptz IS NULL OR o.ordered_at >= $4)
         AND ($5::timestamptz IS NULL OR o.ordered_at < $5)`,
      [
        scope.organizationId,
        scope.campaignId ?? null,
        scope.creatorId ?? null,
        scope.from ?? null,
        scope.to ?? null,
      ],
    );

    const row = result.rows[0];
    return {
      attributed_orders: Number(row?.attributed_orders ?? 0),
      attributed_valid_orders: Number(row?.attributed_valid_orders ?? 0),
      paid_orders: Number(row?.paid_orders ?? 0),
      cancelled_orders: Number(row?.cancelled_orders ?? 0),
      pending_orders: Number(row?.pending_orders ?? 0),
      refunded_orders: Number(row?.refunded_orders ?? 0),
      gross_minor: Number(row?.gross_minor ?? 0),
      refund_minor: Number(row?.refund_minor ?? 0),
      net_minor: Number(row?.net_minor ?? 0),
    };
  },

  /** Cost aggregates for a scope: the total spend and the creator-fee subset. */
  async costAggregates(
    tx: SqlClient,
    scope: {
      organizationId: string;
      campaignId?: string | null;
      creatorId?: string | null;
    },
  ): Promise<{ total_minor: number; creator_minor: number }> {
    const result = await tx.query<{ total_minor: number; creator_minor: number }>(
      `SELECT coalesce(sum(ct.amount_minor), 0) AS total_minor,
              coalesce(sum(ct.amount_minor) FILTER (WHERE ct.cost_type = 'creator_fee'), 0)
                AS creator_minor
       FROM campaign_costs ct
       WHERE ct.organization_id = $1
         AND ($2::uuid IS NULL OR ct.campaign_id = $2)
         AND ($3::uuid IS NULL OR ct.creator_id = $3)`,
      [scope.organizationId, scope.campaignId ?? null, scope.creatorId ?? null],
    );
    const row = result.rows[0];
    return {
      total_minor: Number(row?.total_minor ?? 0),
      creator_minor: Number(row?.creator_minor ?? 0),
    };
  },
};
