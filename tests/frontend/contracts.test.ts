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
