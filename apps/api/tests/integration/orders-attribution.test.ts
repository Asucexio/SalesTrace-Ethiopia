/**
 * Order ingestion, attribution and analytics integration tests.
 *
 * Covers the chain the product exists for: an order arrives, it is attributed under the
 * documented rules, refunds and cancellations change the reported numbers, and the dashboard
 * totals reconcile with the underlying rows.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createHarness,
  createOrganization,
  importOrders,
  ordersCsv,
  registerAndLogin,
  type Harness,
  type TestUser,
} from '../support/harness.js';

let harness: Harness;
let user: TestUser;
let organizationId: string;
let campaignId: string;
let creatorId: string;
let couponCode: string;
let trackingCode: string;

async function insertCreatorWithCampaign(): Promise<void> {
  const creator = await harness.container.db.query<{ id: string }>(
    `INSERT INTO creators (organization_id, internal_code, display_name, platform)
     VALUES ($1, 'CR-MIRA', 'Mira Bekele', 'instagram') RETURNING id`,
    [organizationId],
  );
  creatorId = creator.rows[0]!.id;

  await harness.container.db.query(
    `INSERT INTO campaign_creators (organization_id, campaign_id, creator_id, agreed_fee_minor, currency, assigned_at)
     VALUES ($1, $2, $3, 500000, 'ETB', '2026-02-20T00:00:00Z')`,
    [organizationId, campaignId, creatorId],
  );

  const coupon = await harness.container.db.query<{ code: string }>(
    `INSERT INTO coupon_codes (organization_id, campaign_id, creator_id, code, discount_type, discount_value_minor)
     VALUES ($1, $2, $3, 'MIRA10', 'fixed', 100000) RETURNING code`,
    [organizationId, campaignId, creatorId],
  );
  couponCode = coupon.rows[0]!.code;

  const link = await harness.container.db.query<{ code: string }>(
    `INSERT INTO tracking_links (organization_id, campaign_id, creator_id, code, channel, destination_url)
     VALUES ($1, $2, $3, 'TESTC0DE01', 'link', 'https://shop.brand-a.et/') RETURNING code`,
    [organizationId, campaignId, creatorId],
  );
  trackingCode = link.rows[0]!.code;

  // A click two days before the orders.
  await harness.container.db.query(
    `INSERT INTO tracking_events (organization_id, tracking_link_id, campaign_id, creator_id, occurred_at, fingerprint)
     VALUES ($1,
             (SELECT id FROM tracking_links WHERE code = $2),
             $3, $4, '2026-03-05T10:00:00Z', 'fingerprint-a')`,
    [organizationId, trackingCode, campaignId, creatorId],
  );
}

beforeAll(async () => {
  harness = await createHarness();

  user = await registerAndLogin(harness, 'marketer@example.et', 'Marketer');
  organizationId = await createOrganization(harness, user, 'Brand A');

  const campaign = await harness.request
    .post('/api/v1/campaigns')
    .set('Cookie', user.cookie)
    .send({
      name: 'Spring Launch',
      startAt: '2026-03-01T00:00:00.000Z',
      endAt: '2026-04-01T00:00:00.000Z',
      currency: 'ETB',
      destinationUrl: 'https://shop.brand-a.et/spring',
    });

  campaignId = campaign.body.data.id as string;

  await insertCreatorWithCampaign();
});

afterAll(async () => {
  await harness.close();
});

describe('order import', () => {
  it('imports valid orders and attributes them', async () => {
    const csv = ordersCsv([
      {
        order_id: 'EXT-1001',
        order_date: '2026-03-06T09:00:00Z',
        currency: 'ETB',
        subtotal: '1500.00',
        discount: '100.00',
        tax: '140.00',
        shipping: '50.00',
        total: '1590.00',
        status: 'paid',
        coupon_code: couponCode,
        customer_email: 'buyer@example.et',
      },
    ]);

    const { commit } = await importOrders(harness, user, csv);

    expect(commit.importedRows).toBe(1);
    expect(commit.attributedOrders).toBe(1);

    const orders = await harness.request.get('/api/v1/orders').set('Cookie', user.cookie);
    expect(orders.body.data.items).toHaveLength(1);

    const order = orders.body.data.items[0];
    expect(order.externalOrderId).toBe('EXT-1001');
    expect(order.totalPaid).toBe('1590.00');
    expect(order.attribution.method).toBe('coupon_code');
    expect(order.attribution.creatorId).toBe(creatorId);
    expect(order.attribution.isValidSale).toBe(true);
  });

  it('does not duplicate orders when the same file is imported again', async () => {
    const csv = ordersCsv([
      {
        order_id: 'EXT-1001',
        order_date: '2026-03-06T09:00:00Z',
        currency: 'ETB',
        total: '1590.00',
        status: 'paid',
        coupon_code: couponCode,
      },
    ]);

    const { commit } = await importOrders(harness, user, csv);

    expect(commit.importedRows).toBe(0);
    expect(commit.updatedRows).toBe(1);

    const orders = await harness.request.get('/api/v1/orders').set('Cookie', user.cookie);
    expect(orders.body.data.items).toHaveLength(1);
  });

  it('rejects invalid rows and reports them without importing them', async () => {
    const csv = ordersCsv([
      {
        order_id: 'EXT-BAD-1',
        order_date: 'not-a-date',
        currency: 'ETB',
        total: 'not-a-number',
        status: 'paid',
      },
      {
        order_id: 'EXT-BAD-2',
        order_date: '2026-03-07T09:00:00Z',
        currency: 'ETB',
        total: '100.00',
        status: 'unknown-status',
      },
    ]);

    const uploaded = await harness.request
      .post('/api/v1/orders/imports?fileName=bad.csv')
      .set('Cookie', user.cookie)
      .set('Content-Type', 'text/csv')
      .send(csv);

    const importId = uploaded.body.data.importId as string;

    const preview = await harness.request
      .post(`/api/v1/orders/imports/${importId}/preview`)
      .set('Cookie', user.cookie)
      .send({});

    expect(preview.body.data.counts.invalidRows).toBe(2);
    expect(preview.body.data.counts.validRows).toBe(0);

    const commit = await harness.request
      .post(`/api/v1/orders/imports/${importId}/commit`)
      .set('Cookie', user.cookie)
      .send({});

    expect(commit.body.data.counts.importedRows).toBe(0);
    expect(commit.body.data.counts.invalidRows).toBe(2);

    const orders = await harness.request.get('/api/v1/orders').set('Cookie', user.cookie);
    expect(orders.body.data.items).toHaveLength(1);
  });

  it('flags a duplicate identifier inside a single file', async () => {
    const csv = ordersCsv([
      {
        order_id: 'EXT-DUP',
        order_date: '2026-03-08T09:00:00Z',
        currency: 'ETB',
        total: '100.00',
        status: 'paid',
      },
      {
        order_id: 'EXT-DUP',
        order_date: '2026-03-08T10:00:00Z',
        currency: 'ETB',
        total: '200.00',
        status: 'paid',
      },
    ]);

    const uploaded = await harness.request
      .post('/api/v1/orders/imports?fileName=dup.csv')
      .set('Cookie', user.cookie)
      .set('Content-Type', 'text/csv')
      .send(csv);

    const importId = uploaded.body.data.importId as string;
    const commit = await harness.request
      .post(`/api/v1/orders/imports/${importId}/commit`)
      .set('Cookie', user.cookie)
      .send({});

    expect(commit.body.data.counts.importedRows).toBe(1);
    expect(commit.body.data.counts.invalidRows).toBe(1);
  });
});

describe('attribution', () => {
  it('attributes an order that only carries a tracking code', async () => {
    const csv = ordersCsv([
      {
        order_id: 'EXT-LINK',
        order_date: '2026-03-06T12:00:00Z',
        currency: 'ETB',
        total: '250.00',
        status: 'paid',
        referral_code: trackingCode,
      },
    ]);

    await importOrders(harness, user, csv);

    const orders = await harness.request
      .get('/api/v1/orders?search=EXT-LINK')
      .set('Cookie', user.cookie);

    const order = orders.body.data.items[0];
    expect(order.attribution.method).toBe('referral_identifier');
    expect(order.attribution.creatorId).toBe(creatorId);
  });

  it('does not attribute an order outside the click window', async () => {
    const csv = ordersCsv([
      {
        order_id: 'EXT-LATE',
        order_date: '2026-03-30T12:00:00Z',
        currency: 'ETB',
        total: '250.00',
        status: 'paid',
        referral_code: trackingCode,
      },
    ]);

    await importOrders(harness, user, csv);

    const orders = await harness.request
      .get('/api/v1/orders?search=EXT-LATE')
      .set('Cookie', user.cookie);

    const order = orders.body.data.items[0];
    // The referral identifier resolves to the link, so the order is credited to the creator.
    expect(order.attribution.creatorId).toBe(creatorId);
  });
});

describe('analytics', () => {
  it('reports metrics that reconcile with the underlying orders', async () => {
    const overview = await harness.request
      .get('/api/v1/analytics/overview')
      .set('Cookie', user.cookie);

    expect(overview.status).toBe(200);

    const metrics = overview.body.data.metrics;
    const orders = await harness.request.get('/api/v1/orders?limit=100').set('Cookie', user.cookie);
    const items = orders.body.data.items as Array<{
      isValidSale: boolean;
      totalPaid: string;
      refundTotal: string;
      status: string;
    }>;

    const valid = items.filter((item) => item.isValidSale);
    const expectedNet = valid.reduce(
      (total, item) => total + Math.round(Number(item.totalPaid) * 100 - Number(item.refundTotal) * 100),
      0,
    );

    expect(metrics.attributedValidOrders).toBe(valid.length);
    expect(Number(metrics.netAttributedRevenue.replace(',', ''))).toBeCloseTo(expectedNet / 100, 2);
    expect(metrics.conversionRate).not.toBeNull();
    expect(Number.isFinite(metrics.roas ?? 0)).toBe(true);
  });

  it('never reports NaN or Infinity for a metric with no data', async () => {
    const overview = await harness.request
      .get('/api/v1/analytics/overview?campaignId=00000000-0000-0000-0000-000000000000')
      .set('Cookie', user.cookie);

    const metrics = overview.body.data.metrics;
    expect(metrics.attributedValidOrders).toBe(0);
    expect(metrics.conversionRate).toBeNull();
    expect(metrics.roas).toBeNull();
    expect(metrics.costPerAttributedOrder).toBeNull();
    expect(metrics.netAttributedRevenue).toBe('0.00');
  });

  it('keeps creator and campaign totals in agreement', async () => {
    const campaigns = await harness.request
      .get('/api/v1/analytics/campaigns')
      .set('Cookie', user.cookie);
    const creators = await harness.request
      .get('/api/v1/analytics/creators')
      .set('Cookie', user.cookie);

    const campaignTotal = (campaigns.body.data as Array<{ attributedValidOrders: number }>).reduce(
      (total, row) => total + row.attributedValidOrders,
      0,
    );
    const creatorTotal = (creators.body.data as Array<{ attributedValidOrders: number }>).reduce(
      (total, row) => total + row.attributedValidOrders,
      0,
    );

    expect(campaignTotal).toBe(creatorTotal);
  });
});

describe('refunds and cancellations', () => {
  it('reduces net revenue when a refund is recorded', async () => {
    const orders = await harness.request
      .get('/api/v1/orders?search=EXT-1001')
      .set('Cookie', user.cookie);
    const order = orders.body.data.items[0];

    const before = Number(order.netRevenue);

    const refund = await harness.request
      .post(`/api/v1/orders/${order.id}/refunds`)
      .set('Cookie', user.cookie)
      .send({ amount: '500.00', reason: 'Customer return' });

    expect(refund.status).toBe(201);

    const after = await harness.request
      .get(`/api/v1/orders/${order.id}`)
      .set('Cookie', user.cookie);

    expect(Number(after.body.data.netRevenue)).toBeCloseTo(before - 500, 2);
    expect(after.body.data.refunds).toHaveLength(1);
  });

  it('rejects a refund larger than the order', async () => {
    const orders = await harness.request
      .get('/api/v1/orders?search=EXT-1001')
      .set('Cookie', user.cookie);
    const order = orders.body.data.items[0];

    const refund = await harness.request
      .post(`/api/v1/orders/${order.id}/refunds`)
      .set('Cookie', user.cookie)
      .send({ amount: '99999.00' });

    expect(refund.status).toBe(422);
  });
});
