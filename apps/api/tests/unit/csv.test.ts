import { describe, expect, it } from 'vitest';

import { detectColumnMapping, isMappingUsable, parseCsv } from '../../src/modules/orders/csv.js';

describe('parseCsv', () => {
  it('reads the header row and the data rows', () => {
    const result = parseCsv('order_id,total\nEXT-1,100.00\nEXT-2,200.00\n');

    expect(result.headers).toEqual(['order_id', 'total']);
    expect(result.rows).toEqual([
      ['EXT-1', '100.00'],
      ['EXT-2', '200.00'],
    ]);
  });

  it('skips blank lines', () => {
    const result = parseCsv('order_id,total\n\nEXT-1,100.00\n\n');

    expect(result.rows).toHaveLength(1);
  });

  it('tolerates rows with a different number of cells', () => {
    const result = parseCsv('order_id,total,status\nEXT-1,100.00\nEXT-2,200.00,paid,extra\n');

    expect(result.rows).toHaveLength(2);
    // Short rows simply have fewer cells; the row mapper substitutes an empty string.
    expect(result.rows[0]).toEqual(['EXT-1', '100.00']);
    expect(result.rows[1]).toEqual(['EXT-2', '200.00', 'paid', 'extra']);
  });

  it('handles a UTF-8 byte order mark', () => {
    const result = parseCsv('\uFEFForder_id,total\nEXT-1,100.00\n');

    expect(result.headers[0]).toBe('order_id');
  });

  it('returns no headers for an empty document', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});

describe('detectColumnMapping', () => {
  it('detects the common column names', () => {
    const mapping = detectColumnMapping([
      'order_id',
      'order_date',
      'currency',
      'subtotal',
      'discount',
      'tax',
      'shipping',
      'total',
      'status',
      'coupon_code',
      'referral_code',
      'customer_email',
    ]);

    expect(mapping['externalOrderId']).toBe('order_id');
    expect(mapping['orderedAt']).toBe('order_date');
    expect(mapping['currency']).toBe('currency');
    expect(mapping['subtotal']).toBe('subtotal');
    expect(mapping['discount']).toBe('discount');
    expect(mapping['tax']).toBe('tax');
    expect(mapping['shipping']).toBe('shipping');
    expect(mapping['totalPaid']).toBe('total');
    expect(mapping['status']).toBe('status');
    expect(mapping['couponCode']).toBe('coupon_code');
    expect(mapping['referralIdentifier']).toBe('referral_code');
    expect(mapping['customerRef']).toBe('customer_email');
  });

  it('recognises alternative header names', () => {
    const mapping = detectColumnMapping(['Order Number', 'Created At', 'Grand Total', 'Payment Status']);

    expect(mapping['externalOrderId']).toBe('Order Number');
    expect(mapping['orderedAt']).toBe('Created At');
    expect(mapping['totalPaid']).toBe('Grand Total');
    expect(mapping['status']).toBe('Payment Status');
  });

  it('never maps one source column to two canonical fields', () => {
    const mapping = detectColumnMapping(['order_id', 'total', 'amount']);

    const used = Object.values(mapping);
    expect(new Set(used).size).toBe(used.length);
  });

  it('reports a mapping as unusable when the required fields are missing', () => {
    expect(isMappingUsable({ externalOrderId: 'order_id' })).toBe(false);
    expect(isMappingUsable({ externalOrderId: 'order_id', totalPaid: 'total' })).toBe(true);
  });
});
