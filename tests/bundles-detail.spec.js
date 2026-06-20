const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8181';
const SYNC_PATTERN = '**/api/sync/**';
const BUNDLES_PATTERN = '**/api/bundles';
const DETAIL_PATTERN = '**/api/bundles/*/detail';

const MOCK_DETAIL_SLUG = 'test_bundle_1';

const MOCK_DETAIL = {
  slug: MOCK_DETAIL_SLUG,
  tiers: [
    {
      price_label: 'Pay $8 to unlock!',
      items: [
        { human_name: 'Portal', msrp: 9.99 },
        { human_name: 'Celeste', msrp: 19.99 },
      ],
    },
    {
      price_label: 'Pay $15 or more to also unlock!',
      items: [
        { human_name: 'SOMA', msrp: 29.99 },
      ],
    },
  ],
};

const MOCK_BUNDLES = [
  {
    name: 'Test Bundle 1',
    slug: MOCK_DETAIL_SLUG,
    url: 'https://www.humblebundle.com/games/test-bundle-1',
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

async function loginWithMockBundlesAndDetail(page) {
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
  await page.route(DETAIL_PATTERN, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(MOCK_DETAIL),
  }));
  await page.goto(BASE);
  await page.fill('#username', 'testuser');
  await page.fill('#passphrase', 'testpass');
  await page.click('#login-btn');
  await expect(page.locator('#authenticated-view')).toBeVisible();
}

async function openDetailPanel(page) {
  await page.click('#tab-bundles');
  await page.waitForSelector('#bundles-list .bundle-detail-btn');
  await page.locator('.bundle-detail-btn').first().click();
  await expect(page.locator('#bundle-detail')).toBeVisible();
  await expect(page.locator('#bundle-detail-loading')).toBeHidden();
}

