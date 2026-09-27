import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const credentials = Object.fromEntries(fs.readFileSync('infra/.env', 'utf8').split('\n').filter(line => line.includes('=') && !line.startsWith('#')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const smoke = JSON.parse(fs.readFileSync('verification/live-replay-smoke.json', 'utf8'));
test('lost create response retries the same plan without a duplicate', async ({ page }) => {
  await page.goto(`/risks?run=${smoke.simulation.run}`);
  await page.getByLabel('Пользователь', {exact:true}).fill('engineer');
  await page.getByLabel('Пароль', {exact:true}).fill(credentials.DEMO_ENGINEER_PASSWORD);
  await page.getByRole('button', {name:'Войти',exact:true}).click();
  await page.getByRole('link', {name:/ТП-177/}).click();
  await page.getByRole('button', {name:'Создать проект проверки'}).click();
  const dialog = page.getByRole('dialog', {name:'Проект проверочных мероприятий'});
  await dialog.getByLabel('Основание проекта').fill('Проверка повторной отправки после потери ответа');
  const requests: {key:string|undefined;body:string|null;plan:string}[] = [];
  await page.route('**/api/v1/work-plans?*', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const result = await response.json();
    requests.push({key:route.request().headers()['idempotency-key'],body:route.request().postData(),plan:result.data.planId});
    if (requests.length === 1) await route.abort('failed');
    else await route.fulfill({response});
  });
  await dialog.getByRole('button', {name:'Создать проект',exact:true}).click();
  await expect(dialog.getByText('Нет связи с сервером.', {exact:true})).toBeVisible();
  await dialog.getByRole('button', {name:'Создать проект',exact:true}).click();
  await expect(page.getByRole('heading', {name:/План проверки/})).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0].key).toBeTruthy();
  expect(requests[1]).toEqual(requests[0]);
});
