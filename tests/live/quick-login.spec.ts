import { test, expect } from '@playwright/test';

test('quick roles preserve the populated run and enforce viewer permissions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/risks?run=reference-slide29');
  await expect(page.getByRole('group', { name: 'Тестовые пользователи' })).toBeVisible();
  await page.getByRole('group', { name: 'Тестовые пользователи' }).getByRole('button', { name: 'Инженер', exact: true }).click();
  await expect(page.locator('.profile strong')).toHaveText('DEMO engineer');
  await expect(page.getByRole('heading', { name: 'Очередь рисков', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /ТП-177/ }).click();
  const caseUrl = page.url();
  for (const [label, role] of [['Согласующий', 'approver'], ['Исполнитель', 'technician'], ['Администратор', 'admin'], ['Наблюдатель', 'viewer'], ['Инженер', 'engineer']]) {
    await page.getByRole('button', { name: 'Сменить пользователя', exact: true }).click();
    await page.getByRole('group', { name: 'Тестовые пользователи' }).getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.profile strong')).toHaveText(`DEMO ${role}`);
    await expect(page).toHaveURL(caseUrl);
    await expect(page.getByRole('heading', { name: /ТП-177/ })).toBeVisible();
    if (role === 'viewer') {
      const identity = await page.request.get('/api/v1/auth/me');
      expect((await identity.json()).permissions).toEqual(['read']);
    }
  }
  await page.getByRole('button', { name: 'Сменить пользователя', exact: true }).click();
  await page.screenshot({ path: 'verification/quick-login-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await expect(page.getByRole('group', { name: 'Тестовые пользователи' })).toBeVisible();
  await page.screenshot({ path: 'verification/quick-login-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByLabel('Пароль', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Тестовые пользователи' })).toBeVisible();
  expect(errors).toEqual([]);
});