test.describe('T-DETAIL: Bundle detail API integration', () => {
  let api;
  let realSlug;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: BASE });
    try {
      const res = await api.get('/api/bundles');
      if (res.ok()) {
        const bundles = await res.json();
        realSlug = bundles.length > 0 ? bundles[0].slug : null;
      }
    } catch (_e) {
      realSlug = null;
    }
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('T-DETAIL-01: GET /api/bundles/{slug}/detail returns 200 with slug and tiers array', async () => {
    if (!realSlug) return;
    const res = await api.get(`/api/bundles/${realSlug}/detail`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.slug).toBe('string');
    expect(body.slug).toBe(realSlug);
    expect(Array.isArray(body.tiers)).toBe(true);
  });

  test('T-DETAIL-02: second request to detail endpoint returns X-Cache: HIT', async () => {
    if (!realSlug) return;
    await api.get(`/api/bundles/${realSlug}/detail`);
    const res = await api.get(`/api/bundles/${realSlug}/detail`);
    expect(res.headers()['x-cache']).toBe('HIT');
  });

  test('T-DETAIL-03: each tier has price_label (string) and items array; each item has human_name (string) and msrp (number >= 0)', async () => {
    if (!realSlug) return;
    const res = await api.get(`/api/bundles/${realSlug}/detail`);
    const body = await res.json();
    if (body.tiers.length === 0) return;

    for (const tier of body.tiers) {
      const id = `tier "${tier.price_label}"`;
      expect(typeof tier.price_label, `price_label must be string — ${id}`).toBe('string');
      expect(tier.price_label.length, `price_label must be non-empty — ${id}`).toBeGreaterThan(0);
      expect(Array.isArray(tier.items), `items must be array — ${id}`).toBe(true);
      for (const item of tier.items) {
        expect(typeof item.human_name, `human_name must be string — item in ${id}`).toBe('string');
        expect(item.human_name.length, `human_name must be non-empty — item in ${id}`).toBeGreaterThan(0);
        expect(typeof item.msrp, `msrp must be number — ${item.human_name}`).toBe('number');
        expect(item.msrp, `msrp must be >= 0 — ${item.human_name}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('T-DETAIL-04: POST /api/bundles/{slug}/detail returns 405', async () => {
    if (!realSlug) return;
    const res = await api.post(`/api/bundles/${realSlug}/detail`, { data: {} });
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('T-DETAIL-05: unknown slug returns 404', async () => {
    const res = await api.get('/api/bundles/this_slug_does_not_exist_xyz123abc/detail');
    expect(res.status()).toBe(404);
  });
});

test.describe('T-DETAIL-UI: Bundle detail panel UI', () => {
  test('T-DETAIL-06: after login + Bundles tab + click Details button — detail panel visible, bundles-list hidden', async ({ page }) => {
    await loginWithMockBundlesAndDetail(page);
    await openDetailPanel(page);

    await expect(page.locator('#bundle-detail')).toBeVisible();
    await expect(page.locator('#bundles-list')).toBeHidden();
  });

  test('T-DETAIL-07: detail panel shows .bundle-tier sections matching mock tier count', async ({ page }) => {
    await loginWithMockBundlesAndDetail(page);
    await openDetailPanel(page);

    await expect(page.locator('.bundle-tier')).toHaveCount(MOCK_DETAIL.tiers.length);
  });

  test('T-DETAIL-08: each .bundle-game has .game-name text matching mock game names in order', async ({ page }) => {
    await loginWithMockBundlesAndDetail(page);
    await openDetailPanel(page);

    const allMockNames = MOCK_DETAIL.tiers.flatMap(t => t.items.map(i => i.human_name));
    const gameNames = page.locator('.bundle-game .game-name');
    await expect(gameNames).toHaveCount(allMockNames.length);

    for (let i = 0; i < allMockNames.length; i++) {
      const text = await gameNames.nth(i).textContent();
      expect(text.trim()).toBe(allMockNames[i]);
    }
  });

  test("T-DETAIL-09: .bundle-detail-summary shows '{X} of {Y} games you don't own — ${Z} value' format", async ({ page }) => {
    await loginWithMockBundlesAndDetail(page);
    await openDetailPanel(page);

    const summary = page.locator('.bundle-detail-summary');
    await expect(summary).toBeVisible();
    const text = await summary.textContent();
    expect(text).toMatch(/\d+ of \d+ games you don't own — \$[\d.]+ value/);
  });

  test('T-DETAIL-10: clicking #bundle-detail-back hides detail panel and restores bundles-list', async ({ page }) => {
    await loginWithMockBundlesAndDetail(page);
    await openDetailPanel(page);

    await page.click('#bundle-detail-back');

    await expect(page.locator('#bundle-detail')).toBeHidden();
    await expect(page.locator('#bundles-list')).toBeVisible();
  });

  test('T-DETAIL-11: detail API error shows #bundle-detail-error, hides loading spinner', async ({ page }) => {
    await loginNew(page);
    await page.route(BUNDLES_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Cache': 'MISS' },
      body: JSON.stringify(MOCK_BUNDLES),
    }));
    await page.route(DETAIL_PATTERN, route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Server error' }),
    }));

    await page.click('#tab-bundles');
    await page.waitForSelector('#bundles-list .bundle-detail-btn');
    await page.locator('.bundle-detail-btn').first().click();
    await expect(page.locator('#bundle-detail')).toBeVisible();

    await expect(page.locator('#bundle-detail-error')).toBeVisible();
    await expect(page.locator('#bundle-detail-error')).not.toBeEmpty();
    await expect(page.locator('#bundle-detail-loading')).toBeHidden();
  });

  test('T-DETAIL-12: each .bundle-game has data-owned attribute set to "true" or "false"', async ({ page }) => {
    await loginWithMockBundlesAndDetail(page);
    await openDetailPanel(page);

    const games = page.locator('.bundle-game');
    const count = await games.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const dataOwned = await games.nth(i).getAttribute('data-owned');
      expect(['true', 'false']).toContain(dataOwned);
    }
  });

  test('T-DETAIL-13: owned game shows data-owned="true" when user blob contains a matching game', async ({ page }) => {
    // Oracle: end-to-end ownership — blob contains "Portal" in steam library,
    // detail has Portal and Celeste. Portal must be data-owned="true", Celeste "false".
    const USERNAME = 'detail-owner';
    const PASSPHRASE = 'ownerpass';
    const BLOB_STATE = {
      steam: { steamId: '76561198000000001', games: [{ appid: 620, name: 'Portal 2', img_icon_url: '', playtime_forever: 0 }] },
      epic: null, itch: null,
      lastSync: { steam: '2026-06-19T00:00:00.000Z' },
    };

    await page.goto('http://localhost:8181');

    const encryptedBlob = await page.evaluate(
      async ({ username, passphrase, salt, iterations, state }) => {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(username + ':' + passphrase), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
          keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(state)));
        const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return { iv: toB64(iv), ciphertext: toB64(ciphertext) };
      },
      { username: USERNAME, passphrase: PASSPHRASE, salt: 'ei-the-answer-is-42', iterations: 310000, state: BLOB_STATE },
    );

    const DETAIL_WITH_PORTAL = {
      slug: MOCK_DETAIL_SLUG,
      tiers: [{
        price_label: 'Pay $8 to unlock!',
        items: [
          { human_name: 'Portal 2', msrp: 9.99 },
          { human_name: 'Celeste', msrp: 19.99 },
        ],
      }],
    };

    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: JSON.stringify(encryptedBlob) }),
      headers: { ETag: '"owner-etag"' },
    }));
    await page.route(BUNDLES_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(MOCK_BUNDLES),
    }));
    await page.route(DETAIL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(DETAIL_WITH_PORTAL),
    }));

    await page.goto('http://localhost:8181');
    await page.fill('#username', USERNAME);
    await page.fill('#passphrase', PASSPHRASE);
    await page.click('#login-btn');
    await expect(page.locator('#authenticated-view')).toBeVisible();

    await openDetailPanel(page);

    const games = page.locator('.bundle-game');
    await expect(games).toHaveCount(2);

    // Oracle: Portal 2 is in the blob — must be owned
    await expect(games.nth(0)).toHaveAttribute('data-owned', 'true');
    // Oracle: Celeste is not in the blob — must be unowned
    await expect(games.nth(1)).toHaveAttribute('data-owned', 'false');
  });

  test('T-DETAIL-14: summary reflects correct owned/unowned counts when user owns some games', async ({ page }) => {
    // Oracle: same blob as T-DETAIL-13 (Portal 2 owned, Celeste not).
    // Summary: "1 of 2 games you don't own — $19.99 value"
    const USERNAME = 'detail-summary';
    const PASSPHRASE = 'summarypass';
    const BLOB_STATE = {
      steam: { steamId: '76561198000000002', games: [{ appid: 620, name: 'Portal 2', img_icon_url: '', playtime_forever: 0 }] },
      epic: null, itch: null,
      lastSync: { steam: '2026-06-19T00:00:00.000Z' },
    };

    await page.goto('http://localhost:8181');

    const encryptedBlob = await page.evaluate(
      async ({ username, passphrase, salt, iterations, state }) => {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(username + ':' + passphrase), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
          keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(state)));
        const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return { iv: toB64(iv), ciphertext: toB64(ciphertext) };
      },
      { username: USERNAME, passphrase: PASSPHRASE, salt: 'ei-the-answer-is-42', iterations: 310000, state: BLOB_STATE },
    );

    const DETAIL_WITH_PORTAL = {
      slug: MOCK_DETAIL_SLUG,
      tiers: [{
        price_label: 'Pay $8 to unlock!',
        items: [
          { human_name: 'Portal 2', msrp: 9.99 },
          { human_name: 'Celeste', msrp: 19.99 },
        ],
      }],
    };

    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: JSON.stringify(encryptedBlob) }),
      headers: { ETag: '"summary-etag"' },
    }));
    await page.route(BUNDLES_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(MOCK_BUNDLES),
    }));
    await page.route(DETAIL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(DETAIL_WITH_PORTAL),
    }));

    await page.goto('http://localhost:8181');
    await page.fill('#username', USERNAME);
    await page.fill('#passphrase', PASSPHRASE);
    await page.click('#login-btn');
    await expect(page.locator('#authenticated-view')).toBeVisible();

    await openDetailPanel(page);

    const summary = page.locator('.bundle-detail-summary');
    await expect(summary).toBeVisible();
    // Oracle: 1 unowned (Celeste), 2 total, $19.99 value
    await expect(summary).toHaveText("1 of 2 games you don't own — $19.99 value");
  });
});
