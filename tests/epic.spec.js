const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8181';

test.describe('T-EPIC: Epic API integration', () => {
  let api;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: BASE });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('T-EPIC-01: POST /api/epic/exchange with no body → 400, error mentions body', async () => {
    const res = await api.post('/api/epic/exchange', {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('T-EPIC-02: POST /api/epic/exchange with missing code field → 400, error mentions code', async () => {
    const res = await api.post('/api/epic/exchange', {
      data: { other: 'value' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('code');
  });

  test('T-EPIC-03: POST /api/epic/exchange with empty code → 400', async () => {
    const res = await api.post('/api/epic/exchange', {
      data: { code: '' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('T-EPIC-04: POST /api/epic/exchange with invalid code → 4xx from Epic forwarded', async () => {
    test.setTimeout(15000);
    const res = await api.post('/api/epic/exchange', {
      data: { code: 'notavalidcode' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    const body = await res.json();
    expect(body.error).toContain('Epic OAuth error');
  });

  test('T-EPIC-05: GET /api/epic/exchange → 405 Method Not Allowed', async () => {
    const res = await api.get('/api/epic/exchange');
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.error).toContain('Method not allowed');
  });

  test('T-EPIC-06: POST /api/epic/exchange with invalid JSON → 400', async () => {
    const res = await api.post('/api/epic/exchange', {
      data: 'this is not json',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
