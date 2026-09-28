import { useState } from 'react';
import { api } from '../api/client';
import type { components } from '../api/generated';
import { Badge, Banner, Button, Card, DataTable, Dialog, Empty, ErrorState, Loading, PageHeading } from '../design-system/components';
import { ApiFailure, actionLabel, date, expectData, fetchCaseSnapshot, href, mutationHeaders, planStateLabel, roleLabel, useResource, type Identity, type Plan } from './shared';

type S = components['schemas'];
const stepStatusLabel: Record<S['PlanStep']['status'], string> = { not_started: 'Не начат', in_progress: 'В работе', result_recorded: 'Результат записан', verified: 'Проверен' };
const due = (step: S['PlanStep']) => step.dueAt ? date(step.dueAt) : step.dueWithinHours ? `В течение ${step.dueWithinHours} ч после ${step.dueAnchor === 'approved_at' ? 'согласования' : 'открытия случая'}` : 'Срок не задан';

function EvidenceChoice({ evidence, selected, onChange, caseId, run }: { evidence: S['Evidence'][]; selected: string[]; onChange: (ids: string[]) => void; caseId: string; run: string }) {
  return <fieldset className="feature-evidence-choice"><legend>Подтверждающие записи</legend><p className="feature-muted">Выбор записи прикладывает ее к решению, но не делает проверенной. Результаты отдельно проверяет согласующий.</p>{evidence.length ? evidence.map(item => <label key={item.evidenceId} className="feature-check"><input type="checkbox" checked={selected.includes(item.evidenceId)} disabled={item.verification === 'rejected'} onChange={event => onChange(event.target.checked ? [...selected, item.evidenceId] : selected.filter(id => id !== item.evidenceId))} /><span>{item.text || 'Запись без описания'}<small>{date(item.observedAt)} · {item.verification === 'verified' ? 'проверено' : item.verification === 'rejected' ? 'отклонено' : 'не проверено'}</small></span></label>) : <p className="feature-muted">В случае пока нет записей.</p>}<a href={href(`/diagnostics/cases/${encodeURIComponent(caseId)}`, run)}>Открыть доказательства случая →</a></fieldset>;
}

function mutationError(error: ApiFailure) {
  if (error.status === 403) return 'Сервер отказал: у текущего пользователя нет права на действие.';
  if (error.status === 409) return 'Ревизия анализа, доказательств или плана изменилась. Проверьте обновленные данные.';
  if (error.status === 422) return 'Действие не соответствует текущему состоянию. Проверьте основание и шаги.';
  return error.message;
}

function EditPlan({ plan, identity, run, refresh }: { plan: Plan; identity: Identity; run: string; refresh: () => void }) {
  const [steps, setSteps] = useState(plan.steps.map(step => ({ ...step, assigneeRole: 'technician' as const })));
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setFailure(null);
    try {
      expectData(await api.PATCH('/api/v1/work-plans/{id}', { params: { path: { id: plan.planId }, query: { scenarioRunId: run }, header: mutationHeaders(identity) }, body: {
        expectedRevision: plan.revision, evidenceIds: [], reason, steps,
      } }));
      setReason(''); refresh();
    } catch (error) { setFailure(error instanceof ApiFailure ? error : new ApiFailure(0, 'Нет связи с сервером.')); if (error instanceof ApiFailure && error.status === 409) refresh(); }
    finally { setPending(false); }
  }
  return <Card title="Редактировать проект" subtitle={`Ревизия ${plan.revision} · изменения сохраняются только после ответа сервера`}><form className="feature-form" onSubmit={save}>
    <p className="feature-muted">Результаты шагов может записать только исполнитель. При сохранении проекта шаги назначаются роли «Исполнитель».</p>{steps.map((step, index) => <fieldset className="feature-step-editor" key={step.stepId}><legend>Шаг {step.number} · {actionLabel[step.actionCode]}</legend><label className="field">Описание<textarea value={step.description} onChange={event => setSteps(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} required /></label><div className="feature-form-grid"><label className="field">Ответственный<select value="technician" disabled><option value="technician">Исполнитель</option></select></label><label className="field">Срок, ч после согласования<input type="number" min="1" step="1" value={step.dueWithinHours || ''} onChange={event => setSteps(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, dueWithinHours: event.target.value ? Number(event.target.value) : null, dueAnchor: event.target.value ? 'approved_at' : 'reference_unspecified' } : item))} /></label></div><label className="field">Нужные подтверждения, через запятую<input value={step.requiredEvidence.join(', ')} onChange={event => setSteps(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, requiredEvidence: event.target.value.split(',').map(value => value.trim()).filter(Boolean) } : item))} /></label><p className="feature-muted">Условие: {step.condition === 'defect_confirmed' ? 'только после подтверждения дефекта' : 'после согласования плана'}</p></fieldset>)}
    <label className="field">Основание изменения<textarea value={reason} onChange={event => setReason(event.target.value)} required /></label>
    {failure && <ErrorState message={mutationError(failure)} requestId={failure.requestId} />}
    <Button variant="primary" disabled={pending}>{pending ? 'Сохраняем...' : 'Сохранить проект'}</Button>
  </form></Card>;
}

