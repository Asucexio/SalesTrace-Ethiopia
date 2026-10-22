/**
 * Creator integration tests.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
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

beforeAll(async () => {
  harness = await createTestHarness();

  owner = await registerUser(harness, 'creator-owner@example.et', 'Creator Owner');
  await createOrganization(harness, owner, 'Creator Brand');
  client = clientFor(harness, owner);

  otherOwner = await registerUser(harness, 'creator-other@example.et', 'Other Owner');
  await createOrganization(harness, otherOwner, 'Other Creator Brand');
  otherClient = clientFor(harness, otherOwner);

  creatorId = await createCreator(client, {
    internalCode: 'CR-ALMA',
    displayName: 'Alma Tadesse',
    platform: 'tiktok',
    niche: 'fashion',
  });

  campaignId = await createCampaign(client, { name: 'Creator Campaign' });
  await client.post(`/api/v1/campaigns/${campaignId}/creators`).send({ creatorId });
});

afterAll(async () => {
  await harness.close();
});

describe('creator CRUD', () => {
  it('creates a creator', async () => {
    const response = await client.get(`/api/v1/creators/${creatorId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.internalCode).toBe('CR-ALMA');
    expect(response.body.data.displayName).toBe('Alma Tadesse');
    expect(response.body.data.status).toBe('active');
    expect(response.body.data.campaignCount).toBe(1);
    expect(response.body.data.socialAccounts).toEqual([]);
  });

  it('rejects a duplicate internal code with 409', async () => {
    const response = await client.post('/api/v1/creators').send({
      internalCode: 'CR-ALMA',
      displayName: 'Alma Again',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('allows the same internal code in another organization', async () => {
    const response = await otherClient.post('/api/v1/creators').send({
      internalCode: 'CR-ALMA',
      displayName: 'Alma Elsewhere',
    });

    expect(response.status).toBe(201);
  });

  it('lists creators with the campaign count and the social accounts', async () => {
    await client.post(`/api/v1/creators/${creatorId}/social-accounts`).send({
      platform: 'instagram',
      handle: 'alma',
    });

    const response = await client.get('/api/v1/creators');

    expect(response.status).toBe(200);
    const item = response.body.data.items.find((entry: { id: string }) => entry.id === creatorId);
    expect(item.campaignCount).toBe(1);
    expect(item.socialAccounts).toHaveLength(1);
    expect(item.socialAccounts[0].handle).toBe('alma');
  });

  it('filters the creator list', async () => {
    const response = await client.get('/api/v1/creators?platform=tiktok&search=Alma');

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);
  });

  it('updates a creator', async () => {
    const response = await client
      .patch(`/api/v1/creators/${creatorId}`)
      .send({ displayName: 'Alma T.', niche: 'fashion and lifestyle' });

    expect(response.status).toBe(200);
    expect(response.body.data.displayName).toBe('Alma T.');
    expect(response.body.data.niche).toBe('fashion and lifestyle');
  });
});

describe('tenant isolation', () => {
  it('does not expose a creator of another organization', async () => {
    const response = await otherClient.get(`/api/v1/creators/${creatorId}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('does not list the creators of another organization', async () => {
    const response = await otherClient.get('/api/v1/creators');

    expect(response.status).toBe(200);
    const ids = (response.body.data.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).not.toContain(creatorId);
  });
});

describe('social accounts', () => {
  let accountCreatorId: string;

  beforeAll(async () => {
    accountCreatorId = await createCreator(client, {
      internalCode: 'CR-SOCIAL',
      displayName: 'Social Creator',
    });
  });

  it('marks a manually entered account as unverified', async () => {
    const response = await client.post(`/api/v1/creators/${accountCreatorId}/social-accounts`).send({
      platform: 'instagram',
      handle: 'social.creator',
      url: 'https://instagram.com/social.creator',
      isPrimary: true,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.verified).toBe(false);
    expect(response.body.data.isPrimary).toBe(true);
    expect(response.body.data.url).toBe('https://instagram.com/social.creator');
  });

  it('lists the social accounts of a creator', async () => {
    const response = await client.get(`/api/v1/creators/${accountCreatorId}/social-accounts`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it('removes a social account', async () => {
    const list = await client.get(`/api/v1/creators/${accountCreatorId}/social-accounts`);
    const accountId = list.body.data[0].id as string;

    const removed = await client.delete(
      `/api/v1/creators/${accountCreatorId}/social-accounts/${accountId}`,
    );
    expect(removed.status).toBe(204);

    const after = await client.get(`/api/v1/creators/${accountCreatorId}/social-accounts`);
    expect(after.body.data).toHaveLength(0);
  });
});

describe('deactivation', () => {
  it('deactivates a creator without destroying its history', async () => {
    const softCreatorId = await createCreator(client, {
      internalCode: 'CR-SOFT',
      displayName: 'Soft Delete Creator',
    });
    const softCampaignId = await createCampaign(client, { name: 'Soft Delete Campaign' });
    await client.post(`/api/v1/campaigns/${softCampaignId}/creators`).send({
      creatorId: softCreatorId,
    });

    const response = await client.delete(`/api/v1/creators/${softCreatorId}`);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('inactive');

    // The creator is still there and the assignment survived.
    const detail = await client.get(`/api/v1/creators/${softCreatorId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('inactive');
    expect(detail.body.data.campaignCount).toBe(1);
  });
});

describe('creator performance', () => {
  it('reports the creator metrics with null zero-denominator values', async () => {
    const response = await client.get(`/api/v1/creators/${creatorId}/performance`);

    expect(response.status).toBe(200);
    expect(response.body.data.creatorId).toBe(creatorId);
    expect(response.body.data.creatorInternalCode).toBe('CR-ALMA');
    expect(response.body.data.campaignCount).toBe(1);
    expect(response.body.data.totalClicks).toBe(0);
    expect(response.body.data.eligibleClicks).toBe(0);
    expect(response.body.data.conversionRate).toBeNull();
    expect(response.body.data.roas).toBeNull();
    expect(response.body.data.costPerAttributedOrder).toBeNull();
    expect(response.body.data.netAttributedRevenue).toBe('0.00');
    expect(response.body.data.creatorCost).toBe('0.00');
    expect(response.body.data.revenuePerCreator).toBe('0.00');
  });

  it('includes a performance summary in the creator detail', async () => {
    const response = await client.get(`/api/v1/creators/${creatorId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.performance).toBeDefined();
    expect(response.body.data.performance.creatorId).toBe(creatorId);
  });
});

describe('audit trail', () => {
  it('records the creator events', async () => {
    const rows = await harness.container.db.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE entity_type = 'creator' ORDER BY created_at ASC`,
    );

    const actions = rows.rows.map((row) => row.action);
    expect(actions).toContain('creator.created');
    expect(actions).toContain('creator.updated');
    expect(actions).toContain('creator.deactivated');
  });
});
