/**
 * schema.spec.js — DB schema regression tests
 *
 * Guards against schema drift: verifies that the live DB matches what
 * db/schema.sql declares, specifically that user_blobs.blob is MEDIUMTEXT
 * (not TEXT) so large game libraries (500+ games encrypted) don't get
 * silently truncated at the 64KB TEXT limit.
 *
 * Oracle: user_blobs.blob must store a blob larger than 65535 bytes and
 * return it byte-identical on GET. Any column type narrower than MEDIUMTEXT
 * will silently truncate and the GET body will not match the POST body.
 */

const { test, expect } = require('@playwright/test');
const { randomBytes } = require('crypto');
const { execSync } = require('child_process');
const path = require('path');

const BASE = 'http://127.0.0.1:8181';
const SOCKET = '/tmp/mysql.sock';
const SCHEMA_FILE = path.resolve(__dirname, '../db/schema.sql');
const SCRATCH_DB = 'mylibrary_schema_test';

function freshUserId() {
  return 'test-' + randomBytes(8).toString('hex');
}

test.describe('T-SCHEMA: DB schema regression — live DB', () => {
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

test.describe('T-SCHEMA: DB schema regression — fresh schema.sql load', () => {
  test.beforeAll(() => {
    execSync(`mariadb --socket=${SOCKET} -e "CREATE DATABASE IF NOT EXISTS ${SCRATCH_DB}"`);
    execSync(`mariadb --socket=${SOCKET} ${SCRATCH_DB} < "${SCHEMA_FILE}"`);
  });

  test.afterAll(() => {
    try {
      execSync(`mariadb --socket=${SOCKET} -e "DROP DATABASE IF EXISTS ${SCRATCH_DB}"`);
    } catch (_) {
      // Best-effort cleanup
    }
  });

  test('T-SCHEMA-02: schema.sql creates user_blobs.blob as MEDIUMTEXT (not TEXT)', () => {
    const output = execSync(
      `mariadb --socket=${SOCKET} ${SCRATCH_DB} -e "SHOW CREATE TABLE user_blobs\\G"`,
    ).toString();

    expect(
      output.toLowerCase(),
      'blob column must be mediumtext — TEXT would silently truncate blobs >64KB',
    ).toMatch(/`blob`\s+mediumtext/);

    const columnLine = output.split('\n').find(line => line.toLowerCase().includes('`blob`'));
    expect(
      columnLine?.toLowerCase(),
      'blob column declaration must not be plain TEXT',
    ).not.toMatch(/`blob`\s+text[^m]/);
  });

  test(
    'T-SCHEMA-03: schema.sql creates bundle_cache.detail as a nullable column',
    () => {
      // Oracle: Phase 5 added `detail JSON NULL` to bundle_cache. If schema.sql is loaded
      // on a fresh DB without this column, detail.php throws a DB error on every cache write.
      const output = execSync(
        `mariadb --socket=${SOCKET} ${SCRATCH_DB} -e "SHOW CREATE TABLE bundle_cache\\G"`,
      ).toString();

      expect(
        output.toLowerCase(),
        'bundle_cache must have a detail column',
      ).toContain('`detail`');

      const detailLine = output.split('\n').find(line => line.toLowerCase().includes('`detail`'));
      expect(
        detailLine,
        'detail column must exist in bundle_cache',
      ).toBeTruthy();

      expect(
        detailLine?.toLowerCase(),
        'detail column must allow NULL (DEFAULT NULL)',
      ).toContain('null');
    },
  );
});
