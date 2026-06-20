const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8181';
const SYNC_PATTERN = '**/api/sync/**';
const SALT = 'ei-the-answer-is-42';
const ITERATIONS = 310000;

test.describe('T-ITCH-BROWSER: itch.io browser behavior', () => {
  test('T-ITCH-B01: itch connect section visible after login, itch library hidden', async ({ page }) => {
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
    await expect(page.locator('#itch-connect-section')).toBeVisible();
    await expect(page.locator('#itch-library')).toBeHidden();
  });

  test('T-ITCH-B02: itch:connected event renders library and hides connect section', async ({ page }) => {
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

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('itch:connected', {
        detail: {
          token: 'tok',
          games: [
            { appid: 1, name: 'Celeste', platform: 'itch' },
            { appid: 2, name: 'SOMA', platform: 'itch' },
            { appid: 3, name: 'Hades', platform: 'itch' },
          ],
        },
      }));
    });

    await expect(page.locator('#itch-library')).toBeVisible();
    await expect(page.locator('#itch-connect-section')).toBeHidden();
    // Oracle: itch.io game count format is always "itch.io: N games" (never singular)
    await expect(page.locator('#itch-game-count')).toHaveText('itch.io: 3 games');
  });

  test('T-ITCH-B03: itch:error event sets error message in #itch-error', async ({ page }) => {
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

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('itch:error', {
        detail: { message: 'itch.io auth failed' },
      }));
    });

    await expect(page.locator('#itch-error')).toContainText('itch.io auth failed');
  });

  test('T-ITCH-B04: Disconnect button calls disconnectItch → shows connect section', async ({ page }) => {
    const USERNAME = 'itchuser';
    const PASSPHRASE = 'itchpass';
    const ITCH_STATE = {
      steam: null,
      epic: null,
      itch: {
        token: 'existingtoken',
        games: [{ appid: 1, name: 'Celeste', platform: 'itch' }],
      },
      lastSync: { itch: '2026-06-19T00:00:00.000Z' },
    };

    await page.goto('http://localhost:8181');

    const encryptedBlob = await page.evaluate(
      async ({ username, passphrase, salt, iterations, state }) => {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw', enc.encode(username + ':' + passphrase), 'PBKDF2', false, ['deriveKey'],
        );
        const key = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
          keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          enc.encode(JSON.stringify(state)),
        );
        const toBase64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return { iv: toBase64url(iv), ciphertext: toBase64url(ciphertext) };
      },
      { username: USERNAME, passphrase: PASSPHRASE, salt: SALT, iterations: ITERATIONS, state: ITCH_STATE },
    );

    await page.route(SYNC_PATTERN, route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
          headers: { ETag: '"after-itch-disconnect"' },
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: JSON.stringify(encryptedBlob) }),
        headers: { ETag: '"existing-itch-etag"' },
      });
    });

    await page.goto('http://localhost:8181');
    await page.fill('#username', USERNAME);
    await page.fill('#passphrase', PASSPHRASE);
    await page.click('#login-btn');

    await expect(page.locator('#authenticated-view')).toBeVisible();
    // Oracle: manage-platforms closes when platforms connected — open it to check state
    await page.locator('#manage-platforms').evaluate(el => el.setAttribute('open', ''));
    // Oracle: itch state loaded from blob → library visible without re-connecting
    await expect(page.locator('#itch-library')).toBeVisible();
    await expect(page.locator('#itch-connect-section')).toBeHidden();

    await page.click('#itch-disconnect-btn');

    await expect(page.locator('#itch-library')).toBeHidden();
    await expect(page.locator('#itch-connect-section')).toBeVisible();
  });

  test('T-ITCH-B05: handleCallback processes URL hash with access_token', async ({ page }) => {
    await page.route(SYNC_PATTERN, route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
          headers: { ETag: '"itch-callback-etag"' },
        });
      }
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
    });

    await page.route('**/api/itch/library', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        games: [
          { appid: 1, name: 'Celeste', platform: 'itch' },
          { appid: 2, name: 'SOMA', platform: 'itch' },
        ],
      }),
    }));

    // Navigate to root with the hash — pendingItchCallback fires because hash includes 'access_token'.
    // Root URL is used (not /api/itch/callback) so ES module imports resolve correctly in dev.
    await page.goto(`${BASE}/#access_token=testtoken123&token_type=bearer`);
    await page.fill('#username', 'testuser');
    await page.fill('#passphrase', 'testpass');
    await page.click('#login-btn');

    // Oracle: after login handleCallback runs, fetchLibrary returns 2 games, itch:connected fires
    await expect(page.locator('#itch-library')).toBeVisible();
    await expect(page.locator('#itch-game-count')).toContainText('2 games');
  });

  test('T-ITCH-B06: parseItchResponse edge case — empty library {} renders 0 games', async ({ page }) => {
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

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('itch:connected', {
        detail: { token: 'tok', games: [] },
      }));
    });

    // Oracle: library shows even when empty; parseItchResponse({}) → []
    await expect(page.locator('#itch-library')).toBeVisible();
    await expect(page.locator('#itch-game-count')).toHaveText('itch.io: 0 games');
  });

  test('T-ITCH-B07: handleCallback verifies correct token is forwarded to library proxy', async ({ page }) => {
    let capturedLibraryRequest = null;

    await page.route(SYNC_PATTERN, route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
          headers: { ETag: '"itch-token-check-etag"' },
        });
      }
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
    });

    await page.route('**/api/itch/library', route => {
      capturedLibraryRequest = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ games: [{ appid: 1, name: 'Celeste', platform: 'itch' }] }),
      });
    });

    await page.goto(`${BASE}/#access_token=my-specific-token-abc&token_type=bearer`);
    await page.fill('#username', 'testuser');
    await page.fill('#passphrase', 'testpass');
    await page.click('#login-btn');

    await expect(page.locator('#itch-library')).toBeVisible();

    // Oracle: the exact token from the URL hash must be forwarded to the library proxy —
    // not a different token, not an empty string, not undefined.
    expect(capturedLibraryRequest, 'library proxy must have been called').not.toBeNull();
    expect(capturedLibraryRequest.token).toBe('my-specific-token-abc');
  });

  test('T-ITCH-JS-02: handleCallback saveState failure → itch:error fires, URL cleaned, library hidden', async ({ page }) => {
    await page.route(SYNC_PATTERN, route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 412,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'ETag mismatch' }),
        });
      }
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
    });

    await page.route('**/api/itch/library', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ games: [{ appid: 1, name: 'Celeste', platform: 'itch' }] }),
    }));

    await page.goto(`${BASE}/#access_token=sometoken&token_type=bearer`);
    await page.fill('#username', 'savestatefailuser');
    await page.fill('#passphrase', 'savestatefailpass');

    // Register the error listener AFTER page is stable, before triggering login
    const itchErrorFired = page.evaluate(
      () => new Promise(resolve => {
        document.addEventListener('itch:error', e => resolve(e.detail?.message ?? ''), { once: true });
      })
    );

    await page.click('#login-btn');

    // Oracle: itch:error dispatched because saveState threw
    const errorMessage = await itchErrorFired;
    expect(errorMessage, 'itch:error must fire when saveState fails').toBeTruthy();

    // Oracle: library section never shown — partial state not committed
    await expect(page.locator('#itch-library')).toBeHidden();
    await expect(page.locator('#itch-connect-section')).toBeVisible();

    // Oracle: URL hash cleaned even on failure — no dangling fragment
    expect(page.url()).not.toContain('#');
  });

  test(
    'T-ITCH-JS-01: itch OAuth denial (#error=access_denied in hash) — itch:error shown, URL cleaned [KNOWN FAILING — bug, not test]',
    async ({ page }) => {
      // Bug: when itch.io redirects back with #error=access_denied (user denied the grant),
      // pendingItchCallback is false (hash has no 'access_token') so handleCallback is never
      // called. No error is surfaced and the fragment is never cleaned.
      //
      // Oracle (correct behavior): an error hash should dispatch itch:error with a meaningful
      // message and clean the URL. This test documents that contract. It currently FAILS
      // because the code doesn't implement it yet.
      await page.route(SYNC_PATTERN, route => route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      }));

      await page.goto(`${BASE}/#error=access_denied&error_description=User+denied+access`);
      await page.fill('#username', 'testuser');
      await page.fill('#passphrase', 'testpass');
      await page.click('#login-btn');
      await expect(page.locator('#authenticated-view')).toBeVisible();

      // Oracle 1: error message surfaced in the itch error element
      await expect(page.locator('#itch-error')).toBeVisible();

      // Oracle 2: URL fragment cleaned — user shouldn't sit on /#error=access_denied
      expect(page.url()).not.toContain('#');
    }
  );
});
