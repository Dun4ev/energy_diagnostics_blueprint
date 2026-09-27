import { test, expect } from '@playwright/test';
test('foundation is honest and connected to PostgreSQL', async ({ page, request }) => {
  const health = await request.get('/api/v1/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ database: 'ready', businessRuntime: 'not_implemented', controlCommandsAllowed: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ЭнергоДиагностика · DEMO' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Backend и PostgreSQL доступны');
  await expect(page.getByText('Диагностика, replay и согласование еще не реализованы.')).toBeVisible();
  expect((await request.get('/api/v1/risks?scenarioRunId=reference-slide29')).status()).toBe(501);
});
