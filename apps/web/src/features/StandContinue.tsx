import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Banner, Button, Card, Loading } from '../design-system/components';
import { loadStandPackage, type StandPackage } from '../stand/package';
import { Login } from './DiagnosticsApp';
import { ApiFailure, expectData, href, mutationHeaders, type Identity } from './shared';
import { leaveStandLive, readStandHandoff, STAND_HANDOFF_KEY, STAND_LIVE_KEY, type StandHandoff } from './standContext';
import './stand-flow.css';

// StrictMode and fast reloads may invoke the same preparation twice. Reuse the
// same in-flight promise and the server's idempotency key for this handoff.
const creationFlights = new Map<string, Promise<string>>();

function message(error: unknown): string {
  if (error instanceof ApiFailure) {
    if ([502, 503, 504].includes(error.status)) return 'Локальный API недоступен. Запустите полный стек и повторите попытку.';
    return error.message;
  }
  if (error instanceof Error && !(error instanceof TypeError)) return error.message;
  return 'Нет связи с локальным сервером. Проверьте запуск приложения.';
}

export function createStandRun(handoff: StandHandoff, scene: StandPackage['scenes'][number], pack: StandPackage, identity: Identity): Promise<string> {
  const existing = creationFlights.get(handoff.idempotencyKey);
  if (existing) return existing;
  const flight = (async () => {
    const result = expectData(await api.POST('/api/v1/demo/sessions', {
      params: { header: { 'Idempotency-Key': handoff.idempotencyKey, 'X-CSRF-Token': identity.csrfToken } },
      body: {
        datasetId: pack.provenance.datasetId, seed: pack.provenance.seed, mode: 'simulation',
        virtualTime: pack.slices[scene.slice].virtualTime,
        reason: 'Интерактивная демонстрация по выбранному эпизоду стенда',
      },
    }));
    // A slow response must not overwrite another episode selected in the meantime.
    const current = readStandHandoff();
    if (!current || current.sceneId !== handoff.sceneId || current.idempotencyKey !== handoff.idempotencyKey) {
      throw new Error('Переход был изменен. Вернитесь к автопоказу и выберите эпизод снова.');
    }
    // Persist before navigation so that retries and reloads continue the same run.
    sessionStorage.setItem(STAND_HANDOFF_KEY, JSON.stringify({ ...handoff, runId: result.scenarioRunId }));
    return result.scenarioRunId;
  })();
  creationFlights.set(handoff.idempotencyKey, flight);
  void flight.finally(() => creationFlights.delete(handoff.idempotencyKey)).catch(() => {});
  return flight;
}