function PlanMutation({ plan, identity, run, caseAnalysisId, caseEvidenceRevision, evidence, refresh }: { plan: Plan; identity: Identity; run: string; caseAnalysisId: string | null; caseEvidenceRevision: number | null; evidence: S['Evidence'][]; refresh: () => void }) {
  const [action, setAction] = useState<'submit' | 'approved' | 'rejected' | 'in_progress' | 'awaiting_verification' | 'completed' | null>(null);
  const [reason, setReason] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const stale = plan.staleReview || caseAnalysisId !== plan.analysisRunId || (['draft', 'submitted', 'approved'].includes(plan.state) && caseEvidenceRevision !== plan.evidenceRevision);
  const actions: { action: NonNullable<typeof action>; label: string; permission: S['Permission'] }[] = [];
  if (plan.state === 'draft') actions.push({ action: 'submit', label: 'Передать на согласование', permission: 'plan.edit' });
  if (plan.state === 'submitted') actions.push({ action: 'approved', label: 'Согласовать', permission: 'plan.approve' }, { action: 'rejected', label: 'Отклонить', permission: 'plan.approve' });
  if (plan.state === 'approved') actions.push({ action: 'in_progress', label: 'Начать выполнение', permission: 'step.result' });
  if (plan.state === 'in_progress') actions.push({ action: 'awaiting_verification', label: 'Передать на проверку', permission: 'step.result' });
  if (plan.state === 'awaiting_verification') actions.push({ action: 'completed', label: 'Записать завершение', permission: 'plan.approve' });
  async function commit(event: React.FormEvent) {
    event.preventDefault(); if (!action) return;
    setPending(true); setFailure(null);
    try {
      const base = { expectedRevision: plan.revision, analysisRunId: plan.analysisRunId,
        evidenceRevision: plan.evidenceRevision, evidenceIds, reason };
      if (action === 'submit') expectData(await api.POST('/api/v1/work-plans/{id}/submit', { params: { path: { id: plan.planId }, query: { scenarioRunId: run }, header: mutationHeaders(identity) }, body: base }));
      else expectData(await api.POST('/api/v1/work-plans/{id}/decisions', { params: { path: { id: plan.planId }, query: { scenarioRunId: run }, header: mutationHeaders(identity) }, body: { ...base, action } }));
      setAction(null); setReason(''); setEvidenceIds([]); refresh();
    } catch (error) { setFailure(error instanceof ApiFailure ? error : new ApiFailure(0, 'Нет связи с сервером.')); if (error instanceof ApiFailure && error.status === 409) refresh(); }
    finally { setPending(false); }
  }
  return <><div className="feature-actions">{actions.filter(item => identity.permissions.includes(item.permission)).map(item => <Button key={item.action} variant={item.action === 'approved' || item.action === 'submit' ? 'primary' : 'secondary'} disabled={stale && item.action !== 'rejected'} onClick={() => { setFailure(null); setAction(item.action); }}>{item.label}</Button>)}</div>
    {stale && <Banner tone="medium" title="План требует повторной проверки">Основание плана изменилось. <a href={href(`/diagnostics/cases/${encodeURIComponent(plan.caseId)}`, run)}>Откройте случай и подготовьте новый проект проверки →</a></Banner>}
    <Dialog open={action !== null} onClose={() => setAction(null)} title={actions.find(item => item.action === action)?.label || 'Решение по плану'}><form className="feature-form" onSubmit={commit}><p className="feature-muted">Сервер проверит текущие версии плана, анализа и доказательств.</p><label className="field">Основание<textarea value={reason} onChange={event => setReason(event.target.value)} required /></label><EvidenceChoice evidence={evidence} selected={evidenceIds} onChange={setEvidenceIds} caseId={plan.caseId} run={run} />{failure && <ErrorState message={mutationError(failure)} requestId={failure.requestId} />}<div className="dialog-actions"><Button type="button" onClick={() => setAction(null)}>Отмена</Button><Button variant="primary" disabled={pending}>{pending ? 'Отправляем...' : 'Записать решение'}</Button></div></form></Dialog>
  </>;
}

