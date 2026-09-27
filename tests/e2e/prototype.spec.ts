import { test, expect } from '@playwright/test';
test('local prototype is ready, advisory and requires server login', async ({ page, request }) => {
  const health = await request.get('/api/v1/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ database: 'ready', businessRuntime: 'ready', controlCommandsAllowed: false, externalAiEnabled: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Вход в демонстрационный контур' })).toBeVisible();
  await expect(page.getByLabel('Пользователь', { exact: true })).toBeVisible();
  expect((await request.get('/api/v1/risks?scenarioRunId=reference-slide29')).status()).toBe(401);
});
