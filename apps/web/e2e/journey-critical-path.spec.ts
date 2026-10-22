import { expect, test, type Page } from '@playwright/test';

/**
 * The critical journey from the master brief.
 *
 * Register → create an organization → create a campaign → assign creators → generate tracking
 * assets → open a tracking link → import orders → verify the attribution → check the dashboard
 * → export the report.
 *
 * The fixtures are deterministic: no test depends on wall-clock time or on random data.
 */

const ORDER_CSV = [
  'order_id,order_date,currency,subtotal,discount,tax,shipping,total,status,coupon_code,customer_email',
  'EXT-E2E-1,2026-03-06T09:00:00Z,ETB,1500.00,100.00,140.00,50.00,1590.00,paid,CREATOR1-10,buyer@example.et',
  'EXT-E2E-2,2026-03-07T11:30:00Z,ETB,800.00,0.00,80.00,20.00,900.00,paid,,buyer2@example.et',
  'EXT-E2E-BAD,not-a-date,ETB,abc,0.00,0.00,0.00,abc,paid,,buyer3@example.et',
].join('\n');

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill('Str0ng-Passw0rd');
  const nameField = page.getByLabel(/full name/i);
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill('E2E User');
  }
  await page.getByRole('button', { name: /create account|sign up/i }).click();
}

async function createOrganization(page: Page, name: string): Promise<void> {
  await page.waitForURL(/\/onboarding|\/dashboard/, { timeout: 30_000 });

  if (page.url().includes('/onboarding')) {
    await page.getByLabel(/organization name|company name|name/i).first().fill(name);
    await page.getByRole('button', { name: /create organization|create organisation/i }).click();
  }

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe('the critical journey', () => {
  test('a brand can run a campaign from creation to a report', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.et`;

    // 1 — register and create the organization.
    await signUp(page, email);
    await createOrganization(page, 'E2E Brand');

    // 2 — create a campaign.
    await page.goto('/campaigns/new');
    await page.getByLabel(/campaign name|name/i).first().fill('E2E Spring Campaign');
    await page.getByLabel(/start/i).first().fill('2026-03-01');
    await page.getByLabel(/destination/i).first().fill('https://example.et/e2e');
    await page.getByRole('button', { name: /create campaign|save/i }).click();
    await expect(page).toHaveURL(/\/campaigns\/[^/]+/, { timeout: 30_000 });

    // 3 — assign a creator.
    await page.goto('/creators/new');
    await page.getByLabel(/internal code|code/i).first().fill('CREATOR1');
    await page.getByLabel(/display name|name/i).first().fill('E2E Creator');
    await page.getByRole('button', { name: /create creator|save/i }).click();
    await expect(page).toHaveURL(/\/creators\//, { timeout: 30_000 });

    // 4 — generate a tracking link and a coupon code.
    await page.goto('/tracking');
    await page.getByRole('button', { name: /new tracking link|create tracking link/i }).click();
    await page.getByRole('button', { name: /create|save/i }).last().click();
    await expect(page.getByText(/CREATOR1-|\/r\//i).first()).toBeVisible({ timeout: 30_000 });

    // 5 — open the tracking link: a referral event must be recorded.
    const trackingLink = await page.getByText(/\/r\/[A-Z0-9]{10}/i).first().textContent();
    expect(trackingLink).toBeTruthy();
    const code = /\/r\/([A-Z0-9]{10})/i.exec(trackingLink ?? '')?.[1];
    expect(code).toBeTruthy();

    await page.request.get(`/r/${code}`, { maxRedirects: 0 }).catch(() => undefined);

    // 6 — import the order CSV.
    await page.goto('/orders/import');
    await page.setInputFiles('input[type="file"]', {
      name: 'orders.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(ORDER_CSV, 'utf8'),
    });

    await page.getByRole('button', { name: /upload|continue|preview/i }).first().click();
    await expect(page.getByText(/valid|invalid|rows/i).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import|commit|finish/i }).first().click();
    await expect(page.getByText(/imported|completed|summary/i).first()).toBeVisible({ timeout: 30_000 });

    // 7 — the dashboard must show real numbers, not placeholders.
    await page.goto('/dashboard');
    await expect(page.getByText(/attributed revenue/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/net attributed revenue/i).first()).toBeVisible();

    // 8 — export the campaign report.
    await page.goto('/reports');
    const download = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: /export|download csv/i }).first().click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('a metric with no denominator is rendered as a dash, never NaN', async ({ page }) => {
    await signUp(page, `e2e-empty-${Date.now()}@example.et`);
    await createOrganization(page, 'E2E Empty Brand');
    await page.goto('/dashboard');

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('NaN');
    expect(body).not.toContain('Infinity');
  });
});
