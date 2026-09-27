import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(here, '../../verification');
const envPath = process.env.QA_ENV_FILE || join(here, '../../infra/.env');
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map(line => {
  const index = line.indexOf('=');
  let value = line.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  return [line.slice(0, index), value];
}));

async function login(page, role) {
  await page.goto('/?choose=1');
  await expect(page.getByText('Вход в демонстрационный контур')).toBeVisible();
  await page.getByLabel('Пользователь').fill(role);
  await page.getByLabel('Пароль').fill(env[`DEMO_${role.toUpperCase()}_PASSWORD`]);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Выберите набор данных' })).toBeVisible();
}

async function openScenario(page, kind, early = false) {
  const card = page.locator('.feature-scenario-grid .panel').filter({ hasText: kind === 'reference' ? 'Иллюстрация презентации' : 'Синтетический расчет' }).first();
  await expect(card).toBeVisible();
  if (early) await card.getByLabel('Время среза').selectOption('early');
  await card.getByRole('button', { name: 'Открыть сценарий' }).click();
  await expect(page).toHaveURL(/\/risks\?run=/);
  await expect(page.getByRole('heading', { name: 'Очередь рисков' })).toBeVisible();
  await expect(page.getByText('Набор подготавливается')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator('.feature-queue')).toHaveCount(1);
  return new URL(page.url()).searchParams.get('run');
}

async function apiJson(page, path) {
  const response = await page.request.get(path);
  expect(response.ok(), `${path}: ${response.status()}`).toBeTruthy();
  return response.json();
}

async function screen(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(screenshotDir, `final-qa-${name}.png`), fullPage: true, animations: 'disabled' });
}

