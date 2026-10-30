import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateStandPackage, type StandPackage } from '../../apps/web/src/stand/package';

const fixture = JSON.parse(readFileSync(resolve('apps/web/public/stand-data.json'), 'utf8'));

describe('stand package', () => {
  it('accepts the generated synthetic package and its eight-scene schedule', () => {
    const data = validateStandPackage(fixture);
    expect(data.scenes.map(scene => scene.durationSeconds)).toEqual([15, 20, 30, 25, 20, 25, 25, 20]);
    expect(data.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0)).toBe(180);
    expect(data.story.evidence.map(item => item.authorId)).toContain('engineer');
    expect(data.story.evidence.map(item => item.authorId)).toContain('technician');
  });

  it.each([
    ['wrong probability', (value: StandPackage) => { value.slices.late.risks[0].analysis.metrics.failureProbability = 0.2 as never; }],
    ['wrong mode', (value: StandPackage) => { value.slices.early.risks[0].analysis.mode = 'reference'; }],
    ['different data time', (value: StandPackage) => { value.slices.late.virtualTime = '2026-07-01T07:40:00Z'; }],
    ['duplicate scene', (value: StandPackage) => { value.scenes[1].id = value.scenes[0].id; }],
    ['wrong timeline', (value: StandPackage) => { value.scenes[0].durationSeconds = 1; }],
    ['missing recorded step', (value: StandPackage) => { value.story.approved.steps = []; }],
    ['wrong asset', (value: StandPackage) => { value.scenes[0].assetId = 'absent'; }],
    ['mismatched analysis', (value: StandPackage) => { value.slices.late.snapshot.analysis.risk.score = 0; }],
    ['mismatched plan', (value: StandPackage) => { value.story.completed.planId = 'different'; }],
    ['mismatched evidence', (value: StandPackage) => { value.story.evidence[0].scenarioRunId = 'different'; }],
    ['mismatched audit', (value: StandPackage) => { value.story.audit[0].objectId = 'different'; }],
  ])('rejects %s instead of rendering misleading data', (_label, corrupt) => {
    const value = structuredClone(fixture);
    corrupt(value);
    expect(() => validateStandPackage(value)).toThrow();
  });
});
