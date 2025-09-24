const { test, expect } = require('@playwright/test');

// Test auth flow
test('passwordless auth flow', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Enter email
  await page.fill('#email-input', 'test@example.com');
  await page.click('#email-form button[type="submit"]');

  // Wait for pending state
  await expect(page.locator('[data-auth-state="pending"]')).toBeVisible();

  // Simulate validation - manually set localStorage or mock API
  // For full test, mock /api/auth/validate response
  await page.evaluate(() => {
    localStorage.setItem('flare_auth_state', 'validated');
    localStorage.setItem('flare_user_id', 'test-user');
    location.reload();
  });

  // Check dashboard
  await expect(page.locator('[data-auth-state="validated"]')).toBeVisible();
  await expect(page.locator('#platforms-grid')).toBeVisible();

  // Connect platform mock
  await page.click('[data-platform="steam"] .connect-btn');
  // Wait for window or mock

  // Load games mock
  await page.evaluate(() => {
    // Mock games load
  });

  await expect(page.locator('.game-grid')).toBeVisible();
});