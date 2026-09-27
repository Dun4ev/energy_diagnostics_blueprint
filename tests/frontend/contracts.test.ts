import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { setupServer } from 'msw/node';
import measurement from '../../contracts/measurement.schema.json';
import analysis from '../../contracts/analysis.schema.json';
import corpus from '../../contracts/fixtures/wire-corpus.json';
import { handlers } from '../../apps/web/src/api/mocks';
import { createApi } from '../../apps/web/src/api/client';
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const validators = { measurement: ajv.compile(measurement), analysis: ajv.compile(analysis) };
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
describe('same JSON semantics in JS', () => {
  for (const sample of corpus) it(sample.name, () => {
    expect(validators[sample.schema as keyof typeof validators](sample.value)).toBe(sample.valid);
  });
  it('typed API client reads a labeled reference snapshot', async () => {
    const { data } = await createApi('http://localhost').GET('/api/v1/cases/{id}/snapshot', { params: { path: { id: 'AG-2026-017' }, query: { scenarioRunId: 'reference-slide29' } } });
    expect(data?.mode).toBe('reference');
    expect(data?.data.analysis.metrics.failureProbability).toBeNull();
    expect(data?.data.analysis.risk.score).toBe(7.2);
  });
});

it('mock refuses a foreign run or missing case', async () => {
  for (const [id, run] of [['AG-2026-017', 'foreign-run'], ['absent', 'reference-slide29']]) {
    const { response } = await createApi('http://localhost').GET('/api/v1/cases/{id}/snapshot', {
      params: { path: { id }, query: { scenarioRunId: run } },
    });
    expect(response.status).toBe(404);
  }
});

it('reference queue respects filters and pagination', async () => {
  const client = createApi('http://localhost');
  const filtered = await client.GET('/api/v1/risks', { params: { query: { scenarioRunId: 'reference-slide29', priority: 'low' } } });
  expect(filtered.data?.data.total).toBe(0);
  const page = await client.GET('/api/v1/risks', { params: { query: { scenarioRunId: 'reference-slide29', limit: 1, offset: 1 } } });
  expect(page.data?.data).toMatchObject({ items: [], total: 1, limit: 1, offset: 1 });
});
