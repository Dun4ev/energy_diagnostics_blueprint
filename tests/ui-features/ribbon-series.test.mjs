import test from 'node:test';
import assert from 'node:assert/strict';
import { ribbonSeries } from '../../apps/web/src/features/ribbon-series.ts';

const t = hour => `2026-07-24T${String(hour).padStart(2, '0')}:00:00Z`;
test('does not draw through a missing interval and preserves isolated values', () => {
  const result = ribbonSeries([t(0), t(1), t(2), t(8)], [10, null, 12, 18]);
  assert.deepEqual(result.isolated, [[t(0), 10], [t(2), 12], [t(8), 18]]);
  assert.deepEqual(result.data, [[t(0), 10], [t(1), null], [t(2), 12], ['2026-07-24T05:00:00.000Z', null], [t(8), 18]]);
});
test('does not invent cadence from a single interval', () => {
  const result = ribbonSeries([t(0), t(1)], [10, 11]);
  assert.equal(result.isolated.length, 2);
  assert.equal(result.data[1][1], null);
});
test('retains contiguous samples without adding gaps', () => {
  const result = ribbonSeries([t(0), t(1), t(2)], [10, 11, 12]);
  assert.equal(result.data.length, 3);
  assert.deepEqual(result.isolated, []);
});
