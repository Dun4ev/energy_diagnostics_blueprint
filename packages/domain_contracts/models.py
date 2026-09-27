"""Canonical wire contracts. Generated exports must never be edited by hand."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictBool,
    model_validator,
)

from .schema_rules import ANALYSIS_RULES, MEASUREMENT_RULES

Number = Annotated[float, Field(strict=True)]
Integer = Annotated[int, Field(strict=True)]


def require_bool(value):
    if type(value) is not bool:
        raise ValueError("boolean required")
    return value


def require_int(value):
    if type(value) is not int:
        raise ValueError("integer required")
    return value


def require_time(value):
    if not isinstance(value, (str, datetime)):
        raise ValueError("ISO8601 timestamp required")
    return value


TrueFlag = Annotated[Literal[True], BeforeValidator(require_bool)]
FalseFlag = Annotated[Literal[False], BeforeValidator(require_bool)]
Speed = Annotated[Literal[1, 10, 60], BeforeValidator(require_int)]


def utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timezone required")
    return value.astimezone(timezone.utc)


Time = Annotated[datetime, BeforeValidator(require_time), AfterValidator(utc)]
Text = Annotated[str, Field(min_length=1, max_length=4000)]
ID = Annotated[str, Field(min_length=1, max_length=128)]
Fraction = Annotated[Number, Field(ge=0, le=1)]
Revision = Annotated[Integer, Field(ge=1)]
Mode = Literal["reference", "simulation"]
Metric = Literal[
    "contact_temperature",
    "ambient_temperature",
    "load_fraction",
    "closing_time",
    "relative_pd_indicator",
]
Unit = Literal["degC", "fraction", "ms", "dB_ref_demo"]
Quality = Literal["good", "missing", "suspect", "invalid"]
ActionCode = Literal[
    "VERIFY_TELEMETRY",
    "REQUEST_THERMOGRAPHY",
    "COMPARE_PHASES_AND_LOAD",
    "ENGINEERING_REVIEW",
    "PLAN_MAINTENANCE_IF_CONFIRMED",
    "VERIFY_AFTER_ACTION",
    "CONTINUE_OBSERVATION",
]
Priority = Literal["low", "medium", "high", "unknown"]


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, frozen=True)


class Measurement(DTO):
    model_config = ConfigDict(json_schema_extra={"allOf": MEASUREMENT_RULES})
    schemaVersion: Literal["0.1.0"]
    measurementId: ID
    assetId: ID
    sourceId: ID
    metric: Metric
    eventTime: Time
    receivedAt: Time
    value: Number | None
    unit: Unit
    quality: Quality
    origin: Literal["synthetic", "field"]
    scenarioRunId: ID

    @model_validator(mode="after")
    def semantics(self):
        units = {
            "contact_temperature": "degC",
            "ambient_temperature": "degC",
            "load_fraction": "fraction",
            "closing_time": "ms",
            "relative_pd_indicator": "dB_ref_demo",
        }
        if self.eventTime > self.receivedAt:
            raise ValueError("eventTime cannot follow receivedAt")
        if self.unit != units[self.metric]:
            raise ValueError("metric/unit mismatch")
        if self.quality == "missing" and self.value is not None:
            raise ValueError("missing requires null")
        if self.quality == "good" and self.value is None:
            raise ValueError("good requires number")
        if self.metric == "load_fraction" and self.value is not None and not 0 <= self.value <= 2:
            raise ValueError("load fraction outside demo bounds")
        return self


class AnalysisQuality(DTO):
    overall: Literal["good", "partial", "insufficient", "invalid"]
    freshSources: Annotated[Integer, Field(ge=0)]
    totalSources: Annotated[Integer, Field(ge=0)]
    coverage: Fraction | None
    issues: list[Text]

    @model_validator(mode="after")
    def counts(self):
        if self.freshSources > self.totalSources:
            raise ValueError("freshSources exceeds totalSources")
        return self


class AnalysisMetrics(DTO):
    observedTemperatureC: Number | None
    expectedTemperatureC: Number | None
    residualC: Number | None
    loadFraction: Number | None
    ambientC: Number | None
    slopeCPerDay: Number | None
    trendWindowHours: Integer | None
    failureProbability: None

    @model_validator(mode="after")
    def residual(self):
        if all(
            x is not None
            for x in [self.observedTemperatureC, self.expectedTemperatureC, self.residualC]
        ):
            if abs(self.observedTemperatureC - self.expectedTemperatureC - self.residualC) > 1e-6:
                raise ValueError("residual must equal observed minus expected")
        return self


class Risk(DTO):
    score: Annotated[Number, Field(ge=0, le=10)] | None
    scaleMax: Annotated[Literal[10], BeforeValidator(require_int)]
    priority: Priority
    label: Text
    probabilistic: FalseFlag

    @model_validator(mode="after")
    def unknown(self):
        if (self.score is None) != (self.priority == "unknown"):
            raise ValueError("unknown risk requires null score and vice versa")
        return self


class Hypothesis(DTO):
    code: ID
    title: Text
    status: Literal["unconfirmed"]
    supportEvidenceIds: list[ID]
    missingEvidence: list[Text]


class NextAction(DTO):
    code: ActionCode
    reason: Text
    dueWithinHours: Annotated[Number, Field(gt=0)] | None
    requiresHumanApproval: TrueFlag


class MonitoringWindow(DTO):
    minDays: Annotated[Number, Field(ge=0)] | None
    maxDays: Annotated[Number, Field(ge=0)] | None
    isFailureDateForecast: FalseFlag

    @model_validator(mode="after")
    def bounds(self):
        if (self.minDays is None) != (self.maxDays is None):
            raise ValueError("both monitoring bounds required or both null")
        if self.minDays is not None and self.minDays > self.maxDays:
            raise ValueError("reversed monitoring bounds")
        return self


class AnalysisResult(DTO):
    model_config = ConfigDict(json_schema_extra={"allOf": ANALYSIS_RULES})
    schemaVersion: Literal["0.1.0"]
    analysisRunId: ID
    assetId: ID
    scenarioRunId: ID
    asOf: Time
    mode: Mode
    status: Literal["normal", "requires_review", "insufficient_data"]
    modelVersion: Text | None
    policyVersion: Text | None
    inputSnapshotId: ID
    calculationOrigin: Literal["presentation_illustration", "computed"]
    quality: AnalysisQuality
    metrics: AnalysisMetrics
    risk: Risk
    hypotheses: list[Hypothesis]
    nextActions: list[NextAction]
    monitoringWindow: MonitoringWindow
    advisoryOnly: TrueFlag
    controlCommandsAllowed: FalseFlag

    @model_validator(mode="after")
    def semantics(self):
        if self.mode == "reference" and self.calculationOrigin != "presentation_illustration":
            raise ValueError("reference origin required")
        if self.mode == "simulation" and (
            self.calculationOrigin != "computed" or not self.modelVersion or not self.policyVersion
        ):
            raise ValueError("simulation requires computed origin and versions")
        if (
            self.status == "insufficient_data"
            or self.quality.overall in {"insufficient", "invalid"}
        ) and self.risk.score is not None:
            raise ValueError("insufficient/invalid data cannot have a current numeric score")
        return self


class ThermalCalibration(DTO):
    aC: Number
    bC: Annotated[Number, Field(ge=0)]
    tauHours: Annotated[Number, Field(gt=0)]


class Asset(DTO):
    assetId: ID
    name: Text
    assetType: Literal["transformer", "breaker", "cable"]
    siteId: ID
    parentId: ID | None
    measurementLocation: Text
    demoConsequenceWeight: Fraction
    calibration: ThermalCalibration | None


class Source(DTO):
    sourceId: ID
    assetId: ID
    metric: Metric
    unit: Unit
    location: Text
    channel: Literal["primary_a", "independent_a", "phase_b", "load", "ambient", "event", "daily"]
    frequencySeconds: Annotated[Integer, Field(gt=0)] | None
    maxAgeSeconds: Annotated[Integer, Field(gt=0)]
    origin: Literal["synthetic", "field"]


class Evidence(DTO):
    evidenceId: ID
    scenarioRunId: ID
    assetId: ID
    revision: Revision
    origin: Literal["synthetic", "presentation_illustration"]
    authorId: ID
    observedAt: Time
    receivedAt: Time
    kind: Literal["measurement", "note", "thermography_metadata", "file"]
    verification: Literal["unverified", "verified", "rejected"]
    text: Text
    measurement: Measurement | None
    uri: str | None
    sha256: Annotated[str, Field(pattern="^[a-f0-9]{64}$")] | None
    hasImage: StrictBool

    @model_validator(mode="after")
    def provenance(self):
        if self.kind == "measurement" and self.measurement is None:
            raise ValueError("measurement evidence requires a measurement")
        if self.measurement is not None:
            if (
                self.measurement.assetId != self.assetId
                or self.measurement.scenarioRunId != self.scenarioRunId
            ):
                raise ValueError("evidence measurement asset/run mismatch")
            if self.measurement.origin != self.origin:
                raise ValueError("evidence measurement origin mismatch")
        if self.hasImage and (self.uri is None or self.sha256 is None):
            raise ValueError("image requires URI and hash")
        return self


class CaseState(StrEnum):
    DETECTED = "detected"
    UNDER_REVIEW = "under_review"
    AWAITING_EVIDENCE = "awaiting_evidence"
    CONFIRMED = "confirmed"
    NOT_CONFIRMED = "not_confirmed"
    SENSOR_ISSUE = "sensor_issue"
    REMEDIATION_PLANNED = "remediation_planned"
    VERIFICATION = "verification"
    CLOSED = "closed"


class PlanState(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    IN_PROGRESS = "in_progress"
    AWAITING_VERIFICATION = "awaiting_verification"
    COMPLETED = "completed"
    SUPERSEDED = "superseded"
    CANCELLED = "cancelled"


class Role(StrEnum):
    VIEWER = "viewer"
    ENGINEER = "engineer"
    APPROVER = "approver"
    TECHNICIAN = "technician"
    ADMIN = "admin"


class Permission(StrEnum):
    READ = "read"
    CASE_REVIEW = "case.review"
    CASE_CONFIRM = "case.confirm"
    CASE_CLOSE = "case.close"
    PLAN_EDIT = "plan.edit"
    PLAN_APPROVE = "plan.approve"
    STEP_RESULT = "step.result"
    EVIDENCE_ADD = "evidence.add"
    DEMO_ADVANCE = "demo.advance"
    ADMIN_USERS = "admin.users"


class Identity(DTO):
    actorId: ID
    displayName: Text
    role: Role
    permissions: list[Permission]
    csrfToken: Text


class Case(DTO):
    caseId: ID
    scenarioRunId: ID
    assetId: ID
    symptomFamily: ID
    state: CaseState
    revision: Revision
    evidenceRevision: Revision
    analysisRunId: ID
    openedAt: Time
    assignedTo: ID | None
    outcome: Text | None


class PlanStep(DTO):
    stepId: ID
    number: Annotated[Integer, Field(ge=1)]
    actionCode: ActionCode
    description: Text
    assigneeRole: Role
    assigneeId: ID | None
    dueAt: Time | None
    dueWithinHours: Annotated[Number, Field(gt=0)] | None
    dueAnchor: Literal["case_opened", "approved_at", "reference_unspecified"]
    requiredEvidence: list[Text]
    condition: Literal["approved_plan", "defect_confirmed"]
    status: Literal["not_started", "in_progress", "result_recorded", "verified"]
    resultEvidenceIds: list[ID]


class WorkPlan(DTO):
    planId: ID
    scenarioRunId: ID
    caseId: ID
    analysisRunId: ID
    evidenceRevision: Revision
    revision: Revision
    authorId: ID
    state: PlanState
    staleReview: StrictBool
    steps: list[PlanStep]

    @model_validator(mode="after")
    def unique_steps(self):
        if len({s.stepId for s in self.steps}) != len(self.steps) or len(
            {s.number for s in self.steps}
        ) != len(self.steps):
            raise ValueError("step ids and numbers must be unique")
        return self


class Approval(DTO):
    approvalId: ID
    scenarioRunId: ID
    planId: ID
    actorId: ID
    action: Literal["approved", "rejected"]
    approvedRevision: Revision
    evidenceRevision: Revision
    reason: Text
    evidenceIds: list[ID]
    occurredAt: Time


class AuditEvent(DTO):
    eventId: ID
    scenarioRunId: ID
    actorId: ID
    action: Text
    objectId: ID
    previousRevision: Annotated[Integer, Field(ge=0)]
    newRevision: Revision
    timestamp: Time
    requestId: ID
    reason: Text


class Defect(DTO):
    defectId: ID
    scenarioRunId: ID
    caseId: ID
    confirmedBy: ID
    confirmedAt: Time
    evidenceIds: Annotated[list[ID], Field(min_length=1)]
    reason: Text


class InputWindow(DTO):
    start: Time
    end: Time
    replayReceivedAt: Time

    @model_validator(mode="after")
    def order(self):
        if self.start > self.end or self.end > self.replayReceivedAt:
            raise ValueError("invalid input window")
        return self


class Trend(DTO):
    windowHours: Literal[24, 72]
    slopeCPerDay: Number | None
    hourlyBins: Annotated[Integer, Field(ge=0)]
    coverage: Fraction
    reason: Text | None


class SeriesPoint(DTO):
    eventTime: Time
    observedC: Number | None
    expectedC: Number | None
    residualC: Number | None
    loadFraction: Number | None
    ambientC: Number | None
    quality: Quality
    sourceIds: list[ID]
    historicalLowerC: Number | None
    historicalUpperC: Number | None


class AnalysisDetails(DTO):
    analysisRunId: ID
    inputWindow: InputWindow
    inputSnapshotHash: Annotated[str, Field(pattern="^[a-f0-9]{64}$")] | None
    trends: list[Trend]
    persistenceMinutes: Annotated[Number, Field(ge=0)] | None
    counterEvidenceIds: list[ID]
    methodStatus: Literal["supported", "unsupported", "warm_up", "reference"]
    methodReason: Text | None
    forecastEnabled: FalseFlag


class AnalysisBundle(DTO):
    analysis: AnalysisResult
    details: AnalysisDetails

    @model_validator(mode="after")
    def consistent(self):
        if self.analysis.analysisRunId != self.details.analysisRunId:
            raise ValueError("analysis/details id mismatch")
        if self.details.inputWindow.end > self.analysis.asOf:
            raise ValueError("future input window")
        if (
            self.details.methodStatus in {"unsupported", "warm_up"}
            and self.analysis.risk.score is not None
        ):
            raise ValueError("unsupported/warm-up risk must be unknown")
        return self


class TopologyNode(DTO):
    nodeId: ID
    assetId: ID | None
    label: Text
    state: Literal["energized", "deenergized", "unknown"]
    origin: Literal["model", "telemetry", "manual_verified"]
    observedAt: Time


class TopologyEdge(DTO):
    source: ID
    target: ID
    state: Literal["energized", "deenergized", "unknown"]


class Topology(DTO):
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]
    label: Text


class CaseSnapshot(DTO):
    snapshotId: ID
    case: Case
    asset: Asset
    analysis: AnalysisResult
    details: AnalysisDetails
    evidence: list[Evidence]
    topology: Topology

    @model_validator(mode="after")
    def consistent(self):
        if self.case.assetId != self.asset.assetId or self.asset.assetId != self.analysis.assetId:
            raise ValueError("snapshot asset mismatch")
        if (
            self.case.analysisRunId != self.analysis.analysisRunId
            or self.details.analysisRunId != self.analysis.analysisRunId
        ):
            raise ValueError("snapshot analysis mismatch")
        if self.case.scenarioRunId != self.analysis.scenarioRunId:
            raise ValueError("snapshot run mismatch")
        if any(
            e.assetId != self.asset.assetId or e.scenarioRunId != self.case.scenarioRunId
            for e in self.evidence
        ):
            raise ValueError("snapshot evidence mismatch")
        AnalysisBundle(analysis=self.analysis, details=self.details)
        return self


class RiskEntry(DTO):
    asset: Asset
    caseId: ID | None
    analysis: AnalysisResult
    assignedTo: ID | None
    nextDueAt: Time | None

    @model_validator(mode="after")
    def coherent_asset(self):
        if self.asset.assetId != self.analysis.assetId:
            raise ValueError("risk entry asset mismatch")
        return self


class Scenario(DTO):
    datasetId: ID
    title: Text
    startsAt: Time
    endsAt: Time
    origin: Literal["synthetic", "presentation_illustration"]


class ScenarioSession(DTO):
    scenarioRunId: ID
    datasetId: ID
    seed: Integer
    mode: Mode
    virtualTime: Time
    replayReceivedAt: Time
    speed: Speed
    paused: StrictBool
    revision: Revision


class ModelInfo(DTO):
    modelVersion: ID
    policyVersion: ID
    supportedAssetTypes: list[Literal["transformer"]]
    advisoryOnly: TrueFlag
    forecastEnabled: FalseFlag


class APIError(DTO):
    code: Text
    message: Text
    details: dict[str, str | Integer | list[str]]
    requestId: ID


T = TypeVar("T")


class Envelope(DTO, Generic[T]):
    schemaVersion: Literal["0.1.0"]
    mode: Mode
    scenarioRunId: ID
    dataTime: Time
    requestId: ID
    data: T

    @model_validator(mode="after")
    def coherent_context(self):
        def visit(value):
            if isinstance(value, DTO):
                if hasattr(value, "scenarioRunId") and value.scenarioRunId != self.scenarioRunId:
                    raise ValueError("envelope run mismatch")
                if hasattr(value, "mode") and value.mode != self.mode:
                    raise ValueError("envelope mode mismatch")
                if hasattr(value, "asOf") and value.asOf > self.dataTime:
                    raise ValueError("analysis beyond envelope dataTime")
                for name in type(value).model_fields:
                    visit(getattr(value, name))
            elif isinstance(value, (list, tuple)):
                for item in value:
                    visit(item)

        visit(self.data)
        if isinstance(self.data, CaseSnapshot) and self.data.analysis.asOf != self.dataTime:
            raise ValueError("snapshot dataTime must equal analysis asOf")
        if isinstance(self.data, ScenarioSession) and self.data.virtualTime != self.dataTime:
            raise ValueError("session dataTime must equal virtualTime")
        return self


class Page(DTO, Generic[T]):
    items: list[T]
    total: Annotated[Integer, Field(ge=0)]
    offset: Annotated[Integer, Field(ge=0)]
    limit: Annotated[Integer, Field(ge=1, le=1000)]


class LoginRequest(DTO):
    username: ID
    password: Annotated[str, Field(min_length=1, max_length=256)]


class Mutation(DTO):
    expectedRevision: Revision
    reason: Text
    evidenceIds: list[ID]


class CaseDecision(Mutation):
    targetState: CaseState
    evidenceRevision: Revision
    outcome: Text | None


class PlanDraft(DTO):
    caseId: ID
    analysisRunId: ID
    evidenceRevision: Revision
    expectedCaseRevision: Revision
    reason: Text
    steps: Annotated[list[PlanStep], Field(min_length=1)]


class PlanEdit(Mutation):
    steps: Annotated[list[PlanStep], Field(min_length=1)]


class PlanSubmit(Mutation):
    analysisRunId: ID
    evidenceRevision: Revision


class PlanDecision(PlanSubmit):
    action: Literal[
        "approved",
        "rejected",
        "cancelled",
        "superseded",
        "in_progress",
        "awaiting_verification",
        "completed",
        "draft",
    ]


class StepResult(Mutation):
    stepId: ID
    observedAt: Time
    conclusion: Text


class EvidenceCreate(DTO):
    caseId: ID
    expectedRevision: Revision
    reason: Text
    observedAt: Time
    kind: Literal["note", "measurement", "thermography_metadata"]
    text: Text
    measurement: Measurement | None
    origin: Literal["synthetic"]


class SessionCreate(DTO):
    datasetId: ID
    seed: Integer
    mode: Mode
    virtualTime: Time
    reason: Text


class SessionAdvance(DTO):
    expectedRevision: Revision
    action: Literal["pause", "resume", "step", "speed"]
    seconds: Annotated[Integer, Field(ge=0, le=86400)]
    speed: Speed
    reason: Text


class Health(DTO):
    status: Literal["ok", "degraded"]
    stage: Literal["foundation"]
    database: Literal["ready", "unavailable", "unconfigured"]
    businessRuntime: Literal["not_implemented"]
    advisoryOnly: TrueFlag
    controlCommandsAllowed: FalseFlag
    externalAiEnabled: FalseFlag


class BrandConfig(DTO):
    productName: Text
    organizationName: Text
    logoLight: str | None
    logoDark: str | None
    logoAlt: Text
    favicon: str | None
    locale: Literal["ru-RU"]
    timezone: Text
    primaryColor: Annotated[str, Field(pattern="^#[a-fA-F0-9]{6}$")]
    navBackground: Annotated[str, Field(pattern="^#[a-fA-F0-9]{6}$")]


class FeatureRegistration(DTO):
    id: ID
    route: Text
    label: Text
    permission: Permission
    implemented: StrictBool


class ThermalPolicy(DTO):
    aC: Number
    bC: Number
    tauHours: Annotated[Number, Field(gt=0)]


class QualityPolicy(DTO):
    maxTelemetryAgeSeconds: Annotated[Integer, Field(gt=0)]
    minimumWindowCoverage: Fraction
    minimumTrendHours: Annotated[Integer, Field(gt=0)]
    minimumHourlyBins: Annotated[Integer, Field(gt=1)]
    thermographyMaxAgeHoursForThisHeatCaseOnly: Annotated[Integer, Field(gt=0)]


class TrendPolicy(DTO):
    aggregation: Literal["hourly_median"]
    estimator: Literal["theil_sen"]
    windowsHours: list[Literal[24, 72]]


class DetectionPolicy(DTO):
    residualWatchC: Number
    persistMinutes: Annotated[Integer, Field(gt=0)]
    clearResidualC: Number
    clearPersistMinutes: Annotated[Integer, Field(gt=0)]
    autoCloseCase: FalseFlag


class PriorityWeights(DTO):
    severity: Fraction
    growth: Fraction
    consequence: Fraction

    @model_validator(mode="after")
    def total(self):
        if abs(self.severity + self.growth + self.consequence - 1) > 1e-9:
            raise ValueError("priority weights must sum to one")
        return self


class PriorityPolicy(DTO):
    severityScaleC: Annotated[Number, Field(gt=0)]
    growthScaleCPerDay: Annotated[Number, Field(gt=0)]
    weights: PriorityWeights
    mediumFrom: Annotated[Number, Field(ge=0, le=10)]
    highFrom: Annotated[Number, Field(ge=0, le=10)]
    insufficientDataScore: None
    qualityMustNotReduceRiskToZero: TrueFlag


class ForecastPolicy(DTO):
    enabled: FalseFlag
    demoResidualThresholdC: Number
    maximumHorizonDays: Annotated[Integer, Field(gt=0)]
    label: Text


class DiagnosticPolicy(DTO):
    version: ID
    applicability: Text
    thermalModel: ThermalPolicy
    quality: QualityPolicy
    trend: TrendPolicy
    detection: DetectionPolicy
    priority: PriorityPolicy
    conditionalForecast: ForecastPolicy
    failureProbability: None
    allowAutoApprove: FalseFlag
    allowOperationalCommands: FalseFlag
    allowedActionCodes: list[ActionCode]
