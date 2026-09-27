import { expect, test } from '@playwright/test';
for (const [width, height] of [[1440,1000],[1920,1080],[1024,768],[390,844]]) {
  test(`gallery ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/gallery');
    await expect(page.getByRole('heading', { name: 'Единое рабочее пространство' })).toBeVisible();
    await expect(page.getByText('24.07.2026, 10:42')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `verification/shell-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Проверить диалог' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByPlaceholder('Комментарий инженера').fill('Проверка клавиатуры');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Проверить диалог' })).toBeFocused();
  });
}
test('gallery 125 percent and logo fallback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/gallery');
  await page.evaluate(() => { document.documentElement.style.zoom = '1.25'; });
  await expect(page.getByRole('link', { name: 'Длинное название демонстрационной энергетической организации' })).toBeVisible();
  await page.screenshot({ path: 'verification/shell-125.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
