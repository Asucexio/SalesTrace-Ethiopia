/**
 * Campaign integration tests.
 *
 * They exercise the HTTP surface end to end: the real SQL, the real Row Level Security policies
 * and the real middleware chain.
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

let campaignId: string;
let creatorId: string;

beforeAll(async () => {
  harness = await createTestHarness();

  owner = await registerUser(harness, 'campaign-owner@example.et', 'Campaign Owner');
  await createOrganization(harness, owner, 'Campaign Brand');
  client = clientFor(harness, owner);

  otherOwner = await registerUser(harness, 'other-owner@example.et', 'Other Owner');
  await createOrganization(harness, otherOwner, 'Other Brand');
  otherClient = clientFor(harness, otherOwner);

  campaignId = await createCampaign(client, {
    name: 'Summer 2026 Launch',
    budget: '250000.00',
  });

  creatorId = await createCreator(client, {
    internalCode: 'CR-MIRA',
    displayName: 'Mira Bekele',
  });
});

afterAll(async () => {
  await harness.close();
});

describe('campaign CRUD', () => {
  it('creates a campaign in the draft state with the organisation currency', async () => {
    const response = await client.get(`/api/v1/campaigns/${campaignId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Summer 2026 Launch');
    expect(response.body.data.status).toBe('draft');
    expect(response.body.data.currency).toBe('ETB');
    expect(response.body.data.budget).toBe('250000.00');
    expect(response.body.data.attributionWindowDays).toBe(7);
    expect(response.body.data.creatorCount).toBe(0);
    expect(response.body.data.costTotal).toBeNull();
  });

  it('lists campaigns with the creator count and the cost total', async () => {
    await client.post(`/api/v1/campaigns/${campaignId}/creators`).send({ creatorId });
    await client.post(`/api/v1/campaigns/${campaignId}/costs`).send({
      costType: 'creator_fee',
      amount: '1500.00',
    });

    const response = await client.get('/api/v1/campaigns');

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);

    const item = response.body.data.items.find(
      (entry: { id: string }) => entry.id === campaignId,
    );
    expect(item.creatorCount).toBe(1);
    expect(item.costTotal).toBe('1500.00');
  });

  it('updates a campaign', async () => {
    const response = await client.patch(`/api/v1/campaigns/${campaignId}`).send({
      name: 'Summer 2026 Launch (updated)',
      destinationUrl: 'https://shop.brand.et/summer-2026',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Summer 2026 Launch (updated)');
    expect(response.body.data.destinationUrl).toBe('https://shop.brand.et/summer-2026');
  });

  it('rejects a non-https destination', async () => {
    const response = await client.patch(`/api/v1/campaigns/${campaignId}`).send({
      destinationUrl: 'http://shop.brand.et/insecure',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a currency that differs from the organisation currency', async () => {
    const response = await client.post('/api/v1/campaigns').send({
      name: 'Dollar Campaign',
      startAt: '2026-03-01T00:00:00.000Z',
      destinationUrl: 'https://shop.brand.et/x',
      currency: 'USD',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('UNPROCESSABLE_ENTITY');
  });

  it('validates a currency change like a creation', async () => {
    const rejected = await client.patch(`/api/v1/campaigns/${campaignId}`).send({ currency: 'USD' });
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.code).toBe('UNPROCESSABLE_ENTITY');

    const accepted = await client.patch(`/api/v1/campaigns/${campaignId}`).send({ currency: 'ETB' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.currency).toBe('ETB');
  });

  it('rejects an end date before the start date', async () => {
    const response = await client.post('/api/v1/campaigns').send({
      name: 'Backwards Campaign',
      startAt: '2026-04-01T00:00:00.000Z',
      endAt: '2026-03-01T00:00:00.000Z',
      destinationUrl: 'https://shop.brand.et/x',
    });

    expect(response.status).toBe(422);
  });
});

describe('tenant isolation', () => {
  it('does not expose another organization’s campaign', async () => {
    const response = await otherClient.get(`/api/v1/campaigns/${campaignId}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('does not list another organization’s campaigns', async () => {
    const response = await otherClient.get('/api/v1/campaigns');

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(0);
  });

  it('does not let another organization assign a creator to the campaign', async () => {
    const response = await otherClient
      .post(`/api/v1/campaigns/${campaignId}/creators`)
      .send({ creatorId });

    expect(response.status).toBe(404);
  });
});

describe('campaign status', () => {
  it('accepts a legal transition', async () => {
    const response = await client
      .post(`/api/v1/campaigns/${campaignId}/status`)
      .send({ status: 'active' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('active');
  });

  it('rejects an illegal transition with INVALID_STATUS_TRANSITION', async () => {
    // `active` may become paused, completed or archived — never `draft`.
    const response = await client
      .post(`/api/v1/campaigns/${campaignId}/status`)
      .send({ status: 'draft' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('archives a campaign', async () => {
    const response = await client.post(`/api/v1/campaigns/${campaignId}/archive`).send({});

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('archived');
    expect(response.body.data.archivedAt).toBeTruthy();
  });

  it('refuses to leave the terminal archived state', async () => {
    const response = await client
      .post(`/api/v1/campaigns/${campaignId}/status`)
      .send({ status: 'active' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('creator assignments', () => {
  let assignmentCampaignId: string;

  beforeAll(async () => {
    assignmentCampaignId = await createCampaign(client, { name: 'Assignment Campaign' });
  });

  it('assigns a creator to a campaign', async () => {
    const response = await client
      .post(`/api/v1/campaigns/${assignmentCampaignId}/creators`)
      .send({ creatorId, agreedFee: '2500.00', assignedAt: '2026-02-01T00:00:00.000Z' });

    expect(response.status).toBe(201);
    expect(response.body.data.creatorId).toBe(creatorId);
    expect(response.body.data.creatorName).toBe('Mira Bekele');
    expect(response.body.data.agreedFee).toBe('2500.00');
    expect(response.body.data.currency).toBe('ETB');
    // The assignment may be back-dated: it is the lower bound for click eligibility.
    expect(response.body.data.assignedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('rejects a duplicate assignment with 409', async () => {
    const response = await client
      .post(`/api/v1/campaigns/${assignmentCampaignId}/creators`)
      .send({ creatorId });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects a creator from another organization with 404', async () => {
    const foreignCreatorId = await createCreator(otherClient, {
      internalCode: 'CR-FOREIGN',
      displayName: 'Foreign Creator',
    });

    const response = await client
      .post(`/api/v1/campaigns/${assignmentCampaignId}/creators`)
      .send({ creatorId: foreignCreatorId });

    expect(response.status).toBe(404);
  });

  it('updates an assignment', async () => {
    const response = await client
      .patch(`/api/v1/campaigns/${assignmentCampaignId}/creators/${creatorId}`)
      .send({ agreedFee: '3000.00', notes: 'Negotiated after the shoot' });

    expect(response.status).toBe(200);
    expect(response.body.data.agreedFee).toBe('3000.00');
    expect(response.body.data.notes).toBe('Negotiated after the shoot');
  });

  it('lists the assignments of a campaign', async () => {
    const response = await client.get(`/api/v1/campaigns/${assignmentCampaignId}/creators`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].creatorInternalCode).toBe('CR-MIRA');
  });

  it('removes an assignment without deleting the creator', async () => {
    const response = await client.delete(
      `/api/v1/campaigns/${assignmentCampaignId}/creators/${creatorId}`,
    );
    expect(response.status).toBe(204);

    const assignments = await client.get(`/api/v1/campaigns/${assignmentCampaignId}/creators`);
    expect(assignments.body.data).toHaveLength(0);

    const creator = await client.get(`/api/v1/creators/${creatorId}`);
    expect(creator.status).toBe(200);
  });
});

describe('campaign costs', () => {
  let costCampaignId: string;

  beforeAll(async () => {
    costCampaignId = await createCampaign(client, { name: 'Cost Campaign' });
  });

  it('records a cost', async () => {
    const response = await client.post(`/api/v1/campaigns/${costCampaignId}/costs`).send({
      costType: 'content_production',
      description: 'Video shoot',
      amount: '12000.50',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.amount).toBe('12000.50');
    expect(response.body.data.currency).toBe('ETB');
    expect(response.body.data.costType).toBe('content_production');
  });

  it('rejects a cost in another currency with 422', async () => {
    const response = await client.post(`/api/v1/campaigns/${costCampaignId}/costs`).send({
      costType: 'content_production',
      amount: '100.00',
      currency: 'USD',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('UNPROCESSABLE_ENTITY');
  });

  it('lists and deletes a cost', async () => {
    const list = await client.get(`/api/v1/campaigns/${costCampaignId}/costs`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const costId = list.body.data[0].id as string;

    const removed = await client.delete(`/api/v1/campaigns/${costCampaignId}/costs/${costId}`);
    expect(removed.status).toBe(204);

    const after = await client.get(`/api/v1/campaigns/${costCampaignId}/costs`);
    expect(after.body.data).toHaveLength(0);
  });
});

describe('campaign performance', () => {
  it('reports zero-denominator metrics as null instead of NaN', async () => {
    const response = await client.get(`/api/v1/campaigns/${campaignId}/performance`);

    expect(response.status).toBe(200);
    expect(response.body.data.campaignId).toBe(campaignId);
    expect(response.body.data.totalClicks).toBe(0);
    expect(response.body.data.eligibleClicks).toBe(0);
    expect(response.body.data.attributedOrders).toBe(0);
    expect(response.body.data.conversionRate).toBeNull();
    // The campaign recorded a cost, so the return on that cost is zero — not `null`.
    expect(response.body.data.roas).toBe(0);
    // No attributed valid order: the quotient has no denominator.
    expect(response.body.data.costPerAttributedOrder).toBeNull();
    expect(response.body.data.netAttributedRevenue).toBe('0.00');
    expect(response.body.data.campaignCost).toBe('1500.00');
  });

  it('reports a null ROAS for a campaign without recorded cost', async () => {
    const bare = await createCampaign(client, { name: 'Zero Cost Campaign' });

    const response = await client.get(`/api/v1/campaigns/${bare}/performance`);

    expect(response.status).toBe(200);
    expect(response.body.data.campaignCost).toBe('0.00');
    expect(response.body.data.roas).toBeNull();
    expect(response.body.data.conversionRate).toBeNull();
    expect(response.body.data.costPerAttributedOrder).toBeNull();
  });
});

describe('audit trail', () => {
  it('records the campaign events', async () => {
    const rows = await harness.container.db.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE entity_id = $1 ORDER BY created_at ASC`,
      [campaignId],
    );

    const actions = rows.rows.map((row) => row.action);
    expect(actions).toContain('campaign.created');
    expect(actions).toContain('campaign.updated');
    expect(actions).toContain('campaign.status_changed');
    expect(actions).toContain('campaign.archived');
  });
});

describe('status of a fresh campaign', () => {
  it('can be activated so that its tracking links resolve', async () => {
    const fresh = await createCampaign(client, { name: 'Activatable Campaign' });
    await activateCampaign(client, fresh);

    const response = await client.get(`/api/v1/campaigns/${fresh}`);
    expect(response.body.data.status).toBe('active');
  });
});
