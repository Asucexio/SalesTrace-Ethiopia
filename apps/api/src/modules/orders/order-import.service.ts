/**
 * Order import service.
 *
 * The pipeline is: upload → map columns → preview (validate every row) → commit (import the
 * valid rows and attribute them) → error report.
 *
 * Guarantees:
 * - A row that fails validation never reaches the database.
 * - Re-importing the same file never creates duplicate orders: the unique constraint on
 *   `(organization_id, external_order_id)` makes the write idempotent, and existing rows are
 *   reconciled rather than duplicated.
 * - Refunds are appended, never overwritten.
 * - The source values are stored as they were supplied; mismatches are reported as warnings
 *   instead of being silently corrected.
 */

import { createHash } from 'node:crypto';

import {
  naiveTimestampToUtc,
  parseAmountToMinor,
  parseIsoDate,
  type OrderStatus,
  type OrganizationRole,
  ORDER_STATUSES,
} from '@salestrace/shared-types';
import type { OrderColumn } from '@salestrace/validation';

import { withOrgContext } from '../../db/context.js';
import type { DbDriver, SqlClient } from '../../db/driver.js';
import { recordAudit, sanitiseForAudit } from '../../shared/audit.js';
import { AppError } from '../../shared/errors.js';
import type { FileStorage } from '../../shared/storage.js';

import { detectColumnMapping, isMappingUsable, parseCsv } from './csv.js';

export interface RowIssue {
  code: string;
  message: string;
  field?: string;
}

export interface ValidatedRow {
  rowNumber: number;
  raw: Record<string, string>;
  status: 'valid' | 'invalid' | 'duplicate';
  errors: RowIssue[];
  warnings: RowIssue[];
  externalOrderId: string | null;
  parsed: ParsedOrder | null;
}

export interface ParsedOrder {
  externalOrderId: string;
  orderedAt: Date;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalPaidMinor: number;
  refundMinor: number;
  status: OrderStatus;
  couponCode: string | null;
  referralIdentifier: string | null;
  customerRefHash: string | null;
}

export interface ImportCounts {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  updatedRows: number;
  skippedRows: number;
  attributedOrders: number;
}

export interface ImportServiceDeps {
  db: DbDriver;
  storage: FileStorage;
  attributeOrder: (
    tx: SqlClient,
    input: {
      organizationId: string;
      orderId: string;
      requestId?: string | null;
      actorUserId?: string | null;
      actorRole?: string | null;
    },
  ) => Promise<unknown>;
}

interface ImportJobRow {
  id: string;
  organization_id: string;
  file_name: string;
  file_size_bytes: number;
  storage_path: string | null;
  checksum: string | null;
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
}

export class OrderImportService {
  constructor(private readonly deps: ImportServiceDeps) {}

  private get db(): DbDriver {
    return this.deps.db;
  }

