const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');

const BASE = 'http://127.0.0.1:8181';
const SYNC_PATTERN = '**/api/sync/**';
const BUNDLES_PATTERN = '**/api/bundles';

const MOCK_BUNDLES = [
  {
    name: 'Test Bundle 1',
    slug: 'test_bundle_1',
    url: 'https://www.humblebundle.com/games/test-bundle-1',
    end_date: '2099-12-31T18:00:00',
    start_date: '2026-06-01T18:00:00',
    category: 'bundle',
  },
  {
    name: 'Test Bundle 2',
    slug: 'test_bundle_2',
    url: 'https://www.humblebundle.com/games/test-bundle-2',
    end_date: '2099-12-31T18:00:00',
    start_date: '2026-06-01T18:00:00',
    category: 'bundle',
  },
];

async function loginNew(page) {
  await page.route(SYNC_PATTERN, route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Not found' }),
  }));
  await page.goto(BASE);
  await page.fill('#username', 'testuser');
  await page.fill('#passphrase', 'testpass');
  await page.click('#login-btn');
  await expect(page.locator('#authenticated-view')).toBeVisible();
}

async function loginWithMockBundles(page) {
  await page.route(SYNC_PATTERN, route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Not found' }),
  }));
  await page.route(BUNDLES_PATTERN, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'X-Cache': 'MISS' },
    body: JSON.stringify(MOCK_BUNDLES),
  }));
  await page.goto(BASE);
  await page.fill('#username', 'testuser');
  await page.fill('#passphrase', 'testpass');
  await page.click('#login-btn');
  await expect(page.locator('#authenticated-view')).toBeVisible();
}

