import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { brand } from '../config';
import { ribbonSeries } from './ribbon-series';
import { DataTable, Empty } from '../design-system/components';
import { date, percent, pointQualityLabel, temperature, type S, type SeriesPoint } from './shared';

type Evidence = S['Evidence'];
const qualityColor: Record<SeriesPoint['quality'], string> = { good: '#0E6B4A', missing: '#667085', suspect: '#B56B00', invalid: '#B42336' };

export function DiagnosticRibbon({ points, evidence, onEvidence, mode }: { points: SeriesPoint[]; evidence: Evidence[]; onEvidence: (id?: string) => void; mode: 'reference' | 'simulation' }) {
  const reference = mode === 'reference';
  const qualityText = (quality: SeriesPoint['quality']) => reference ? `${pointQualityLabel[quality]} · условно` : pointQualityLabel[quality];
  const element = useRef<HTMLDivElement>(null);
  const callback = useRef(onEvidence);
  callback.current = onEvidence;
  const [selected, setSelected] = useState(points.length - 1);
  const index = Math.max(0, Math.min(selected, points.length - 1));
  const point = points[index];
  useEffect(() => { setSelected(points.length - 1); }, [points]);
  useEffect(() => {
    if (!element.current || !points.length) return;
    const chart = echarts.init(element.current, undefined, { renderer: 'svg' });
    const first = new Date(points[0].eventTime).getTime();
    const last = new Date(points[points.length - 1].eventTime).getTime();
    const min = first === last ? first - 1800000 : first;
    const max = first === last ? last + 1800000 : last;
    const dateFormat = new Intl.DateTimeFormat('ru-RU', max - min <= 48 * 3600000 ? { hour: '2-digit', minute: '2-digit', timeZone: brand.timezone } : { day: '2-digit', month: '2-digit', timeZone: brand.timezone });
    const hasTemperature = points.some(p => p.observedC !== null || p.expectedC !== null);
    const hasResidual = points.some(p => p.residualC !== null);
    const hasLoad = points.some(p => p.loadFraction !== null);
    const scale = 0.8;
    const positions = [{ top: 32, height: 166 }, { top: 232, height: 78 }, { top: 344, height: 60 }, { top: 437, height: 20 }, { top: 491, height: 20 }].map(({ top, height }) => ({ top: top * scale, height: height * scale }));
    const axes = positions.map((_, i) => ({ type: 'time' as const, gridIndex: i, min, max, axisLine: { show: i === 4, lineStyle: { color: '#b8cbd8' } }, axisTick: { show: false }, axisLabel: { show: i === 4, hideOverlap: true, color: '#52677A', fontSize: 11, formatter: (value: number) => dateFormat.format(new Date(value)) }, splitLine: { show: false }, axisPointer: { show: true, label: { show: false }, lineStyle: { color: '#52677A', type: 'dashed' as const } } }));
    const y = positions.map((_, i) => i < 3 && [hasTemperature, hasResidual, hasLoad][i] ? { type: 'value' as const, gridIndex: i, scale: true, splitNumber: i === 0 ? 3 : 2, axisLabel: { color: '#52677A', fontSize: 10 }, splitLine: { lineStyle: { color: '#e7eef4' } } } : { type: 'value' as const, gridIndex: i, min: 0, max: 2, show: false });
    const line = (name: string, i: number, values: (number | null)[], color: string, dashed = false) => {
      const { data, isolated } = ribbonSeries(points.map(p => p.eventTime), values);
      return [{ name, type: 'line' as const, xAxisIndex: i, yAxisIndex: i, data, showSymbol: false, connectNulls: false, lineStyle: { color, width: i === 0 ? 2.2 : 1.8, type: dashed ? 'dashed' as const : 'solid' as const }, itemStyle: { color }, emphasis: { disabled: true } }, { name, type: 'scatter' as const, xAxisIndex: i, yAxisIndex: i, data: isolated, symbolSize: 6, itemStyle: { color }, emphasis: { disabled: true } }];
    };
    chart.setOption({ animation: false, useUTC: true, grid: positions.map(pos => ({ ...pos, left: 45, right: 15 })), xAxis: axes, yAxis: y,
      axisPointer: { link: [{ xAxisIndex: 'all' }] }, tooltip: { show: false, trigger: 'axis' },
      graphic: [...([ ['Температура · °C', 3], ['Отклонение · °C', 204], ['Нагрузка · %', 316], ['Качество точки', 409], ['Записи · время наблюдения', 463] ] as const).map(([text, top]) => ({ type: 'text' as const, left: 0, top: top * scale, style: { text, fill: '#344f64', fontSize: 11, fontWeight: 600 } })), ...([ [hasTemperature, 'Нет температурных данных', 105], [hasResidual, 'Нет данных об отклонении', 262], [hasLoad, 'Нет данных о нагрузке', 364] ] as const).filter(([available]) => !available).map(([, text, top]) => ({ type: 'text' as const, left: 48, top: top * scale, style: { text, fill: '#52677A', fontSize: 12 } }))],
      series: [...line('Измерено', 0, points.map(p => p.observedC), '#C65D00'), ...line('Ожидается', 0, points.map(p => p.expectedC), '#0066B3', true), ...line('Отклонение', 1, points.map(p => p.residualC), '#9A6400'), ...line('Нагрузка', 2, points.map(p => p.loadFraction === null ? null : p.loadFraction * 100), '#387D89'),
        { name: 'Качество', type: 'scatter', xAxisIndex: 3, yAxisIndex: 3, symbolSize: 5, data: points.map(p => ({ value: [p.eventTime, 1], itemStyle: { color: qualityColor[p.quality] } })) },
        { name: 'Записи', type: 'scatter', xAxisIndex: 4, yAxisIndex: 4, symbol: 'diamond', symbolSize: 11, itemStyle: { color: '#0066B3' }, data: evidence.filter(e => { const time = Date.parse(e.observedAt); return time >= min && time <= max; }).map(e => ({ value: [e.observedAt, 1], evidenceId: e.evidenceId })) },
      ] });
    const move = (event: { offsetX: number; offsetY: number }) => {
      if (event.offsetY < 30 * scale || event.offsetY > 515 * scale) return;
      const value = chart.convertFromPixel({ xAxisIndex: 0 }, event.offsetX);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return;
      let lo = 0, hi = points.length - 1;
      while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (Date.parse(points[mid].eventTime) < value) lo = mid + 1; else hi = mid; }
      const nearest = lo > 0 && Math.abs(Date.parse(points[lo - 1].eventTime) - value) < Math.abs(Date.parse(points[lo].eventTime) - value) ? lo - 1 : lo;
      setSelected(nearest);
    };
    chart.getZr().on('mousemove', move);
    chart.on('click', params => { const item = params.data as { evidenceId?: string } | undefined; if (item?.evidenceId) callback.current(item.evidenceId); });
    const resize = new ResizeObserver(() => chart.resize()); resize.observe(element.current);
    return () => { resize.disconnect(); chart.getZr().off('mousemove', move); chart.dispose(); };
  }, [points, evidence]);
  if (!points.length) return <Empty title="Нет точек в выбранном диапазоне">Измените диапазон или проверьте источники.</Empty>;
  const firstTime = Date.parse(points[0].eventTime);
  const lastTime = Date.parse(points[points.length - 1].eventTime);
  const position = firstTime === lastTime ? .5 : Math.max(0, Math.min(1, (Date.parse(point.eventTime) - firstTime) / (lastTime - firstTime)));
  return <div className="diagnostic-ribbon">
    <>{reference && <p className="ribbon-reference-note">История графика — стилизованная реконструкция слайда, не исходная телеметрия и не точная оцифровка. Качество точек условное.</p>}</>
    <div className="ribbon-legend"><span className="ribbon-line observed">{reference ? 'Реконструкция измерения' : 'Измерено'}</span><span className="ribbon-line expected">Ожидаемый режим</span><span className="ribbon-legend-note">Наведите на график или выберите точку ниже</span></div>
    <div className="ribbon-plot"><div ref={element} className="ribbon-chart" role="img" aria-label="Синхронизированные графики температуры, отклонения, нагрузки, качества и записей" /><div className="ribbon-cursor" aria-hidden="true" style={{ left: `calc(45px + ${position * 100}% - ${position * 60}px)` }} /></div>
    <div className="ribbon-quality-key"><span><i className="q-good" />{reference ? 'Качество хорошее · условно' : 'Достоверная'}</span><span><i className="q-suspect" />Подозрительная</span><span><i className="q-invalid" />Недопустимая</span><span><i className="q-missing" />Нет измерения</span></div>
    <div className="ribbon-selection"><div className="ribbon-selection-head"><strong>Выбранный момент</strong><time>{date(point.eventTime)}</time></div><label className="ribbon-scrubber">Точка на временной шкале<input type="range" min="0" max={points.length - 1} value={index} onChange={event => setSelected(Number(event.target.value))} aria-valuetext={date(point.eventTime)} /></label><div className="ribbon-values"><div><span>{reference ? 'Реконструкция' : 'Измерено'}</span><strong>{temperature(point.observedC)}</strong></div><div><span>Ожидалось</span><strong>{temperature(point.expectedC)}</strong></div><div><span>Отклонение</span><strong>{temperature(point.residualC)}</strong></div><div><span>Нагрузка</span><strong>{percent(point.loadFraction)}</strong></div><div><span>Качество</span><strong>{qualityText(point.quality)}</strong></div></div><div className="ribbon-source"><span>Источники точки: {point.sourceIds.length ? point.sourceIds.join(', ') : 'не указаны'}</span><button type="button" onClick={() => onEvidence()}>Открыть проводник записей</button></div></div>
    <p className="feature-footnote">Качество относится к точкам ряда, а не ко всем источникам. Маркеры обозначают время наблюдения в записях; связь с точкой не предполагается. Длинные интервалы разрываются по медианному шагу ряда; это правило отображения, а не оценка качества. При недостатке интервалов точки не соединяются. Прогноз не показан.</p>
    <details className="feature-chart-table"><summary>Таблица точек графика</summary><DataTable label="Точки диагностической ленты"><thead><tr><th>Время</th><th>{reference ? 'Реконструкция измерения' : 'Измерено'}</th><th>Ожидалось</th><th>Отклонение</th><th>Нагрузка</th><th>Качество</th><th>Источники</th></tr></thead><tbody>{points.map((p, n) => <tr key={`${p.eventTime}-${n}`}><td>{date(p.eventTime)}</td><td>{temperature(p.observedC)}</td><td>{temperature(p.expectedC)}</td><td>{temperature(p.residualC)}</td><td>{percent(p.loadFraction)}</td><td>{qualityText(p.quality)}</td><td>{p.sourceIds.join(', ') || 'Не указаны'}</td></tr>)}</tbody></DataTable></details>
  </div>;
}