  /** Create an import job from an uploaded CSV. */
  async createJob(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    requestId?: string;
    fileName: string;
    content: Buffer;
    idempotencyKey?: string | null;
  }): Promise<{
    importId: string;
    status: string;
    detectedColumns: string[];
    suggestedMapping: Record<string, string>;
    totalRows: number;
  }> {
    const text = input.content.toString('utf8');
    const parsed = parseCsv(text);

    if (parsed.headers.length === 0) {
      throw AppError.unprocessable('The file does not contain a header row.');
    }

    const suggestedMapping = detectColumnMapping(parsed.headers);

    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      async (tx) => {
        if (input.idempotencyKey) {
          const existing = await tx.query<ImportJobRow>(
            'SELECT * FROM import_jobs WHERE organization_id = $1 AND idempotency_key = $2',
            [input.organizationId, input.idempotencyKey],
          );
          const found = existing.rows[0];
          if (found) {
            return {
              importId: found.id,
              status: found.status,
              detectedColumns: parsed.headers,
              suggestedMapping: found.column_mapping ?? {},
              totalRows: found.total_rows,
            };
          }
        }

        const storageKey = `${input.organizationId}/${crypto.randomUUID()}.csv`;
        const stored = await this.deps.storage.store(storageKey, input.content);

        const created = await tx.query<ImportJobRow>(
          `INSERT INTO import_jobs (
             organization_id, file_name, file_size_bytes, storage_path, checksum, status,
             column_mapping, total_rows, created_by
           ) VALUES ($1, $2, $3, $4, $5, 'ready', $6, $7, $8)
           RETURNING *`,
          [
            input.organizationId,
            input.fileName,
            input.content.length,
            stored.path,
            stored.checksum,
            JSON.stringify(suggestedMapping),
            parsed.rows.length,
            input.actorUserId,
          ],
        );
        const job = created.rows[0];
        if (!job) throw new Error('Failed to create the import job.');

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'import.created',
          entityType: 'import_job',
          entityId: job.id,
          after: sanitiseForAudit({ fileName: input.fileName, rows: parsed.rows.length }),
          requestId: input.requestId ?? null,
        });

        return {
          importId: job.id,
          status: job.status,
          detectedColumns: parsed.headers,
          suggestedMapping,
          totalRows: parsed.rows.length,
        };
      },
    );
  }

  /** Replace the column mapping of an import job. */
  async setMapping(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    importId: string;
    mapping: Record<string, string>;
  }): Promise<{ importId: string; status: string; columnMapping: Record<string, string> }> {
    if (!isMappingUsable(input.mapping)) {
      throw AppError.validation(
        'The mapping must include the external order id and the total paid columns.',
      );
    }

    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      async (tx) => {
        const job = await this.loadJob(tx, input.organizationId, input.importId);
        if (job === null) throw AppError.notFound('Import');

        const updated = await tx.query<ImportJobRow>(
          `UPDATE import_jobs SET column_mapping = $3, status = 'ready' WHERE id = $1 AND organization_id = $2 RETURNING *`,
          [input.importId, input.organizationId, JSON.stringify(input.mapping)],
        );

        return {
          importId: input.importId,
          status: updated.rows[0]?.status ?? 'ready',
          columnMapping: input.mapping,
        };
      },
    );
  }

  /** Validate every row and store the per-row outcome. */
  async preview(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    importId: string;
  }): Promise<{
    importId: string;
    status: string;
    counts: ImportCounts;
    samples: { valid: ValidatedRow[]; invalid: ValidatedRow[] };
  }> {
    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      async (tx) => {
        const job = await this.loadJob(tx, input.organizationId, input.importId);
        if (job === null) throw AppError.notFound('Import');

        const rows = await this.validateRows(tx, input.organizationId, job);
        await this.storeRowResults(tx, input.organizationId, input.importId, rows);

        const counts = summarise(rows);
        await tx.query(
          `UPDATE import_jobs SET status = 'ready', total_rows = $3, valid_rows = $4, invalid_rows = $5
           WHERE id = $1 AND organization_id = $2`,
          [input.importId, input.organizationId, counts.totalRows, counts.validRows, counts.invalidRows],
        );

        return {
          importId: input.importId,
          status: 'ready',
          counts,
          samples: {
            valid: rows.filter((row) => row.status === 'valid').slice(0, 10),
            invalid: rows.filter((row) => row.status === 'invalid').slice(0, 10),
          },
        };
      },
    );
  }

  /** Import the valid rows, reconcile duplicates and attribute the orders. */
  async commit(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    requestId?: string;
    importId: string;
  }): Promise<{ importId: string; status: string; counts: ImportCounts }> {
    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      async (tx) => {
        const job = await this.loadJob(tx, input.organizationId, input.importId);
        if (job === null) throw AppError.notFound('Import');

        if (job.status === 'completed') {
          // Idempotent: committing a finished import again returns the recorded counts.
          return {
            importId: job.id,
            status: 'completed',
            counts: {
              totalRows: job.total_rows,
              validRows: job.valid_rows,
              invalidRows: job.invalid_rows,
              importedRows: job.imported_rows,
              updatedRows: job.updated_rows,
              skippedRows: job.skipped_rows,
              attributedOrders: 0,
            },
          };
        }

        const rows = await this.validateRows(tx, input.organizationId, job);
        await this.storeRowResults(tx, input.organizationId, input.importId, rows);

        let importedRows = 0;
        let updatedRows = 0;
        let skippedRows = 0;
        let attributedOrders = 0;

        for (const row of rows) {
          if (row.status !== 'valid' || row.parsed === null) {
            skippedRows += 1;
            continue;
          }

          const existing = await tx.query<{ id: string }>(
            'SELECT id FROM orders WHERE organization_id = $1 AND external_order_id = $2',
            [input.organizationId, row.parsed.externalOrderId],
          );

          const saved = await tx.query<{ id: string }>(
            `INSERT INTO orders (
               organization_id, external_order_id, source, ordered_at, currency,
               subtotal_minor, discount_minor, tax_minor, shipping_minor, total_paid_minor,
               status, coupon_code, referral_identifier, customer_ref_hash, source_import_id
             ) VALUES ($1, $2, 'csv', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT (organization_id, external_order_id) DO UPDATE SET
               ordered_at = EXCLUDED.ordered_at,
               currency = EXCLUDED.currency,
               subtotal_minor = EXCLUDED.subtotal_minor,
               discount_minor = EXCLUDED.discount_minor,
               tax_minor = EXCLUDED.tax_minor,
               shipping_minor = EXCLUDED.shipping_minor,
               total_paid_minor = EXCLUDED.total_paid_minor,
               status = EXCLUDED.status,
               coupon_code = EXCLUDED.coupon_code,
               referral_identifier = EXCLUDED.referral_identifier,
               customer_ref_hash = EXCLUDED.customer_ref_hash,
               source_import_id = EXCLUDED.source_import_id,
               updated_at = now()
             RETURNING id, (xmax = 0) AS was_inserted`,
            [
              input.organizationId,
              row.parsed.externalOrderId,
              row.parsed.orderedAt,
              row.parsed.currency,
              row.parsed.subtotalMinor,
              row.parsed.discountMinor,
              row.parsed.taxMinor,
              row.parsed.shippingMinor,
              row.parsed.totalPaidMinor,
              row.parsed.status,
              row.parsed.couponCode,
              row.parsed.referralIdentifier,
              row.parsed.customerRefHash,
              input.importId,
            ],
          );

          const savedRow = saved.rows[0];
          if (!savedRow) continue;

          if (existing.rows.length > 0) {
            updatedRows += 1;
          } else {
            importedRows += 1;
          }

          // Refunds are appended, never overwritten. The external id makes a re-import idempotent.
          if (row.parsed.refundMinor > 0) {
            await tx.query(
              `INSERT INTO refunds (organization_id, order_id, amount_minor, currency, reason,
                                    external_refund_id, refunded_at, source_import_id)
               VALUES ($1, $2, $3, $4, 'Imported refund', $5, $6, $7)
               ON CONFLICT (order_id, external_refund_id) DO NOTHING`,
              [
                input.organizationId,
                savedRow.id,
                row.parsed.refundMinor,
                row.parsed.currency,
                `${row.parsed.externalOrderId}:refund`,
                row.parsed.orderedAt,
                input.importId,
              ],
            );
          }

          await this.deps.attributeOrder(tx, {
            organizationId: input.organizationId,
            orderId: savedRow.id,
            requestId: input.requestId ?? null,
            actorUserId: input.actorUserId,
            actorRole: input.actorRole,
          });
          attributedOrders += 1;
        }

        const counts: ImportCounts = {
          totalRows: rows.length,
          validRows: rows.filter((row) => row.status === 'valid').length,
          invalidRows: rows.filter((row) => row.status === 'invalid').length,
          importedRows,
          updatedRows,
          skippedRows,
          attributedOrders,
        };

        await tx.query(
          `UPDATE import_jobs SET
             status = 'completed',
             total_rows = $3, valid_rows = $4, invalid_rows = $5,
             imported_rows = $6, updated_rows = $7, skipped_rows = $8,
             completed_at = now()
           WHERE id = $1 AND organization_id = $2`,
          [
            input.importId,
            input.organizationId,
            counts.totalRows,
            counts.validRows,
            counts.invalidRows,
            counts.importedRows,
            counts.updatedRows,
            counts.skippedRows,
          ],
        );

        await recordAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          action: 'import.committed',
          entityType: 'import_job',
          entityId: input.importId,
          after: sanitiseForAudit(counts),
          requestId: input.requestId ?? null,
        });

        return { importId: input.importId, status: 'completed', counts };
      },
    );
  }

  /** Build the downloadable error report. */
  async errorReport(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    importId: string;
  }): Promise<{ filename: string; content: string }> {
    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      async (tx) => {
        const job = await this.loadJob(tx, input.organizationId, input.importId);
        if (job === null) throw AppError.notFound('Import');

        const rows = await tx.query<{
          row_number: number;
          status: string;
          external_order_id: string | null;
          errors: RowIssue[];
          warnings: RowIssue[];
          raw_data: Record<string, string>;
        }>(
          `SELECT row_number, status, external_order_id, errors, warnings, raw_data
           FROM import_job_rows
           WHERE import_job_id = $1 AND organization_id = $2 AND status IN ('invalid', 'duplicate')
           ORDER BY row_number`,
          [input.importId, input.organizationId],
        );

        const header = ['row_number', 'status', 'external_order_id', 'errors', 'warnings'];
        const lines = [header.join(',')];

        for (const row of rows.rows) {
          lines.push(
            [
              String(row.row_number),
              row.status,
              row.external_order_id ?? '',
              escapeCsv((row.errors ?? []).map((issue) => issue.message).join('; ')),
              escapeCsv((row.warnings ?? []).map((issue) => issue.message).join('; ')),
            ].join(','),
          );
        }

        return {
          filename: `import-errors-${input.importId}.csv`,
          content: `${lines.join('\n')}\n`,
        };
      },
    );
  }

  async getJob(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    importId: string;
  }): Promise<ImportJobRow | null> {
    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      (tx) => this.loadJob(tx, input.organizationId, input.importId),
    );
  }

  async listJobs(input: {
    organizationId: string;
    actorUserId: string;
    actorRole: OrganizationRole;
    limit: number;
    offset: number;
  }): Promise<{ items: ImportJobRow[]; total: number }> {
    return withOrgContext(
      this.db,
      { organizationId: input.organizationId, userId: input.actorUserId, role: input.actorRole },
      async (tx) => {
        const items = await tx.query<ImportJobRow>(
          `SELECT * FROM import_jobs WHERE organization_id = $1
           ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
          [input.organizationId, input.limit, input.offset],
        );
        const total = await tx.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM import_jobs WHERE organization_id = $1',
          [input.organizationId],
        );
        return { items: items.rows, total: total.rows[0]?.count ?? 0 };
      },
    );
  }

  private async loadJob(
    tx: SqlClient,
    organizationId: string,
    importId: string,
  ): Promise<ImportJobRow | null> {
    const result = await tx.query<ImportJobRow>(
      'SELECT * FROM import_jobs WHERE id = $1 AND organization_id = $2',
      [importId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  /** Read the stored file and validate every row against the mapping. */
  private async validateRows(
    tx: SqlClient,
    organizationId: string,
    job: ImportJobRow,
  ): Promise<ValidatedRow[]> {
    if (job.storage_path === null) {
      throw AppError.unprocessable('The import file is no longer available.');
    }

    const content = await this.deps.storage.read(job.storage_path);
    const parsed = parseCsv(content.toString('utf8'));
    const mapping = (job.column_mapping ?? {}) as Record<OrderColumn, string>;

    const organization = await tx.query<{ currency: string; timezone: string }>(
      'SELECT currency, timezone FROM organizations WHERE id = $1',
      [organizationId],
    );
    const currency = organization.rows[0]?.currency ?? 'ETB';
    const timezone = organization.rows[0]?.timezone ?? 'Africa/Addis_Ababa';

    const seen = new Set<string>();
    const rows: ValidatedRow[] = [];

    parsed.rows.forEach((cells, index) => {
      const rowNumber = index + 2; // the header is row 1
      const raw: Record<string, string> = {};

      parsed.headers.forEach((header, columnIndex) => {
        raw[header] = cells[columnIndex] ?? '';
      });

      const result = validateRow(raw, mapping, { currency, timezone, seen }, rowNumber);
      seen.add(result.externalOrderId ?? '');
      rows.push(result);
    });

    return rows;
  }

  private async storeRowResults(
    tx: SqlClient,
    organizationId: string,
    importId: string,
    rows: ValidatedRow[],
  ): Promise<void> {
    await tx.query('DELETE FROM import_job_rows WHERE import_job_id = $1 AND organization_id = $2', [
      importId,
      organizationId,
    ]);

    for (const row of rows) {
      await tx.query(
        `INSERT INTO import_job_rows (
           organization_id, import_job_id, row_number, raw_data, status, errors, warnings, external_order_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          organizationId,
          importId,
          row.rowNumber,
          JSON.stringify(row.raw),
          row.status,
          JSON.stringify(row.errors),
          JSON.stringify(row.warnings),
          row.externalOrderId,
        ],
      );
    }
  }
}

