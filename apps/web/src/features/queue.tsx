import { useState } from 'react';
import { api } from '../api/client';
import { Badge, Banner, Card, DataTable, Empty, ErrorState, Loading, PageHeading } from '../design-system/components';
import { actionLabel, assetTypeLabel, date, expectData, fetchRiskQueue, href, number, percent, priorityLabel, riskTone, stateLabel, temperature, useResource, type RiskEntry } from './shared';

type PriorityFilter = '' | 'high' | 'medium' | 'low' | 'unknown';
function updateFilter(name: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value); else url.searchParams.delete(name);
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}
function sortEntries(items: RiskEntry[], sort: string) {
  const copy = [...items];
  if (sort === 'freshness') return copy.sort((a, b) => a.analysis.asOf.localeCompare(b.analysis.asOf));
  if (sort === 'name') return copy.sort((a, b) => a.asset.name.localeCompare(b.asset.name, 'ru'));
  return copy.sort((a, b) => {
    if (a.analysis.risk.score === null) return -1;
    if (b.analysis.risk.score === null) return 1;
    return b.analysis.risk.score - a.analysis.risk.score;
  });
}

export function QueuePage({ run }: { run: string }) {
  const params = new URLSearchParams(window.location.search);
  const [priority, setPriority] = useState<PriorityFilter>(() => (params.get('priority') || '') as PriorityFilter);
  const [site, setSite] = useState(() => params.get('site') || '');
  const [sort, setSort] = useState(() => params.get('sort') || 'priority');
  const [includeNormal, setIncludeNormal] = useState(() => params.get('normal') === 'true');
  const [offset, setOffset] = useState(() => Number(params.get('offset') || 0));
  const key = `risks-${run}-${priority}-${site}-${includeNormal}-${offset}`;
  const resource = useResource(key, () => fetchRiskQueue(run, { priority: priority || undefined, siteId: site || undefined,
    includeNormal, limit: 50, offset }));
  const items = sortEntries(resource.data?.data.items || [], sort);
  function filter<T>(name: string, value: T, setter: (next: T) => void) {
    setter(value); setOffset(0); updateFilter('offset', ''); updateFilter(name, String(value));
  }
  return <div className="feature-stack"><PageHeading eyebrow="Приоритет внимания" title="Очередь рисков" subtitle="Пилотный индекс помогает выбрать следующий шаг. Неизвестное качество требует отдельной проверки." />
    <div className="feature-toolbar"><label className="field">Приоритет<select value={priority} onChange={event => filter('priority', event.target.value as PriorityFilter, setPriority)}><option value="">Все</option><option value="high">Высокий</option><option value="medium">Средний</option><option value="low">Низкий</option><option value="unknown">Неизвестно</option></select></label>
      <label className="field">Площадка<input value={site} onChange={event => filter('site', event.target.value, setSite)} placeholder="Все площадки" /></label>
      <label className="field">Сортировка<select value={sort} onChange={event => filter('sort', event.target.value, setSort)}><option value="priority">По приоритету</option><option value="freshness">По давности данных</option><option value="name">По объекту</option></select></label>
      <label className="feature-check"><input type="checkbox" checked={includeNormal} onChange={event => filter('normal', event.target.checked, setIncludeNormal)} /> Показать нормальные</label>
    </div>
    {resource.loading && !resource.data && <Loading />}
    {resource.error && !resource.data && <ErrorState message={resource.error.message} requestId={resource.error.requestId} retry={resource.refresh} />}
    {resource.stale && <Banner tone="high" title="Показана сохраненная очередь">Время данных и приоритет могли измениться. Обновите после восстановления связи.</Banner>}
    {resource.data && <Card title={`${resource.data.data.total} объектов`} subtitle={`Время данных: ${date(resource.data.dataTime)} · ${resource.data.mode === 'reference' ? 'Иллюстрация презентации' : 'Расчет по синтетическим наблюдениям'}`} className="feature-queue">
      {items.length ? <><DataTable label="Очередь рисков"><thead><tr><th scope="col">Объект и сигнал</th><th scope="col">Наблюдение</th><th scope="col">Приоритет</th><th scope="col">Данные</th><th scope="col">Следующий шаг</th></tr></thead><tbody>{items.map(item => <tr key={item.asset.assetId}>
        <td><a className="feature-row-link" href={href(item.caseId ? `/diagnostics/cases/${encodeURIComponent(item.caseId)}` : `/assets/${encodeURIComponent(item.asset.assetId)}`, run)}><strong>{item.asset.name}</strong><span aria-hidden="true">→</span></a><span className="secondary-line">{assetTypeLabel[item.asset.assetType]} · {item.asset.siteId}</span><span className="secondary-line feature-mono">{item.analysis.analysisRunId}</span></td>
        <td>{item.asset.assetType === 'transformer' ? <><strong>{item.analysis.metrics.residualC === null ? 'Остаток не определен' : `${item.analysis.metrics.residualC > 0 ? '+' : ''}${temperature(item.analysis.metrics.residualC)}`}</strong><span className="secondary-line">Нагрузка {percent(item.analysis.metrics.loadFraction)}</span></> : <><strong>Отдельная методика</strong><span className="secondary-line">Температурный расчет не применим</span></>}</td>
        <td><Badge tone={riskTone(item.analysis.risk.priority)}>{priorityLabel[item.analysis.risk.priority]}</Badge><span className="secondary-line">{item.analysis.risk.score === null ? 'Оценка неизвестна' : `${number(item.analysis.risk.score)}/10 · пилотный индекс`}</span></td>
        <td><strong>{date(item.analysis.asOf)}</strong><span className="secondary-line">{item.analysis.quality.overall === 'good' ? 'Достаточно' : item.analysis.quality.overall === 'partial' ? 'Частично' : 'Недостаточно'} · {item.analysis.quality.freshSources}/{item.analysis.quality.totalSources} источников</span></td>
        <td><strong>{item.analysis.nextActions[0] ? actionLabel[item.analysis.nextActions[0].code] : 'Требуется разбор'}</strong><span className="secondary-line">{item.nextDueAt ? `Срок: ${date(item.nextDueAt)}` : 'Срок не назначен'}</span></td>
      </tr>)}</tbody></DataTable><div className="feature-pagination"><span>{offset + 1}–{offset + items.length} из {resource.data.data.total}</span><button type="button" disabled={offset === 0} onClick={() => filter('offset', Math.max(0, offset - 50), setOffset)}>Назад</button><button type="button" disabled={offset + items.length >= resource.data.data.total} onClick={() => filter('offset', offset + 50, setOffset)}>Далее</button></div></> : <Empty title="Нет объектов по фильтрам">Измените фильтры или включите нормальные записи.</Empty>}
    </Card>}
  </div>;
}

