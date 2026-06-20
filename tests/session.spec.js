const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8181';
const SYNC_PATTERN = '**/api/sync/**';

test.describe('T-SESSION: SessionStore auto-login', () => {
  test('T-SESSION-01: page reload with valid sessionStorage entry re-authenticates without user interaction', async ({ page }) => {
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }));

    await page.goto(BASE);
    await page.fill('#username', 'sessionuser');
    await page.fill('#passphrase', 'sessionpass');
    await page.click('#login-btn');
    await expect(page.locator('#authenticated-view')).toBeVisible();

    // sessionStorage persists across same-tab navigations
    const storedSession = await page.evaluate(() => sessionStorage.getItem('ml_session'));
    expect(storedSession).not.toBeNull();
    const parsed = JSON.parse(storedSession);
    expect(parsed.username).toBe('sessionuser');
    expect(parsed.passphrase).toBe('sessionpass');

    // Reload — auto-login should fire from sessionStorage, no form interaction
    await page.reload();

    // Oracle: authenticated view visible immediately without filling the form
    await expect(page.locator('#authenticated-view')).toBeVisible();
    await expect(page.locator('#unauthenticated-view')).toBeHidden();
    await expect(page.locator('#welcome-msg')).toContainText('sessionuser');
  });

  test('T-SESSION-02: logout clears sessionStorage so next page load shows login form', async ({ page }) => {
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }));

    await page.goto(BASE);
    await page.fill('#username', 'sessionuser');
    await page.fill('#passphrase', 'sessionpass');
    await page.click('#login-btn');
    await expect(page.locator('#authenticated-view')).toBeVisible();

    await page.click('#logout-btn');
    await expect(page.locator('#unauthenticated-view')).toBeVisible();

    // Oracle: sessionStorage key must be absent after logout
    const storedAfterLogout = await page.evaluate(() => sessionStorage.getItem('ml_session'));
    expect(storedAfterLogout).toBeNull();

    // Reload — must show login form, NOT auto-login
    await page.reload();
    await expect(page.locator('#unauthenticated-view')).toBeVisible();
    await expect(page.locator('#authenticated-view')).toBeHidden();
  });

  test('T-SESSION-03: stale sessionStorage with bad credentials is cleared gracefully — no loop, login form shown', async ({ page }) => {
    // Seed sessionStorage with credentials that will fail decryption.
    // The server returns a valid-looking encrypted blob, but the stored passphrase
    // is wrong so decrypt() will throw. clearSession() must fire and the login
    // form must appear — not an error loop and not a blank screen.
    await page.goto(BASE);

    const WRONG_PASSPHRASE_SESSION = JSON.stringify({
      username: 'staleuser',
      passphrase: 'this-passphrase-is-wrong',
    });

    // Plant stale creds into sessionStorage before any route is active
    await page.evaluate((session) => {
      sessionStorage.setItem('ml_session', session);
    }, WRONG_PASSPHRASE_SESSION);

    // Server returns an encrypted blob (from a different passphrase) — decrypt will fail
    const GARBAGE_BLOB = JSON.stringify({ iv: 'dGVzdGl2', ciphertext: 'dGVzdGNpcGhlcg' });
    await page.route(SYNC_PATTERN, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: GARBAGE_BLOB }),
      headers: { ETag: '"stale-etag"' },
    }));

    await page.reload({ waitUntil: 'networkidle' });

    // Oracle: login form shown — not authenticated, no JS crash, no empty page
    await expect(page.locator('#unauthenticated-view')).toBeVisible();
    await expect(page.locator('#authenticated-view')).toBeHidden();

    // Oracle: stale session cleared — another reload must not retry the bad creds
    const storedAfterFail = await page.evaluate(() => sessionStorage.getItem('ml_session'));
    expect(storedAfterFail).toBeNull();

    // Oracle: no error text injected into the login form by the auto-login failure
    await expect(page.locator('#login-error')).toBeHidden();
  });
});
