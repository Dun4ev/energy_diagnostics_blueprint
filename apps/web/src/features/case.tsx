import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { components } from '../api/generated';
import { Badge, Banner, Button, Card, Dialog, Empty, ErrorState, Loading, PageHeading } from '../design-system/components';
import { ApiFailure, actionLabel, assetTypeLabel, dataOriginLabel, date, evidenceOriginLabel, expectData, exportJson, fetchCaseSnapshot, href, methodStatusLabel, mutationHeaders, number, percent, planStateLabel, priorityLabel, qualityLabel, riskTone, signed, stateLabel, symptomLabel, temperature, useResource, type Identity, type Snapshot } from './shared';
import { TopologyCard } from './topology';

type S = components['schemas'];
const TemperatureChart = lazy(() => import('./chart').then(module => ({ default: module.TemperatureChart })));
const decisionTargets: Partial<Record<S['CaseState'], S['CaseState'][]>> = {
  detected: ['under_review'], under_review: ['awaiting_evidence'],
  awaiting_evidence: ['confirmed', 'not_confirmed', 'sensor_issue'],
  confirmed: ['remediation_planned'], remediation_planned: ['verification'],
  verification: ['under_review', 'closed'], sensor_issue: ['verification'], not_confirmed: ['verification'],
};

function Metric({ label, value, detail, emphasis = false }: { label: string; value: string; detail?: string; emphasis?: boolean }) {
  return <div className={`feature-metric ${emphasis ? 'feature-metric-emphasis' : ''}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function EvidencePanel({ snapshot, onAdd }: { snapshot: Snapshot; onAdd: () => void }) {
  return <Card title="Доказательства и качество" subtitle={`${snapshot.analysis.quality.freshSources} из ${snapshot.analysis.quality.totalSources} источников свежие`} actions={<Button variant="ghost" onClick={onAdd}>Открыть записи</Button>}>
    {snapshot.analysis.quality.issues.length ? <div className="feature-issues">{snapshot.analysis.quality.issues.map(issue => <div key={issue} className="feature-issue">{issue}</div>)}</div> : <p className="feature-muted">Критичных замечаний к текущему расчету нет.</p>}
    <div className="feature-separator" /><dl className="feature-definition"><div><dt>Качество</dt><dd>{qualityLabel[snapshot.analysis.quality.overall]}</dd></div><div><dt>Покрытие</dt><dd>{snapshot.analysis.quality.coverage === null ? 'Не указано' : percent(snapshot.analysis.quality.coverage)}</dd></div><div><dt>Место измерения</dt><dd>{snapshot.asset.measurementLocation}</dd></div></dl>
  </Card>;
}

function EvidenceDrawer({ open, onClose, snapshot, identity, run, refresh }: { open: boolean; onClose: () => void; snapshot: Snapshot; identity: Identity | null; run: string; refresh: () => void }) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  async function add(event: React.FormEvent) {
    event.preventDefault(); if (!identity) return;
    setPending(true); setFailure(null);
    try {
      expectData(await api.POST('/api/v1/evidence', { params: { query: { scenarioRunId: run }, header: mutationHeaders(identity) }, body: {
        caseId: snapshot.case.caseId, expectedRevision: snapshot.case.evidenceRevision, reason,
        observedAt: snapshot.analysis.asOf, kind: 'note', text, measurement: null, origin: 'synthetic',
      } }));
      setText(''); setReason(''); refresh(); onClose();
    } catch (error) { setFailure(error instanceof ApiFailure ? error : new ApiFailure(0, 'Нет связи с сервером.')); if (error instanceof ApiFailure && error.status === 409) refresh(); }
    finally { setPending(false); }
  }
  return <Dialog open={open} onClose={onClose} title="Доказательства" drawer><div className="feature-stack">
    {snapshot.evidence.length ? snapshot.evidence.map(item => <article className="feature-evidence" key={item.evidenceId}><div className="feature-between"><strong>{item.kind === 'thermography_metadata' ? 'Метаданные термографии' : item.kind === 'measurement' ? 'Измерение' : 'Запись'}</strong><Badge tone={item.verification === 'verified' ? 'low' : 'unknown'}>{item.verification === 'verified' ? 'Проверено' : 'Не подтверждено'}</Badge></div><p>{item.text}</p><small>Наблюдение: {date(item.observedAt)} · Получено: {date(item.receivedAt)} · {evidenceOriginLabel[item.origin]}</small><small className="feature-mono">{item.evidenceId}</small>{!item.hasImage && item.kind === 'thermography_metadata' && <p className="feature-muted">Изображение отсутствует: обследование не подтверждено.</p>}</article>) : <Empty title="Записей нет">Добавьте подтверждаемое наблюдение с указанием причины.</Empty>}
    {identity?.permissions.includes('evidence.add') && snapshot.analysis.mode === 'simulation' && <form className="feature-form" onSubmit={add}><h3>Добавить заметку</h3><label className="field">Наблюдение<textarea value={text} onChange={event => setText(event.target.value)} required /></label><label className="field">Основание добавления<input value={reason} onChange={event => setReason(event.target.value)} required /></label>{failure && <ErrorState message={failure.status === 409 ? 'Доказательства изменились. Проверьте обновленные записи.' : failure.status === 403 ? 'Нет права добавлять доказательства.' : failure.message} requestId={failure.requestId} /> }<Button variant="primary" disabled={pending}>{pending ? 'Сохраняем...' : 'Сохранить запись'}</Button></form>}
  </div></Dialog>;
}

function CaseDecision({ snapshot, identity, run, refresh }: { snapshot: Snapshot; identity: Identity | null; run: string; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const targets = decisionTargets[snapshot.case.state] || [];
  const [target, setTarget] = useState<S['CaseState']>(targets[0] || 'under_review');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const allowed = identity && snapshot.analysis.mode === 'simulation' && (identity.permissions.includes('case.review') || identity.permissions.includes('case.confirm') || identity.permissions.includes('case.close'));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!identity) return;
    setPending(true); setFailure(null);
    try {
      expectData(await api.POST('/api/v1/cases/{id}/decisions', { params: { path: { id: snapshot.case.caseId }, query: { scenarioRunId: run }, header: mutationHeaders(identity) }, body: {
        targetState: target, expectedRevision: snapshot.case.revision, evidenceRevision: snapshot.case.evidenceRevision,
        evidenceIds: snapshot.evidence.filter(item => item.verification === 'verified').map(item => item.evidenceId),
        reason, outcome: target === 'closed' || target === 'not_confirmed' || target === 'sensor_issue' ? reason : null,
      } }));
      setOpen(false); setReason(''); refresh();
    } catch (error) { setFailure(error instanceof ApiFailure ? error : new ApiFailure(0, 'Нет связи с сервером.')); if (error instanceof ApiFailure && error.status === 409) refresh(); }
    finally { setPending(false); }
  }
  return <>{allowed && targets.length > 0 && <Button onClick={() => setOpen(true)}>Решение по случаю</Button>}<Dialog open={open} onClose={() => setOpen(false)} title="Решение по случаю"><form className="feature-form" onSubmit={submit}><p className="feature-muted">Текущая ревизия {snapshot.case.revision}, доказательства {snapshot.case.evidenceRevision}. Сервер проверит полномочия и актуальность.</p><label className="field">Новое состояние<select value={target} onChange={event => setTarget(event.target.value as S['CaseState'])}>{targets.map(item => <option key={item} value={item}>{stateLabel[item]}</option>)}</select></label><label className="field">Основание<textarea value={reason} onChange={event => setReason(event.target.value)} required /></label>{failure && <ErrorState message={failure.status === 409 ? 'Случай изменился. Данные обновляются; проверьте ревизию.' : failure.status === 403 ? 'Нет права на это решение.' : failure.message} requestId={failure.requestId} />}<div className="dialog-actions"><Button type="button" onClick={() => setOpen(false)}>Отмена</Button><Button variant="primary" disabled={pending}>{pending ? 'Сохраняем...' : 'Записать решение'}</Button></div></form></Dialog></>;
}

function CreatePlan({ snapshot, identity, run }: { snapshot: Snapshot; identity: Identity | null; run: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const canCreate = identity?.permissions.includes('plan.edit') && snapshot.analysis.mode === 'simulation' && snapshot.analysis.nextActions.length > 0;
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!identity) return;
    setPending(true); setFailure(null);
    const steps: S['PlanStep'][] = snapshot.analysis.nextActions.map((action, index) => ({
      stepId: crypto.randomUUID(), number: index + 1, actionCode: action.code,
      description: action.reason, assigneeRole: 'technician', assigneeId: null,
      dueAt: null, dueWithinHours: action.dueWithinHours,
      dueAnchor: action.dueWithinHours === null ? 'reference_unspecified' : 'approved_at',
      requiredEvidence: [], condition: action.code === 'PLAN_MAINTENANCE_IF_CONFIRMED' ? 'defect_confirmed' : 'approved_plan',
      status: 'not_started', result: null, resultEvidenceIds: [],
    }));
    try {
      const result = expectData(await api.POST('/api/v1/work-plans', { params: { query: { scenarioRunId: run }, header: mutationHeaders(identity) }, body: {
        caseId: snapshot.case.caseId, analysisRunId: snapshot.analysis.analysisRunId,
        evidenceRevision: snapshot.case.evidenceRevision, expectedCaseRevision: snapshot.case.revision, reason, steps,
      } }));
      window.location.assign(href(`/work-plans/${encodeURIComponent(result.data.planId)}`, run));
    } catch (error) { setFailure(error instanceof ApiFailure ? error : new ApiFailure(0, 'Нет связи с сервером.')); }
    finally { setPending(false); }
  }
  return <>{canCreate && <Button variant="primary" onClick={() => setOpen(true)}>Создать проект проверки</Button>}<Dialog open={open} onClose={() => setOpen(false)} title="Проект проверочных мероприятий"><form className="feature-form" onSubmit={create}><p className="feature-muted">Шаги создаются из рекомендованных сервером действий. После создания их можно уточнить в проекте.</p><ul className="feature-simple-list">{snapshot.analysis.nextActions.map(action => <li key={action.code}>{actionLabel[action.code]}</li>)}</ul><label className="field">Основание проекта<textarea value={reason} onChange={event => setReason(event.target.value)} required /></label>{failure && <ErrorState message={failure.status === 409 ? 'Анализ или доказательства изменились. Обновите случай.' : failure.status === 403 ? 'Нет права создавать план.' : failure.message} requestId={failure.requestId} />}<div className="dialog-actions"><Button type="button" onClick={() => setOpen(false)}>Отмена</Button><Button variant="primary" disabled={pending}>{pending ? 'Создаем...' : 'Создать проект'}</Button></div></form></Dialog></>;
}

export function CasePage({ id, run, identity }: { id: string; run: string; identity: Identity | null }) {
  const [range, setRange] = useState<24 | 72 | 336>(() => Number(new URLSearchParams(window.location.search).get('hours') || 72) as 24 | 72 | 336);
  const [residual, setResidual] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const snapshot = useResource(`snapshot-${run}-${id}`, () => fetchCaseSnapshot(id, run));
  useEffect(() => { if (snapshot.data?.mode === 'reference' && !new URLSearchParams(window.location.search).has('hours')) setRange(336); }, [snapshot.data?.mode]);
  const analysis = snapshot.data?.data.analysis;
  const from = analysis ? new Date(new Date(analysis.asOf).getTime() - range * 3600000).toISOString() : '';
  const series = useResource(`series-${run}-${id}-${analysis?.analysisRunId || ''}-${range}`, async () => {
    if (!analysis) throw new ApiFailure(404, 'Анализ еще не загружен.');
    const fetchPage = async (offset: number) => expectData(await api.GET('/api/v1/cases/{id}/series', { params: { path: { id }, query: {
      scenarioRunId: run, analysisRunId: analysis.analysisRunId, from, to: analysis.asOf, limit: 1000, offset,
    } } }));
    const first = await fetchPage(0);
    const items = [...first.data.items];
    while (items.length < first.data.total) {
      const next = await fetchPage(items.length);
      if (!next.data.items.length) throw new ApiFailure(502, 'Сервер вернул неполный временной ряд.');
      items.push(...next.data.items);
    }
    return { ...first, data: { ...first.data, items } };
  });
  const history = useResource(`history-${run}-${id}`, async () => expectData(await api.GET('/api/v1/cases/{id}/history', { params: { path: { id }, query: { scenarioRunId: run, limit: 50, offset: 0 } } })));
  const relatedPlans = useResource(`case-plans-${run}-${id}`, async () => expectData(await api.GET('/api/v1/work-plans', { params: { query: { scenarioRunId: run, caseId: id, limit: 50, offset: 0 } } })));
  const current = snapshot.data?.data;
  if (snapshot.loading && !current) return <Loading />;
  if (snapshot.error && !current) return <ErrorState message={snapshot.error.message} requestId={snapshot.error.requestId} retry={snapshot.refresh} />;
  if (!current) return <Empty title="Случай не найден">Проверьте ссылку и выбранный запуск.</Empty>;
  const facts = current.analysis.metrics;
  const stage = current.case.state === 'closed' ? 5 : ['remediation_planned', 'verification'].includes(current.case.state) ? 4 : ['awaiting_evidence', 'confirmed', 'not_confirmed', 'sensor_issue'].includes(current.case.state) ? 3 : current.case.state === 'under_review' ? 2 : 1;
  const trends = current.details.trends;
  const exportPayload = { schemaVersion: '0.1.0', mode: snapshot.data?.mode, dataTime: snapshot.data?.dataTime,
    calculationOrigin: current.analysis.calculationOrigin, modelVersion: current.analysis.modelVersion,
    policyVersion: current.analysis.policyVersion, limitation: 'Советчик без команд в сеть. Индекс не вероятность отказа.',
    snapshot: current, series: series.data?.data.items || [], };
  return <div className="feature-stack feature-case"><PageHeading eyebrow={`Диагностический случай · ${current.case.caseId}`} title={current.asset.name} subtitle={<>{assetTypeLabel[current.asset.assetType]} · {symptomLabel(current.case.symptomFamily)} · Анализ <span className="feature-mono">{current.analysis.analysisRunId}</span></>} actions={<><Badge tone={riskTone(current.analysis.risk.priority)}>{current.analysis.status === 'insufficient_data' ? 'Данные недостаточны' : current.analysis.status === 'requires_review' ? 'Требует проверки' : 'Наблюдение'}</Badge><Button onClick={() => window.print()}>Печать</Button><Button onClick={() => exportJson(`case-${current.case.caseId}.json`, exportPayload)}>Экспорт JSON</Button></>} />
    <div className="feature-print-meta">{snapshot.data?.mode === 'reference' ? 'REFERENCE · иллюстрация презентации' : 'SIMULATION · синтетический расчет'} · Время данных {date(snapshot.data?.dataTime || null)} · Версии: {current.analysis.modelVersion || 'не применимо'} / {current.analysis.policyVersion || 'не применимо'}</div>
    {snapshot.stale && <Banner tone="high" title="Сохраненная карточка">Нет связи с сервером. Решения и проект плана недоступны.</Banner>}
    {current.analysis.mode === 'reference' && <Banner tone="blue" title="Иллюстрация презентации">Числа 7,2/10, 80/68/+12 °C взяты со слайда и не являются результатом расчета по наблюдениям.</Banner>}
    {current.analysis.status === 'insufficient_data' && <Banner tone="unknown" title="Текущий риск неизвестен">Недостаточные данные не означают безопасное состояние. Проверьте источники и открытый случай.</Banner>}
    <div className="feature-case-meta"><div><span>Состояние</span><strong>{stateLabel[current.case.state]}</strong></div><div><span>Время данных</span><strong>{date(current.analysis.asOf)}</strong></div><div><span>Ревизия случая</span><strong>{current.case.revision}</strong></div><div><span>Ревизия доказательств</span><strong>{current.case.evidenceRevision}</strong></div></div>
    <div className="feature-case-grid"><div className="feature-stack"><Card title="Температура с поправкой на нагрузку" subtitle={`Модель и наблюдение · ${range} ч`} actions={<div className="feature-chart-controls"><label className="field">Период<select value={range} onChange={event => { const value = Number(event.target.value) as 24 | 72 | 336; setRange(value); const url = new URL(window.location.href); url.searchParams.set('hours', String(value)); window.history.replaceState(null, '', url); }}><option value={24}>24 часа</option><option value={72}>72 часа</option><option value={336}>14 суток</option></select></label><Button variant={residual ? 'secondary' : 'primary'} onClick={() => setResidual(false)}>Температура</Button><Button variant={residual ? 'primary' : 'secondary'} onClick={() => setResidual(true)}>Остаток</Button></div>}>
      {series.loading && !series.data && <Loading label="Загружаем ряд..." />}{series.error && !series.data && <ErrorState message={series.error.message} retry={series.refresh} />}{series.stale && <Banner tone="high" title="Ряд сохранен">Точки могли обновиться.</Banner>}{series.data && <><Suspense fallback={<Loading label="Готовим график..." />}><TemperatureChart points={series.data.data.items} residual={residual} /></Suspense><p className="feature-footnote">Ряд сервера: {series.data.data.items.length ? `${date(series.data.data.items[0].eventTime)} – ${date(series.data.data.items[series.data.data.items.length - 1].eventTime)}. ` : ''}Показано {series.data.data.items.length} из {series.data.data.total} точек. Историческая полоса не является прогнозом. Анализ {current.analysis.analysisRunId}.</p></>}
    </Card><div className="feature-metrics"><Metric label="Измерено" value={temperature(facts.observedTemperatureC)} /><Metric label="Ожидалось" value={temperature(facts.expectedTemperatureC)} /><Metric label="Отклонение" value={facts.residualC === null ? 'Нет данных' : `${signed(facts.residualC)} °C`} emphasis /><Metric label="Нагрузка" value={percent(facts.loadFraction)} /><Metric label="Наружная температура" value={temperature(facts.ambientC)} /></div><TopologyCard snapshot={current} /></div>
      <div className="feature-stack"><EvidencePanel snapshot={current} onAdd={() => setDrawer(true)} /><Card title="Инженерный вывод" subtitle="Гипотеза, а не подтвержденный дефект"><div className="feature-assessment"><div><span>Пилотный индекс</span><strong>{current.analysis.risk.score === null ? 'Неизвестно' : `${number(current.analysis.risk.score)}/10`}</strong><Badge tone={riskTone(current.analysis.risk.priority)}>{priorityLabel[current.analysis.risk.priority]}</Badge></div><p>{current.analysis.risk.label}</p></div>
        {current.analysis.hypotheses.length ? current.analysis.hypotheses.map(item => <article className="feature-hypothesis" key={item.code}><h3>{item.title}</h3><p>Не подтверждено. Не хватает: {item.missingEvidence.length ? item.missingEvidence.join('; ') : 'инженерного решения по доказательствам'}.</p>{item.supportEvidenceIds.length > 0 && <small>Поддерживающие записи: {item.supportEvidenceIds.join(', ')}</small>}</article>) : <p className="feature-muted">Подтверждаемой гипотезы по текущему анализу нет.</p>}
        <div className="feature-separator" /><h3>Наблюдаемые признаки</h3><dl className="feature-definition"><div><dt>Тренд {facts.trendWindowHours || '—'} ч</dt><dd>{facts.slopeCPerDay === null ? 'Не определен' : `${signed(facts.slopeCPerDay, 2)} °C/сут`}</dd></div>{trends.map(item => <div key={item.windowHours}><dt>{item.windowHours} ч · {item.hourlyBins} интервалов</dt><dd>{item.slopeCPerDay === null ? item.reason || 'Не определен' : `${signed(item.slopeCPerDay, 2)} °C/сут`}</dd></div>)}<div><dt>Вероятность отказа</dt><dd>Не рассчитывается</dd></div></dl>
        <div className="feature-separator" /><h3>Следующие проверки</h3><ul className="feature-simple-list">{current.analysis.nextActions.map(action => <li key={action.code}><strong>{actionLabel[action.code]}</strong><span>{action.reason}</span></li>)}</ul>
        {relatedPlans.data?.data.items.length ? <div className="feature-related-plans"><h3>Связанные планы</h3>{relatedPlans.data.data.items.map(plan => <a key={plan.planId} href={href(`/work-plans/${encodeURIComponent(plan.planId)}`, run)}>{plan.planId} · {planStateLabel[plan.state]}</a>)}</div> : null}
        <div className="feature-actions"><CaseDecision snapshot={current} identity={identity && !snapshot.stale ? identity : null} run={run} refresh={() => { snapshot.refresh(); history.refresh(); }} /><CreatePlan snapshot={current} identity={identity && !snapshot.stale ? identity : null} run={run} /></div>
      </Card></div></div>
    <Card title="Ход рассмотрения" subtitle="Решения фиксируются сервером с автором, основанием и ревизией"><div className="feature-timeline">{['Сигнал', 'Разбор', 'Доказательства', 'План', 'Решение'].map((label, index) => <div key={label} className={`feature-timeline-step ${stage >= index + 1 ? 'active' : ''}`}><span>{index + 1}</span><strong>{label}</strong></div>)}</div>{history.loading && !history.data && <Loading label="Загружаем историю..." />}{history.error && !history.data && <ErrorState message={history.error.message} retry={history.refresh} />}{history.data?.data.items.length ? <ul className="feature-history">{history.data.data.items.map(item => <li key={item.eventId}><time>{date(item.timestamp)}</time><strong>{item.action}</strong><span>{item.reason}</span><small>{item.actorId} · rev {item.previousRevision} → {item.newRevision}</small></li>)}</ul> : <p className="feature-muted">Записи истории пока отсутствуют.</p>}</Card>
    <Card title="Происхождение расчета"><dl className="feature-definition feature-provenance"><div><dt>Режим / источник</dt><dd>{current.analysis.mode === 'reference' ? 'Иллюстрация' : 'Синтетический расчет'} / {dataOriginLabel[current.analysis.calculationOrigin]}</dd></div><div><dt>Время расчета</dt><dd>{date(current.analysis.asOf)}</dd></div><div><dt>Модель / политика</dt><dd>{current.analysis.modelVersion || 'Иллюстрация'} / {current.analysis.policyVersion || 'Иллюстрация'}</dd></div><div><dt>Снимок входа</dt><dd className="feature-mono">{current.analysis.inputSnapshotId}</dd></div><div><dt>Метод</dt><dd>{methodStatusLabel[current.details.methodStatus]}{current.details.methodReason ? ` · ${current.details.methodReason}` : ''}</dd></div><div><dt>Границы данных</dt><dd>{date(current.details.inputWindow.start)} — {date(current.details.inputWindow.end)}</dd></div></dl></Card>
    <EvidenceDrawer open={drawer} onClose={() => setDrawer(false)} snapshot={current} identity={identity && !snapshot.stale ? identity : null} run={run} refresh={snapshot.refresh} />
  </div>;
}