/* ------------------------------------------------------------------ helpers */

function summarise(rows: ValidatedRow[]): ImportCounts {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'valid').length,
    invalidRows: rows.filter((row) => row.status === 'invalid').length,
    importedRows: 0,
    updatedRows: 0,
    skippedRows: rows.filter((row) => row.status !== 'valid').length,
    attributedOrders: 0,
  };
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface ValidationContext {
  currency: string;
  timezone: string;
  seen: Set<string>;
}

/**
 * Validate one source row.
 *
 * Errors are fatal for the row; warnings are recorded but the row is still imported.
 */
export function validateRow(
  raw: Record<string, string>,
  mapping: Record<string, string>,
  context: ValidationContext,
  rowNumber = 0,
): ValidatedRow {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  const value = (column: OrderColumn): string | undefined => {
    const header = mapping[column];
    if (header === undefined) return undefined;
    const cell = raw[header];
    return cell === undefined || cell.trim() === '' ? undefined : cell.trim();
  };

  /* --- external order id --------------------------------------------- */
  const externalOrderId = value('externalOrderId');
  if (externalOrderId === undefined) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      message: 'The external order id is missing.',
      field: 'externalOrderId',
    });
  } else if (externalOrderId.length > 120) {
    errors.push({
      code: 'INVALID_IDENTIFIER',
      message: 'The external order id is longer than 120 characters.',
      field: 'externalOrderId',
    });
  }

  /* --- ordered at ---------------------------------------------------- */
  let orderedAt: Date | null = null;
  const orderedAtRaw = value('orderedAt');
  if (orderedAtRaw === undefined) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      message: 'The order date is missing.',
      field: 'orderedAt',
    });
  } else {
    const parsed = parseDateValue(orderedAtRaw, context.timezone);
    if (parsed === null) {
      errors.push({
        code: 'INVALID_DATE',
        message: `"${orderedAtRaw}" is not a valid date.`,
        field: 'orderedAt',
      });
    } else {
      orderedAt = parsed;
    }
  }

  /* --- money ---------------------------------------------------------- */
  const amount = (column: OrderColumn): number | null => {
    const raw2 = value(column);
    if (raw2 === undefined) return 0;

    try {
      const minor = parseAmountToMinor(raw2);
      if (minor < 0) {
        errors.push({
          code: 'NEGATIVE_AMOUNT',
          message: `"${raw2}" is negative.`,
          field: column,
        });
        return null;
      }
      return minor;
    } catch {
      errors.push({
        code: 'INVALID_AMOUNT',
        message: `"${raw2}" is not a valid amount.`,
        field: column,
      });
      return null;
    }
  };

  const subtotalMinor = amount('subtotal');
  const discountMinor = amount('discount');
  const taxMinor = amount('tax');
  const shippingMinor = amount('shipping');
  const refundMinor = amount('refundAmount') ?? 0;

  // The total paid is the one mandatory monetary field: without it there is no revenue.
  let totalPaidMinor: number | null = null;
  const totalPaidRaw = value('totalPaid');
  if (totalPaidRaw === undefined) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      message: 'The total paid is missing.',
      field: 'totalPaid',
    });
  } else {
    try {
      const minor = parseAmountToMinor(totalPaidRaw);
      if (minor < 0) {
        errors.push({
          code: 'NEGATIVE_AMOUNT',
          message: `"${totalPaidRaw}" is negative.`,
          field: 'totalPaid',
        });
      } else {
        totalPaidMinor = minor;
      }
    } catch {
      errors.push({
        code: 'INVALID_AMOUNT',
        message: `"${totalPaidRaw}" is not a valid amount.`,
        field: 'totalPaid',
      });
    }
  }

  /* --- currency -------------------------------------------------------- */
  const currency = (value('currency') ?? context.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.push({
      code: 'INVALID_CURRENCY',
      message: `"${currency}" is not a three-letter currency code.`,
      field: 'currency',
    });
  } else if (currency !== context.currency) {
    warnings.push({
      code: 'CURRENCY_MISMATCH',
      message: `The order is in ${currency} but the organization reports in ${context.currency}. It will not be included in currency totals.`,
      field: 'currency',
    });
  }

  /* --- status ---------------------------------------------------------- */
  let status: OrderStatus = 'paid';
  const statusRaw = value('status');
  if (statusRaw !== undefined) {
    const normalized = statusRaw.toLowerCase().replace(/[\s-]+/g, '_');
    if ((ORDER_STATUSES as readonly string[]).includes(normalized)) {
      status = normalized as OrderStatus;
    } else {
      errors.push({
        code: 'INVALID_STATUS',
        message: `"${statusRaw}" is not a supported order status.`,
        field: 'status',
      });
    }
  } else {
    warnings.push({
      code: 'STATUS_DEFAULTED',
      message: 'No status column was mapped; the order was imported as "paid".',
      field: 'status',
    });
  }

  /* --- reconciliation --------------------------------------------------- */
  if (
    subtotalMinor !== null &&
    discountMinor !== null &&
    taxMinor !== null &&
    shippingMinor !== null &&
    totalPaidMinor !== null
  ) {
    const expected = subtotalMinor - discountMinor + taxMinor + shippingMinor;
    if (expected !== totalPaidMinor) {
      warnings.push({
        code: 'AMOUNT_MISMATCH',
        message: `Subtotal − discount + tax + shipping is ${(expected / 100).toFixed(2)}, but the total paid is ${(totalPaidMinor / 100).toFixed(2)}. The source values were kept.`,
        field: 'totalPaid',
      });
    }
  }

  /* --- duplicate inside the file ------------------------------------------ */
  if (externalOrderId !== undefined && context.seen.has(externalOrderId)) {
    errors.push({
      code: 'DUPLICATE_IN_FILE',
      message: `"${externalOrderId}" appears more than once in this file. Only the first occurrence was imported.`,
      field: 'externalOrderId',
    });
  }

  const fatal = errors.length > 0;

  const parsed: ParsedOrder | null =
    fatal || externalOrderId === undefined || orderedAt === null || totalPaidMinor === null
      ? null
      : {
          externalOrderId,
          orderedAt,
          currency,
          subtotalMinor: subtotalMinor ?? 0,
          discountMinor: discountMinor ?? 0,
          taxMinor: taxMinor ?? 0,
          shippingMinor: shippingMinor ?? 0,
          totalPaidMinor,
          refundMinor,
          status,
          couponCode: value('couponCode')?.toUpperCase() ?? null,
          referralIdentifier: value('referralIdentifier') ?? null,
          customerRefHash: hashCustomerRef(value('customerRef')),
        };

  return {
    rowNumber,
    raw,
    status: fatal ? 'invalid' : 'valid',
    errors,
    warnings,
    externalOrderId: externalOrderId ?? null,
    parsed,
  };
}

/** Parse a date, interpreting a naive timestamp in the organisation's timezone. */
function parseDateValue(raw: string, timezone: string): Date | null {
  const withOffset = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw);
  if (withOffset) {
    try {
      return parseIsoDate(raw);
    } catch {
      return null;
    }
  }

  const naive = naiveTimestampToUtc(raw, timezone);
  if (naive !== null && !Number.isNaN(naive.getTime())) {
    return naive;
  }

  // A plain date such as `2026-03-01`.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : null;
  if (dateOnly !== null) {
    const parsed = naiveTimestampToUtc(dateOnly, timezone);
    if (parsed !== null && !Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

/** Hash a customer reference: the raw value is never stored. */
function hashCustomerRef(value: string | undefined): string | null {
  if (value === undefined) return null;
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}
