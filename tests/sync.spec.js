const { test, expect, request } = require('@playwright/test');
const { randomBytes } = require('crypto');

const BASE = 'http://127.0.0.1:8181';

function freshUserId() {
  return 'test-' + randomBytes(8).toString('hex');
}

const BLOB = JSON.stringify({ iv: 'dGVzdGl2', ciphertext: 'dGVzdGNpcGhlcg' });

test.describe('T-SYNC: sync.php integration', () => {
  let api;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: BASE });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('T-SYNC-01: GET unknown userId → 404 Not found', async () => {
    const res = await api.get(`/api/sync/${freshUserId()}`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });

  test('T-SYNC-02: POST new userId → 200, ETag header present', async () => {
    const userId = freshUserId();
    const res = await api.post(`/api/sync/${userId}`, {
      data: { data: BLOB },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(res.headers()['etag']).toBeTruthy();
  });

  test('T-SYNC-03: GET after POST → 200, data byte-identical, ETag matches', async () => {
    const userId = freshUserId();

    const postRes = await api.post(`/api/sync/${userId}`, {
      data: { data: BLOB },
    });
    const postEtag = postRes.headers()['etag'];

    const getRes = await api.get(`/api/sync/${userId}`);
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();
    expect(body.data).toBe(BLOB);
    expect(getRes.headers()['etag']).toBe(postEtag);
  });

  test('T-SYNC-04: POST with correct If-Match → 200', async () => {
    const userId = freshUserId();

    const first = await api.post(`/api/sync/${userId}`, { data: { data: BLOB } });
    const etag = first.headers()['etag'].replace(/^"|"$/g, '');

    const second = await api.post(`/api/sync/${userId}`, {
      data: { data: BLOB },
      headers: { 'If-Match': `"${etag}"` },
    });
    expect(second.status()).toBe(200);
  });

  test('T-SYNC-05: POST with wrong If-Match → 412 ETag mismatch', async () => {
    const userId = freshUserId();
    await api.post(`/api/sync/${userId}`, { data: { data: BLOB } });

    const res = await api.post(`/api/sync/${userId}`, {
      data: { data: BLOB },
      headers: { 'If-Match': '"definitelywrongetag"' },
    });
    expect(res.status()).toBe(412);
    const body = await res.json();
    expect(body.error).toBe('ETag mismatch');
  });

  test('T-SYNC-06: POST missing data field → 400', async () => {
    const res = await api.post(`/api/sync/${freshUserId()}`, {
      data: { notdata: 'oops' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Missing data field');
  });

  test('T-SYNC-07: POST empty body → 400', async () => {
    const res = await api.post(`/api/sync/${freshUserId()}`, {
      data: '',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });

  test('T-SYNC-08: path traversal and injection attempts → 400', async () => {
    const badIds = [
      '../etc/passwd',
      '../../config.php',
      "'; DROP TABLE users; --",
      '<script>alert(1)</script>',
      'has a space',
      '',
    ];

    for (const bad of badIds) {
      const encoded = encodeURIComponent(bad);
      const res = await api.get(`/api/sync/${encoded}`);
      expect(res.status(), `Expected 400 for userId: ${JSON.stringify(bad)}`).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid userId');
    }
  });

  test('T-SYNC-09: HEAD → 200 with ETag, no body', async () => {
    const userId = freshUserId();
    const postRes = await api.post(`/api/sync/${userId}`, { data: { data: BLOB } });
    const postEtag = postRes.headers()['etag'];

    const headRes = await api.head(`/api/sync/${userId}`);
    expect(headRes.status()).toBe(200);
    expect(headRes.headers()['etag']).toBe(postEtag);

    const text = await headRes.text();
    expect(text).toBe('');
  });
});
