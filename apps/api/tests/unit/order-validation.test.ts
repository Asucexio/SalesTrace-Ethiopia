import { describe, expect, it } from 'vitest';

import { validateRow } from '../../src/modules/orders/order-import.service.js';

const MAPPING = {
  externalOrderId: 'order_id',
  orderedAt: 'order_date',
  currency: 'currency',
  subtotal: 'subtotal',
  discount: 'discount',
  tax: 'tax',
  shipping: 'shipping',
  totalPaid: 'total',
  refundAmount: 'refund',
  status: 'status',
  couponCode: 'coupon_code',
  referralIdentifier: 'referral_code',
  customerRef: 'customer_email',
} as Record<string, string>;

function row(values: Record<string, string>) {
  return validateRow(values, MAPPING, {
    currency: 'ETB',
    timezone: 'Africa/Addis_Ababa',
    seen: new Set<string>(),
  });
}

describe('validateRow', () => {
  it('accepts a complete row', () => {
    const result = row({
      order_id: 'EXT-1',
      order_date: '2026-03-06T09:00:00Z',
      currency: 'ETB',
      subtotal: '1000.00',
      discount: '100.00',
      tax: '90.00',
      shipping: '10.00',
      total: '1000.00',
      status: 'paid',
    });

    expect(result.status).toBe('valid');
    expect(result.errors).toHaveLength(0);
    expect(result.parsed?.totalPaidMinor).toBe(100000);
    expect(result.parsed?.subtotalMinor).toBe(100000);
    expect(result.parsed?.discountMinor).toBe(10000);
    expect(result.parsed?.status).toBe('paid');
  });

  it('rejects a row without an external order id', () => {
    const result = row({ order_date: '2026-03-06T09:00:00Z', total: '10.00' });

    expect(result.status).toBe('invalid');
    expect(result.errors.some((issue) => issue.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
  });

  it('rejects a row without a total paid', () => {
    const result = row({ order_id: 'EXT-1', order_date: '2026-03-06T09:00:00Z' });

    expect(result.status).toBe('invalid');
    expect(result.errors.some((issue) => issue.field === 'totalPaid')).toBe(true);
  });

  it('rejects an unparsable date', () => {
    const result = row({ order_id: 'EXT-1', order_date: 'yesterday', total: '10.00' });

    expect(result.status).toBe('invalid');
    expect(result.errors.some((issue) => issue.code === 'INVALID_DATE')).toBe(true);
  });

  it('rejects an unparsable amount', () => {
    const result = row({ order_id: 'EXT-1', order_date: '2026-03-06T09:00:00Z', total: 'ten birr' });

    expect(result.status).toBe('invalid');
    expect(result.errors.some((issue) => issue.code === 'INVALID_AMOUNT')).toBe(true);
  });

  it('rejects a negative amount', () => {
    const result = row({ order_id: 'EXT-1', order_date: '2026-03-06T09:00:00Z', total: '-5.00' });

    expect(result.status).toBe('invalid');
    expect(result.errors.some((issue) => issue.code === 'NEGATIVE_AMOUNT')).toBe(true);
  });

  it('rejects an unsupported status', () => {
    const result = row({
      order_id: 'EXT-1',
      order_date: '2026-03-06T09:00:00Z',
      total: '10.00',
      status: 'teleported',
    });

    expect(result.status).toBe('invalid');
    expect(result.errors.some((issue) => issue.code === 'INVALID_STATUS')).toBe(true);
  });

  it('normalises the status', () => {
    const result = row({
      order_id: 'EXT-1',
      order_date: '2026-03-06T09:00:00Z',
      total: '10.00',
      status: 'Partially Refunded',
    });

    expect(result.parsed?.status).toBe('partially_refunded');
  });

  it('warns when the amounts do not reconcile, but still imports the row', () => {
    const result = row({
      order_id: 'EXT-1',
      order_date: '2026-03-06T09:00:00Z',
      subtotal: '1000.00',
      discount: '100.00',
      tax: '90.00',
      shipping: '10.00',
      total: '1234.00',
      status: 'paid',
    });

    expect(result.status).toBe('valid');
    expect(result.warnings.some((issue) => issue.code === 'AMOUNT_MISMATCH')).toBe(true);
    // The source values are preserved rather than corrected.
    expect(result.parsed?.totalPaidMinor).toBe(123400);
  });

  it('warns when the currency differs from the organization currency', () => {
    const result = row({
      order_id: 'EXT-1',
      order_date: '2026-03-06T09:00:00Z',
      currency: 'USD',
      total: '10.00',
      status: 'paid',
    });

    expect(result.status).toBe('valid');
    expect(result.warnings.some((issue) => issue.code === 'CURRENCY_MISMATCH')).toBe(true);
    expect(result.parsed?.currency).toBe('USD');
  });

  it('flags a duplicate identifier inside the same file', () => {
    const values = {
      order_id: 'EXT-1',
      order_date: '2026-03-06T09:00:00Z',
      total: '10.00',
      status: 'paid',
    };

    const first = validateRow(values, MAPPING, {
      currency: 'ETB',
      timezone: 'Africa/Addis_Ababa',
      seen: new Set<string>(),
    });
    expect(first.status).toBe('valid');

    const second = validateRow(values, MAPPING, {
      currency: 'ETB',
      timezone: 'Africa/Addis_Ababa',
      seen: new Set(['EXT-1']),
    });
    expect(second.status).toBe('invalid');
    expect(second.errors.some((issue) => issue.code === 'DUPLICATE_IN_FILE')).toBe(true);
  });

  it('interprets a naive timestamp in the organization timezone', () => {
    const result = row({
      order_id: 'EXT-1',
      order_date: '2026-03-06 09:00:00',
      total: '10.00',
      status: 'paid',
    });

    expect(result.status).toBe('valid');
    // Africa/Addis_Ababa is UTC+3 year round, so 09:00 local is 06:00 UTC.
    expect(result.parsed?.orderedAt.toISOString()).toBe('2026-03-06T06:00:00.000Z');
  });

  it('defaults the status to paid and says so', () => {
    const result = row({ order_id: 'EXT-1', order_date: '2026-03-06T09:00:00Z', total: '10.00' });

    expect(result.parsed?.status).toBe('paid');
    expect(result.warnings.some((issue) => issue.code === 'STATUS_DEFAULTED')).toBe(true);
  });

  it('stores only a hash of the customer reference', () => {
    const result = row({
      order_id: 'EXT-1',
      order_date: '2026-03-06T09:00:00Z',
      total: '10.00',
      status: 'paid',
      customer_email: 'buyer@example.et',
    });

    expect(result.parsed?.customerRefHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result.parsed)).not.toContain('buyer@example.et');
  });

  it('uppercases the coupon code', () => {
    const result = row({
      order_id: 'EXT-1',
      order_date: '2026-03-06T09:00:00Z',
      total: '10.00',
      status: 'paid',
      coupon_code: ' mira10 ',
    });

    expect(result.parsed?.couponCode).toBe('MIRA10');
  });
});
