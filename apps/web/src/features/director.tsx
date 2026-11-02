import { api } from '../api/client';
import type { components } from '../api/generated';
import { Badge, Banner, Card, DataTable, Empty, ErrorState, Loading, PageHeading } from '../design-system/components';
import { ApiFailure, actionLabel, assetTypeLabel, date, expectData, fetchRiskQueue, href, number, priorityLabel, qualityLabel, useResource, type RiskEntry } from './shared';

type Case = components['schemas']['Case'];

/** This screen groups server results; it does not calculate or infer risk. */
async function loadOverview(run: string) {
  const assets = expectData(await api.GET('/api/v1/assets', { params: { query: { scenarioRunId: run, limit: 100, offset: 0 } } }));
  const first = await fetchRiskQueue(run, { includeNormal: true, limit: 100, offset: 0 });
  const risks = [...first.data.items];
  while (risks.length < first.data.total) {
    const next = await fetchRiskQueue(run, { includeNormal: true, limit: 100, offset: risks.length });
    if (!next.data.items.length || next.dataTime !== first.dataTime || next.mode !== first.mode) throw new ApiFailure(502, 'Не удалось получить согласованный список оценок.');
    risks.push(...next.data.items);
  }
  if (assets.dataTime !== first.dataTime || assets.mode !== first.mode) throw new ApiFailure(502, 'Время данных реестра и оценок различается. Обновите обзор.');
  // The risk endpoint can associate its latest asset analysis with a different
  // open case. Confirm case/analysis identity before offering a direct link.
  let cases: Case[] | null = null;
  try {
    const initial = expectData(await api.GET('/api/v1/cases', { params: { query: { scenarioRunId: run, limit: 100, offset: 0 } } }));
    if (initial.dataTime !== first.dataTime || initial.mode !== first.mode) throw new Error('Case snapshot differs');
    const items = [...initial.data.items];
    while (items.length < initial.data.total) {
      const next = expectData(await api.GET('/api/v1/cases', { params: { query: { scenarioRunId: run, limit: 100, offset: items.length } } }));
      if (!next.data.items.length || next.dataTime !== first.dataTime || next.mode !== first.mode) throw new Error('Incomplete cases');
      items.push(...next.data.items);
    }
    cases = items;
  } catch { /* The asset link stays available even if case links cannot be verified. */ }
  return { assets, risks, cases, mode: first.mode, dataTime: first.dataTime };
}

function riskOrder(a: RiskEntry, b: RiskEntry) {
  const rank = { high: 0, medium: 1, unknown: 2, low: 3 } as const;
  return rank[a.analysis.risk.priority] - rank[b.analysis.risk.priority] || (b.analysis.risk.score ?? -1) - (a.analysis.risk.score ?? -1);
}

