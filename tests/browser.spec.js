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
});
