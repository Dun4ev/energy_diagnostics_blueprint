import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { DataTable, Empty } from '../design-system/components';
import { date, pointQualityLabel, temperature, type SeriesPoint } from './shared';

export function TemperatureChart({ points, residual = false }: { points: SeriesPoint[]; residual?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const tokens = getComputedStyle(document.documentElement);
    const observed = tokens.getPropertyValue('--chart-observed').trim();
    const expected = tokens.getPropertyValue('--chart-expected').trim();
    const residualColor = tokens.getPropertyValue('--risk-medium-text').trim();
    const shortRange = new Date(points[points.length - 1].eventTime).getTime() - new Date(points[0].eventTime).getTime() <= 48 * 3600000;
    const axisTime = new Intl.DateTimeFormat('ru-RU', shortRange ? { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' } : { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
    const series = residual ? [
      { name: 'Отклонение', type: 'line' as const, showSymbol: false, connectNulls: false,
        itemStyle: { color: residualColor }, lineStyle: { color: residualColor, width: 2 },
        data: points.map(point => [point.eventTime, point.residualC]) },
    ] : [
      { name: 'Измерено', type: 'line' as const, showSymbol: false, connectNulls: false,
        itemStyle: { color: observed }, lineStyle: { color: observed, width: 2.5 },
        data: points.map(point => [point.eventTime, point.observedC]) },
      { name: 'Ожидаемый режим', type: 'line' as const, showSymbol: false, connectNulls: false,
        itemStyle: { color: expected }, lineStyle: { color: expected, width: 2, type: 'dashed' as const },
        data: points.map(point => [point.eventTime, point.expectedC]) },
    ];
    chart.setOption({
      animation: false, color: residual ? [residualColor] : [observed, expected],
      grid: { left: 47, right: 16, top: 48, bottom: 42 },
      legend: { top: 6, left: 0, textStyle: { color: '#52677A', fontSize: 12 } },
      tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => typeof value === 'number' ? `${value.toFixed(1)} °C` : 'Нет данных' },
      xAxis: { type: 'time', axisLabel: { color: '#52677A', fontSize: 11, formatter: (value: number) => axisTime.format(new Date(value)) }, axisLine: { lineStyle: { color: '#D6E2EC' } } },
      yAxis: { type: 'value', name: '°C', scale: true, nameTextStyle: { color: '#52677A' }, axisLabel: { color: '#52677A' }, splitLine: { lineStyle: { color: '#E7EEF4' } } },
      series,
    });
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(ref.current);
    return () => { resize.disconnect(); chart.dispose(); };
  }, [points, residual]);
  if (!points.length) return <Empty title="Нет точек в выбранном диапазоне">Измените диапазон или проверьте источники.</Empty>;
  return <div className="feature-chart-wrap"><div ref={ref} className="feature-chart" role="img" aria-label={residual ? 'График отклонения температуры от модели' : 'График измеренной и ожидаемой температуры'} />
    <details className="feature-chart-table"><summary>Таблица точек графика</summary><DataTable label="Точки температурного графика"><thead><tr><th>Время</th><th>Измерено</th><th>Ожидалось</th><th>Отклонение</th><th>Качество</th></tr></thead><tbody>{points.map((point, index) => <tr key={`${point.eventTime}-${index}`}><td>{date(point.eventTime)}</td><td>{temperature(point.observedC)}</td><td>{temperature(point.expectedC)}</td><td>{temperature(point.residualC)}</td><td>{pointQualityLabel[point.quality]}</td></tr>)}</tbody></DataTable></details>
  </div>;
}
