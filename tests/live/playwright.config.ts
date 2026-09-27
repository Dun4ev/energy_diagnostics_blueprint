import { defineConfig } from '@playwright/test';
export default defineConfig({testDir: '.', testMatch: '*.spec.ts', workers: 1, timeout: 60000,
  reporter: 'list', use: {baseURL:'http://127.0.0.1:8080', viewport:{width:1440,height:1000}, trace:'off'},
});
