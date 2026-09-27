import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { components } from '../api/generated';
import { AppShell, type NavItem } from '../shell/AppShell';
import { Banner, Button, Card, Empty, ErrorState, Loading, PageHeading } from '../design-system/components';
import { AssetsPage, AssetPage, ModelsPage } from './support';
import { QueuePage, CasesPage } from './queue';
import { CasePage } from './case';
import { PlanPage, PlansPage } from './plan';
import { ApiFailure, expectData, href, mutationHeaders, roleLabel, useResource } from './shared';
import './features.css';
import { ReplayControls } from './ReplayControls';

type S = components['schemas'];
export const featureRegistrations: S['FeatureRegistration'][] = [
  { id: 'assets', route: '/assets', label: 'Обзор активов', permission: 'read', implemented: true },
  { id: 'diagnostics', route: '/diagnostics', label: 'Диагностика', permission: 'read', implemented: true },
  { id: 'risks', route: '/risks', label: 'Очередь рисков', permission: 'read', implemented: true },
  { id: 'plans', route: '/work-plans', label: 'Задания ТОиР', permission: 'read', implemented: true },
  { id: 'models', route: '/models-and-data', label: 'Модели и данные', permission: 'read', implemented: true },
];
const icons: Record<string, string> = { assets: 'grid', diagnostics: 'diagnostics', risks: 'risk', plans: 'plan', models: 'data' };

function route(pathname: string): { active: string; title: string; content: (run: string, identity: S['Identity'] | null) => React.ReactNode } {
  const caseId = pathname.match(/^\/diagnostics\/cases\/([^/]+)$/)?.[1];
  const planId = pathname.match(/^\/work-plans\/([^/]+)$/)?.[1];
  const assetId = pathname.match(/^\/assets\/([^/]+)$/)?.[1];
  if (caseId) return { active: 'diagnostics', title: 'Диагностический случай', content: (run, user) => <CasePage id={decodeURIComponent(caseId)} run={run} identity={user} /> };
  if (planId) return { active: 'plans', title: 'Проверочный план', content: (run, user) => <PlanPage id={decodeURIComponent(planId)} run={run} identity={user} /> };
  if (assetId) return { active: 'assets', title: 'Актив', content: run => <AssetPage id={decodeURIComponent(assetId)} run={run} /> };
  if (pathname === '/diagnostics') return { active: 'diagnostics', title: 'Диагностика', content: run => <CasesPage run={run} /> };
  if (pathname === '/work-plans') return { active: 'plans', title: 'Задания ТОиР', content: run => <PlansPage run={run} /> };
  if (pathname === '/assets') return { active: 'assets', title: 'Обзор активов', content: run => <AssetsPage run={run} /> };
  if (pathname === '/models-and-data') return { active: 'models', title: 'Модели и данные', content: run => <ModelsPage run={run} /> };
  return { active: 'risks', title: 'Очередь рисков', content: run => <QueuePage run={run} /> };
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setFailure(null);
    try { expectData(await api.POST('/api/v1/auth/login', { body: { username, password } })); setPassword(''); onSuccess(); }
    catch (error) { setFailure(error instanceof ApiFailure ? error : new ApiFailure(0, 'Нет связи с сервером.')); }
    finally { setPending(false); }
  }
  return <Card className="feature-login" title="Вход в демонстрационный контур" subtitle="Для действий нужна серверная роль и сессия."><form className="feature-form" onSubmit={submit}>
    <label className="field">Пользователь<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label>
    <label className="field">Пароль<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
    {failure && <ErrorState message={failure.message} requestId={failure.requestId} />}
    <Button variant="primary" disabled={pending}>{pending ? 'Проверяем...' : 'Войти'}</Button>
  </form></Card>;
}

function ScenarioPicker({ identity }: { identity: S['Identity'] }) {
  const scenarios = useResource('scenarios-v1', async () => expectData(await api.GET('/api/v1/demo/scenarios')));
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [timeChoice, setTimeChoice] = useState<Record<string, 'last' | 'early' | 'custom'>>({});
  const [customTime, setCustomTime] = useState<Record<string, string>>({});
  async function start(scenario: S['Scenario']) {
    setPending(scenario.datasetId); setFailure(null);
    try {
      const choice = timeChoice[scenario.datasetId] || 'last';
      const virtualTime = choice === 'early'
        ? new Date(new Date(scenario.startsAt).getTime() + 7 * 86400000).toISOString()
        : choice === 'custom' ? new Date(`${customTime[scenario.datasetId] || scenario.endsAt.slice(0, 16)}:00Z`).toISOString() : scenario.endsAt;
      if (new Date(virtualTime) < new Date(scenario.startsAt) || new Date(virtualTime) > new Date(scenario.endsAt)) throw new ApiFailure(422, 'Время должно находиться внутри периода набора.');
      const result = expectData(await api.POST('/api/v1/demo/sessions', {
        params: { header: mutationHeaders(identity) },
        body: { datasetId: scenario.datasetId, seed: 20260925,
          mode: scenario.origin === 'presentation_illustration' ? 'reference' : 'simulation',
          virtualTime, reason: 'Открыть демонстрационный сценарий' },
      }));
      localStorage.setItem('diagnostics-run', result.scenarioRunId);
      window.location.assign(href('/risks', result.scenarioRunId));
    } catch (error) { setFailure(error instanceof ApiFailure ? error : error instanceof RangeError ? new ApiFailure(422, 'Укажите корректное время среза.') : new ApiFailure(0, 'Нет связи с сервером.')); }
    finally { setPending(null); }
  }
  return <div className="feature-stack"><PageHeading eyebrow="DEMO" title="Выберите набор данных" subtitle="REFERENCE воспроизводит значения слайда; SIMULATION рассчитывается из синтетических наблюдений." />
    {scenarios.loading && !scenarios.data && <Loading />}
    {scenarios.error && !scenarios.data && <ErrorState message={scenarios.error.message} retry={scenarios.refresh} />}
    {failure && <ErrorState message={failure.message} requestId={failure.requestId} />}
    {scenarios.data?.items.length === 0 && <Empty title="Нет доступных сценариев">Проверьте настройку демонстрационного сервера.</Empty>}
    <div className="feature-scenario-grid">{scenarios.data?.items.map(item => <Card key={item.datasetId} title={item.title} subtitle={item.origin === 'presentation_illustration' ? 'Иллюстрация презентации' : 'Синтетический расчет'}>
      <p className="feature-muted">Период данных: {new Date(item.startsAt).toLocaleDateString('ru-RU')} — {new Date(item.endsAt).toLocaleDateString('ru-RU')}</p>
      {item.origin === 'synthetic' && <><label className="field">Время среза<select value={timeChoice[item.datasetId] || 'last'} onChange={event => setTimeChoice(previous => ({ ...previous, [item.datasetId]: event.target.value as 'last' | 'early' | 'custom' }))}><option value="last">Последний срез</option><option value="early">Ранний период</option><option value="custom">Выбрать время UTC</option></select></label>{timeChoice[item.datasetId] === 'custom' && <label className="field">Время UTC<input type="datetime-local" value={customTime[item.datasetId] || item.endsAt.slice(0, 16)} onChange={event => setCustomTime(previous => ({ ...previous, [item.datasetId]: event.target.value }))} min={item.startsAt.slice(0, 16)} max={item.endsAt.slice(0, 16)} /></label>}</>}
      <Button variant="primary" onClick={() => start(item)} disabled={pending !== null || !identity.permissions.includes('demo.advance')}>{pending === item.datasetId ? 'Создаем запуск...' : 'Открыть сценарий'}</Button>
    </Card>)}</div>
  </div>;
}

