const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8181';

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.js'],
  timeout: 15000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',

  use: {
    baseURL: BASE_URL,
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
