const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8181';
const SYNC_PATTERN = '**/api/sync/**';

test.describe('T-HTML: index.html auth state machine', () => {
  test('T-HTML-01: unauthenticated view visible on load, authenticated view hidden', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('#unauthenticated-view')).toBeVisible();
    await expect(page.locator('#authenticated-view')).toBeHidden();
  });

  test('T-HTML-02: successful login shows authenticated view with username', async ({ page }) => {
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
    await expect(page.locator('#unauthenticated-view')).toBeHidden();
    await expect(page.locator('#welcome-msg')).toContainText('testuser');
  });

  test('T-HTML-03: login error displays on failure, clears on retry success', async ({ page }) => {
    let callCount = 0;
    await page.route(SYNC_PATTERN, route => {
      callCount++;
      if (callCount === 1) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error' }),
        });
      }
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
    });

    await page.goto(BASE);
    await page.fill('#username', 'testuser');
    await page.fill('#passphrase', 'testpass');
    await page.click('#login-btn');

    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).not.toBeEmpty();

    await page.click('#login-btn');

    await expect(page.locator('#authenticated-view')).toBeVisible();
    await expect(page.locator('#login-error')).toBeHidden();
  });

  test('T-HTML-02b: logout returns to unauthenticated view', async ({ page }) => {
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

    await page.route('**/api/sync/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
      headers: { 'ETag': '"fakeetag"' },
    }));

    await page.click('#logout-btn');
    await expect(page.locator('#unauthenticated-view')).toBeVisible();
    await expect(page.locator('#authenticated-view')).toBeHidden();
  });

  test('T-HTML-05: Steam connect button visible after login, library section hidden', async ({ page }) => {
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
    await expect(page.locator('#steam-connect-btn')).toBeVisible();
    await expect(page.locator('#steam-library')).toBeHidden();
  });

  test('T-HTML-06: steam:connected event renders library section and hides connect button', async ({ page }) => {
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
      document.dispatchEvent(new CustomEvent('steam:connected', {
        detail: {
          games: [{ appid: 1, name: 'Test Game', img_icon_url: '', playtime_forever: 0 }],
        },
      }));
    });

    await expect(page.locator('#steam-library')).toBeVisible();
    await expect(page.locator('#steam-connect-btn')).toBeHidden();
    // Oracle: singular "1 game", not "1 games"
    await expect(page.locator('#steam-game-count')).toContainText('1 game');
    await expect(page.locator('#steam-game-count')).not.toContainText('1 games');
    await expect(page.locator('.game-card')).toHaveCount(1);
    await expect(page.locator('.game-card')).toContainText('Test Game');
  });

  test('T-HTML-07: steam_error URL param displays error message after login', async ({ page }) => {
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }));

    // Navigate with steam_error in URL (user cancelled Steam login)
    await page.goto(`${BASE}/?steam_error=Steam+login+cancelled`);
    await page.fill('#username', 'testuser');
    await page.fill('#passphrase', 'testpass');
    await page.click('#login-btn');

    await expect(page.locator('#authenticated-view')).toBeVisible();
    // Oracle: error text populated from URL param
    await expect(page.locator('#steam-error')).toHaveText('Steam login cancelled');
    // Oracle: URL cleaned — no steam_error param remains
    await expect(page).toHaveURL(BASE + '/');
  });

  test('T-HTML-08: Steam disconnect returns to connect-button state', async ({ page }) => {
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

    // Connect Steam via event (same pattern as T-HTML-06)
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('steam:connected', {
        detail: {
          games: [{ appid: 1, name: 'Test Game', img_icon_url: '', playtime_forever: 0 }],
        },
      }));
    });
    await expect(page.locator('#steam-library')).toBeVisible();
    await expect(page.locator('#steam-connect-btn')).toBeHidden();

    // Route the saveState POST (disconnect writes back the blob)
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
      headers: { ETag: '"after-disconnect"' },
    }));

    await page.click('#steam-disconnect-btn');

    // Oracle: library hidden, connect button restored
    await expect(page.locator('#steam-library')).toBeHidden();
    await expect(page.locator('#steam-connect-btn')).toBeVisible();
  });

  test('T-HTML-09: login with existing Steam state renders library without re-connecting', async ({ page }) => {
    // Build a real encrypted blob in the browser context using WebCrypto —
    // same algorithm as crypto.js (PBKDF2-SHA256 310k, AES-GCM-256, salt 'ei-the-answer-is-42').
    // We route the sync GET to return this blob so AuthManager decrypts it on login.
    // crypto.subtle requires a secure context: page.goto(localhost) first, then evaluate.
    const SALT = 'ei-the-answer-is-42';
    const ITERATIONS = 310000;
    const USERNAME = 'returning';
    const PASSPHRASE = 'testpass';
    const STEAM_STATE = {
      steam: { steamId: '76561198000000001', games: [{ appid: 2, name: 'Half-Life 2', img_icon_url: '', playtime_forever: 120 }] },
      epic: null, itch: null,
      lastSync: { steam: '2026-06-17T00:00:00.000Z' },
    };

    // Load the page first to enter a secure context, then generate the blob
    await page.goto('http://localhost:8181');

    // Generate the encrypted blob using the same WebCrypto primitives as crypto.js
    const encryptedBlob = await page.evaluate(
      async ({ username, passphrase, salt, iterations, state }) => {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw', enc.encode(username + ':' + passphrase), 'PBKDF2', false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
          keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          enc.encode(JSON.stringify(state))
        );
        const toBase64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return { iv: toBase64url(iv), ciphertext: toBase64url(ciphertext) };
      },
      { username: USERNAME, passphrase: PASSPHRASE, salt: SALT, iterations: ITERATIONS, state: STEAM_STATE }
    );

    // Route sync to return our pre-encrypted blob, then reload so the route is active from load
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: JSON.stringify(encryptedBlob) }),
      headers: { ETag: '"existing-state-etag"' },
    }));

    await page.goto('http://localhost:8181');
    await page.fill('#username', USERNAME);
    await page.fill('#passphrase', PASSPHRASE);
    await page.click('#login-btn');

    await expect(page.locator('#authenticated-view')).toBeVisible();
    // Oracle: library section visible immediately — no connect flow needed
    await expect(page.locator('#steam-library')).toBeVisible();
    await expect(page.locator('#steam-connect-btn')).toBeHidden();
    await expect(page.locator('#steam-game-count')).toContainText('1 game');
    await expect(page.locator('.game-card')).toContainText('Half-Life 2');
  });

  test('T-HTML-10: steam callback with private Steam profile shows steam error', async ({ page }) => {
    // Stub sync to simulate a logged-in user with no existing Steam state
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }));

    // Stub games endpoint to simulate a private Steam profile (404)
    await page.route('**/api/steam/games**', route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'No games found (profile may be private)' }),
    }));

    // Navigate with steam_connected=1 in URL (post-callback redirect from server)
    await page.goto(`${BASE}/?steam_connected=1&steamid=76561198000000000`);
    await page.fill('#username', 'testuser');
    await page.fill('#passphrase', 'testpass');
    await page.click('#login-btn');

    await expect(page.locator('#authenticated-view')).toBeVisible();
    // Oracle: steam:error fired → #steam-error populated; library section stays hidden
    await expect(page.locator('#steam-error')).not.toBeEmpty();
    await expect(page.locator('#steam-library')).toBeHidden();
    // Oracle: URL cleaned after failed callback
    await expect(page).toHaveURL(BASE + '/');
  });

  test('T-HTML-11: Epic connect section visible after login, Epic library hidden', async ({ page }) => {
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
    await expect(page.locator('#epic-connect-section')).toBeVisible();
    await expect(page.locator('#epic-library')).toBeHidden();
  });

  test('T-HTML-12: epic:connected event renders Epic library section and hides connect section', async ({ page }) => {
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
      document.dispatchEvent(new CustomEvent('epic:connected', {
        detail: {
          games: [{ appid: 'AAA', name: 'Fortnite', platform: 'epic' }],
          accountId: 'acct123',
        },
      }));
    });

    await expect(page.locator('#epic-library')).toBeVisible();
    await expect(page.locator('#epic-connect-section')).toBeHidden();
    // Oracle: always plural for Epic ("1 games"), no singular special-case
    await expect(page.locator('#epic-game-count')).toHaveText('Epic: 1 games');
    await expect(page.locator('.game-card')).toHaveCount(1);
    await expect(page.locator('.game-card')).toContainText('Fortnite');
  });

  test('T-HTML-13: epic:error event displays error message', async ({ page }) => {
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
      document.dispatchEvent(new CustomEvent('epic:error', {
        detail: { message: 'Epic connect failed' },
      }));
    });

    await expect(page.locator('#epic-error')).toHaveText('Epic connect failed');
  });

  test('T-HTML-14: Epic disconnect returns to connect-section state', async ({ page }) => {
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

    // Connect Epic via event (same pattern as T-HTML-12)
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('epic:connected', {
        detail: {
          games: [{ appid: 'AAA', name: 'Fortnite', platform: 'epic' }],
          accountId: 'acct123',
        },
      }));
    });
    await expect(page.locator('#epic-library')).toBeVisible();
    await expect(page.locator('#epic-connect-section')).toBeHidden();

    // Route the saveState POST (disconnect writes back the blob)
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
      headers: { ETag: '"after-disconnect"' },
    }));

    await page.click('#epic-disconnect-btn');

    // Oracle: library hidden, connect section restored
    await expect(page.locator('#epic-library')).toBeHidden();
    await expect(page.locator('#epic-connect-section')).toBeVisible();
  });

  test('T-HTML-15: itch connect section visible after login, itch library hidden', async ({ page }) => {
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

  test('T-HTML-16: itch:connected event renders itch library section and hides connect section', async ({ page }) => {
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
          games: [{ appid: 1, name: 'Celeste', platform: 'itch' }],
        },
      }));
    });

    await expect(page.locator('#itch-library')).toBeVisible();
    await expect(page.locator('#itch-connect-section')).toBeHidden();
    // Oracle: itch.io game count always plural — no singular special-case
    await expect(page.locator('#itch-game-count')).toContainText('games');
  });

  test('T-HTML-17: itch:error event displays error message', async ({ page }) => {
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
        detail: { message: 'test itch error' },
      }));
    });

    await expect(page.locator('#itch-error')).toContainText('test itch error');
  });

  test('T-HTML-18: itch disconnect returns to connect-section state', async ({ page }) => {
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
          games: [{ appid: 1, name: 'Celeste', platform: 'itch' }],
        },
      }));
    });
    await expect(page.locator('#itch-library')).toBeVisible();
    await expect(page.locator('#itch-connect-section')).toBeHidden();

    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
      headers: { ETag: '"after-itch-disconnect"' },
    }));

    await page.click('#itch-disconnect-btn');

    // Oracle: library hidden, connect section restored
    await expect(page.locator('#itch-library')).toBeHidden();
    await expect(page.locator('#itch-connect-section')).toBeVisible();
  });
});
