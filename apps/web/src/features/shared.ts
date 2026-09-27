import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { components } from '../api/generated';
import { formatTime } from '../shell/AppShell';

export type S = components['schemas'];
export async function fetchCaseSnapshot(id: string, run: string) {
  return expectData(await api.GET('/api/v1/cases/{id}/snapshot', { params: { path: { id }, query: { scenarioRunId: run } } }));
}
export async function fetchRiskQueue(run: string, filters: { priority?: 'high' | 'medium' | 'low' | 'unknown'; siteId?: string; includeNormal?: boolean; limit?: number; offset?: number } = {}) {
  return expectData(await api.GET('/api/v1/risks', { params: { query: { scenarioRunId: run, ...filters } } }));
}
export type Snapshot = Awaited<ReturnType<typeof fetchCaseSnapshot>>['data'];
export type Analysis = S['AnalysisResult'];
export type Plan = S['WorkPlan'];
export type Identity = S['Identity'];
export type RiskEntry = Awaited<ReturnType<typeof fetchRiskQueue>>['data']['items'][number];
export type SeriesPoint = S['SeriesPoint'];

export class ApiFailure extends Error {
  constructor(public status: number, message: string, public requestId?: string) { super(message); }
}
export function expectData<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data;
  const error = result.error as Partial<S['APIError']> | undefined;
  throw new ApiFailure(result.response.status, error?.message || `Сервер вернул ${result.response.status}.`, error?.requestId);
}
export type Resource<T> = { data: T | null; loading: boolean; stale: boolean; error: ApiFailure | null; refresh: () => void };
export function useResource<T>(key: string, load: () => Promise<T>, cache = true): Resource<T> {
  const cached = (): T | null => {
    if (!cache) return null;
    try { return JSON.parse(sessionStorage.getItem(key) || 'null') as T | null; }
    catch { return null; }
  };
  const [state, setState] = useState<{ data: T | null; loading: boolean; stale: boolean; error: ApiFailure | null }>(() => {
    return { data: cached(), loading: true, stale: false, error: null };
  });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setState({ data: cached(), loading: true, stale: false, error: null });
    load().then(data => {
      if (!active) return;
      if (cache) try { sessionStorage.setItem(key, JSON.stringify(data)); } catch { /* storage optional */ }
      setState({ data, loading: false, stale: false, error: null });
    }).catch(error => {
      if (!active) return;
      const failure = error instanceof ApiFailure ? error : new ApiFailure(0, 'Нет связи с сервером.');
      setState(prev => ({ ...prev, loading: false, stale: prev.data !== null, error: failure }));
    });
    return () => { active = false; };
  }, [key, revision, cache]); // load is intentionally captured for this resource key
  return { ...state, refresh };
}

export const number = (value: number | null, digits = 1) => value === null ? 'Нет данных' : new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
export const signed = (value: number | null, digits = 1) => value === null ? 'Нет данных' : `${value > 0 ? '+' : ''}${number(value, digits)}`;
export const temperature = (value: number | null) => value === null ? 'Нет данных' : `${number(value)} °C`;
export const percent = (fraction: number | null) => fraction === null ? 'Нет данных' : `${number(fraction * 100, 0)} %`;
export const date = (value: string | null) => formatTime(value);
export const qualityLabel: Record<Analysis['quality']['overall'], string> = {
  good: 'Достаточно', partial: 'Частично', insufficient: 'Недостаточно', invalid: 'Недостоверно',
};
export const pointQualityLabel: Record<SeriesPoint['quality'], string> = {
  good: 'Достоверная точка', missing: 'Нет измерения', suspect: 'Подозрительная точка', invalid: 'Недопустимая точка',
};
export const dataOriginLabel: Record<Analysis['calculationOrigin'], string> = {
  computed: 'Расчет по наблюдениям', presentation_illustration: 'Иллюстрация презентации',
};
export const methodStatusLabel: Record<S['AnalysisDetails']['methodStatus'], string> = {
  supported: 'Методика применима', warm_up: 'Модель прогревается', unsupported: 'Методика не поддерживается', reference: 'Иллюстрация презентации',
};
export const evidenceOriginLabel: Record<S['Evidence']['origin'], string> = {
  synthetic: 'синтетический источник', presentation_illustration: 'иллюстрация презентации',
};
export function symptomLabel(value: string): string {
  return ({ contact_heat: 'Локальный нагрев контакта', winding_heat: 'Нагрев обмотки', unknown: 'Причина не установлена' } as Record<string, string>)[value] || 'Требует уточнения';
}
export const riskTone = (priority: Analysis['risk']['priority']) => priority;
export const priorityLabel = { high: 'Высокий', medium: 'Средний', low: 'Низкий', unknown: 'Неизвестно' } as const;
export const stateLabel: Record<S['CaseState'], string> = {
  detected: 'Обнаружен', under_review: 'На рассмотрении', awaiting_evidence: 'Ожидает доказательств',
  confirmed: 'Подтвержден человеком', not_confirmed: 'Не подтвержден', sensor_issue: 'Проблема измерения',
  remediation_planned: 'Мероприятия запланированы', verification: 'Проверка результата', closed: 'Закрыт',
};
export const roleLabel: Record<S['Role'], string> = { viewer: 'Наблюдатель', engineer: 'Инженер', approver: 'Согласующий', technician: 'Исполнитель', admin: 'Администратор' };
export const planStateLabel: Record<S['PlanState'], string> = {
  draft: 'Проект', submitted: 'На согласовании', approved: 'Согласован', rejected: 'Отклонен',
  in_progress: 'В работе', awaiting_verification: 'Ожидает проверки', completed: 'Выполнен',
  superseded: 'Заменен', cancelled: 'Отменен',
};
export const assetTypeLabel = { transformer: 'Трансформатор', breaker: 'Выключатель', cable: 'Кабельный участок' } as const;
export const actionLabel: Record<S['NextAction']['code'], string> = {
  VERIFY_TELEMETRY: 'Проверить телеметрию', REQUEST_THERMOGRAPHY: 'Запросить термографию',
  COMPARE_PHASES_AND_LOAD: 'Сопоставить фазы и нагрузку', ENGINEERING_REVIEW: 'Рассмотреть инженеру',
  PLAN_MAINTENANCE_IF_CONFIRMED: 'Планировать ТОиР после подтверждения',
  VERIFY_AFTER_ACTION: 'Проверить после мероприятия', CONTINUE_OBSERVATION: 'Продолжить наблюдение',
};
export function href(path: string, run: string) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('run', run);
  return `${url.pathname}${url.search}`;
}
export function exportJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
export const mutationHeaders = (identity: Identity) => ({
  'Idempotency-Key': crypto.randomUUID(), 'X-CSRF-Token': identity.csrfToken,
});