export function DirectorPage({ run }: { run: string }) {
  const overview = useResource(`director-${run}`, () => loadOverview(run));
  const data = overview.data;
  const ordered = data ? [...data.risks].sort(riskOrder) : [];
  const caseMatches = (item: RiskEntry) => Boolean(item.caseId && data?.cases?.some(record => record.caseId === item.caseId && record.assetId === item.asset.assetId && record.analysisRunId === item.analysis.analysisRunId));
  const overviewLink = (item: RiskEntry) => caseMatches(item) ? href(`/diagnostics/cases/${encodeURIComponent(item.caseId!)}?expectedAnalysis=${encodeURIComponent(item.analysis.analysisRunId)}`, run) : href(`/assets/${encodeURIComponent(item.asset.assetId)}`, run);
  const count = (priority: RiskEntry['analysis']['risk']['priority']) => data?.risks.filter(item => item.analysis.risk.priority === priority).length;
  return <div className="feature-stack director-page"><PageHeading title="Обзор руководителя" subtitle="Приоритет внимания и доступность данных в выбранном наборе" />
    {overview.loading && !data && <Loading label="Загружаем обзор..." />}
    {overview.error && !data && <ErrorState message={overview.error.message} requestId={overview.error.requestId} retry={overview.refresh} />}
    {overview.stale && <Banner tone="high" title="Показан сохраненный обзор">Оценки и время данных могли измениться. Обновите обзор после восстановления связи.</Banner>}
    {data && <><div className="director-context"><div><span>Источник</span><strong>{data.mode === 'reference' ? 'REFERENCE · иллюстрация презентации' : 'SIMULATION · синтетические наблюдения'}</strong></div><div><span>Время данных</span><strong>{date(data.dataTime)}</strong></div><div><span>Охват</span><strong>{data.risks.length} из {data.assets.data.total} активов с оценками</strong></div></div>
      <div className="director-summary" aria-label="Сводка по оцененным активам"><div><span>Всего активов</span><strong>{data.assets.data.total}</strong><small>Реестр выбранного набора</small></div><div><span>Высокий приоритет</span><strong>{count('high')}</strong><small>Оценено сервером</small></div><div><span>Средний приоритет</span><strong>{count('medium')}</strong><small>Оценено сервером</small></div><div><span>Оценка неизвестна</span><strong>{count('unknown')}</strong><small>Среди полученных оценок</small></div></div>
      <div className="director-layout"><Card className="director-queue" title="Приоритет рассмотрения" subtitle="Серверные оценки; индекс не является вероятностью отказа" actions={<a href={href('/risks', run)}>Вся очередь</a>}>
        {ordered.length ? <><p className="director-scroll-hint">Прокрутите таблицу вправо, чтобы увидеть качество данных и следующий шаг.</p><DataTable label="Приоритет рассмотрения"><thead><tr><th scope="col">Объект</th><th scope="col">Приоритет</th><th scope="col">Качество данных</th><th scope="col">Следующий шаг</th></tr></thead><tbody>{ordered.map(item => <tr key={item.asset.assetId}><td><a href={overviewLink(item)}><strong>{item.asset.name}</strong></a><span className="secondary-line">{item.caseId && !caseMatches(item) ? 'Связь анализа со случаем не подтверждена · ' : ''}{assetTypeLabel[item.asset.assetType]} · {item.asset.siteId === 'demo-site' ? 'Демонстрационная площадка' : item.asset.siteId}</span></td><td><Badge tone={item.analysis.risk.priority}>{priorityLabel[item.analysis.risk.priority]}</Badge><span className="secondary-line">{item.analysis.risk.score === null ? 'Неизвестно' : `${number(item.analysis.risk.score)}/10`}</span></td><td>{qualityLabel[item.analysis.quality.overall]}<span className="secondary-line">{item.analysis.quality.freshSources}/{item.analysis.quality.totalSources} источников актуальны</span></td><td>{item.analysis.nextActions[0] ? actionLabel[item.analysis.nextActions[0].code] : 'Требуется разбор'}<span className="secondary-line">{item.nextDueAt ? `Срок: ${date(item.nextDueAt)}` : 'Срок не назначен'}</span></td></tr>)}</tbody></DataTable></> : <Empty title="Оценок пока нет">Откройте реестр активов или проверьте выбранный запуск.</Empty>}
      </Card><div className="feature-stack"><Card className="director-notes" title="Что требует внимания" subtitle="Качество источников и границы обзора"><dl className="director-observability"><div><dt>Недостаточное или недостоверное качество</dt><dd>{data.risks.filter(item => ['insufficient', 'invalid'].includes(item.analysis.quality.overall)).length}</dd></div><div><dt>Частичное качество</dt><dd>{data.risks.filter(item => item.analysis.quality.overall === 'partial').length}</dd></div><div><dt>Активов в реестре</dt><dd>{data.assets.data.total}</dd></div><div><dt>Получено оценок</dt><dd>{data.risks.length}</dd></div></dl><p className="feature-muted">Количество относится только к полученным оценкам. Отсутствие оценки не означает безопасное состояние. Прямой переход к случаю доступен при совпадении анализа.</p></Card><Card title="Контекст обзора"><p className="feature-muted">Индекс предназначен для сортировки внимания. Подтверждение дефекта и решения по проверке остаются за человеком.</p><div className="director-links"><a href={href('/assets', run)}>Реестр активов</a><a href={href('/models-and-data', run)}>Модели и источники</a></div></Card></div></div></>}
  </div>;
}