test('independent live UI and API acceptance', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const badResponses = [];
  const externalRequests = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 500) badResponses.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => { if (new URL(request.url()).origin !== 'http://127.0.0.1:8080') externalRequests.push(request.url()); });
  const browserFacts = await page.evaluate(() => ({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, dpr: devicePixelRatio, fonts: document.fonts.check('16px Inter') ? 'Inter available' : 'Inter fallback' }));
  console.log(`BROWSER ${browser.version()} ${JSON.stringify(browserFacts)}`);
  await login(page, 'engineer');

  const referenceRun = await openScenario(page, 'reference');
  expect(await page.locator('body').innerText()).toContain('REFERENCE');
  const referenceQueue = await apiJson(page, `/api/v1/risks?scenarioRunId=${referenceRun}&includeNormal=true`);
  expect(referenceQueue.mode).toBe('reference');
  const referenceCaseId = referenceQueue.data.items.find(item => item.caseId)?.caseId;
  expect(referenceCaseId).toBeTruthy();
  await page.goto(`/diagnostics/cases/${referenceCaseId}?run=${referenceRun}`);
  await expect(page.getByText('Иллюстрация презентации').first()).toBeVisible();
  await expect(page.getByText('7,2/10', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'График измеренной и ожидаемой температуры' }).locator('svg')).toBeVisible();
  expect(await page.locator('body').innerText()).toContain('Не рассчитывается');
  await screen(page, 'reference-case-1440');
  const referenceSnapshot = await apiJson(page, `/api/v1/cases/${referenceCaseId}/snapshot?scenarioRunId=${referenceRun}`);
  expect(referenceSnapshot.data.analysis.metrics.failureProbability).toBeNull();
  expect(referenceSnapshot.data.analysis.risk.score).toBe(7.2);
  expect(referenceSnapshot.data.topology.nodes.find(node => node.label.includes('Т-2'))?.state).toBe('unknown');
  const exportPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт JSON' }).click();
  const download = await exportPromise;
  const exportPayload = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(exportPayload.mode).toBe('reference');
  expect(exportPayload.dataTime).toBeTruthy();
  expect(exportPayload.snapshot.analysis.metrics.failureProbability).toBeNull();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.feature-print-meta')).toBeVisible();
  expect(await page.locator('.feature-print-meta').innerText()).toContain('REFERENCE');
  expect(await page.locator('.feature-print-meta').innerText()).toContain('Время данных');
  await page.emulateMedia({ media: 'screen' });

  const referencePlans = await apiJson(page, `/api/v1/work-plans?scenarioRunId=${referenceRun}`);
  const referencePlanId = referencePlans.data.items[0]?.planId;
  if (referencePlanId) {
    await page.goto(`/work-plans/${referencePlanId}?run=${referenceRun}`);
    await expect(page.getByRole('heading', { name: /План проверки/ })).toBeVisible();
    await expect(page.getByText('Иллюстрация презентации').first()).toBeVisible();
    await screen(page, 'reference-plan-1440');
  }

  await page.getByRole('link', { name: 'Сменить набор' }).click();
  await expect(page).toHaveURL(/\?choose=1/);
  const simulationRun = await openScenario(page, 'simulation', true);
  const before = await apiJson(page, `/api/v1/demo/sessions/${simulationRun}`);
  expect(before.data.mode).toBe('simulation');
  expect(before.data.paused).toBe(true);
  await page.getByLabel('Шаг виртуального времени').selectOption('3600');
  await page.getByRole('button', { name: 'Вперед на шаг' }).click();
  await expect.poll(async () => (await apiJson(page, `/api/v1/demo/sessions/${simulationRun}`)).data.revision, { timeout: 120_000 }).toBeGreaterThan(before.data.revision);
  await expect.poll(async () => (await apiJson(page, `/api/v1/demo/sessions/${simulationRun}`)).data.processingStatus, { timeout: 120_000 }).toBe('ready');
  const after = await apiJson(page, `/api/v1/demo/sessions/${simulationRun}`);
  expect(new Date(after.data.virtualTime).getTime() - new Date(before.data.virtualTime).getTime()).toBe(3_600_000);
  const engineer = await apiJson(page, '/api/v1/auth/me');
  const staleAdvance = await page.request.post(`/api/v1/demo/sessions/${simulationRun}/advance`, {
    headers: { Origin: 'http://127.0.0.1:8080', 'Idempotency-Key': crypto.randomUUID(), 'X-CSRF-Token': engineer.csrfToken },
    data: { expectedRevision: before.data.revision, action: 'step', seconds: 300, speed: 1, reason: 'Проверка устаревшей ревизии' },
  });
  expect(staleAdvance.status()).toBe(409);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Очередь рисков' })).toBeVisible();
  await screen(page, 'simulation-queue-1440');
  const simulationQueue = await apiJson(page, `/api/v1/risks?scenarioRunId=${simulationRun}&includeNormal=true`);
  expect(simulationQueue.mode).toBe('simulation');
  expect(simulationQueue.data.items.length).toBeGreaterThan(0);
  expect(simulationQueue.data.items.every(item => item.analysis.mode === 'simulation')).toBe(true);
  expect(simulationQueue.data.items.every(item => item.analysis.metrics.failureProbability === null)).toBe(true);
  expect(simulationQueue.data.items.find(item => item.asset.assetType === 'transformer')?.analysis.risk.score).not.toBe(7.2);
  const simulationCaseId = simulationQueue.data.items.find(item => item.caseId)?.caseId;
  const noCase = simulationQueue.data.items.find(item => !item.caseId);
  expect(noCase).toBeTruthy();
  await page.goto(`/risks?run=${simulationRun}&normal=true`);
  const assetLink = page.locator(`a[href="/assets/${encodeURIComponent(noCase.asset.assetId)}?run=${simulationRun}"]`).first();
  await expect(assetLink).toBeVisible();
  await assetLink.click();
  await expect(page).toHaveURL(new RegExp(`/assets/${encodeURIComponent(noCase.asset.assetId)}`));
  await expect(page.getByRole('heading', { name: noCase.asset.name })).toBeVisible();

  // A second role retains the run URL but receives permissions from its own server session.
  await page.getByRole('button', { name: /Выйти/ }).click();
  await expect(page.getByText('Вход в демонстрационный контур')).toBeVisible();
  await login(page, 'viewer');
  await page.goto(`/risks?run=${simulationRun}`);
  await expect(page.getByRole('heading', { name: 'Очередь рисков' })).toBeVisible();
  expect(await page.locator('body').innerText()).toContain('Наблюдатель');
  await expect(page.getByRole('button', { name: 'Вперед на шаг' })).toBeDisabled();
  const viewer = await apiJson(page, '/api/v1/auth/me');
  const viewerAdvance = await page.request.post(`/api/v1/demo/sessions/${simulationRun}/advance`, {
    headers: { Origin: 'http://127.0.0.1:8080', 'Idempotency-Key': crypto.randomUUID(), 'X-CSRF-Token': viewer.csrfToken },
    data: { expectedRevision: after.data.revision, action: 'step', seconds: 300, speed: 1, reason: 'negative test' },
  });
  expect(viewerAdvance.status()).toBe(403);

  // Cached queue stays visible and marked stale while offline, then recovers.
  await page.route('**/api/v1/**', route => route.abort('failed'));
  await page.reload();
  await expect(page.getByText('Сервер недоступен')).toBeVisible();
  await expect(page.getByText('Показана сохраненная очередь')).toBeVisible();
  await screen(page, 'offline-queue-1440');
  await page.unroute('**/api/v1/**');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Очередь рисков' })).toBeVisible();
  await expect(page.getByText('Сервер недоступен')).toHaveCount(0);
  expect((await page.evaluate(() => navigator.serviceWorker.getRegistrations())).length).toBe(0);
  await page.getByLabel('Площадка').fill('qa-no-such-site');
  await expect(page.getByText('Нет объектов по фильтрам')).toBeVisible();
  await screen(page, 'empty-queue-1440');
  await page.getByLabel('Площадка').fill('');
  await page.goto(`/diagnostics/cases/qa-nonexistent-case?run=${simulationRun}`);
  await expect(page.getByText('Случай не найден')).toBeVisible();
  await screen(page, 'not-found-1440');
  await page.route('**/api/v1/models?*', async route => { await new Promise(resolve => setTimeout(resolve, 900)); await route.continue(); });
  await page.goto(`/models-and-data?run=${simulationRun}`);
  await expect(page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Численные модели' }) }).getByText('Загружаем данные...')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Модели и данные' })).toBeVisible();
  await page.unroute('**/api/v1/models?*');
  expect(badResponses).toEqual([]);
  expect(consoleErrors.filter(error => !error.includes('Failed to load resource'))).toEqual([]);
  expect(externalRequests).toEqual([]);
  console.log(`RUNS reference=${referenceRun} simulation=${simulationRun} case=${simulationCaseId || 'none'} referencePlan=${referencePlanId || 'none'}`);
  await page.close();
});

