/** Contract-only mocks. Not imported by the application entry point. */
import { http, HttpResponse } from 'msw';
import fixture from '../../../../contracts/fixtures/reference-snapshot.json';
import type { components } from './generated';
// JSON imports widen literals; JSON Schema and Pydantic validate this fixture in CI.
export const referenceSnapshot = fixture as components['schemas']['Envelope_CaseSnapshot_'];
function unavailable() {
  return HttpResponse.json({ code: 'NOT_FOUND', message: 'Reference fixture not found for this id/run', details: {}, requestId: 'mock' }, { status: 404 });
}
function matchingRun(request: Request) {
  return new URL(request.url).searchParams.get('scenarioRunId') === referenceSnapshot.scenarioRunId;
}
export const handlers = [
  http.get('*/api/v1/cases/:id/snapshot', ({ request, params }) => {
    if (!matchingRun(request) || params.id !== referenceSnapshot.data.case.caseId) return unavailable();
    return HttpResponse.json(referenceSnapshot);
  }),
  http.get('*/api/v1/risks', ({ request }) => {
    if (!matchingRun(request)) return unavailable();
    const query = new URL(request.url).searchParams;
    const limit = Number(query.get('limit') ?? 100);
    const offset = Number(query.get('offset') ?? 0);
    const priority = query.get('priority');
    const includeNormal = query.get('includeNormal') ?? 'false';
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(offset) || offset < 0
      || (priority !== null && !['low', 'medium', 'high', 'unknown'].includes(priority))
      || !['true', 'false'].includes(includeNormal)) {
      return HttpResponse.json({ code: 'VALIDATION_ERROR', message: 'Invalid mock query', details: {}, requestId: 'mock' }, { status: 422 });
    }
    const items = [{ asset: referenceSnapshot.data.asset, caseId: referenceSnapshot.data.case.caseId,
      analysis: referenceSnapshot.data.analysis, assignedTo: null, nextDueAt: null }].filter(item =>
      (!priority || item.analysis.risk.priority === priority)
      && (!query.get('siteId') || item.asset.siteId === query.get('siteId'))
      && (includeNormal === 'true' || item.analysis.status !== 'normal'));
    return HttpResponse.json({
      ...referenceSnapshot,
      data: { items: items.slice(offset, offset + limit), total: items.length, offset, limit },
    } satisfies components['schemas']['Envelope_Page_RiskEntry__']);
  }),
  http.all('*/api/v1/*', () => HttpResponse.json({ code: 'NOT_IMPLEMENTED', message: 'Contract mock: mutation not implemented', details: {}, requestId: 'mock' }, { status: 501 })),
];
