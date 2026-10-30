export const STAND_HANDOFF_KEY = 'energy-stand-handoff-v1';
export const STAND_LIVE_KEY = 'energy-stand-live-v1';

export type StandHandoff = { sceneId: string; idempotencyKey: string; runId?: string };

export function readStandHandoff(): StandHandoff | null {
  const raw = sessionStorage.getItem(STAND_HANDOFF_KEY);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.sceneId !== 'string' || typeof item.idempotencyKey !== 'string') return null;
  if (item.runId !== undefined && typeof item.runId !== 'string') return null;
  return item as StandHandoff;
}

export function hasStandLive(): boolean {
  try { return !!sessionStorage.getItem(STAND_LIVE_KEY); } catch { return false; }
}

export function leaveStandLive() {
  try {
    sessionStorage.removeItem(STAND_LIVE_KEY);
    sessionStorage.removeItem(STAND_HANDOFF_KEY);
  } catch { /* navigation is still allowed */ }
}

export function beginStandHandoff(sceneId: string) {
  try {
    sessionStorage.removeItem(STAND_LIVE_KEY);
    sessionStorage.setItem(STAND_HANDOFF_KEY, JSON.stringify({ sceneId, idempotencyKey: crypto.randomUUID() }));
  } catch { /* The continuation page will offer recovery if storage is unavailable. */ }
  window.location.assign(`/stand/continue?scene=${encodeURIComponent(sceneId)}`);
}
