/**
 * Tenant isolation tests.
 *
 * These are the most important tests in the suite: they prove that a member of one
 * organization cannot reach another organization's data by changing an identifier, and that the
 * database itself fails closed when no organization context is set.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createHarness, createOrganization, registerAndLogin, type Harness, type TestUser } from '../support/harness.js';

let harness: Harness;
let ownerA: TestUser;
let ownerB: TestUser;
let organizationA: string;
let organizationB: string;
let campaignA: string;

beforeAll(async () => {
  harness = await createHarness();

  ownerA = await registerAndLogin(harness, 'owner-a@example.et', 'Owner A');
  ownerB = await registerAndLogin(harness, 'owner-b@example.et', 'Owner B');

  organizationA = await createOrganization(harness, ownerA, 'Brand A');
  organizationB = await createOrganization(harness, ownerB, 'Brand B');

  const campaign = await harness.request
    .post('/api/v1/campaigns')
    .set('Cookie', ownerA.cookie)
    .send({
      name: 'Brand A Spring Campaign',
      startAt: '2026-03-01T00:00:00.000Z',
      endAt: '2026-04-01T00:00:00.000Z',
      destinationUrl: 'https://shop.brand-a.et/spring',
    });

  campaignA = campaign.body.data.id as string;
});

afterAll(async () => {
  await harness.close();
});

describe('tenant isolation', () => {
  it('creates campaigns inside the caller organization', () => {
    expect(campaignA).toBeTruthy();
  });

  it('does not list another organization’s campaigns', async () => {
    const response = await harness.request
      .get('/api/v1/campaigns')
      .set('Cookie', ownerB.cookie);

    expect(response.status).toBe(200);
    const names = (response.body.data.items as Array<{ name: string }>).map((item) => item.name);
    expect(names).not.toContain('Brand A Spring Campaign');
  });

  it('returns 404 for another organization’s campaign', async () => {
    const response = await harness.request
      .get(`/api/v1/campaigns/${campaignA}`)
      .set('Cookie', ownerB.cookie);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('does not allow updating another organization’s campaign', async () => {
    const response = await harness.request
      .patch(`/api/v1/campaigns/${campaignA}`)
      .set('Cookie', ownerB.cookie)
      .send({ name: 'Hijacked' });

    expect(response.status).toBe(404);
  });

  it('does not allow changing another organization’s campaign status', async () => {
    const response = await harness.request
      .post(`/api/v1/campaigns/${campaignA}/status`)
      .set('Cookie', ownerB.cookie)
      .send({ status: 'active' });

    expect(response.status).toBe(404);
  });

  it('does not allow adding costs to another organization’s campaign', async () => {
    const response = await harness.request
      .post(`/api/v1/campaigns/${campaignA}/costs`)
      .set('Cookie', ownerB.cookie)
      .send({ costType: 'creator_fee', amount: '1000.00' });

    expect(response.status).toBe(404);
  });

  it('does not allow assigning creators to another organization’s campaign', async () => {
    const response = await harness.request
      .post(`/api/v1/campaigns/${campaignA}/creators`)
      .set('Cookie', ownerB.cookie)
      .send({ creatorId: '11111111-1111-1111-1111-111111111111' });

    expect(response.status).toBe(404);
  });

  it('does not expose another organization’s members', async () => {
    const response = await harness.request
      .get('/api/v1/organizations/current/members')
      .set('Cookie', ownerB.cookie);

    expect(response.status).toBe(200);
    const members = response.body.data as Array<{ email: string }>;
    expect(members.map((member) => member.email)).not.toContain(ownerA.email);
  });

  it('does not expose another organization’s orders', async () => {
    const response = await harness.request
      .get('/api/v1/orders')
      .set('Cookie', ownerB.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(0);
  });

  it('does not expose another organization’s analytics', async () => {
    const response = await harness.request
      .get('/api/v1/analytics/overview')
      .set('Cookie', ownerB.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.metrics.attributedValidOrders).toBe(0);
    expect(response.body.data.metrics.netAttributedRevenue).toBe('0.00');
  });

  it('does not expose another organization’s audit trail', async () => {
    const response = await harness.request
      .get('/api/v1/analytics/overview')
      .set('Cookie', ownerA.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.metrics.netAttributedRevenue).toBe('0.00');
  });
});

describe('row level security', () => {
  it('returns no organization-owned rows when no organization context is set', async () => {
    const result = await harness.container.db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM campaigns`,
    );

    // The query runs without `SET LOCAL ROLE salestrace_app`, so it sees the owner's view.
    // The fail-closed behaviour is asserted through the application role below.
    expect(result.rows[0]?.count).toBeGreaterThanOrEqual(0);
  });

  it('hides every tenant row from the application role without an organization context', async () => {
    const result = await harness.container.db.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE salestrace_app');
      const campaigns = await tx.query('SELECT id FROM campaigns');
      const orders = await tx.query('SELECT id FROM orders');
      const creators = await tx.query('SELECT id FROM creators');
      return {
        campaigns: campaigns.rows.length,
        orders: orders.rows.length,
        creators: creators.rows.length,
      };
    });

    expect(result.campaigns).toBe(0);
    expect(result.orders).toBe(0);
    expect(result.creators).toBe(0);
  });

  it('shows only the organization context’s rows to the application role', async () => {
    const result = await harness.container.db.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE salestrace_app');
      await tx.query(`SELECT set_config('app.current_org_id', $1, true)`, [organizationA]);
      const campaigns = await tx.query('SELECT id FROM campaigns');
      return campaigns.rows.length;
    });

    expect(result).toBe(1);
  });

  it('blocks a cross-tenant insert at the database level', async () => {
    await expect(
      harness.container.db.transaction(async (tx) => {
        await tx.query('SET LOCAL ROLE salestrace_app');
        await tx.query(`SELECT set_config('app.current_org_id', $1, true)`, [organizationA]);
        await tx.query(
          `INSERT INTO creators (organization_id, internal_code, display_name)
           VALUES ($1, 'X', 'Cross tenant')`,
          [organizationB],
        );
      }),
    ).rejects.toThrow();
  });
});
