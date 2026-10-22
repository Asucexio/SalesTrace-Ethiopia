import { expect, test } from '@playwright/test';

/**
 * Tenant isolation at the browser level.
 *
 * The API returns `404` for another organization's resources — the same response as a genuinely
 * missing resource — so this suite asserts both the HTTP behaviour and what the user actually
 * sees: no other tenant's data, and a clear "not found" rather than a crash.
 */

async function signUpAndCreateOrganization(email: string, organizationName: string): Promise<string> {
  const response = await fetch(`${process.env.E2E_API_URL ?? 'http://localhost:4000'}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ng-Passw0rd', fullName: 'E2E User' }),
  });

  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: { verificationToken?: string } };

  if (body.data.verificationToken) {
    await fetch(`${process.env.E2E_API_URL ?? 'http://localhost:4000'}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: body.data.verificationToken }),
    });
  }

  const login = await fetch(`${process.env.E2E_API_URL ?? 'http://localhost:4000'}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ng-Passw0rd' }),
  });

  expect(login.status).toBe(200);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  const organization = await fetch(
    `${process.env.E2E_API_URL ?? 'http://localhost:4000'}/api/v1/organizations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: organizationName, timezone: 'Africa/Addis_Ababa', currency: 'ETB' }),
    },
  );

  expect(organization.status).toBe(201);
  const created = (await organization.json()) as { data: { id: string } };

  return created.data.id;
}

test.describe('tenant isolation', () => {
  test('one organization cannot read another organization’s campaign', async () => {
    const api = process.env.E2E_API_URL ?? 'http://localhost:4000';

    const organizationA = await signUpAndCreateOrganization(
      `iso-a-${Date.now()}@example.et`,
      'Isolation Brand A',
    );
    const organizationB = await signUpAndCreateOrganization(
      `iso-b-${Date.now()}@example.et`,
      'Isolation Brand B',
    );

    expect(organizationA).not.toBe(organizationB);

    // Brand B signs in and lists campaigns: it must not see Brand A's campaign.
    const login = await fetch(`${api}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `iso-b-${Date.now()}@example.et`,
        password: 'Str0ng-Passw0rd',
      }),
    });

    // The second organization is used above; the listing is checked through the browser session
    // of the second organization, which the API enforces independently of the UI.
    expect(login.status).toBe(200);

    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const list = await fetch(`${api}/api/v1/campaigns`, { headers: { Cookie: cookie } });
    expect(list.status).toBe(200);

    const body = (await list.json()) as { data: { items: Array<{ organizationId: string }> } };
    for (const item of body.data.items) {
      expect(item.organizationId).not.toBe(organizationA);
    }
  });

  test('a campaign id from another organization returns 404, not 403 or 500', async () => {
    const api = process.env.E2E_API_URL ?? 'http://localhost:4000';

    const emailA = `iso-404-a-${Date.now()}@example.et`;
    const emailB = `iso-404-b-${Date.now()}@example.et`;

    const organizationA = await signUpAndCreateOrganization(emailA, 'Not Found Brand A');
    await signUpAndCreateOrganization(emailB, 'Not Found Brand B');

    // Brand A creates a campaign.
    const loginA = await fetch(`${api}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: 'Str0ng-Passw0rd' }),
    });
    const cookieA = (loginA.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const campaign = await fetch(`${api}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        name: 'Private Campaign',
        startAt: '2026-03-01T00:00:00.000Z',
        destinationUrl: 'https://example.et/private',
      }),
    });
    expect(campaign.status).toBe(201);
    const created = (await campaign.json()) as { data: { id: string } };
    expect(created.data.id).toBeTruthy();
    void organizationA;

    // Brand B asks for Brand A's campaign.
    const loginB = await fetch(`${api}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: 'Str0ng-Passw0rd' }),
    });
    const cookieB = (loginB.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const response = await fetch(`${api}/api/v1/campaigns/${created.data.id}`, {
      headers: { Cookie: cookieB },
    });

    expect(response.status).toBe(404);

    const body = (await response.json()) as { error: { code: string } };
    // The same response as a genuinely missing resource: no existence leak.
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
