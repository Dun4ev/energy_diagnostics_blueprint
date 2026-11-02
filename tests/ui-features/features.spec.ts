import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'contracts/fixtures/reference-snapshot.json'), 'utf8'));
const chart = JSON.parse(fs.readFileSync(path.join(root, 'contracts/examples/reference-chart-reconstruction.json'), 'utf8'));
const topology = JSON.parse(fs.readFileSync(path.join(root, 'contracts/examples/reference-topology.json'), 'utf8'));
snapshot.data.topology = { label: 'Схема модели; состояние не подтверждено',
  nodes: topology.nodes.map((node: { id: string; label: string; state: string }) => ({ nodeId: node.id, label: node.label, state: node.state,
    origin: 'model', observedAt: snapshot.dataTime, assetId: null })),
  edges: topology.edges.map((edge: { from: string; to: string }) => ({ source: edge.from, target: edge.to,
    state: edge.to === 'tp177-t2' ? 'unknown' : 'energized' })) };
const session = { ...snapshot, data: {
  scenarioRunId: snapshot.scenarioRunId, datasetId: 'reference-slide29', seed: 20260925,
  mode: 'reference', virtualTime: snapshot.dataTime, replayReceivedAt: snapshot.dataTime,
  speed: 1, paused: true, revision: 1, processingStatus: 'ready', processingError: null, processedAt: snapshot.dataTime,
} };
const identity = { actorId: 'viewer-demo', displayName: 'Инженер (просмотр)', role: 'viewer', permissions: ['read'], csrfToken: 'review-only' };
const risk = { asset: snapshot.data.asset, caseId: snapshot.data.case.caseId, analysis: snapshot.data.analysis, assignedTo: null, nextDueAt: null };
const points = chart.points.map((point: { eventTime: string; observedC: number; expectedC: number }) => ({
  eventTime: point.eventTime, observedC: point.observedC, expectedC: point.expectedC,
  residualC: point.observedC - point.expectedC, loadFraction: null, ambientC: null,
  quality: 'good', sourceIds: [], historicalLowerC: null, historicalUpperC: null,
}));
const envelope = (data: unknown) => ({ ...snapshot, data });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    let payload: unknown = { code: 'NOT_FOUND', message: 'Нет записи в reference fixture', details: {}, requestId: 'ui-review' };
    let status = 200;
    if (pathname === '/api/v1/auth/me') payload = identity;
    else if (pathname === '/api/v1/demo/sessions/reference-slide29') payload = session;
    else if (pathname === '/api/v1/risks') payload = envelope({ items: [risk], total: 1, offset: 0, limit: 50 });
    else if (pathname === '/api/v1/cases/AG-2026-017/snapshot') payload = snapshot;
    else if (pathname === '/api/v1/cases/AG-2026-017/series') {
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const selected = points.filter((point: { eventTime: string }) => point.eventTime >= from && point.eventTime <= to);
      const offset = Number(url.searchParams.get('offset') || 0);
      payload = envelope({ items: selected.slice(offset, offset + 8), total: selected.length, offset, limit: 8 });
    }
    else if (pathname === '/api/v1/cases/AG-2026-017/history') payload = envelope({ items: [], total: 0, offset: 0, limit: 50 });
    else if (pathname === '/api/v1/work-plans') payload = envelope({ items: [], total: 0, offset: 0, limit: 50 });
    else status = 404;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
  });
});

async function openPreview(page: import('@playwright/test').Page, route: string) {
  await page.goto(route);
  await expect(page.locator('#root')).toBeVisible();
}