export function CasesPage({ run }: { run: string }) {
  const resource = useResource(`cases-${run}`, async () => expectData(await api.GET('/api/v1/cases', { params: { query: { scenarioRunId: run, limit: 100, offset: 0 } } })));
  return <div className="feature-stack"><PageHeading eyebrow="Диагностика" title="Случаи" subtitle="Сигнал остается неподтвержденным до решения ответственного человека." />
    {resource.loading && !resource.data && <Loading />}{resource.error && !resource.data && <ErrorState message={resource.error.message} retry={resource.refresh} />}
    {resource.stale && <Banner tone="high" title="Сохраненный список">Состояние случаев могло измениться.</Banner>}
    {resource.data && <Card title={`${resource.data.data.total} случаев`}><DataTable label="Диагностические случаи"><thead><tr><th>Случай</th><th>Объект</th><th>Состояние</th><th>Открыт</th></tr></thead><tbody>{resource.data.data.items.map(item => <tr key={item.caseId}><td><a href={href(`/diagnostics/cases/${encodeURIComponent(item.caseId)}`, run)}><strong>{item.caseId}</strong></a></td><td>{item.assetId}</td><td>{stateLabel[item.state]}</td><td>{date(item.openedAt)}</td></tr>)}</tbody></DataTable>{resource.data.data.items.length === 0 && <Empty title="Случаев пока нет">Откройте очередь рисков для просмотра активов.</Empty>}</Card>}
  </div>;
}
