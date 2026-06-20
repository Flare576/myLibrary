const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8181';

test.describe('T-STEAM: Steam API integration', () => {
  let api;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: BASE });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('T-STEAM-01: GET /api/steam/init → 302 redirect to Steam OpenID with required params', async () => {
    const res = await api.get('/api/steam/init', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers()['location'];
    expect(location).toContain('https://steamcommunity.com/openid/login');
    expect(location).toContain('openid.ns=');
    expect(location).toContain('openid.mode=checkid_setup');
    expect(location).toContain('openid.return_to=');
    expect(location).toContain('openid.realm=');
  });

  test('T-STEAM-02: GET /api/steam/init → sets PHPSESSID session cookie', async ({ playwright }) => {
    const freshCtx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await freshCtx.get('/api/steam/init', { maxRedirects: 0 });
      const state = await freshCtx.storageState();
      const hasSession = state.cookies.some(c => c.name === 'PHPSESSID');
      expect(hasSession).toBe(true);
    } finally {
      await freshCtx.dispose();
    }
  });

  test('T-STEAM-03: callback with openid.mode=cancel → 302 redirect with steam_error', async () => {
    const res = await api.get('/api/steam/callback?openid.mode=cancel', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers()['location'];
    expect(location).toContain('steam_error=');
    const url = new URL(location, BASE);
    expect(url.searchParams.get('steam_error')).toBe('Steam login cancelled');
  });

  test('T-STEAM-04: callback with openid.mode=id_res and no nonce → 302 redirect with steam_error', async () => {
    const res = await api.get('/api/steam/callback?openid.mode=id_res', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers()['location'];
    expect(location).toContain('steam_error=');
    // Oracle: nonce param absent → Missing nonce (session check removed; URL nonce required)
    const url = new URL(location, BASE);
    expect(url.searchParams.get('steam_error')).toBe('Missing nonce');
  });

  test('T-STEAM-05: callback with spoofed nonce but invalid return_to → 302 redirect with steam_error', async () => {
    const res = await api.get(
      '/api/steam/callback?openid.mode=id_res' +
      '&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000000' +
      '&nonce=FAKE_NONCE_NO_SESSION',
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(302);
    const location = res.headers()['location'];
    expect(location).toContain('steam_error=');
    // Oracle: nonce present but openid.return_to absent/wrong → Invalid return_to
    const url = new URL(location, BASE);
    expect(url.searchParams.get('steam_error')).toBe('Invalid return_to');
  });

  test('T-STEAM-06: GET /api/steam/games with no steamid → 400, error mentions steamid', async () => {
    const res = await api.get('/api/steam/games');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('steamid');
  });

  test('T-STEAM-07: GET /api/steam/games with non-numeric steamid → 400 Invalid steamid', async () => {
    const res = await api.get('/api/steam/games?steamid=notanumber');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid steamid');
  });

  test('T-STEAM-08: GET /api/steam/games with too-short steamid → 400 Invalid steamid', async () => {
    const res = await api.get('/api/steam/games?steamid=12345');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid steamid');
  });
});