export function DiagnosticsApp() {
  const url = new URL(window.location.href);
  const run = url.searchParams.get('run') || (url.searchParams.has('choose') ? '' : localStorage.getItem('diagnostics-run') || '');
  const identity = useResource('auth-me', async () => expectData(await api.GET('/api/v1/auth/me')), false);
  const session = useResource(`session-${run}`, async () => {
    if (!run) throw new ApiFailure(404, 'Запуск не выбран.');
    return expectData(await api.GET('/api/v1/demo/sessions/{id}', { params: { path: { id: run } } }));
  });
  const current = route(window.location.pathname);
  const nav: NavItem[] = featureRegistrations.map(item => ({ id: item.id, href: href(item.route, run), label: item.label, icon: icons[item.id] }));
  const processing = session.data?.data.processingStatus || 'ready';
  const canShowRun = !identity.loading && identity.error?.status !== 401;
  useEffect(() => {
    if (!run || (processing !== 'queued' && processing !== 'running' && session.data?.data.paused !== false)) return;
    const timer = window.setInterval(session.refresh, 3000);
    return () => window.clearInterval(timer);
  }, [run, processing, session.data?.data.paused, session.refresh]);
  const connection = identity.error?.status === 0 || session.error?.status === 0 ? 'offline' : identity.loading || session.loading ? 'loading' : 'online';
  async function logout() {
    if (!identity.data) return;
    try { expectData(await api.POST('/api/v1/auth/logout', { params: { header: mutationHeaders(identity.data) } })); window.location.reload(); }
    catch { identity.refresh(); }
  }
  return <AppShell nav={nav} active={current.active} mode={session.data?.mode || null} dataTime={session.data?.dataTime || null} connection={connection}
    userLabel={identity.data?.displayName || 'Нет входа'} roleLabel={identity.data ? roleLabel[identity.data.role] : 'Просмотр'} onLogout={identity.data ? logout : undefined}
    breadcrumb={current.title} headerActions={run ? <a href="/?choose=1">Сменить набор</a> : undefined}>
    {identity.loading && !identity.data && <Loading label="Проверяем вход..." />}
    {identity.error?.status === 401 && <Login onSuccess={() => window.location.reload()} />}
    {identity.error && identity.error.status !== 401 && <Banner tone="high" title="Сервер недоступен">Сохраненные данные показаны как устаревшие. Изменения недоступны.</Banner>}
    {!identity.loading && identity.error?.status !== 401 && !run && identity.data && <ScenarioPicker identity={identity.data} />}
    {canShowRun && run && session.loading && !session.data && <Loading label="Загружаем запуск..." />}
    {canShowRun && run && session.error && !session.data && <ErrorState message={session.error.message} requestId={session.error.requestId} retry={session.refresh} />}
    {canShowRun && run && session.data && <ReplayControls session={session.data.data} identity={session.stale ? null : identity.data} refresh={session.refresh} />}
    {canShowRun && run && session.data && processing !== 'ready' && <Banner tone={processing === 'failed' ? 'high' : 'blue'} title={processing === 'failed' ? 'Подготовка набора не удалась' : 'Набор подготавливается'}>{processing === 'failed' ? session.data.data.processingError || 'Проверьте журнал сервера.' : 'Данные еще не готовы для просмотра. Статус обновляется автоматически.'}</Banner>}
    {canShowRun && run && session.data && processing !== 'ready' && <Button onClick={session.refresh}>Проверить состояние</Button>}
    {canShowRun && run && session.data && processing === 'ready' && <>{session.stale && <Banner tone="high" title="Показаны сохраненные данные">Связь с сервером потеряна; действия заблокированы.</Banner>}<div key={session.data.data.processedAt || session.data.data.virtualTime}>{current.content(run, identity.data && !identity.stale && !session.stale ? identity.data : null)}</div></>}
  </AppShell>;
}