export function StandContinue() {
  const sceneId = new URLSearchParams(window.location.search).get('scene') || '';
  const [pack, setPack] = useState<StandPackage | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityStatus, setIdentityStatus] = useState<'loading' | 'login' | 'ready' | 'error'>('loading');
  const [handoff, setHandoff] = useState<StandHandoff | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [terminalFailure, setTerminalFailure] = useState(false);
  const [retry, setRetry] = useState(0);
  const [identityRevision, setIdentityRevision] = useState(0);
  const scene = pack?.scenes.find(item => item.id === sceneId);

  useEffect(() => {
    let active = true;
    loadStandPackage().then(value => {
      if (!active) return;
      if (!value.scenes.some(item => item.id === sceneId)) {
        setFailure('Эпизод не найден. Вернитесь к автопоказу и выберите его снова.');
        return;
      }
      setPack(value);
      try {
        let current = readStandHandoff();
        if (!current || current.sceneId !== sceneId) {
          current = { sceneId, idempotencyKey: crypto.randomUUID() };
          sessionStorage.setItem(STAND_HANDOFF_KEY, JSON.stringify(current));
        }
        setHandoff(current);
        setRunId(current.runId || null);
      } catch {
        setFailure('Не удалось сохранить переход. Разрешите хранение данных браузера и повторите попытку.');
      }
    }).catch(() => { if (active) setFailure('Не удалось открыть подготовленные данные стенда. Повторите попытку.'); });
    return () => { active = false; };
  }, [sceneId, retry]);

  useEffect(() => {
    let active = true;
    setIdentityStatus('loading');
    api.GET('/api/v1/auth/me').then(result => {
      if (!active) return;
      if (result.response.status === 401) { setIdentity(null); setIdentityStatus('login'); return; }
      setIdentity(expectData(result));
      setIdentityStatus('ready');
    }).catch(error => { if (active) { setFailure(message(error)); setIdentityStatus('error'); } });
    return () => { active = false; };
  }, [identityRevision, retry]);

  useEffect(() => {
    if (!pack || !scene || !handoff || !identity || !identity.permissions.includes('demo.advance') || runId || failure) return;
    let active = true;
    createStandRun(handoff, scene, pack, identity).then(id => {
      if (active) setRunId(id);
    }).catch(error => { if (active) setFailure(message(error)); });
    return () => { active = false; };
  }, [pack, scene, handoff, identity, runId, failure, retry]);

  useEffect(() => {
    if (!runId || !scene || !identity || !identity.permissions.includes('demo.advance') || failure) return;
    let active = true;
    let timer: number | undefined;
    const started = Date.now();
    async function poll() {
      try {
        const session = expectData(await api.GET('/api/v1/demo/sessions/{id}', { params: { path: { id: runId! } } }));
        if (!active) return;
        if (session.data.processingStatus === 'failed') {
          setTerminalFailure(true);
          throw new Error(session.data.processingError || 'Расчет сценария не завершился.');
        }
        if (session.data.processingStatus !== 'ready') {
          if (Date.now() - started > 120000) throw new Error('Расчет занимает больше двух минут. Проверьте состояние worker и повторите попытку.');
          timer = window.setTimeout(poll, 1500);
          return;
        }
        const risks = expectData(await api.GET('/api/v1/risks', { params: { query: { scenarioRunId: runId!, includeNormal: true, limit: 1000, offset: 0 } } }));
        if (!active) return;
        const item = risks.data.items.find(value => value.asset.assetId === scene!.assetId);
        if (!item) throw new Error('Объект выбранного эпизода отсутствует в расчетном срезе.');
        sessionStorage.setItem(STAND_LIVE_KEY, JSON.stringify({ runId, sceneId: scene!.id }));
        try { localStorage.setItem('diagnostics-run', runId!); } catch { /* URL retains the run */ }
        const target = item.caseId ? `/diagnostics/cases/${encodeURIComponent(item.caseId)}` : `/assets/${encodeURIComponent(item.asset.assetId)}`;
        window.location.replace(href(target, runId!));
      } catch (error) {
        if (active) setFailure(message(error));
      }
    }
    void poll();
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [runId, scene, identity, failure, retry]);

  async function changeUser() {
    if (!identity) return;
    try {
      expectData(await api.POST('/api/v1/auth/logout', { params: { header: mutationHeaders(identity) } }));
      setIdentity(null);
      setIdentityRevision(value => value + 1);
    } catch (error) { setFailure(message(error)); }
  }
  function repeat() {
    if (terminalFailure) {
      try {
        const next = { sceneId, idempotencyKey: crypto.randomUUID() };
        sessionStorage.setItem(STAND_HANDOFF_KEY, JSON.stringify(next));
        setHandoff(next);
        setRunId(null);
        setTerminalFailure(false);
      } catch {
        setFailure('Не удалось сохранить повторный запуск. Проверьте хранение данных браузера.');
        return;
      }
    }
    setFailure(null);
    setRetry(value => value + 1);
  }
  return <main className="stand-continue">
    <div className="stand-continue-header"><h1>Демонстрация с ведущим</h1><a href="/stand" onClick={leaveStandLive}>Вернуться к автопоказу</a></div>
    <p>Будет открыт отдельный запуск с данными выбранного эпизода. Начните собственный разбор сигнала.</p>
    {scene && <p><strong>{scene.title}</strong> · SIMULATION · время данных: {pack?.slices[scene.slice].virtualTime}</p>}
    {failure && <><Banner tone="high" title="Не удалось открыть демонстрацию">{failure}</Banner><div className="stand-continue-actions"><Button onClick={repeat}>Повторить</Button><a className="button" href="/stand" onClick={leaveStandLive}>Вернуться к автопоказу</a></div></>}
    {!failure && identityStatus === 'login' && <Login onSuccess={() => setIdentityRevision(value => value + 1)} />}
    {!failure && identityStatus === 'ready' && identity && !identity.permissions.includes('demo.advance') && <Card title="Для начала нужен инженер"><p>Текущая роль может просматривать данные. Чтобы создать новый учебный запуск, войдите как engineer.</p><Button onClick={() => void changeUser()}>Выйти и сменить пользователя</Button></Card>}
    {!failure && (identityStatus === 'loading' || (identityStatus === 'ready' && !!identity?.permissions.includes('demo.advance'))) && <Loading label="Подготавливаем живую демонстрацию..." />}
  </main>;
}
