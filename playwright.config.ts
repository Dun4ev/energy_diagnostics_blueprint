import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', use: { baseURL: 'http://127.0.0.1:8080', viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow' },
  reporter: 'list',
});
