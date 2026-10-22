/**
 * CSV parsing and column detection for order imports.
 *
 * The importer is deliberately forgiving about the *shape* of a file and strict about the
 * *values*: a header row is required, rows may have a different number of cells (the extra
 * values are ignored, the missing ones are reported per row), and every monetary value is
 * validated individually.
 */

import { parse } from 'csv-parse/sync';

import type { OrderColumn } from '@salestrace/validation';

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Parse a CSV document into headers and rows. */
export function parseCsv(content: string): ParsedCsv {
  const records = parse(content, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    columns: false,
  }) as string[][];

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headerRow, ...rows] = records;
  return {
    headers: (headerRow ?? []).map((header) => header.trim()),
    rows,
  };
}

/** Normalise a header for comparison: lowercase, alphanumeric only. */
function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Candidate header names for each canonical column, most specific first. */
const HEADER_HINTS: Record<OrderColumn, string[]> = {
  externalOrderId: [
    'externalorderid',
    'orderid',
    'ordernumber',
    'orderno',
    'orderreference',
    'reference',
    'transactionid',
    'id',
  ],
  orderedAt: [
    'orderedat',
    'orderdate',
    'orderdatetime',
    'createdat',
    'date',
    'datetime',
    'timestamp',
    'placedat',
  ],
  currency: ['currency', 'currencycode', 'curr'],
  subtotal: ['subtotal', 'subtotalamount', 'subtotalminor', 'netamount'],
  discount: ['discount', 'discountamount', 'discountvalue', 'discounttotal'],
  tax: ['tax', 'taxamount', 'vat', 'vatamount'],
  shipping: ['shipping', 'shippingamount', 'delivery', 'deliveryfee', 'postage'],
  totalPaid: [
    'totalpaid',
    'totalamount',
    'grandtotal',
    'ordertotal',
    'paymentamount',
    'paid',
    'total',
    'amount',
  ],
  refundAmount: ['refund', 'refunded', 'refundamount', 'refundedamount', 'amountrefunded'],
  status: ['orderstatus', 'status', 'state', 'paymentstatus'],
  couponCode: ['couponcode', 'coupon', 'promocode', 'promo', 'discountcode', 'voucher', 'vouchercode'],
  referralIdentifier: [
    'referralidentifier',
    'referralcode',
    'referral',
    'affiliatecode',
    'affiliate',
    'trackingcode',
    'attributioncode',
    'ref',
  ],
  customerRef: ['customerref', 'customerid', 'customer', 'email', 'phone', 'buyer'],
};

const ALL_COLUMNS = Object.keys(HEADER_HINTS) as OrderColumn[];

/**
 * Guess the column mapping from the header row.
 *
 * Exact matches win; a column is only assigned once. The result is a suggestion — the user can
 * change it before the import is committed.
 */
export function detectColumnMapping(headers: string[]): Record<OrderColumn, string> {
  const normalised = headers.map((header) => normaliseHeader(header));
  const mapping: Partial<Record<OrderColumn, string>> = {};
  const used = new Set<number>();

  // Pass 1 — exact matches.
  for (const column of ALL_COLUMNS) {
    for (const hint of HEADER_HINTS[column]) {
      const index = normalised.findIndex((header, position) => header === hint && !used.has(position));
      if (index >= 0) {
        mapping[column] = headers[index]!;
        used.add(index);
        break;
      }
    }
  }

  // Pass 2 — "contains" matches for the columns that are still unmapped.
  for (const column of ALL_COLUMNS) {
    if (mapping[column] !== undefined) continue;

    for (const hint of HEADER_HINTS[column]) {
      const index = normalised.findIndex(
        (header, position) => !used.has(position) && header.length > 2 && header.includes(hint),
      );
      if (index >= 0) {
        mapping[column] = headers[index]!;
        used.add(index);
        break;
      }
    }
  }

  return mapping as Record<OrderColumn, string>;
}

/** True when the mapping covers the fields an import cannot proceed without. */
export function isMappingUsable(mapping: Record<string, string>): boolean {
  return (
    typeof mapping['externalOrderId'] === 'string' &&
    mapping['externalOrderId'].length > 0 &&
    typeof mapping['totalPaid'] === 'string' &&
    mapping['totalPaid'].length > 0
  );
}
