/** Contract-only mocks. Not imported by the application entry point. */
import { http, HttpResponse } from 'msw';
import fixture from '../../../../contracts/fixtures/reference-snapshot.json';
import type { components } from './generated';
// JSON imports widen literals; JSON Schema and Pydantic validate this fixture in CI.
export const referenceSnapshot = fixture as components['schemas']['Envelope_CaseSnapshot_'];
export const handlers = [
  http.get('*/api/v1/cases/:id/snapshot', () => HttpResponse.json(referenceSnapshot)),
  http.get('*/api/v1/risks', () => HttpResponse.json({
    ...referenceSnapshot,
    data: { items: [{ asset: referenceSnapshot.data.asset, caseId: referenceSnapshot.data.case.caseId,
      analysis: referenceSnapshot.data.analysis, assignedTo: null, nextDueAt: null }], total: 1, offset: 0, limit: 100 },
  } satisfies components['schemas']['Envelope_Page_RiskEntry__'])),
  http.all('*/api/v1/*', () => HttpResponse.json({ code: 'NOT_IMPLEMENTED', message: 'Contract mock: mutation not implemented', details: {}, requestId: 'mock' }, { status: 501 })),
];
