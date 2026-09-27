import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'acceptance.spec.mjs',
  workers: 1,
  reporter: 'list',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: { baseURL: process.env.QA_BASE_URL || 'http://127.0.0.1:8080', browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
});