test('risk queue and case share one analysis and reference labeling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPreview(page, '/risks?run=reference-slide29');
  await expect(page.getByRole('heading', { name: 'Очередь рисков' })).toBeVisible();
  await page.getByText('Идентификатор расчета').click();
  await expect(page.getByText('reference-ag-2026-017-r1')).toBeVisible();
  await expect(page.getByText('7,2/10')).toBeVisible();
  await page.screenshot({ path: path.join(root, 'tests/ui-features/screenshots/queue-1440.png'), fullPage: true });
  await page.getByRole('link', { name: /ТП-177 \/ Т-1/ }).first().click();
  await openPreview(page, '/diagnostics/cases/AG-2026-017?run=reference-slide29');
  await page.getByText('Технические сведения случая', { exact: true }).click();
  await expect(page.locator('.case-technical-details')).toContainText('reference-ag-2026-017-r1');
  await expect(page.getByText('Иллюстрация презентации').first()).toBeVisible();
  await expect(page.getByText('Вероятность отказа', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Синхронизированные графики/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Схема связей оборудования/ })).toBeVisible();
  await expect(page.getByText('Состояние неизвестно', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(`Показано точек: ${points.length} из ${points.length}.`)).toBeVisible();
  await page.getByRole('button', { name: 'Открыть записи', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.screenshot({ path: path.join(root, 'tests/ui-features/screenshots/case-1440.png'), fullPage: true });
});

test('case is readable at 1920 and narrow width without document overflow', async ({ page }) => {
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await openPreview(page, '/diagnostics/cases/AG-2026-017?run=reference-slide29');
    await expect(page.getByRole('heading', { name: 'ТП-177 / Т-1' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Синхронизированные графики/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: path.join(root, `tests/ui-features/screenshots/case-${width}.png`), fullPage: true });
  }
});

test('plan decisions preserve server state on 409 and 403', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const simAnalysis = {
    ...snapshot.data.analysis, analysisRunId: 'sim-analysis-1', scenarioRunId: 'sim-run',
    mode: 'simulation', calculationOrigin: 'computed', modelVersion: 'test-model', policyVersion: 'test-policy',
    status: 'insufficient_data', metrics: { ...snapshot.data.analysis.metrics,
      observedTemperatureC: null, expectedTemperatureC: null, residualC: null,
      loadFraction: null, ambientC: null, slopeCPerDay: null, trendWindowHours: null },
    risk: { score: null, scaleMax: 10, priority: 'unknown', label: 'Недостаточно данных', probabilistic: false },
    hypotheses: [], nextActions: [],
  };
  const caseSnapshot = { ...snapshot, mode: 'simulation', scenarioRunId: 'sim-run', data: {
    ...snapshot.data, case: { ...snapshot.data.case, caseId: 'case-1', scenarioRunId: 'sim-run', analysisRunId: 'sim-analysis-1' },
    analysis: simAnalysis,
  } };
  const plan = { planId: 'plan-1', caseId: 'case-1', scenarioRunId: 'sim-run', analysisRunId: 'sim-analysis-1',
    evidenceRevision: 1, revision: 2, authorId: 'engineer', state: 'submitted', staleReview: false,
    steps: [{ stepId: 'step-1', number: 1, actionCode: 'VERIFY_TELEMETRY', description: 'Проверить канал температуры',
      assigneeRole: 'engineer', assigneeId: null, dueAt: null, dueWithinHours: 48, dueAnchor: 'approved_at',
      requiredEvidence: ['Журнал телеметрии'], condition: 'approved_plan', status: 'not_started', resultEvidenceIds: [] }],
  };
  const simEnvelope = (data: unknown) => ({ ...snapshot, mode: 'simulation', scenarioRunId: 'sim-run', data });
  let mutationCount = 0;
  const requests: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let payload: unknown;
    let status = 200;
    if (pathname === '/api/v1/auth/me') payload = { actorId: 'approver-1', displayName: 'Согласующий', role: 'approver', permissions: ['read', 'plan.approve'], csrfToken: 'token-from-server' };
    else if (pathname === '/api/v1/demo/sessions/sim-run') payload = simEnvelope({ ...session.data, scenarioRunId: 'sim-run', mode: 'simulation' });
    else if (pathname === '/api/v1/work-plans/plan-1' && route.request().method() === 'GET') payload = simEnvelope(plan);
    else if (pathname === '/api/v1/cases/case-1/snapshot') payload = caseSnapshot;
    else if (pathname === '/api/v1/work-plans/plan-1/decisions') {
      requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
      mutationCount += 1;
      status = mutationCount === 1 ? 409 : 403;
      payload = { code: status === 409 ? 'REVISION_CONFLICT' : 'FORBIDDEN', message: 'Сервер отклонил решение', details: {}, requestId: `request-${mutationCount}` };
    } else { status = 404; payload = { code: 'NOT_FOUND', message: 'Нет fixture', details: {}, requestId: 'test' }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await openPreview(page, '/work-plans/plan-1?run=sim-run');
  await expect(page.getByRole('heading', { name: /План проверки/ })).toBeVisible();
  await expect(page.getByText('На согласовании').first()).toBeVisible();
  await page.screenshot({ path: path.join(root, 'tests/ui-features/screenshots/plan-1440.png'), fullPage: true });
  await page.getByRole('button', { name: 'Согласовать' }).click();
  await page.getByRole('textbox', { name: 'Основание' }).fill('Проверены доступные доказательства');
  await page.getByRole('button', { name: 'Записать решение' }).click();
  await expect(page.getByText(/Ревизия анализа, доказательств или плана изменилась/)).toBeVisible();
  await expect(page.getByText('На согласовании').first()).toBeVisible();
  await page.getByRole('button', { name: 'Записать решение' }).click();
  await expect(page.getByText(/нет права на действие/)).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0].headers['x-csrf-token']).toBe('token-from-server');
  expect(requests[0].headers['idempotency-key']).toBeTruthy();
  expect(requests[0].body).toMatchObject({ expectedRevision: 2, analysisRunId: 'sim-analysis-1', evidenceRevision: 1, action: 'approved' });
});

