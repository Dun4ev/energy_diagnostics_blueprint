import { lazy, Suspense, useEffect, useState } from 'react';
import { brand } from '../config';
import { actorLabel, auditLabel, date, number, percent, planStateLabel, priorityLabel, qualityLabel, signed, temperature } from '../features/shared';
import { loadStandPackage, type StandPackage, type StandScene } from './package';
import { advanceStandClock, type StandClock } from './clock';
import './stand.css';

const TemperatureChart = lazy(() => import('../features/chart').then(module => ({ default: module.TemperatureChart })));

type StandDisplayProps = { onContinue: (sceneId: string) => void };
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="stand-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function SceneContent({ data, scene }: { data: StandPackage; scene: StandScene }) {
  const slice = data.slices[scene.slice];
  const entry = slice.risks.find(item => item.asset.assetId === scene.assetId)!;
  const analysis = entry.analysis;
  const metrics = analysis.metrics;
  if (scene.kind === 'overview') {
    const spotlight = [entry, ...slice.risks.filter(item => item.asset.assetId !== entry.asset.assetId && (item.analysis.risk.priority === 'unknown' || item.analysis.risk.priority === 'low')).slice(0, 3)];
    return <section className="stand-stage-panel" aria-label="Состояние демонстрационных активов">
      <header><div><span className="stand-panel-label">Срез наблюдений</span><h2>Данные по активам</h2></div><span className="stand-panel-meta">{slice.risks.length} активов</span></header>
      <div className="stand-assets">{spotlight.map(item => <div className="stand-asset" key={item.asset.assetId}><div><strong>{item.asset.name}</strong><small>{item.analysis.risk.label}</small></div><span className={`stand-priority stand-priority-${item.analysis.risk.priority}`}>{priorityLabel[item.analysis.risk.priority]}</span><b>{item.analysis.risk.score === null ? 'Нет оценки' : `${number(item.analysis.risk.score)} / 10`}</b></div>)}</div>
      <p className="stand-panel-foot">Индекс помогает выбрать следующий шаг и не является вероятностью отказа.</p>
    </section>;
  }
  if (scene.kind === 'normal' || scene.kind === 'deviation') {
    return <section className="stand-stage-panel stand-chart-panel" aria-label="Температура и ожидаемый режим">
      <header><div><span className="stand-panel-label">{entry.asset.name}</span><h2>Температура и ожидаемый режим</h2></div><span className="stand-panel-meta">{analysis.status === 'normal' ? 'Нормальный режим · ' : analysis.status === 'insufficient_data' ? 'Данные недостаточны · ' : 'Требует проверки · '}Синтетический расчет</span></header>
      <div className="stand-chart"><Suspense fallback={<p>Подготавливаем график...</p>}><TemperatureChart points={slice.series} presentation /></Suspense></div>
      <div className="stand-metrics"><Metric label="Измерено" value={temperature(metrics.observedTemperatureC)} /><Metric label="Ожидалось" value={temperature(metrics.expectedTemperatureC)} /><Metric label="Отклонение" value={metrics.residualC === null ? 'Нет данных' : `${signed(metrics.residualC)} °C`} /><Metric label="Нагрузка" value={percent(metrics.loadFraction)} /></div>
    </section>;
  }
  if (scene.kind === 'hypothesis') {
    const hypothesis = analysis.hypotheses[0];
    const earlyLoad = data.slices.early.risks.find(item => item.asset.assetId === 'tp305-t1');
    const lateLoad = data.slices.late.risks.find(item => item.asset.assetId === 'tp305-t1');
    const missing = data.slices.late.risks.find(item => item.asset.assetId === 'tp307-t1');
    return <section className="stand-stage-panel stand-findings" aria-label="Гипотеза и качество данных">
      <header><div><span className="stand-panel-label">{entry.asset.name}</span><h2>Инженерный разбор</h2></div><span className={`stand-priority stand-priority-${analysis.risk.priority}`}>{priorityLabel[analysis.risk.priority]}</span></header>
      <div className="stand-finding"><span>Гипотеза · не подтверждена</span><h3>{hypothesis?.title || 'Гипотеза не сформирована'}</h3><p>{hypothesis?.missingEvidence.length ? `Для проверки нужны: ${hypothesis.missingEvidence.join('; ')}.` : 'Проверьте состав и качество доступных данных.'}</p></div>
      <div className="stand-comparisons">
        {earlyLoad && lateLoad && <div><strong>{lateLoad.asset.name} · нагрузка</strong><p>{date(data.slices.early.virtualTime)}: {percent(earlyLoad.analysis.metrics.loadFraction)}<br />{date(data.slices.late.virtualTime)}: {percent(lateLoad.analysis.metrics.loadFraction)}</p><small>Отклонение в позднем срезе: {temperature(lateLoad.analysis.metrics.residualC)} · {priorityLabel[lateLoad.analysis.risk.priority]}</small></div>}
        {missing && <div><strong>{missing.asset.name} · данные</strong><p>Оценка: {missing.analysis.risk.score === null ? 'неизвестна' : `${number(missing.analysis.risk.score)} / 10`}</p><small>Качество: {qualityLabel[missing.analysis.quality.overall]}</small></div>}
      </div>
      <div className="stand-metrics"><Metric label="Индекс приоритета" value={analysis.risk.score === null ? 'Неизвестен' : `${number(analysis.risk.score)} / 10`} note="Не вероятность отказа" /><Metric label="Качество" value={qualityLabel[analysis.quality.overall]} /><Metric label="Свежих источников" value={`${analysis.quality.freshSources} из ${analysis.quality.totalSources}`} /></div>
    </section>;
  }
  if (scene.kind === 'evidence') {
    return <section className="stand-stage-panel" aria-label="Учебные доказательства">
      <header><div><span className="stand-panel-label">Учебные материалы</span><h2>Что известно для разбора</h2></div><span className="stand-panel-meta">Записи примера</span></header>
      <div className="stand-evidence">{data.story.evidence.filter(item => item.authorId === 'engineer').slice(0, 2).map(item => <article key={item.evidenceId}><span>{item.verification === 'verified' ? 'Проверено' : item.verification === 'rejected' ? 'Отклонено' : 'Не проверено'} · синтетическая запись</span><p>{item.text}</p><small>Время наблюдения: {date(item.observedAt)}</small></article>)}</div>
      <p className="stand-panel-foot">Реальная термограмма в учебный набор не приложена.</p>
    </section>;
  }
  if (scene.kind === 'plan') {
    const plan = data.story.draft;
    return <section className="stand-stage-panel" aria-label="Учебный проект плана">
      <header><div><span className="stand-panel-label">Учебное решение инженера</span><h2>Проект проверки</h2></div><span className="stand-priority stand-priority-medium">{planStateLabel[plan.state]}</span></header>
      <ol className="stand-steps">{plan.steps.map(step => <li key={step.stepId}><span>{step.number}</span><div><strong>{step.description}</strong><small>Исполнитель: {actorLabel(step.assigneeRole)}</small></div></li>)}</ol>
      <p className="stand-panel-foot">Проект описывает проверку. Он не является разрешением на работы.</p>
    </section>;
  }
  if (scene.kind === 'approval') {
    const states = [data.story.submitted, data.story.approved, data.story.completed];
    return <section className="stand-stage-panel" aria-label="Учебное согласование и результат">
      <header><div><span className="stand-panel-label">Учебная история</span><h2>План проходит проверку</h2></div><span className="stand-panel-meta">Решения разных ролей</span></header>
      <ol className="stand-workflow">{states.map((plan, index) => <li key={plan.state}><span>{index + 1}</span><div><strong>{planStateLabel[plan.state]}</strong><small>{index === 0 ? 'Инженер передает проект' : index === 1 ? 'Согласующий рассматривает проект' : 'Согласующий проверяет результат'}</small></div></li>)}</ol>
      {data.story.evidence.filter(item => item.authorId === 'technician').slice(0, 1).map(item => <div className="stand-result" key={item.evidenceId}><strong>Учебная запись исполнителя</strong><p>{item.text}</p><small>Состояние материала: {item.verification === 'verified' ? 'проверено' : item.verification === 'rejected' ? 'отклонено' : 'не проверено'}</small></div>)}
      <p className="stand-panel-foot">Записанная учебная история. Реальные работы не выполнялись.</p>
    </section>;
  }
  const events = data.story.audit.filter(item => item.actorId !== 'system-analysis').slice(-4);
  return <section className="stand-stage-panel" aria-label="История учебного сценария">
    <header><div><span className="stand-panel-label">Учебная история</span><h2>Решение остается за человеком</h2></div><span className="stand-panel-meta">Сохраненные действия</span></header>
    <ol className="stand-history">{events.map(item => <li key={item.eventId}><span>{actorLabel(item.actorId)}</span><div><strong>{auditLabel(item.action)}</strong><p>{item.reason}</p></div></li>)}</ol>
    <p className="stand-panel-foot">Демонстрация процесса на синтетических данных. Подключения к оборудованию нет.</p>
  </section>;
}