test('late-period case decisions, plan and responsive views', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await login(page, 'engineer');
  const run = await openScenario(page, 'simulation');
  const queue = await apiJson(page, `/api/v1/risks?scenarioRunId=${run}&includeNormal=true`);
  const caseId = queue.data.items.find(item => item.caseId)?.caseId;
  expect(caseId).toBeTruthy();
  await page.goto(`/diagnostics/cases/${caseId}?run=${run}`);
  await expect(page.getByRole('heading', { name: queue.data.items.find(item => item.caseId)?.asset.name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Решение по случаю' })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть записи' }).click();
  const evidenceDialog = page.getByRole('dialog', { name: 'Доказательства' });
  await evidenceDialog.getByLabel('Наблюдение').fill('QA: осмотр измерения требуется; это демонстрационная заметка, дефект не доказан.');
  await evidenceDialog.getByLabel('Основание добавления').fill('Независимая проверка UI и следа аудита');
  await evidenceDialog.getByRole('button', { name: 'Сохранить запись' }).click();
  await expect(evidenceDialog).toBeHidden();
  const withEvidence = await apiJson(page, `/api/v1/cases/${caseId}/snapshot?scenarioRunId=${run}`);
  expect(withEvidence.data.evidence.length).toBeGreaterThan(0);
  expect(withEvidence.data.case.state).toBe('detected');

  for (const [target, label] of [
    ['under_review', 'На рассмотрении'],
    ['awaiting_evidence', 'Ожидает доказательств'],
    ['confirmed', 'Подтвержден человеком'],
  ]) {
    await expect(page.getByRole('button', { name: 'Решение по случаю' })).toBeVisible();
    await page.getByRole('button', { name: 'Решение по случаю' }).click();
    const dialog = page.getByRole('dialog', { name: 'Решение по случаю' });
    await dialog.getByLabel('Новое состояние').selectOption(target);
    await dialog.getByLabel('Основание').fill(`Независимый QA: переход ${target} на основании добавленной заметки`);
    await dialog.getByRole('checkbox', { name: /QA: осмотр измерения требуется/ }).check();
    await dialog.getByRole('button', { name: 'Записать решение' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  const confirmed = await apiJson(page, `/api/v1/cases/${caseId}/snapshot?scenarioRunId=${run}`);
  expect(confirmed.data.case.state).toBe('confirmed');
  expect(confirmed.data.case.revision).toBeGreaterThan(withEvidence.data.case.revision);
  await screen(page, 'simulation-case-1440');

  await page.getByRole('button', { name: 'Создать проект проверки' }).click();
  const project = page.getByRole('dialog', { name: 'Проект проверочных мероприятий' });
  await project.getByLabel('Основание проекта').fill('Независимый QA: проект проверки после решения инженера');
  await project.getByRole('button', { name: 'Создать проект', exact: true }).click();
  await expect(page).toHaveURL(/\/work-plans\/[^/]+\?run=/);
  const planId = page.url().match(/\/work-plans\/([^?]+)/)?.[1];
  const planEnvelope = await apiJson(page, `/api/v1/work-plans/${planId}?scenarioRunId=${run}`);
  expect(planEnvelope.data.caseId).toBe(caseId);
  expect(planEnvelope.data.analysisRunId).toBe(confirmed.data.analysis.analysisRunId);
  await screen(page, 'simulation-plan-1440');

  const engineer = await apiJson(page, '/api/v1/auth/me');
  const staleSubmit = await page.request.post(`/api/v1/work-plans/${planId}/submit?scenarioRunId=${run}`, {
    headers: { Origin: 'http://127.0.0.1:8080', 'Idempotency-Key': crypto.randomUUID(), 'X-CSRF-Token': engineer.csrfToken },
    data: { expectedRevision: planEnvelope.data.revision + 1, analysisRunId: planEnvelope.data.analysisRunId,
      evidenceRevision: planEnvelope.data.evidenceRevision, evidenceIds: [], reason: 'Проверка stale submit' },
  });
  expect(staleSubmit.status()).toBe(409);
  const viewerPage = await browser.newPage();
  await login(viewerPage, 'viewer');
  await viewerPage.goto(`/work-plans/${planId}?run=${run}`);
  await expect(viewerPage.getByRole('heading', { name: /План проверки/ })).toBeVisible();
  await expect(viewerPage.getByRole('button', { name: 'Передать на согласование' })).toHaveCount(0);
  const viewer = await apiJson(viewerPage, '/api/v1/auth/me');
  const deniedApproval = await viewerPage.request.post(`/api/v1/work-plans/${planId}/decisions?scenarioRunId=${run}`, {
    headers: { Origin: 'http://127.0.0.1:8080', 'Idempotency-Key': crypto.randomUUID(), 'X-CSRF-Token': viewer.csrfToken },
    data: { expectedRevision: planEnvelope.data.revision, analysisRunId: planEnvelope.data.analysisRunId,
      evidenceRevision: planEnvelope.data.evidenceRevision, evidenceIds: [], reason: 'Проверка прав viewer', action: 'approved' },
  });
  expect(deniedApproval.status()).toBe(403);
  await viewerPage.close();

  const paths = [
    ['queue', `/risks?run=${run}`],
    ['case', `/diagnostics/cases/${caseId}?run=${run}`],
    ['plan', `/work-plans/${planId}?run=${run}`],
  ];
  for (const [width, height] of [[390, 844], [1024, 768], [1440, 1000], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const [name, path] of paths) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('.loading-state')).toHaveCount(0);
      const layout = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      expect(layout.scrollWidth, `${name} ${width}: document overflow ${JSON.stringify(layout)}`).toBeLessThanOrEqual(width + 2);
      await screen(page, `${name}-${width}`);
    }
    if (width === 390) {
      await page.getByRole('button', { name: 'Открыть меню' }).click();
      await expect(page.getByRole('navigation', { name: 'Главная навигация' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/work-plans/${planId}?run=${run}`);
  await expect(page.getByRole('button', { name: 'Передать на согласование' })).toBeVisible();
  const current = await apiJson(page, `/api/v1/cases/${caseId}/snapshot?scenarioRunId=${run}`);
  const lateEvidence = await page.request.post(`/api/v1/evidence?scenarioRunId=${run}`, {
    headers: { Origin: 'http://127.0.0.1:8080', 'Idempotency-Key': crypto.randomUUID(), 'X-CSRF-Token': engineer.csrfToken },
    data: { caseId, expectedRevision: current.data.case.evidenceRevision, reason: 'Проверка конкурентного обновления',
      observedAt: current.data.analysis.asOf, kind: 'note', text: 'QA: новая запись после открытия формы плана',
      measurement: null, origin: 'synthetic' },
  });
  expect(lateEvidence.status()).toBe(200);
  await page.getByRole('button', { name: 'Передать на согласование' }).click();
  const submitDialog = page.getByRole('dialog', { name: 'Передать на согласование' });
  await submitDialog.getByLabel('Основание').fill('Проверка сообщения об устаревшей форме');
  await submitDialog.getByRole('button', { name: 'Записать решение' }).click();
  await expect(submitDialog.getByText('Ревизия анализа, доказательств или плана изменилась. Проверьте обновленные данные.')).toBeVisible();
  await screen(page, 'stale-plan-409');
  await page.goto(`/diagnostics/cases/${caseId}?run=${run}`);
  await page.evaluate(() => { document.documentElement.style.zoom = '125%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1442);
  await screen(page, 'case-1440-zoom125');
  console.log(`LATE_RUN ${run} case=${caseId} plan=${planId}`);
  await page.close();
});

test('browser offline event preserves cached SPA navigation and restores actions', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await login(page, 'engineer');
  const run = await openScenario(page, 'simulation');
  const queue = await apiJson(page, `/api/v1/risks?scenarioRunId=${run}&includeNormal=true`);
  const caseEntry = queue.data.items.find(item => item.caseId);
  expect(caseEntry).toBeTruthy();
  await page.goto(`/diagnostics/cases/${caseEntry.caseId}?run=${run}`);
  await expect(page.getByRole('img', { name: 'График измеренной и ожидаемой температуры' }).locator('svg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Решение по случаю' })).toBeVisible();
  await screen(page, 'case-mobile-chart-polish');
  await page.context().setOffline(true);
  await expect(page.getByText('Нет сети')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Решение по случаю' })).toHaveCount(0);
  await screen(page, 'case-mobile-native-offline');
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('navigation', { name: 'Главная навигация' }).getByRole('link', { name: 'Очередь рисков' }).click();
  await expect(page.getByRole('heading', { name: 'Очередь рисков' })).toBeVisible();
  await expect(page.getByText('Показана сохраненная очередь')).toBeVisible();
  await screen(page, 'queue-mobile-native-offline');
  await page.context().setOffline(false);
  await expect(page.getByText('Нет сети')).toHaveCount(0);
  await expect(page.getByText('Показана сохраненная очередь')).toHaveCount(0);
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('navigation', { name: 'Главная навигация' }).getByRole('link', { name: 'Диагностика' }).click();
  await expect(page.getByRole('heading', { name: 'Случаи' })).toBeVisible();
  console.log(`OFFLINE_RUN ${run}`);
  await page.close();
});
