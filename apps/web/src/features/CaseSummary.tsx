import type { ReactNode } from 'react';
import { Badge, Button } from '../design-system/components';
import { actionLabel, date, href, number, percent, planStateLabel, priorityLabel, qualityLabel, signed, stateLabel, temperature, type Plan, type Snapshot } from './shared';
import './case-summary.css';

export const CASE_SUMMARY_SECTION_IDS = ['case-summary-conclusion', 'case-summary-basis', 'case-summary-missing', 'case-summary-next'] as const;

type Props = {
  snapshot: Snapshot;
  dataTime: string;
  run: string;
  plans: Plan[] | null;
  plansLoading: boolean;
  plansError: string | null;
  plansStale: boolean;
  onRetryPlans: () => void;
  onOpenEvidence: (id?: string) => void;
  actions?: ReactNode;
  tourNavigation?: ReactNode;
  activeStep: 1 | 2 | 3 | 4 | null;
};

const verificationLabels = { verified: 'Проверено', unverified: 'Не подтверждено', rejected: 'Отклонено' } as const;

export function CaseSummary({ snapshot, dataTime, run, plans, plansLoading, plansError, plansStale, onRetryPlans, onOpenEvidence, actions, tourNavigation, activeStep }: Props) {
  const { analysis, case: diagnosticCase, evidence } = snapshot;
  const reference = analysis.mode === 'reference';
  const facts = analysis.metrics;
  const missing = [...new Set([...analysis.hypotheses.flatMap(item => item.missingEvidence), ...analysis.quality.issues].map(item => item.trim()).filter(Boolean))];
  const supportIds = [...new Set(analysis.hypotheses.flatMap(item => item.supportEvidenceIds))];
  const sectionProps = (index: 0 | 1 | 2 | 3) => ({
    id: CASE_SUMMARY_SECTION_IDS[index],
    tabIndex: -1,
    'aria-labelledby': `${CASE_SUMMARY_SECTION_IDS[index]}-heading`,
    className: `case-summary-section${activeStep === index + 1 ? ' is-tour-active' : ''}`,
  });

  return <div className="case-summary">
    <div className="case-summary-context"><strong>{reference ? 'REFERENCE · иллюстрация презентации' : 'SIMULATION · синтетический расчет'}</strong><span>Время данных: {date(dataTime)}</span></div>
    <div className="case-summary-grid">
      <section {...sectionProps(0)}>
        <h2 id="case-summary-conclusion-heading">Вывод</h2>
        <div className="case-summary-status"><Badge tone={analysis.risk.priority}>{priorityLabel[analysis.risk.priority]}</Badge><strong>{analysis.status === 'insufficient_data' ? 'Текущий риск неизвестен' : analysis.status === 'requires_review' ? 'Требует проверки' : 'Наблюдение'}</strong></div>
        <p>Пилотный индекс: <strong>{analysis.risk.score === null ? 'Неизвестно' : `${number(analysis.risk.score)}/${analysis.risk.scaleMax}`}</strong>. Не вероятность отказа.</p>
        <p className="case-summary-muted">{analysis.risk.label}</p>
        {analysis.hypotheses.length ? <ul className="case-summary-list">{analysis.hypotheses.map(item => <li key={item.code}><strong>{item.title}</strong><span>Гипотеза не подтверждена.</span></li>)}</ul> : <p>Причина по текущему анализу не установлена.</p>}
        <p>Состояние случая: <strong>{stateLabel[diagnosticCase.state]}</strong>.</p>
        {analysis.status === 'insufficient_data' && <p>Недостаточные данные не означают безопасное состояние.</p>}
        {activeStep === 1 && tourNavigation}
      </section>
      <section {...sectionProps(1)}>
        <h2 id="case-summary-basis-heading">Основания</h2>
        <p className="case-summary-muted">{reference ? 'Значения со слайда; расчет по наблюдениям не выполнялся.' : 'Расчет сервера по синтетическим наблюдениям.'}</p>
        <dl className="case-summary-metrics">
          <div><dt>{reference ? 'Температура на слайде' : 'Измерено'}</dt><dd>{temperature(facts.observedTemperatureC)}</dd></div>
          <div><dt>Ожидалось</dt><dd>{temperature(facts.expectedTemperatureC)}</dd></div>
          <div><dt>Отклонение</dt><dd>{facts.residualC === null ? 'Нет данных' : `${signed(facts.residualC)} °C`}</dd></div>
          <div><dt>Нагрузка</dt><dd>{percent(facts.loadFraction)}</dd></div>
        </dl>
        <p>Качество: {qualityLabel[analysis.quality.overall]}. Свежих источников анализа: {analysis.quality.freshSources} из {analysis.quality.totalSources}.</p>
        <p className="case-summary-muted">Это сводка источников анализа, а не число записей случая.</p>
        {supportIds.length > 0 && <ul className="case-summary-list">{supportIds.map(id => {
          const item = evidence.find(record => record.evidenceId === id);
          return <li key={id}>{item ? <><button type="button" className="case-summary-evidence" onClick={() => onOpenEvidence(id)}>{item.text || 'Открыть поддерживающую запись'}</button><span>{verificationLabels[item.verification]} · {date(item.observedAt)}</span>{item.verification !== 'verified' && <span>Запись не подтверждает гипотезу автоматически.</span>}</> : <span>Поддерживающая запись {id} недоступна в снимке.</span>}</li>;
        })}</ul>}
        <Button variant="ghost" onClick={() => onOpenEvidence()}>Открыть записи случая ({evidence.length})</Button>
        {!evidence.length && <p className="case-summary-muted">Записи случая отсутствуют.</p>}
        {activeStep === 2 && tourNavigation}
      </section>
      <section {...sectionProps(2)}>
        <h2 id="case-summary-missing-heading">Чего не хватает</h2>
        {missing.length ? <ul className="case-summary-list case-summary-bullets">{missing.map(item => <li key={item}>{item}</li>)}</ul> : <p>Недостающие материалы в анализе не перечислены. Это не подтверждает достаточность данных.</p>}
        {activeStep === 3 && tourNavigation}
      </section>
      <section {...sectionProps(3)}>
        <h2 id="case-summary-next-heading">Следующая проверка</h2>
        {analysis.nextActions.length ? <ol className="case-summary-list case-summary-bullets">{analysis.nextActions.map((action, index) => <li key={`${action.code}-${index}`}><strong>{actionLabel[action.code]}</strong><span>{action.reason}</span>{action.dueWithinHours !== null && <span>{reference ? `Срок на слайде: ${number(action.dueWithinHours, 0)} ч; точка отсчета требует уточнения.` : `Срок рекомендации: ${number(action.dueWithinHours, 0)} ч; дата исполнения здесь не назначается.`}</span>}{action.requiresHumanApproval && <span className="case-summary-muted">Требуется согласование человеком.</span>}</li>)}</ol> : <p>Следующая проверка сервером не указана.</p>}
        <div className="case-summary-plans"><h3>Связанные планы</h3>
          {plansLoading && <p role="status">{plans === null ? 'Загружаем планы...' : 'Обновляем планы...'}</p>}
          {plansError && <div><p role="alert">Не удалось получить планы: {plansError}</p><Button variant="ghost" onClick={onRetryPlans}>Повторить загрузку планов</Button></div>}
          {plansStale && <p>Показаны сохраненные планы; актуальность не подтверждена.</p>}
          {plans !== null && plans.length > 0 && <ul className="case-summary-list">{plans.map(plan => <li key={plan.planId}><a href={href(`/work-plans/${encodeURIComponent(plan.planId)}`, run)}>{plan.planId} · {planStateLabel[plan.state]}</a></li>)}</ul>}
          {plans !== null && plans.length === 0 && !plansLoading && !plansError && !plansStale && <p>{reference ? <>Проект плана не создан. <a href="/?choose=1">Выбрать симуляцию</a>, чтобы пройти рабочий процесс.</> : 'Связанных планов пока нет.'}</p>}
          {plans === null && !plansLoading && !plansError && <p>Сведения о планах недоступны.</p>}
        </div>
        {actions && <div className="case-summary-actions">{actions}</div>}
        {activeStep === 4 && tourNavigation}
      </section>
    </div>
  </div>;
}