test('diagnostic ribbon synchronizes points and opens the selected evidence', async ({ page }) => {
  const evidence = [{ evidenceId: 'ev-test-1', assetId: snapshot.data.asset.assetId, scenarioRunId: 'reference-slide29', authorId: 'engineer', kind: 'note', observedAt: '2026-07-24T06:42:00Z', receivedAt: '2026-07-24T07:00:00Z', text: 'Проверить контакт', origin: 'presentation_illustration', verification: 'rejected', revision: 2, hasImage: false, measurement: null, uri: null, sha256: null }];
  const sample = [
    { eventTime: '2026-07-24T05:42:00Z', observedC: 50, expectedC: 48, residualC: 2, loadFraction: .5, ambientC: 20, quality: 'good', sourceIds: ['sensor-a'], historicalLowerC: null, historicalUpperC: null },
    { eventTime: '2026-07-24T06:42:00Z', observedC: null, expectedC: 49, residualC: null, loadFraction: null, ambientC: 20, quality: 'missing', sourceIds: [], historicalLowerC: null, historicalUpperC: null },
    { eventTime: '2026-07-24T07:42:00Z', observedC: 60, expectedC: 50, residualC: 10, loadFraction: .7, ambientC: 20, quality: 'suspect', sourceIds: ['sensor-b'], historicalLowerC: null, historicalUpperC: null },
  ];
  await page.route('**/api/v1/cases/AG-2026-017/snapshot**', route => route.fulfill({ json: { ...snapshot, data: { ...snapshot.data, evidence } } }));
  await page.route('**/api/v1/cases/AG-2026-017/series**', route => route.fulfill({ json: envelope({ items: sample, total: sample.length, offset: 0, limit: 1000 }) }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await openPreview(page, '/diagnostics/cases/AG-2026-017?run=reference-slide29');
    await expect(page.getByRole('img', { name: /Синхронизированные графики/ })).toBeVisible();
    await expect(page.getByText(/стилизованная реконструкция слайда/)).toBeVisible();
    await expect(page.getByText('Реконструкция измерения', { exact: true }).first()).toBeVisible();
    const slider = page.getByRole('slider', { name: 'Точка на временной шкале' });
    await expect(slider).toHaveValue('2');
    await page.locator('.ribbon-chart').scrollIntoViewIfNeeded();
    const chartBox = await page.locator('.ribbon-chart').boundingBox();
    if (!chartBox) throw new Error('График не показан');
    await page.mouse.move(chartBox.x + 47, chartBox.y + 80);
    await expect(slider).toHaveValue('0');
    await page.mouse.move(chartBox.x + chartBox.width - 17, chartBox.y + 80);
    await expect(slider).toHaveValue('2');
    const cursor = page.locator('.ribbon-cursor');
    const right = await cursor.evaluate(el => el.getBoundingClientRect().x);
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveValue('1');
    await expect.poll(() => cursor.evaluate(el => el.getBoundingClientRect().x)).toBeLessThan(right);
    await expect(page.locator('.ribbon-selection')).toContainText('Нет измерения');
    await expect(page.locator('.ribbon-selection')).toContainText('Источники точки: не указаны');
    await expect(page.locator('.ribbon-selection')).toContainText('Нет данных');
    await page.locator('.ribbon-chart').scrollIntoViewIfNeeded();
    const plot = await page.locator('.ribbon-chart').boundingBox();
    if (!plot) throw new Error('График не показан');
    await page.mouse.click(plot.x + 45 + (plot.width - 60) / 2, plot.y + 501 * 0.8);
    await expect(page.getByRole('dialog', { name: 'Проводник доказательств' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Проводник доказательств' })).toContainText('Проверить контакт');
    await expect(page.getByRole('dialog')).toContainText('Отклонено');
    await page.screenshot({ path: path.join(root, `.impeccable/review/evidence-${width === 1440 ? 'desktop' : 'mobile'}.png`) });
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(root, `.impeccable/review/${width === 1440 ? 'desktop' : 'mobile'}.png`), fullPage: true });
  }
});

test('director overview uses server priorities and keeps unknown separate', async ({ page }) => {
  const secondAsset = { ...snapshot.data.asset, assetId: 'tp-unknown', name: 'ТП-неизвестно' };
  const unknown = { ...risk, asset: secondAsset, caseId: null, analysis: { ...risk.analysis,
    risk: { ...risk.analysis.risk, priority: 'unknown', score: null },
    quality: { ...risk.analysis.quality, overall: 'insufficient' } } };
  await page.route('**/api/v1/assets?**', route => route.fulfill({ json: envelope({ items: [snapshot.data.asset, secondAsset], total: 2, offset: 0, limit: 100 }) }));
  await page.route('**/api/v1/cases?**', route => route.fulfill({ json: envelope({ items: [snapshot.data.case], total: 1, offset: 0, limit: 100 }) }));
  await page.route('**/api/v1/risks?**', route => route.fulfill({ json: envelope({ items: [unknown, risk], total: 2, offset: 0, limit: 100 }) }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await openPreview(page, '/overview?run=reference-slide29');
    await expect(page.getByRole('heading', { name: 'Обзор руководителя' })).toBeVisible();
    await expect(page.locator('.director-context')).toContainText('REFERENCE');
    await expect(page.locator('.director-context')).toContainText('2 из 2 активов с оценками');
    await expect(page.locator('.director-summary')).toContainText('Оценка неизвестна');
    await expect(page.getByRole('row', { name: /ТП-неизвестно/ })).toContainText('Неизвестно');
    await expect(page.getByRole('row', { name: /ТП-177/ }).getByRole('link')).toHaveAttribute('href', /diagnostics\/cases/);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: path.join(root, `.impeccable/review/director-${width === 1440 ? 'desktop' : 'mobile'}.png`), fullPage: true });
  }
});

test('director overview does not show partial pagination as complete', async ({ page }) => {
  await page.route('**/api/v1/assets?**', route => route.fulfill({ json: envelope({ items: [snapshot.data.asset], total: 2, offset: 0, limit: 100 }) }));
  await page.route('**/api/v1/risks?**', route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0);
    return route.fulfill({ json: envelope({ items: offset ? [] : [risk], total: 2, offset, limit: 100 }) });
  });
  await openPreview(page, '/overview?run=reference-slide29');
  await expect(page.getByText('Не удалось получить согласованный список оценок.')).toBeVisible();
  await expect(page.locator('.director-summary')).toHaveCount(0);
});