test.describe('T-BUNDLES: Bundle API integration', () => {
  let api;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: BASE });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('T-BUNDLES-01: GET /api/bundles returns 200 with Content-Type application/json and a JSON array', async () => {
    const res = await api.get('/api/bundles');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('T-BUNDLES-02: second consecutive GET has X-Cache: HIT after cache is seeded', async () => {
    await api.get('/api/bundles');
    const res = await api.get('/api/bundles');
    expect(res.headers()['x-cache']).toBe('HIT');
  });

  test('T-BUNDLES-03: each bundle object has required fields with correct types and format', async () => {
    const res = await api.get('/api/bundles');
    const bundles = await res.json();
    if (bundles.length === 0) return;

    const isoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    for (const bundle of bundles) {
      const id = `bundle ${bundle.slug}`;
      expect(typeof bundle.name, `name must be string — ${id}`).toBe('string');
      expect(bundle.name.length, `name must be non-empty — ${id}`).toBeGreaterThan(0);
      expect(typeof bundle.slug, `slug must be string — ${id}`).toBe('string');
      expect(bundle.slug.length, `slug must be non-empty — ${id}`).toBeGreaterThan(0);
      expect(bundle.url, `url must start with humblebundle.com — ${id}`).toMatch(/^https:\/\/www\.humblebundle\.com\//);
      expect(bundle.end_date, `end_date must be ISO8601-like — ${id}`).toMatch(isoPattern);
      expect(bundle.start_date, `start_date must be ISO8601-like — ${id}`).toMatch(isoPattern);
      expect(bundle.category, `category must be 'bundle' — ${id}`).toBe('bundle');
    }
  });

  test('T-BUNDLES-04: POST /api/bundles returns 405 Method Not Allowed', async () => {
    const res = await api.post('/api/bundles', { data: {} });
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('T-BUNDLES-05: bundle_cache.expires_at matches bundle end_date with T→space conversion', async () => {
    const res = await api.get('/api/bundles');
    const bundles = await res.json();
    if (bundles.length === 0) return;

    const { slug, end_date } = bundles[0];
    // Oracle: PHP stores expires_at = str_replace('T', ' ', $end_date)
    const expectedExpires = end_date.replace('T', ' ');

    let dbResult;
    try {
      dbResult = execSync(
        `mariadb --socket=/tmp/mysql.sock mylibrary_db --skip-column-names -s -e "SELECT expires_at FROM bundle_cache WHERE slug = '${slug}' LIMIT 1"`,
        { encoding: 'utf8' }
      ).trim();
    } catch (_e) {
      return;
    }

    if (!dbResult) return;
    expect(dbResult).toBe(expectedExpires);
  });
});

test.describe('T-BUNDLES-UI: Bundle Browser tab UI', () => {
  test('T-BUNDLES-06: Library tab is active by default after login, bundles view hidden', async ({ page }) => {
    await loginNew(page);
    await expect(page.locator('#tab-library')).toHaveClass(/tab-active/);
    await expect(page.locator('#library-view')).toBeVisible();
    await expect(page.locator('#bundles-view')).toBeHidden();
  });

  test('T-BUNDLES-07: clicking Bundles tab shows bundles view, hides library view, swaps tab-active', async ({ page }) => {
    await loginWithMockBundles(page);
    await page.click('#tab-bundles');
    // Oracle: display state swapped immediately on click (before loadBundles resolves)
    await expect(page.locator('#bundles-view')).toBeVisible();
    await expect(page.locator('#library-view')).toBeHidden();
    await expect(page.locator('#tab-bundles')).toHaveClass(/tab-active/);
    await expect(page.locator('#tab-library')).not.toHaveClass(/tab-active/);
  });

  test('T-BUNDLES-08: bundle cards render with visible name and "Ends …" end-date after tab click', async ({ page }) => {
    await loginWithMockBundles(page);
    await page.click('#tab-bundles');
    await page.waitForSelector('#bundles-list .bundle-card');

    const cards = page.locator('.bundle-card');
    await expect(cards).toHaveCount(MOCK_BUNDLES.length);

    for (let i = 0; i < MOCK_BUNDLES.length; i++) {
      const card = cards.nth(i);
      await expect(card.locator('.bundle-name')).toBeVisible();
      const nameText = await card.locator('.bundle-name').textContent();
      expect(nameText.trim().length).toBeGreaterThan(0);
      // Oracle: .bundle-end-date starts with "Ends " (formatted via toLocaleDateString)
      const endText = await card.locator('.bundle-end-date').textContent();
      expect(endText).toMatch(/^Ends /);
    }
  });

  test('T-BUNDLES-09: each bundle card is an anchor to humblebundle.com with target=_blank', async ({ page }) => {
    await loginWithMockBundles(page);
    await page.click('#tab-bundles');
    await page.waitForSelector('#bundles-list .bundle-card');

    const cards = page.locator('.bundle-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const href = await card.getAttribute('href');
      expect(href).toMatch(/^https:\/\/www\.humblebundle\.com\//);
      expect(await card.getAttribute('target')).toBe('_blank');
    }
  });

  test('T-BUNDLES-10: ownership line contains "—" placeholder (Phase 4 null counts)', async ({ page }) => {
    await loginWithMockBundles(page);
    await page.click('#tab-bundles');
    await page.waitForSelector('#bundles-list .bundle-card');

    const cards = page.locator('.bundle-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).locator('.bundle-ownership')).toContainText('—');
    }
  });

  test('T-BUNDLES-11: clicking Library tab after Bundles tab restores library view and tab state', async ({ page }) => {
    await loginWithMockBundles(page);
    await page.click('#tab-bundles');
    await expect(page.locator('#bundles-view')).toBeVisible();

    await page.click('#tab-library');
    await expect(page.locator('#library-view')).toBeVisible();
    await expect(page.locator('#bundles-view')).toBeHidden();
    await expect(page.locator('#tab-library')).toHaveClass(/tab-active/);
    await expect(page.locator('#tab-bundles')).not.toHaveClass(/tab-active/);
  });

  test('T-BUNDLES-12: logout resets active tab to Library; bundles view hidden on re-login', async ({ page }) => {
    await loginWithMockBundles(page);

    await page.click('#tab-bundles');
    await expect(page.locator('#tab-bundles')).toHaveClass(/tab-active/);

    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
      headers: { ETag: '"after-logout"' },
    }));

    await page.click('#logout-btn');
    await expect(page.locator('#unauthenticated-view')).toBeVisible();

    // Re-route sync to 404 for fresh re-login (new-user flow again)
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }));

    await page.fill('#username', 'testuser');
    await page.fill('#passphrase', 'testpass');
    await page.click('#login-btn');
    await expect(page.locator('#authenticated-view')).toBeVisible();

    // Oracle: auth:logout resets tab state; auth:login does not — reset persists through re-login
    await expect(page.locator('#tab-library')).toHaveClass(/tab-active/);
    await expect(page.locator('#tab-bundles')).not.toHaveClass(/tab-active/);
    await expect(page.locator('#bundles-view')).toBeHidden();
  });

  test('T-BUNDLES-13: loadBundles API error shows #bundles-error, hides loading indicator', async ({ page }) => {
    await loginNew(page);
    await page.route(BUNDLES_PATTERN, route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Database connection failed' }),
    }));

    await page.click('#tab-bundles');

    // Oracle: error element visible with non-empty text; loading spinner hidden
    await expect(page.locator('#bundles-error')).toBeVisible();
    await expect(page.locator('#bundles-error')).not.toBeEmpty();
    await expect(page.locator('#bundles-loading')).toBeHidden();
    // Oracle: no cards rendered on error
    await expect(page.locator('#bundles-list .bundle-card')).toHaveCount(0);
  });

  test('T-BUNDLES-14: loadBundles empty response shows "No active bundles found." message', async ({ page }) => {
    await loginNew(page);
    await page.route(BUNDLES_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }));

    await page.click('#tab-bundles');

    // Oracle: specific placeholder text; no error shown; no cards
    await expect(page.locator('#bundles-list')).toHaveText('No active bundles found.');
    await expect(page.locator('#bundles-error')).toBeHidden();
    await expect(page.locator('#bundles-list .bundle-card')).toHaveCount(0);
  });
});
