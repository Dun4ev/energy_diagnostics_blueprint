import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StandPackage } from '../../apps/web/src/stand/package';
import type { Identity } from '../../apps/web/src/features/shared';
import { STAND_HANDOFF_KEY } from '../../apps/web/src/features/standContext';

const post = vi.hoisted(() => vi.fn());
vi.mock('../../apps/web/src/api/client', () => ({ api: { POST: post, GET: vi.fn() } }));
import { createStandRun } from '../../apps/web/src/features/StandContinue';

const scene = { id: 'normal', slice: 'early', assetId: 'tp177-t1' } as StandPackage['scenes'][number];
const pack = {
  provenance: { datasetId: 'synthetic-energy-30d', seed: 20260925 },
  slices: { early: { virtualTime: '2026-07-01T07:40:00Z' } },
} as unknown as StandPackage;
const identity = { csrfToken: 'test-csrf' } as Identity;

describe('stand handoff creation', () => {
  let saved: Map<string, string>;
  beforeEach(() => {
    saved = new Map();
    vi.stubGlobal('sessionStorage', {
      setItem: (key: string, value: string) => saved.set(key, value),
      getItem: (key: string) => saved.get(key) ?? null,
    });
    post.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shares one request for simultaneous preparation and saves the returned run', async () => {
    const handoff = { sceneId: 'normal', idempotencyKey: 'same-key' };
    saved.set(STAND_HANDOFF_KEY, JSON.stringify(handoff));
    post.mockResolvedValueOnce({ data: { scenarioRunId: 'run-1' }, response: { status: 200 } });
    const values = await Promise.all([createStandRun(handoff, scene, pack, identity), createStandRun(handoff, scene, pack, identity)]);
    expect(values).toEqual(['run-1', 'run-1']);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({
      params: { header: { 'Idempotency-Key': 'same-key', 'X-CSRF-Token': 'test-csrf' } },
      body: { datasetId: 'synthetic-energy-30d', mode: 'simulation', virtualTime: '2026-07-01T07:40:00Z' },
    });
    expect(JSON.parse(saved.get(STAND_HANDOFF_KEY)!)).toEqual({ ...handoff, runId: 'run-1' });
  });

  it('retries a failed request with the original idempotency key', async () => {
    const handoff = { sceneId: 'normal', idempotencyKey: 'retry-key' };
    saved.set(STAND_HANDOFF_KEY, JSON.stringify(handoff));
    post.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { scenarioRunId: 'run-2' }, response: { status: 200 } });
    await expect(createStandRun(handoff, scene, pack, identity)).rejects.toThrow('offline');
    expect(await createStandRun(handoff, scene, pack, identity)).toBe('run-2');
    expect(post.mock.calls.map(call => call[1].params.header['Idempotency-Key'])).toEqual(['retry-key', 'retry-key']);
  });

  it('does not overwrite a newer scene when an old response arrives late', async () => {
    const old = { sceneId: 'normal', idempotencyKey: 'old-key' };
    const current = { sceneId: 'deviation', idempotencyKey: 'new-key' };
    saved.set(STAND_HANDOFF_KEY, JSON.stringify(old));
    let finish!: (value: unknown) => void;
    post.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = createStandRun(old, scene, pack, identity);
    saved.set(STAND_HANDOFF_KEY, JSON.stringify(current));
    finish({ data: { scenarioRunId: 'obsolete-run' }, response: { status: 200 } });
    await expect(pending).rejects.toThrow('Переход был изменен');
    expect(JSON.parse(saved.get(STAND_HANDOFF_KEY)!)).toEqual(current);
  });
});
