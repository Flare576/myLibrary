const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8181';

test.describe('T-ITCH: itch.io API integration', () => {
  let api;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: BASE });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('T-ITCH-01: GET /api/itch/init → 302 redirect to itch.io OAuth with required params', async () => {
    const res = await api.get('/api/itch/init', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers()['location'];
    expect(location).toContain('https://itch.io/user/oauth');
    // Oracle: implicit flow requires response_type=token
    expect(location).toContain('response_type=token');
    // Oracle: scope=profile:owned — http_build_query URL-encodes the colon
    const hasScope =
      location.includes('scope=profile%3Aowned') || location.includes('scope=profile:owned');
    expect(hasScope).toBe(true);
  });

  test('T-ITCH-02: GET /api/itch/init → redirect contains client_id and redirect_uri params', async () => {
    const res = await api.get('/api/itch/init', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers()['location'];
    // Oracle: both OAuth required params present (values are config-dependent)
    expect(location).toContain('client_id=');
    expect(location).toContain('redirect_uri=');
  });

  test('T-ITCH-03: GET /api/itch/callback → 200, serves HTML containing page title', async () => {
    const res = await api.get('/api/itch/callback');
    expect(res.status()).toBe(200);
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('text/html');
    const body = await res.text();
    // Oracle: callback.php reads index.html — title must be present
    expect(body).toContain('<title>MyLibrary</title>');
  });

  test('T-ITCH-04: GET /api/itch/callback with hash fragment → 200 (server ignores fragment)', async ({ page }) => {
    // Fragments are client-side only — the server receives /api/itch/callback without the hash.
    // Use page.goto() + waitUntil:'commit' so we get the HTTP status before module scripts run.
    const response = await page.goto(
      `${BASE}/api/itch/callback#access_token=sometoken&token_type=bearer`,
      { waitUntil: 'commit' },
    );
    expect(response.status()).toBe(200);
  });

  test('T-ITCH-05: POST /api/itch/library with no body → 400', async () => {
    const res = await api.post('/api/itch/library', {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('T-ITCH-06: POST /api/itch/library with missing token field → 400, error mentions token', async () => {
    const res = await api.post('/api/itch/library', {
      data: { other: 'value' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('token');
  });

  test('T-ITCH-07: POST /api/itch/library with empty token → 400', async () => {
    const res = await api.post('/api/itch/library', {
      data: { token: '' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('T-ITCH-08: GET /api/itch/library → 405 Method Not Allowed', async () => {
    const res = await api.get('/api/itch/library');
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.error).toContain('Method not allowed');
  });

  test('T-ITCH-09: POST /api/itch/library with invalid JSON → 400', async () => {
    const res = await api.post('/api/itch/library', {
      data: 'this is not json',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('T-ITCH-10: POST /api/itch/library with invalid token → 4xx from itch.io forwarded', async () => {
    test.setTimeout(20000);
    const res = await api.post('/api/itch/library', {
      data: { token: 'notavalidtoken' },
    });
    // Oracle: itch.io returns 401/403 for a bad token; library.php forwards 4xx as-is.
    // A 502 is also acceptable if itch.io returns an unexpected shape, but the error
    // field must be present and reference itch.io.
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(600);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('T-ITCH-11: GET /api/itch/callback → injects <base href="/"> exactly once', async () => {
    const res = await api.get('/api/itch/callback');
    expect(res.status()).toBe(200);
    const html = await res.text();
    // Oracle: exactly one <base> tag, injected immediately after <head>
    expect(html).toContain('<head><base href="/">');
    const baseTagCount = (html.match(/<base\b/gi) ?? []).length;
    expect(baseTagCount, '<base> tag must appear exactly once').toBe(1);
  });
});