function ReadyStand({ data, onContinue }: { data: StandPackage; onContinue: StandDisplayProps['onContinue'] }) {
  const [clock, setClock] = useState<StandClock>({ index: 0, elapsed: 0 });
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [fullScreenError, setFullScreenError] = useState('');
  const scene = data.scenes[clock.index];
  const slice = data.slices[scene.slice];
  const elapsed = data.scenes.slice(0, clock.index).reduce((sum, item) => sum + item.durationSeconds * 1000, 0) + clock.elapsed;
  const duration = data.scenes.reduce((sum, item) => sum + item.durationSeconds * 1000, 0);

  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    const full = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', full);
    return () => { document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', full); };
  }, []);
  useEffect(() => {
    if (paused || hidden) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const current = performance.now();
      const delta = current - previous;
      previous = current;
      setClock(value => advanceStandClock(value, delta, data.scenes));
    }, 250);
    return () => window.clearInterval(timer);
  }, [data.scenes, paused, hidden]);
  function move(delta: number) { setClock(value => ({ index: (value.index + delta + data.scenes.length) % data.scenes.length, elapsed: 0 })); }
  async function toggleFullscreen() {
    setFullScreenError('');
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setFullScreenError('Полноэкранный режим недоступен в этом браузере.'); }
  }

  return <main className="stand-screen">
    <header className="stand-topbar"><div className="stand-identity"><span className="stand-brand-mark" aria-hidden="true"><svg viewBox="0 0 30 30" fill="none"><path d="M15 3v8m0 8v8M3 15h8m8 0h8M9 9l3 3m6 6 3 3m0-12-3 3m-6 6-3 3" stroke="currentColor" strokeWidth="1.6"/><circle cx="15" cy="15" r="4" stroke="currentColor" strokeWidth="1.6"/></svg></span><div><strong>{brand.productName}</strong><span>Демонстрационный стенд</span></div></div>
      <div className="stand-context"><span className="stand-mode">SIMULATION</span><span>Запись учебной симуляции</span><span className="stand-context-time">Время данных: <strong>{date(slice.virtualTime)}</strong></span></div></header>
    <div className="stand-body"><aside className="stand-rail" aria-label="Этапы учебного сценария"><span className="stand-rail-title">Путь от данных к решению</span><ol>{data.scenes.map((item, index) => <li key={item.id} className={index === clock.index ? 'stand-rail-active' : index < clock.index ? 'stand-rail-past' : ''}><span aria-hidden="true">{index + 1}</span><span>{item.title}</span></li>)}</ol><p>Советчик<br />Без команд в сеть</p></aside>
      <div className="stand-workspace"><div className="stand-story"><div className="stand-story-heading"><span className="stand-step">Этап {clock.index + 1} из {data.scenes.length}</span><h1>{scene.title}</h1><p>{scene.description}</p></div><div className="stand-caption">{scene.kind === 'approval' || scene.kind === 'history' || scene.kind === 'plan' ? 'Подготовленная учебная история' : 'Расчет по синтетическим наблюдениям'}</div></div><SceneContent data={data} scene={scene} /></div></div>
    <footer className="stand-footer"><div className="stand-progress" role="progressbar" aria-label="Прогресс цикла" aria-valuemin={0} aria-valuemax={180} aria-valuenow={Math.min(180, Math.floor(elapsed / 1000))}><span style={{ transform: `scaleX(${Math.min(1, elapsed / duration)})` }} /></div><div className="stand-toolbar"><div className="stand-controls" aria-label="Управление показом"><button type="button" onClick={() => move(-1)}>Назад</button><button type="button" onClick={() => setPaused(value => !value)}>{paused ? 'Продолжить' : 'Пауза'}</button><button type="button" onClick={() => move(1)}>Далее</button><button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? 'Свернуть экран' : 'На весь экран'}</button></div><button className="stand-primary" type="button" onClick={() => onContinue(scene.id)}>Продолжить с ведущим <span aria-hidden="true">→</span></button></div>
      <div className="stand-footer-meta"><span>Демонстрация · не подключено к оборудованию</span><span>Модель {data.provenance.modelVersion} · политика {data.provenance.policyVersion}</span></div>{fullScreenError && <p className="stand-fullscreen-error" role="status">{fullScreenError}</p>}</footer>
  </main>;
}

export function StandDisplay({ onContinue }: StandDisplayProps) {
  const [data, setData] = useState<StandPackage | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    loadStandPackage().then(value => { if (active) setData(value); }).catch(() => { if (active) setError('Не удалось открыть запись учебной симуляции. Проверьте файл данных и повторите попытку.'); });
    return () => { active = false; };
  }, [attempt]);
  if (error) return <main className="stand-message"><strong>SIMULATION · Запись учебной симуляции</strong><h1>Запись недоступна</h1><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Повторить загрузку</button></main>;
  if (!data) return <main className="stand-message" aria-live="polite"><strong>SIMULATION · Запись учебной симуляции</strong><h1>Открываем учебный сценарий</h1><p>Подготавливаем запись для показа.</p></main>;
  return <ReadyStand data={data} onContinue={onContinue} />;
}