function StepResult({ plan, identity, run, observedAt, evidence, refresh }: { plan: Plan; identity: Identity; run: string; observedAt: string; evidence: S['Evidence'][]; refresh: () => void }) {
  const [stepId, setStepId] = useState<string | null>(null);
  const [conclusion, setConclusion] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!stepId) return;
    setPending(true); setFailure(null);
    try {
      expectData(await api.POST('/api/v1/work-plans/{id}/step-results', { params: { path: { id: plan.planId }, query: { scenarioRunId: run }, header: mutationHeaders(identity) }, body: {
        stepId, expectedRevision: plan.revision, observedAt, conclusion,
        evidenceIds, reason: conclusion,
      } }));
      setStepId(null); setConclusion(''); setEvidenceIds([]); refresh();
    } catch (error) { setFailure(error instanceof ApiFailure ? error : new ApiFailure(0, 'Нет связи с сервером.')); if (error instanceof ApiFailure && error.status === 409) refresh(); }
    finally { setPending(false); }
  }
  return <><div className="feature-step-result-buttons">{plan.steps.map(step => <Button key={step.stepId} onClick={() => setStepId(step.stepId)}>Результат шага {step.number}</Button>)}</div><Dialog open={stepId !== null} onClose={() => setStepId(null)} title="Записать результат проверки"><form className="feature-form" onSubmit={submit}><p>Шаг {plan.steps.find(step => step.stepId === stepId)?.number}: {plan.steps.find(step => step.stepId === stepId)?.description}</p><label className="field">Заключение<textarea value={conclusion} onChange={event => setConclusion(event.target.value)} required /></label><EvidenceChoice evidence={evidence} selected={evidenceIds} onChange={setEvidenceIds} caseId={plan.caseId} run={run} />{failure && <ErrorState message={mutationError(failure)} requestId={failure.requestId} />}<div className="dialog-actions"><Button type="button" onClick={() => setStepId(null)}>Отмена</Button><Button variant="primary" disabled={pending}>{pending ? 'Сохраняем...' : 'Сохранить результат'}</Button></div></form></Dialog></>;
}

