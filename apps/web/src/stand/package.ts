import type { components } from '../api/generated';

type S = components['schemas'];
export type StandSceneKind = 'overview' | 'normal' | 'deviation' | 'hypothesis' | 'evidence' | 'plan' | 'approval' | 'history';
export type StandScene = {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  slice: 'early' | 'late';
  assetId: string;
  kind: StandSceneKind;
};
export type StandSlice = { virtualTime: string; risks: S['RiskEntry'][]; series: S['SeriesPoint'][] };
export type StandPackage = {
  version: 1;
  provenance: { datasetId: string; seed: number; modelVersion: string; policyVersion: string };
  slices: { early: StandSlice; late: StandSlice & { snapshot: S['CaseSnapshot'] } };
  story: { evidence: S['Evidence'][]; draft: S['WorkPlan']; submitted: S['WorkPlan']; approved: S['WorkPlan']; completed: S['WorkPlan']; audit: S['AuditEvent'][] };
  scenes: StandScene[];
};

const kinds: StandSceneKind[] = ['overview', 'normal', 'deviation', 'hypothesis', 'evidence', 'plan', 'approval', 'history'];
const durations = [15, 20, 30, 25, 20, 25, 25, 20];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const date = (value: unknown): value is string => nonempty(value) && Number.isFinite(Date.parse(value));
const nullableNumber = (value: unknown): value is number | null => value === null || typeof value === 'number' && Number.isFinite(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const priorities = ['low', 'medium', 'high', 'unknown'];
const qualities = ['good', 'partial', 'insufficient', 'invalid'];
const pointQualities = ['good', 'missing', 'suspect', 'invalid'];
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

/** Validate fields needed by both the presentation and the live handoff before rendering. */
export function validateStandPackage(value: unknown): StandPackage {
  const invalid = () => { throw new Error('Файл учебной симуляции поврежден или не соответствует версии стенда.'); };
  if (!object(value) || value.version !== 1 || !object(value.provenance) || !object(value.slices) || !object(value.story) || !Array.isArray(value.scenes)) return invalid();
  const { provenance, slices, story, scenes } = value;
  if (provenance.datasetId !== 'synthetic-energy-30d' || provenance.seed !== 20260925 || !nonempty(provenance.modelVersion) || !nonempty(provenance.policyVersion)) return invalid();
  if (!object(slices.early) || !object(slices.late) || !object(slices.late.snapshot)) return invalid();
  for (const slice of [slices.early, slices.late]) {
    if (!date(slice.virtualTime) || !Array.isArray(slice.risks) || !Array.isArray(slice.series) || slice.risks.length === 0) return invalid();
    for (const entry of slice.risks) {
      if (!object(entry) || !object(entry.asset) || !nonempty(entry.asset.assetId) || !nonempty(entry.asset.name) || !object(entry.analysis)) return invalid();
      const analysis = entry.analysis;
      if (analysis.mode !== 'simulation' || analysis.calculationOrigin !== 'computed' || analysis.controlCommandsAllowed !== false || analysis.advisoryOnly !== true || analysis.assetId !== entry.asset.assetId || !date(analysis.asOf) || Date.parse(analysis.asOf) !== Date.parse(slice.virtualTime) || !object(analysis.metrics) || analysis.metrics.failureProbability !== null || !object(analysis.quality) || !object(analysis.risk) || !Array.isArray(analysis.hypotheses) || !Array.isArray(analysis.nextActions)) return invalid();
      const metrics = analysis.metrics;
      if (!['observedTemperatureC', 'expectedTemperatureC', 'residualC', 'loadFraction'].every(key => nullableNumber(metrics[key]))) return invalid();
      const risk = analysis.risk;
      if (!nonempty(risk.priority) || !priorities.includes(risk.priority) || !nullableNumber(risk.score) || !nonempty(risk.label) || risk.probabilistic !== false || risk.scaleMax !== 10) return invalid();
      const quality = analysis.quality;
      if (!nonempty(quality.overall) || !qualities.includes(quality.overall) || !Number.isInteger(quality.freshSources) || !Number.isInteger(quality.totalSources)) return invalid();
      if (!analysis.hypotheses.every(item => object(item) && nonempty(item.title) && item.status === 'unconfirmed' && strings(item.missingEvidence))) return invalid();
    }
    for (const point of slice.series) if (!object(point) || !date(point.eventTime) || Date.parse(point.eventTime) > Date.parse(slice.virtualTime) || !nullableNumber(point.observedC) || !nullableNumber(point.expectedC) || !nullableNumber(point.residualC) || !nonempty(point.quality) || !pointQualities.includes(point.quality)) return invalid();
    const entries = slice.risks;
    if (!['tp305-t1', 'tp307-t1'].every(id => entries.some(entry => object(entry) && object(entry.asset) && entry.asset.assetId === id))) return invalid();
  }
  const snapshot = slices.late.snapshot;
  if (!object(snapshot.asset) || !object(snapshot.analysis) || !object(snapshot.case) || !object(snapshot.details) || !Array.isArray(snapshot.evidence)) return invalid();
  if (snapshot.asset.assetId !== snapshot.analysis.assetId || snapshot.case.assetId !== snapshot.asset.assetId || snapshot.case.analysisRunId !== snapshot.analysis.analysisRunId || !date(snapshot.analysis.asOf) || !date(slices.late.virtualTime) || Date.parse(snapshot.analysis.asOf) !== Date.parse(slices.late.virtualTime)) return invalid();
  const snapshotAssetId = snapshot.asset.assetId;
  const snapshotAnalysisId = snapshot.analysis.analysisRunId;
  const matchingEntry = (slices.late.risks as Array<Record<string, unknown>>).find(item => (item.asset as Record<string, unknown>).assetId === snapshotAssetId && (item.analysis as Record<string, unknown>).analysisRunId === snapshotAnalysisId);
  if (!matchingEntry || JSON.stringify(canonical(matchingEntry.analysis)) !== JSON.stringify(canonical(snapshot.analysis))) return invalid();
  const runId = snapshot.case.scenarioRunId;
  const caseId = snapshot.case.caseId;
  if (!nonempty(runId) || !nonempty(caseId) || snapshot.analysis.scenarioRunId !== runId) return invalid();
  if (!Array.isArray(story.evidence) || story.evidence.length === 0 || !Array.isArray(story.audit) || story.audit.length === 0) return invalid();
  if (!story.evidence.every(item => object(item) && nonempty(item.evidenceId) && nonempty(item.text) && date(item.observedAt) && item.origin === 'synthetic' && item.scenarioRunId === runId && item.assetId === snapshotAssetId && ['unverified', 'verified', 'rejected'].includes(String(item.verification)))) return invalid();
  const planIds: string[] = [];
  for (const key of ['draft', 'submitted', 'approved', 'completed'] as const) {
    const plan = story[key];
    if (!object(plan) || !nonempty(plan.state) || !Array.isArray(plan.steps) || plan.steps.length === 0) return invalid();
    if (!nonempty(plan.planId) || plan.scenarioRunId !== runId || plan.caseId !== caseId || plan.analysisRunId !== snapshotAnalysisId || !plan.steps.every(item => object(item) && nonempty(item.stepId) && Number.isInteger(item.number) && nonempty(item.description) && nonempty(item.assigneeRole))) return invalid();
    planIds.push(plan.planId);
  }
  if (new Set(planIds).size !== 1) return invalid();
  if (!story.audit.every(item => object(item) && nonempty(item.eventId) && nonempty(item.actorId) && nonempty(item.action) && typeof item.reason === 'string' && item.scenarioRunId === runId && (item.objectId === caseId || item.objectId === planIds[0]))) return invalid();
  if ((story.draft as Record<string, unknown>).state !== 'draft' || (story.submitted as Record<string, unknown>).state !== 'submitted' || (story.approved as Record<string, unknown>).state !== 'approved' || (story.completed as Record<string, unknown>).state !== 'completed') return invalid();
  if (scenes.length !== kinds.length) return invalid();
  const ids = new Set<string>();
  for (let index = 0; index < kinds.length; index++) {
    const scene = scenes[index];
    if (!object(scene) || !nonempty(scene.id) || ids.has(scene.id) || !nonempty(scene.title) || !nonempty(scene.description) || scene.kind !== kinds[index] || scene.durationSeconds !== durations[index] || (scene.slice !== 'early' && scene.slice !== 'late') || !nonempty(scene.assetId)) return invalid();
    const slice = slices[scene.slice] as Record<string, unknown>;
    const risks = slice.risks as Array<Record<string, unknown>>;
    if (!risks.some(entry => (entry.asset as Record<string, unknown>).assetId === scene.assetId)) return invalid();
    ids.add(scene.id);
  }
  return value as StandPackage;
}

export async function loadStandPackage(): Promise<StandPackage> {
  const response = await fetch('/stand-data.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось загрузить запись учебной симуляции.');
  return validateStandPackage(await response.json());
}
