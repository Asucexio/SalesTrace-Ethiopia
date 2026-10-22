/**
 * Tracking integration tests — including the public redirect, which is the most security
 * sensitive endpoint of the platform.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  activateCampaign,
  clientFor,
  createCampaign,
  createCreator,
  createOrganization,
  createTestHarness,
  registerUser,
  type TestClient,
  type TestHarness,
  type TestUser,
} from './helpers.js';

let harness: TestHarness;
let owner: TestUser;
let client: TestClient;
let otherOwner: TestUser;
let otherClient: TestClient;

let creatorId: string;
let campaignId: string;
let linkId: string;
let linkCode: string;

beforeAll(async () => {
  harness = await createTestHarness();

  owner = await registerUser(harness, 'tracking-owner@example.et', 'Tracking Owner');
  await createOrganization(harness, owner, 'Tracking Brand');
  client = clientFor(harness, owner);

  otherOwner = await registerUser(harness, 'tracking-other@example.et', 'Other Owner');
  await createOrganization(harness, otherOwner, 'Other Tracking Brand');
  otherClient = clientFor(harness, otherOwner);

  creatorId = await createCreator(client, {
    internalCode: 'CR-TEDA',
    displayName: 'Teda Alemu',
  });

  campaignId = await createCampaign(client, {
    name: 'Tracking Campaign',
    destinationUrl: 'https://shop.brand.et/tracking-campaign',
  });

  await client.post(`/api/v1/campaigns/${campaignId}/creators`).send({ creatorId });
  await activateCampaign(client, campaignId);

  const link = await client.post('/api/v1/tracking-links').send({
    campaignId,
    creatorId,
    channel: 'link',
    label: 'Teda IG Story',
  });
  linkId = link.body.data.id as string;
  linkCode = link.body.data.code as string;
});

afterAll(async () => {
  await harness.close();
});

describe('tracking links', () => {
  it('creates a tracking link with a generated code', async () => {
    const response = await client.get(`/api/v1/tracking-links/${linkId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(response.body.data.campaignName).toBe('Tracking Campaign');
    expect(response.body.data.creatorName).toBe('Teda Alemu');
    expect(response.body.data.isActive).toBe(true);
    expect(response.body.data.url).toBe(`http://localhost:3000/r/${linkCode}`);
    expect(response.body.data.qrCodeUrl).toBe(
      `http://localhost:4000/api/v1/tracking-links/${linkId}/qrcode`,
    );
  });

  it('rejects a creator that is not assigned to the campaign with 422', async () => {
    const otherCreatorId = await createCreator(client, {
      internalCode: 'CR-NOTASSIGNED',
      displayName: 'Not Assigned',
    });

    const response = await client.post('/api/v1/tracking-links').send({
      campaignId,
      creatorId: otherCreatorId,
      channel: 'link',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('UNPROCESSABLE_ENTITY');
  });

  it('rejects a campaign of another organization with 404', async () => {
    const response = await otherClient.post('/api/v1/tracking-links').send({
      campaignId,
      creatorId,
      channel: 'link',
    });

    expect(response.status).toBe(404);
  });

  it('lists and filters the tracking links', async () => {
    const response = await client.get(`/api/v1/tracking-links?campaignId=${campaignId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.items[0].id).toBe(linkId);
  });

  it('serves an SVG QR code for the tracking URL', async () => {
    const response = await client.get(`/api/v1/tracking-links/${linkId}/qrcode`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.headers['cache-control']).toBe('public, max-age=300');

    const payload = Buffer.isBuffer(response.body)
      ? response.body.toString('utf8')
      : (response.text ?? JSON.stringify(response.body));
    expect(payload).toContain('<svg');
  });

  it('updates a tracking link', async () => {
    const response = await client
      .patch(`/api/v1/tracking-links/${linkId}`)
      .send({ label: 'Teda IG Reel', destinationUrl: 'https://shop.brand.et/reel' });

    expect(response.status).toBe(200);
    expect(response.body.data.label).toBe('Teda IG Reel');
    expect(response.body.data.destinationUrl).toBe('https://shop.brand.et/reel');
  });

  it('deactivates a tracking link without deleting it', async () => {
    const disposable = await client.post('/api/v1/tracking-links').send({
      campaignId,
      creatorId,
      channel: 'link',
    });
    const disposableId = disposable.body.data.id as string;

    const response = await client.delete(`/api/v1/tracking-links/${disposableId}`);
    expect(response.status).toBe(204);

    const detail = await client.get(`/api/v1/tracking-links/${disposableId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.isActive).toBe(false);
  });
});

describe('coupon codes', () => {
  it('creates a coupon with a generated code', async () => {
    const response = await client.post('/api/v1/coupon-codes').send({
      campaignId,
      creatorId,
      discountType: 'percentage',
      discountPercent: 10,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.code).toMatch(/^[0-9A-Z][0-9A-Z-]{2,31}$/);
    expect(response.body.data.discountType).toBe('percentage');
    expect(response.body.data.discountPercent).toBe('10.00');
    expect(response.body.data.redemptionCount).toBe(0);
    expect(response.body.data.isActive).toBe(true);
  });

  it('upper-cases an explicit coupon code', async () => {
    const response = await client.post('/api/v1/coupon-codes').send({
      campaignId,
      creatorId,
      code: 'teda-20',
      discountType: 'fixed',
      discountValue: '200.00',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.code).toBe('TEDA-20');
    expect(response.body.data.discountValue).toBe('200.00');
  });

  it('rejects a duplicate coupon code with 409', async () => {
    const response = await client.post('/api/v1/coupon-codes').send({
      campaignId,
      creatorId,
      code: 'TEDA-20',
      discountType: 'fixed',
      discountValue: '200.00',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects a coupon for a creator that is not assigned to the campaign', async () => {
    const otherCreatorId = await createCreator(client, {
      internalCode: 'CR-COUPON-NA',
      displayName: 'Coupon Not Assigned',
    });

    const response = await client.post('/api/v1/coupon-codes').send({
      campaignId,
      creatorId: otherCreatorId,
      discountType: 'percentage',
      discountPercent: 5,
    });

    expect(response.status).toBe(422);
  });

  it('lists, updates and deactivates coupons', async () => {
    const list = await client.get('/api/v1/coupon-codes');
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(2);

    const couponId = list.body.data.items[0].id as string;

    const updated = await client.patch(`/api/v1/coupon-codes/${couponId}`).send({
      maxRedemptions: 500,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.maxRedemptions).toBe(500);

    const removed = await client.delete(`/api/v1/coupon-codes/${couponId}`);
    expect(removed.status).toBe(204);

    const after = await client.get('/api/v1/coupon-codes');
    const deactivated = after.body.data.items.find(
      (entry: { id: string }) => entry.id === couponId,
    );
    expect(deactivated.isActive).toBe(false);
  });
});

describe('the public redirect', () => {
  it('redirects to the destination stored with the link', async () => {
    const response = await harness.request
      .get(`/r/${linkCode}`)
      .set('User-Agent', 'SalesTrace-Redirect-Test/1.0');

    expect(response.status).toBe(302);
    expect(response.headers['location']).toBeDefined();
    expect(response.headers['location']).toContain('https://shop.brand.et/reel');
  });

  it('records a click event', async () => {
    const before = await harness.container.db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM tracking_events WHERE tracking_link_id = $1',
      [linkId],
    );

    await harness.request
      .get(`/r/${linkCode}`)
      .set('User-Agent', 'SalesTrace-Event-Test/1.0');

    const after = await harness.container.db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM tracking_events WHERE tracking_link_id = $1',
      [linkId],
    );

    expect(after.rows[0]!.count).toBe(before.rows[0]!.count + 1);
  });

  it('never stores the raw IP address', async () => {
    const rows = await harness.container.db.query<{ ip_hash: string | null; user_agent: string | null }>(
      'SELECT ip_hash, user_agent FROM tracking_events WHERE tracking_link_id = $1 LIMIT 1',
      [linkId],
    );

    expect(rows.rows[0]!.ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sets a first-party visitor cookie', async () => {
    const response = await harness.request
      .get(`/r/${linkCode}`)
      .set('User-Agent', 'SalesTrace-Cookie-Test/1.0');

    const setCookie = response.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '');
    expect(raw).toContain('st_vid=');
    expect(raw).toContain('Max-Age=31536000');
    expect(raw).toContain('SameSite=Lax');
    expect(raw).toContain('Path=/');
  });

  it('ignores a query parameter that tries to change the destination', async () => {
    const response = await harness.request
      .get(`/r/${linkCode}?url=https://evil.example/steal&redirect=https://evil.example`)
      .set('User-Agent', 'SalesTrace-Open-Redirect-Test/1.0');

    expect(response.status).toBe(302);
    const location = response.headers['location'] as string;
    expect(location).not.toContain('evil.example');
    expect(location).toContain('https://shop.brand.et/reel');
  });

  it('answers 404 for an unknown code', async () => {
    const response = await harness.request.get('/r/ZZZZZZZZZZ');

    expect(response.status).toBe(404);
    expect(response.text).not.toContain('campaign');
  });

  it('answers 404 for an inactive link', async () => {
    const inactive = await client.post('/api/v1/tracking-links').send({
      campaignId,
      creatorId,
      channel: 'link',
    });
    const inactiveId = inactive.body.data.id as string;
    const inactiveCode = inactive.body.data.code as string;

    await client.delete(`/api/v1/tracking-links/${inactiveId}`);

    const response = await harness.request.get(`/r/${inactiveCode}`);
    expect(response.status).toBe(404);
  });

  it('answers 404 when the campaign is not active', async () => {
    const draftCampaignId = await createCampaign(client, { name: 'Draft Tracking Campaign' });
    await client.post(`/api/v1/campaigns/${draftCampaignId}/creators`).send({ creatorId });

    const link = await client.post('/api/v1/tracking-links').send({
      campaignId: draftCampaignId,
      creatorId,
      channel: 'link',
    });
    const code = link.body.data.code as string;

    const response = await harness.request.get(`/r/${code}`);
    expect(response.status).toBe(404);
  });

  it('folds a repeat hit inside the de-duplication window into the same event', async () => {
    const link = await client.post('/api/v1/tracking-links').send({
      campaignId,
      creatorId,
      channel: 'link',
    });
    const dedupeLinkId = link.body.data.id as string;
    const dedupeCode = link.body.data.code as string;

    const userAgent = 'SalesTrace-Dedupe-Test/1.0';

    const first = await harness.request.get(`/r/${dedupeCode}`).set('User-Agent', userAgent);
    expect(first.status).toBe(302);

    const afterFirst = await harness.container.db.query<{ count: number; repeat: number }>(
      'SELECT count(*)::int AS count, coalesce(max(repeat_count), 0) AS repeat FROM tracking_events WHERE tracking_link_id = $1',
      [dedupeLinkId],
    );
    expect(afterFirst.rows[0]!.count).toBe(1);
    expect(afterFirst.rows[0]!.repeat).toBe(1);

    const second = await harness.request.get(`/r/${dedupeCode}`).set('User-Agent', userAgent);
    expect(second.status).toBe(302);

    const afterSecond = await harness.container.db.query<{ count: number; repeat: number }>(
      'SELECT count(*)::int AS count, coalesce(max(repeat_count), 0) AS repeat FROM tracking_events WHERE tracking_link_id = $1',
      [dedupeLinkId],
    );

    // No second row: the repeat count was incremented instead.
    expect(afterSecond.rows[0]!.count).toBe(1);
    expect(afterSecond.rows[0]!.repeat).toBe(2);
  });
});

describe('tracking events', () => {
  it('lists the click events of the organization', async () => {
    const response = await client.get(`/api/v1/tracking-events?campaignId=${campaignId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBeGreaterThan(0);

    const event = response.body.data.items[0];
    expect(event.campaignId).toBe(campaignId);
    expect(event.creatorId).toBe(creatorId);
    expect(event.trackingLinkId).toBeTruthy();
    expect(event.repeatCount).toBeGreaterThanOrEqual(1);
  });

  it('does not expose the events of another organization', async () => {
    const response = await otherClient.get('/api/v1/tracking-events');

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(0);
  });
});

describe('audit trail', () => {
  it('records the tracking asset events', async () => {
    const rows = await harness.container.db.query<{ action: string }>(
      `SELECT action FROM audit_events
       WHERE entity_type IN ('tracking_link', 'coupon_code')
       ORDER BY created_at ASC`,
    );

    const actions = rows.rows.map((row) => row.action);
    expect(actions).toContain('tracking_link.created');
    expect(actions).toContain('tracking_link.updated');
    expect(actions).toContain('tracking_link.deactivated');
    expect(actions).toContain('coupon.created');
  });
});