export function PlanPage({ id, run, identity }: { id: string; run: string; identity: Identity | null }) {
  const planResource = useResource(`plan-${run}-${id}`, async () => expectData(await api.GET('/api/v1/work-plans/{id}', { params: { path: { id }, query: { scenarioRunId: run } } })));
  const plan = planResource.data?.data;
  const caseResource = useResource(`plan-case-${run}-${plan?.caseId || ''}`, async () => {
    if (!plan) throw new ApiFailure(404, 'План еще не загружен.');
    return fetchCaseSnapshot(plan.caseId, run);
  });
  if (planResource.loading && !plan) return <Loading />;
  if (planResource.error && !plan) return <ErrorState message={planResource.error.message} retry={planResource.refresh} />;
  if (!plan) return <Empty title="План не найден">Проверьте ссылку и выбранный запуск.</Empty>;
  const currentCase = caseResource.data?.data;
  const mutationIdentity = planResource.stale || caseResource.stale ? null : identity;
  return <div className="feature-stack"><PageHeading eyebrow="Проверочные мероприятия" title={`План проверки · ${currentCase?.asset.name || `случай ${plan.caseId}`}`} subtitle={<><a href={href(`/diagnostics/cases/${encodeURIComponent(plan.caseId)}`, run)}>Открыть диагностический случай</a> · {plan.steps.length} шагов</>} actions={<Badge tone={plan.state === 'approved' || plan.state === 'completed' ? 'low' : plan.state === 'rejected' ? 'high' : 'medium'}>{planStateLabel[plan.state]}</Badge>} />
    {planResource.stale && <Banner tone="high" title="Показан сохраненный план">Нет связи с сервером. Действия недоступны.</Banner>}
    {planResource.data?.mode === 'reference' && <Banner tone="blue" title="Иллюстрация презентации">Состояние и шаги взяты из демонстрационного источника; согласование здесь недоступно.</Banner>}
    {caseResource.loading && !currentCase && <Loading label="Проверяем актуальность анализа..." />}
    {caseResource.error && !currentCase && <ErrorState message={caseResource.error.message} retry={caseResource.refresh} />}
    {currentCase && (currentCase.analysis.analysisRunId !== plan.analysisRunId || (['draft', 'submitted', 'approved'].includes(plan.state) && currentCase.case.evidenceRevision !== plan.evidenceRevision) || plan.staleReview) && <Banner tone="medium" title="Основание плана устарело">Основание проекта требует пересмотра. <a href={href(`/diagnostics/cases/${encodeURIComponent(plan.caseId)}`, run)}>Создайте новый проект из текущего случая →</a></Banner>}
    <div className="feature-plan-meta"><div><span>Состояние</span><strong>{planStateLabel[plan.state]}</strong></div><div><span>Ревизия</span><strong>{plan.revision}</strong></div><div><span>Доказательства</span><strong>rev {plan.evidenceRevision}</strong></div><div><span>Ответственный за проект</span><strong>{plan.authorId}</strong></div></div>
    <Card title="Шаги проверки" subtitle="Это проект действий. Физические работы выполняются по отдельному порядку допуска."><DataTable label="Шаги плана"><thead><tr><th>№ / проверка</th><th>Ответственный</th><th>Срок и условие</th><th>Нужные подтверждения</th><th>Состояние и результат</th></tr></thead><tbody>{plan.steps.map(step => <tr key={step.stepId}><td><strong>{step.number}. {step.description}</strong><span className="secondary-line">{actionLabel[step.actionCode]}</span></td><td>{step.assigneeId || roleLabel[step.assigneeRole]}</td><td>{due(step)}<span className="secondary-line">{step.condition === 'defect_confirmed' ? 'После подтверждения дефекта' : 'После согласования'}</span></td><td>{step.requiredEvidence.length ? step.requiredEvidence.join(', ') : 'Не указаны'}</td><td><strong>{stepStatusLabel[step.status]}</strong>{step.result && <><span className="secondary-line">{step.result.conclusion}</span><span className="secondary-line">Наблюдение: {date(step.result.observedAt)} · Записано: {date(step.result.recordedAt)}</span><span className="secondary-line">Автор: {step.result.actorId}</span>{step.result.evidenceIds.length > 0 && <details className="feature-details"><summary>Подтверждающие записи ({step.result.evidenceIds.length})</summary><span className="feature-mono">{step.result.evidenceIds.join(', ')}</span></details>}</>}</td></tr>)}</tbody></DataTable></Card>
    {mutationIdentity && planResource.data?.mode === 'simulation' && plan.state === 'draft' && mutationIdentity.permissions.includes('plan.edit') && <EditPlan key={plan.revision} plan={plan} identity={mutationIdentity} run={run} refresh={planResource.refresh} />}
    {mutationIdentity && planResource.data?.mode === 'simulation' && currentCase && <PlanMutation plan={plan} identity={mutationIdentity} run={run} caseAnalysisId={currentCase.analysis.analysisRunId} caseEvidenceRevision={currentCase.case.evidenceRevision} evidence={currentCase.evidence} refresh={() => { planResource.refresh(); caseResource.refresh(); }} />}
    {mutationIdentity && currentCase && planResource.data?.mode === 'simulation' && ['approved', 'in_progress', 'awaiting_verification'].includes(plan.state) && mutationIdentity.permissions.includes('step.result') && <Card title="Результаты шагов" subtitle="Укажите заключение и подтверждающие записи"><StepResult plan={plan} identity={mutationIdentity} run={run} observedAt={currentCase.analysis.asOf} evidence={currentCase.evidence} refresh={planResource.refresh} /></Card>}
    <Card title="Происхождение плана"><dl className="feature-definition feature-provenance"><div><dt>ID плана</dt><dd className="feature-mono">{plan.planId}</dd></div><div><dt>ID анализа</dt><dd className="feature-mono">{plan.analysisRunId}</dd></div><div><dt>Ревизия плана</dt><dd>{plan.revision}</dd></div><div><dt>Ревизия доказательств</dt><dd>{plan.evidenceRevision}</dd></div></dl></Card>
    <Card title="Границы решения"><p className="feature-muted">Одобрение проекта не отдает команд оборудованию и не подтверждает дефект автоматически. Сервер проверяет права, состояние и ревизии перед записью.</p></Card>
  </div>;
}

