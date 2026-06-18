/**
 * schema.spec.js — DB schema regression tests
 *
 * Guards against schema drift between db/schema.sql and the live DB.
 *
 * Background: Phase 1 changed user_blobs.blob from TEXT (64KB max) to
 * MEDIUMTEXT (~16MB) to support large game libraries. The fix lives only in
 * the live DB — schema.sql still declares TEXT. If anyone reloads the schema
 * the bug silently returns. This test catches that regression.
 *
 * Oracle: user_blobs.blob must be able to store a blob larger than 65535 bytes
 * (the TEXT column limit) and return it byte-identical on GET. Any column type
 * narrower than MEDIUMTEXT will silently truncate and the GET body will not
 * match the POST body.
 */

const { test, expect } = require('@playwright/test');
const { randomBytes } = require('crypto');

const BASE = 'http://127.0.0.1:8181';

function freshUserId() {
  return 'test-' + randomBytes(8).toString('hex');
}

test.describe('T-SCHEMA: DB schema regression', () => {
  let api;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: BASE });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test(
    'T-SCHEMA-01: user_blobs stores and retrieves a blob larger than 65535 bytes (TEXT limit)',
    async () => {
      // Oracle: MEDIUMTEXT supports ~16MB. If column is TEXT (64KB), the DB will
      // truncate on INSERT and the round-trip will fail.
      // A real encrypted blob for a user with ~3000 games easily exceeds 65535 bytes.
      // We use a synthetic payload that is just over the TEXT limit (66000 bytes).
      const oversizePayload = JSON.stringify({
        iv: 'dGVzdGl2',
        // 66000 'x' chars ≈ 66KB — safely over TEXT limit, well under MEDIUMTEXT limit
        ciphertext: 'x'.repeat(66000),
      });

      const userId = freshUserId();

      // POST the oversized blob
      const postRes = await api.post(`/api/sync/${userId}`, {
        data: { data: oversizePayload },
      });
      expect(
        postRes.status(),
        'POST should succeed — if 500, blob was likely truncated by TEXT column',
      ).toBe(200);

      // GET it back and verify byte-identical round-trip
      const getRes = await api.get(`/api/sync/${userId}`);
      expect(getRes.status()).toBe(200);

      const body = await getRes.json();
      expect(
        body.data,
        'Round-tripped blob must be byte-identical to the posted blob. ' +
          'Mismatch means the column truncated the data (TEXT limit is 65535 bytes).',
      ).toBe(oversizePayload);
    },
  );
});
