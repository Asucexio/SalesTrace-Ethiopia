/**
 * Orders controller.
 *
 * Handles the order list, the order detail, the CSV import pipeline and manual refunds.
 */

import type { Request, Response } from 'express';

import { parseAmountToMinor, type OrderStatus } from '@salestrace/shared-types';

import { withOrgContext } from '../../db/context.js';
import type { DbDriver } from '../../db/driver.js';
import { recordAudit, sanitiseForAudit } from '../../shared/audit.js';
import { AppError } from '../../shared/errors.js';
import { sendData, sendPaginated } from '../../shared/response.js';

import { orderRepository, type OrderRow } from './order.repository.js';
import type { OrderImportService } from './order-import.service.js';

export interface OrderControllerDeps {
  imports: OrderImportService;
  db: DbDriver;
}

function mapOrder(row: OrderRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    externalOrderId: row.external_order_id,
    source: row.source,
    orderedAt: row.ordered_at.toISOString(),
    currency: row.currency,
    subtotal: (row.subtotal_minor / 100).toFixed(2),
    discount: (row.discount_minor / 100).toFixed(2),
    tax: (row.tax_minor / 100).toFixed(2),
    shipping: (row.shipping_minor / 100).toFixed(2),
    totalPaid: (row.total_paid_minor / 100).toFixed(2),
    status: row.status,
    couponCode: row.coupon_code,
    referralIdentifier: row.referral_identifier,
    refundTotal: (row.refund_minor / 100).toFixed(2),
    netRevenue: (Math.max(row.total_paid_minor - row.refund_minor, 0) / 100).toFixed(2),
    isValidSale:
      row.attribution_is_valid_sale ??
      (row.status === 'paid' || row.status === 'partially_refunded' || row.status === 'refunded'),
    attribution:
      row.attribution_id === null
        ? null
        : {
            id: row.attribution_id,
            orderId: row.id,
            campaignId: row.attribution_campaign_id ?? '',
            campaignName: row.attribution_campaign_name ?? '',
            creatorId: row.attribution_creator_id ?? '',
            creatorName: row.attribution_creator_name ?? '',
            method: row.attribution_method ?? 'link',
            ruleVersion: row.attribution_rule_version ?? '',
            ruleSnapshot: {},
            decisionReason: row.attribution_decision_reason ?? 'no_creator_signal',
            conflictFlag: row.attribution_conflict_flag ?? false,
            conflictDetail: null,
            matchedEventId: null,
            matchedCouponId: null,
            isValidSale: row.attribution_is_valid_sale ?? false,
            attributedAt: row.ordered_at.toISOString(),
          },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createOrderController(deps: OrderControllerDeps) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const query = req.query as unknown as {
        status?: OrderStatus;
        campaignId?: string;
        creatorId?: string;
        attributed?: boolean;
        method?: string;
        search?: string;
        from?: string;
        to?: string;
        limit: number;
        offset: number;
        sort: 'orderedAt' | '-orderedAt' | 'totalPaid' | '-totalPaid' | 'externalOrderId';
      };

      const result = await withOrgContext(
        deps.db,
        { organizationId: auth.organizationId, userId: auth.profileId, role: auth.role },
        (tx) =>
          orderRepository.list(tx, {
            organizationId: auth.organizationId,
            ...(query.status === undefined ? {} : { status: query.status }),
            ...(query.campaignId === undefined ? {} : { campaignId: query.campaignId }),
            ...(query.creatorId === undefined ? {} : { creatorId: query.creatorId }),
            ...(query.attributed === undefined ? {} : { attributed: query.attributed }),
            ...(query.method === undefined ? {} : { method: query.method }),
            ...(query.search === undefined ? {} : { search: query.search }),
            ...(query.from === undefined ? {} : { from: new Date(query.from) }),
            ...(query.to === undefined ? {} : { to: new Date(query.to) }),
            limit: query.limit,
            offset: query.offset,
            sort: query.sort,
          }),
      );

      sendPaginated(res, result.items.map(mapOrder), result.total, query.limit, query.offset);
    },

    async detail(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const orderId = req.params['orderId'];
      if (!orderId) throw AppError.notFound('Order');

      const result = await withOrgContext(
        deps.db,
        { organizationId: auth.organizationId, userId: auth.profileId, role: auth.role },
        async (tx) => {
          const order = await orderRepository.findById(tx, auth.organizationId, orderId);
          if (order === null) throw AppError.notFound('Order');

          const items = await orderRepository.listItems(tx, auth.organizationId, orderId);
          const refunds = await orderRepository.listRefunds(tx, auth.organizationId, orderId);

          return { order, items, refunds };
        },
      );

      sendData(res, {
        ...mapOrder(result.order),
        items: result.items.map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice: (item.unit_price_minor / 100).toFixed(2),
          lineTotal: (item.line_total_minor / 100).toFixed(2),
        })),
        refunds: result.refunds.map((refund) => ({
          id: refund.id,
          orderId: refund.order_id,
          amount: (refund.amount_minor / 100).toFixed(2),
          currency: refund.currency,
          reason: refund.reason,
          externalRefundId: refund.external_refund_id,
          refundedAt: refund.refunded_at.toISOString(),
        })),
      });
    },

    async createImport(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const content = req.body as Buffer;
      if (!Buffer.isBuffer(content) || content.length === 0) {
        throw AppError.badRequest('The request body must contain a CSV file.');
      }

      const fileName = decodeURIComponent(req.query['fileName']?.toString() ?? 'orders.csv');
      const idempotencyKey = req.header('idempotency-key');

      const job = await deps.imports.createJob({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        fileName: fileName.slice(0, 200),
        content,
        idempotencyKey: idempotencyKey ?? null,
      });

      sendData(res, job, 201);
    },

    async listImports(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const query = req.query as unknown as { limit: number; offset: number };
      const result = await deps.imports.listJobs({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        limit: query.limit,
        offset: query.offset,
      });

      sendPaginated(res, result.items.map(mapImportJob), result.total, query.limit, query.offset);
    },

    async importDetail(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const importId = req.params['importId'];
      if (!importId) throw AppError.notFound('Import');

      const job = await deps.imports.getJob({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        importId,
      });
      if (job === null) throw AppError.notFound('Import');

      sendData(res, mapImportJob(job));
    },

    async setMapping(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const importId = req.params['importId'];
      if (!importId) throw AppError.notFound('Import');

      const body = req.body as { mapping: Record<string, string> };

      const result = await deps.imports.setMapping({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        importId,
        mapping: body.mapping,
      });

      sendData(res, result);
    },

    async previewImport(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const importId = req.params['importId'];
      if (!importId) throw AppError.notFound('Import');

      const result = await deps.imports.preview({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        importId,
      });

      sendData(res, result);
    },

    async commitImport(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const importId = req.params['importId'];
      if (!importId) throw AppError.notFound('Import');

      const result = await deps.imports.commit({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        requestId: req.requestId,
        importId,
      });

      sendData(res, result);
    },

    async errorReport(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const importId = req.params['importId'];
      if (!importId) throw AppError.notFound('Import');

      const report = await deps.imports.errorReport({
        organizationId: auth.organizationId,
        actorUserId: auth.profileId,
        actorRole: auth.role,
        importId,
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      res.status(200).send(report.content);
    },

    async recordRefund(req: Request, res: Response): Promise<void> {
      const auth = req.auth;
      if (!auth) throw AppError.unauthenticated();

      const orderId = req.params['orderId'];
      if (!orderId) throw AppError.notFound('Order');

      const body = req.body as {
        amount: string;
        reason?: string | null;
        externalRefundId?: string | null;
        refundedAt?: string;
      };

      const amountMinor = parseAmountToMinor(body.amount);
      if (amountMinor <= 0) {
        throw AppError.validation('The refund amount must be greater than zero.', [
          { path: 'amount', message: 'Must be greater than zero.' },
        ]);
      }

      await withOrgContext(
        deps.db,
        { organizationId: auth.organizationId, userId: auth.profileId, role: auth.role },
        async (tx) => {
          const order = await orderRepository.findById(tx, auth.organizationId, orderId);
          if (order === null) throw AppError.notFound('Order');

          if (amountMinor > order.total_paid_minor) {
            throw AppError.unprocessable('The refund cannot exceed the order total.');
          }

          const refund = await orderRepository.insertRefund(tx, {
            organizationId: auth.organizationId,
            orderId,
            amountMinor,
            currency: order.currency,
            reason: body.reason ?? null,
            externalRefundId: body.externalRefundId ?? null,
            refundedAt: body.refundedAt === undefined ? new Date() : new Date(body.refundedAt),
          });

          // A refunded order is still a sale; the status reflects the partial or full refund.
          const refundedTotal = order.refund_minor + amountMinor;
          const status: OrderStatus =
            refundedTotal >= order.total_paid_minor
              ? 'refunded'
              : order.status === 'paid'
                ? 'partially_refunded'
                : order.status;

          await tx.query('UPDATE orders SET status = $3, updated_at = now() WHERE id = $1 AND organization_id = $2', [
            orderId,
            auth.organizationId,
            status,
          ]);

          await recordAudit(tx, {
            organizationId: auth.organizationId,
            actorUserId: auth.profileId,
            actorRole: auth.role,
            action: 'order.refund_recorded',
            entityType: 'refund',
            entityId: refund.id,
            after: sanitiseForAudit({ amountMinor, status }),
            requestId: req.requestId,
          });
        },
      );

      res.status(201).json({ data: { recorded: true }, meta: { requestId: req.requestId } });
    },
  };
}

function mapImportJob(job: {
  id: string;
  file_name: string;
  file_size_bytes: number;
  status: string;
  column_mapping: Record<string, string>;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  imported_rows: number;
  skipped_rows: number;
  updated_rows: number;
  created_at: Date;
  completed_at: Date | null;
}) {  return {
    id: job.id,
    fileName: job.file_name,
    fileSizeBytes: job.file_size_bytes,
    status: job.status,
    columnMapping: job.column_mapping ?? {},
    totalRows: job.total_rows,
    validRows: job.valid_rows,
    invalidRows: job.invalid_rows,
    importedRows: job.imported_rows,
    skippedRows: job.skipped_rows,
    updatedRows: job.updated_rows,
    errorReportUrl: `/api/v1/orders/imports/${job.id}/errors.csv`,
    createdAt: job.created_at.toISOString(),
    completedAt: job.completed_at?.toISOString() ?? null,
  };
}