export function PlansPage({ run }: { run: string }) {
  const plans = useResource(`plans-${run}`, async () => expectData(await api.GET('/api/v1/work-plans', { params: { query: { scenarioRunId: run, limit: 100, offset: 0 } } })));
  return <div className="feature-stack"><PageHeading eyebrow="Проверочные мероприятия" title="Задания ТОиР" subtitle="Планы связаны с диагностическим случаем, анализом и ревизией доказательств." />
    {plans.loading && !plans.data && <Loading />}{plans.error && !plans.data && <ErrorState message={plans.error.message} retry={plans.refresh} />}
    {plans.stale && <Banner tone="high" title="Сохраненный список">Состояния планов могли измениться.</Banner>}
    {plans.data && <Card title={`${plans.data.data.total} планов`} subtitle={`Время данных: ${date(plans.data.dataTime)}`}><DataTable label="Список проверочных планов"><thead><tr><th>План / случай</th><th>Состояние</th><th>Анализ</th><th>Шаги</th></tr></thead><tbody>{plans.data.data.items.map(plan => <tr key={plan.planId}><td><a href={href(`/work-plans/${encodeURIComponent(plan.planId)}`, run)}><strong>{plan.planId}</strong></a><span className="secondary-line"><a href={href(`/diagnostics/cases/${encodeURIComponent(plan.caseId)}`, run)}>{plan.caseId}</a></span></td><td><Badge tone={plan.staleReview ? 'medium' : plan.state === 'approved' ? 'low' : 'unknown'}>{planStateLabel[plan.state]}</Badge>{plan.staleReview && <span className="secondary-line">Нужен пересмотр</span>}</td><td className="feature-mono">{plan.analysisRunId}<span className="secondary-line">Доказательства rev {plan.evidenceRevision}</span></td><td>{plan.steps.length}</td></tr>)}</tbody></DataTable>{plans.data.data.items.length === 0 && <Empty title="Планов пока нет">Создайте проект из карточки диагностического случая.</Empty>}</Card>}
  </div>;
}
