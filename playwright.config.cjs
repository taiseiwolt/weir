// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testMatch: 'e2e-*.spec.cjs',
  timeout: 30000,
  use: {
    headless: true,
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