test('director does not link a different case analysis and warns on subsequent change', async ({ page }) => {
  await page.route('**/api/v1/assets?**', route => route.fulfill({ json: envelope({ items: [snapshot.data.asset], total: 1, offset: 0, limit: 100 }) }));
  await page.route('**/api/v1/risks?**', route => route.fulfill({ json: envelope({ items: [risk], total: 1, offset: 0, limit: 100 }) }));
  await page.route('**/api/v1/cases?**', route => route.fulfill({ json: envelope({ items: [{ ...snapshot.data.case, analysisRunId: 'different-analysis' }], total: 1, offset: 0, limit: 100 }) }));
  await openPreview(page, '/overview?run=reference-slide29');
  const row = page.getByRole('row', { name: /ТП-177/ });
  await expect(row).toContainText('Связь анализа со случаем не подтверждена');
  await expect(row.getByRole('link')).toHaveAttribute('href', /\/assets\//);
  await openPreview(page, '/diagnostics/cases/AG-2026-017?run=reference-slide29&expectedAnalysis=older-analysis');
  await expect(page.getByText('Анализ случая отличается от обзора')).toBeVisible();
});


test('case demo route is optional, reproducible and read-only', async ({ page }) => {
  const mutations: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/v1/') && request.method() !== 'GET') mutations.push(request.url()); });
  await openPreview(page, '/?choose=1');
  await page.getByRole('link', { name: 'Разобрать один случай', exact: true }).click();
  const tour = page.getByRole('region', { name: 'Разбор случая', exact: true });
  await expect(tour).toBeVisible();
  await expect(page).toHaveURL(/run=reference-slide29&demoStep=1/);
  await expect(page.locator('#case-summary-conclusion')).toBeFocused();
  await expect(tour).toContainText('Шаг 1 из 4');
  await tour.getByRole('link', { name: 'Далее', exact: true }).click();
  await expect(page.locator('#case-summary-basis')).toBeFocused();
  await expect(tour).toContainText('Шаг 2 из 4');
  await expect(page.locator('#case-summary-basis').getByRole('link', { name: 'Далее', exact: true })).toBeVisible();
  await page.locator('#case-summary-basis').getByRole('button', { name: 'Открыть записи случая (0)', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Проводник доказательств' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(tour).toContainText('Шаг 2 из 4');
  await tour.getByRole('link', { name: 'Далее', exact: true }).click();
  await expect(page.locator('#case-summary-missing')).toBeFocused();
  await page.goBack();
  await expect(tour).toContainText('Шаг 2 из 4');
  await page.goForward();
  await expect(tour).toContainText('Шаг 3 из 4');
  await expect(page.locator('#case-summary-missing')).toBeFocused();
  const step4 = tour.getByRole('link', { name: 'Что проверить дальше', exact: true });
  await step4.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#case-summary-next')).toBeFocused();
  await expect(tour).toContainText('Шаг 4 из 4');
  await expect(page.locator('#case-summary-next')).toContainText('Проект плана не создан');
  await page.locator('#case-summary-next').getByRole('link', { name: 'Завершить разбор', exact: true }).click();
  await expect(tour).toHaveCount(0);
  await expect(page).not.toHaveURL(/demoStep/);
  await expect(page.getByRole('link', { name: 'Пройти демо-маршрут', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Пройти демо-маршрут', exact: true }).click();
  await expect(tour).toContainText('Шаг 1 из 4');
  await tour.getByRole('link', { name: 'Закрыть разбор', exact: true }).click();
  await expect(tour).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('case demo links preserve context and reject invalid steps', async ({ page }) => {
  const base = '/diagnostics/cases/AG-2026-017?run=reference-slide29&hours=24&expectedAnalysis=reference-ag-2026-017-r1&custom=keep';
  const tour = page.getByRole('region', { name: 'Разбор случая', exact: true });
  await openPreview(page, `${base}&demoStep=1#old-anchor`);
  await tour.getByRole('link', { name: 'Далее', exact: true }).click();
  const next = new URL(page.url());
  expect(next.searchParams.get('run')).toBe('reference-slide29');
  expect(next.searchParams.get('hours')).toBe('24');
  expect(next.searchParams.get('expectedAnalysis')).toBe('reference-ag-2026-017-r1');
  expect(next.searchParams.get('custom')).toBe('keep');
  expect(next.hash).toBe('');
  await tour.getByRole('link', { name: 'Закрыть разбор', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('custom')).toBe('keep');
  for (const invalid of ['0', '5', '01', 'text', '1&demoStep=2']) {
    await openPreview(page, `${base}&demoStep=${invalid}`);
    await expect(page.getByRole('heading', { name: 'Вывод', exact: true })).toBeVisible();
    await expect(tour).toHaveCount(0);
  }
});

test('case summary keeps reference grounds separate from absent evidence and prints without tour', async ({ page }) => {
  await page.route('**/api/v1/cases/AG-2026-017/series**', route => route.fulfill({ json: envelope({ items: [], total: 0, offset: 0, limit: 1000 }) }));
  for (const width of [1440, 1920, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await openPreview(page, '/diagnostics/cases/AG-2026-017?run=reference-slide29');
    await expect(page.locator('#case-summary-conclusion')).toContainText('Гипотеза не подтверждена');
    await expect(page.locator('#case-summary-conclusion')).toContainText('7,2/10');
    await expect(page.locator('#case-summary-basis')).toContainText('Свежих источников анализа: 3 из 4');
    await expect(page.locator('#case-summary-basis')).toContainText('Записи случая отсутствуют');
    await expect(page.locator('#case-summary-missing')).toContainText('Точное место измерения температуры');
    await expect(page.locator('#case-summary-next')).toContainText('точка отсчета требует уточнения');
    await expect(page.getByText('Нет точек в выбранном диапазоне')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: path.join(root, `verification/case-summary-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Пройти демо-маршрут', exact: true }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.case-demo-route')).toBeHidden();
  await expect(page.locator('.case-summary')).toBeVisible();
  await expect(page.locator('.feature-print-meta')).toContainText('REFERENCE');
  await page.emulateMedia({ media: 'screen' });
  await page.screenshot({ path: path.join(root, 'verification/case-demo-route-1440.png'), fullPage: true });
  await page.evaluate(() => { document.body.style.zoom = '1.25'; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: path.join(root, 'verification/case-demo-route-zoom125.png'), fullPage: true });
  await page.evaluate(() => { document.body.style.zoom = ''; });
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: path.join(root, 'verification/case-demo-route-390.png'), fullPage: true, animations: 'disabled' });
});

test('case summary preserves unknown values and real evidence in simulation', async ({ page }) => {
  const evidence = { evidenceId: 'ev-summary', assetId: snapshot.data.asset.assetId, scenarioRunId: 'reference-slide29', authorId: 'engineer', kind: 'note', observedAt: snapshot.dataTime, receivedAt: snapshot.dataTime, text: 'Проверить канал температуры', origin: 'synthetic', verification: 'unverified', revision: 1, hasImage: false, measurement: null, uri: null, sha256: null };
  const analysis = { ...snapshot.data.analysis, mode: 'simulation', calculationOrigin: 'computed', status: 'insufficient_data', modelVersion: 'test-model', policyVersion: 'test-policy',
    metrics: { ...snapshot.data.analysis.metrics, observedTemperatureC: null, expectedTemperatureC: null, residualC: null, loadFraction: null },
    risk: { ...snapshot.data.analysis.risk, score: null, priority: 'unknown', label: 'Недостаточно данных' },
    quality: { ...snapshot.data.analysis.quality, overall: 'insufficient', issues: [] },
    hypotheses: [{ ...snapshot.data.analysis.hypotheses[0], supportEvidenceIds: ['ev-summary', 'missing-record'], missingEvidence: [] }], nextActions: [] };
  await page.route('**/api/v1/demo/sessions/reference-slide29', route => route.fulfill({ json: { ...session, mode: 'simulation', data: { ...session.data, mode: 'simulation' } } }));
  await page.route('**/api/v1/cases/AG-2026-017/snapshot**', route => route.fulfill({ json: { ...snapshot, mode: 'simulation', data: { ...snapshot.data, analysis, evidence: [evidence] } } }));
  await openPreview(page, '/diagnostics/cases/AG-2026-017?run=reference-slide29&demoStep=1');
  await expect(page.locator('.case-demo-route')).toHaveCount(0);
  await expect(page.locator('#case-summary-conclusion')).toContainText('Текущий риск неизвестен');
  await expect(page.locator('#case-summary-conclusion')).not.toContainText('0/10');
  await expect(page.locator('#case-summary-basis')).toContainText('Нет данных');
  await expect(page.locator('#case-summary-basis')).toContainText('Не подтверждено');
  await expect(page.locator('#case-summary-basis')).toContainText('missing-record недоступна');
  await expect(page.locator('#case-summary-missing')).toContainText('Это не подтверждает достаточность данных');
  await expect(page.locator('#case-summary-next')).toContainText('Следующая проверка сервером не указана');
  await page.locator('#case-summary-basis').getByRole('button', { name: 'Проверить канал температуры', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Проверить канал температуры');
});

test('case summary distinguishes unavailable plans from an empty list and opens existing plans', async ({ page }) => {
  let failing = true;
  await page.route('**/api/v1/work-plans?**', route => failing
    ? route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Планы временно недоступны', details: {}, requestId: 'summary-plans' } })
    : route.fulfill({ json: envelope({ items: [{ planId: 'existing-plan', caseId: 'AG-2026-017', state: 'draft' }], total: 1, offset: 0, limit: 50 }) }));
  await openPreview(page, '/diagnostics/cases/AG-2026-017?run=reference-slide29&demoStep=4');
  const next = page.locator('#case-summary-next');
  await expect(next).toContainText('Не удалось получить планы');
  await expect(next).not.toContainText('Проект плана не создан');
  failing = false;
  await next.getByRole('button', { name: 'Повторить загрузку планов', exact: true }).click();
  await expect(next.getByRole('link', { name: 'existing-plan · Проект', exact: true })).toHaveAttribute('href', '/work-plans/existing-plan?run=reference-slide29');
});


test('case summary retains a labeled cached snapshot when its refresh fails', async ({ page }) => {
  let unavailable = false;
  await page.route('**/api/v1/cases/AG-2026-017/snapshot**', route => unavailable
    ? route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Снимок временно недоступен', details: {}, requestId: 'snapshot-stale' } })
    : route.fulfill({ json: snapshot }));
  await openPreview(page, '/diagnostics/cases/AG-2026-017?run=reference-slide29');
  await expect(page.locator('#case-summary-conclusion')).toContainText('7,2/10');
  unavailable = true;
  await page.reload();
  await expect(page.getByText('Сохраненная карточка', { exact: true })).toBeVisible();
  await expect(page.locator('#case-summary-conclusion')).toContainText('7,2/10');
  await expect(page.getByRole('button', { name: 'Создать проект проверки', exact: true })).toHaveCount(0);
});

test('case demo reports a missing reference session and keeps the dataset exit', async ({ page }) => {
  await page.route('**/api/v1/demo/sessions/reference-slide29', route => route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'Референсный запуск недоступен', details: {}, requestId: 'reference-missing' } }));
  await openPreview(page, '/diagnostics/cases/AG-2026-017?run=reference-slide29&demoStep=1');
  await expect(page.getByText('Референсный запуск недоступен', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Сменить набор', exact: true })).toHaveAttribute('href', '/?choose=1');
  await expect(page.locator('.case-demo-route')).toHaveCount(0);
});
