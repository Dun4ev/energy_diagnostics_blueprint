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
  await page.addScriptTag({ type: 'module', content: "import { mountDiagnosticsPreview } from '/src/features/preview.tsx'; mountDiagnosticsPreview();" });
  await expect(page.locator('#feature-preview')).toBeVisible();
}

test('risk queue and case share one analysis and reference labeling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPreview(page, '/risks?run=reference-slide29');
  await expect(page.getByRole('heading', { name: 'Очередь рисков' })).toBeVisible();
  await expect(page.getByText('reference-ag-2026-017-r1')).toBeVisible();
  await expect(page.getByText('7,2/10')).toBeVisible();
  await page.screenshot({ path: path.join(root, 'tests/ui-features/screenshots/queue-1440.png'), fullPage: true });
  await page.getByRole('link', { name: /ТП-177 \/ Т-1/ }).first().click();
  await openPreview(page, '/diagnostics/cases/AG-2026-017?run=reference-slide29');
  await expect(page.getByText('reference-ag-2026-017-r1')).toBeVisible();
  await expect(page.getByText('Иллюстрация презентации').first()).toBeVisible();
  await expect(page.getByText('Вероятность отказа')).toBeVisible();
  await expect(page.getByRole('img', { name: 'График измеренной и ожидаемой температуры' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Схема связей оборудования/ })).toBeVisible();
  await expect(page.getByText('Состояние неизвестно', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(`Показано ${points.length} из ${points.length} точек.`)).toBeVisible();
  await page.getByRole('button', { name: 'Открыть записи' }).click();
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
    await expect(page.getByRole('img', { name: 'График измеренной и ожидаемой температуры' })).toBeVisible();
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
