import { useState } from 'react';
import { api } from '../api/client';
import { Button, Banner } from '../design-system/components';
import { ApiFailure, expectData, mutationHeaders, useResource, type Identity, type S } from './shared';

export function ReplayControls({ session, identity, refresh }: { session: S['ScenarioSession']; identity: Identity | null; refresh: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(86400);
  const catalog = useResource('scenarios-v1', async () => expectData(await api.GET('/api/v1/demo/scenarios')));
  const end = catalog.data?.items.find(item => item.datasetId === session.datasetId)?.endsAt;
  const atEnd = Boolean(end && new Date(session.virtualTime) >= new Date(end));
  if (session.mode !== 'simulation') return null;
  const allowed = identity?.permissions.includes('demo.advance');
  async function advance(action: S['SessionAdvance']['action'], speed = session.speed) {
    if (!identity) return;
    setPending(true); setError(null);
    try {
      expectData(await api.POST('/api/v1/demo/sessions/{id}/advance', {
        params: { path: { id: session.scenarioRunId }, header: mutationHeaders(identity) },
        body: { expectedRevision: session.revision, action, seconds: action === 'step' ? seconds : 0, speed, reason: 'Управление виртуальным временем демонстрации' },
      }));
    } catch (failure) { setError(failure instanceof ApiFailure ? failure.message : 'Нет связи с сервером.'); }
    finally { setPending(false); refresh(); }
  }
  const disabled = pending || !allowed || session.processingStatus !== 'ready';
  return <section className="replay-controls" aria-label="Виртуальное время демонстрации">
    <div className="replay-controls-row"><strong>Воспроизведение данных</strong><span>{session.paused ? 'Пауза' : `Скорость ×${session.speed}`}</span>
      <Button disabled={disabled || (atEnd && session.paused)} icon={session.paused ? 'play' : 'pause'} onClick={() => advance(session.paused ? 'resume' : 'pause')}>{atEnd ? 'Конец данных' : session.paused ? 'Продолжить' : 'Пауза'}</Button>
      <label>Шаг <select aria-label="Шаг виртуального времени" value={seconds} onChange={event => setSeconds(Number(event.target.value))}><option value={300}>5 минут</option><option value={3600}>1 час</option><option value={86400}>1 сутки</option></select></label>
      <Button disabled={disabled || atEnd} onClick={() => advance('step')}>Вперед на шаг</Button>
      <label>Скорость <select aria-label="Скорость воспроизведения" value={session.speed} disabled={disabled} onChange={event => advance('speed', Number(event.target.value) as S['ScenarioSession']['speed'])}><option value={1}>×1</option><option value={10}>×10</option><option value={60}>×60</option></select></label>
      <a href="/?choose=1">Новый запуск / другое время</a>
    </div>
    <small>{!allowed && 'Управлять воспроизведением может инженер. '}Меняется только виртуальное время синтетических данных. Пересчет выполняется на сервере; управление оборудованием отсутствует.</small>
    {error && <Banner tone="medium" title="Не удалось изменить время">{error}</Banner>}
  </section>;
}
