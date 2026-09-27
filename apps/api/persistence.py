"""Transactional write boundary shared by HTTP and the replay worker."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from apps.api import db
from packages.domain_contracts import models as m


def wire(value: m.DTO) -> dict:
    return value.model_dump(mode="json")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    # SQLite test fixtures lose tzinfo; PostgreSQL TIMESTAMPTZ remains aware.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class DomainError(Exception):
    def __init__(self, code: str, message: str, status: int = 422):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


def require(condition: bool, code: str, message: str, status: int = 422):
    if not condition:
        raise DomainError(code, message, status)


def get_run(session: Session, run_id: str) -> db.RunRow:
    run = session.get(db.RunRow, run_id)
    require(run is not None, "NOT_FOUND", "Сеанс не найден", 404)
    return run


def get_case(session: Session, run_id: str, case_id: str, lock=False) -> db.CaseRow:
    query = select(db.CaseRow).where(db.CaseRow.id == case_id, db.CaseRow.run_id == run_id)
    row = session.scalar(query.with_for_update() if lock else query)
    require(row is not None, "NOT_FOUND", "Случай не найден", 404)
    return row


def get_plan(session: Session, run_id: str, plan_id: str, lock=False) -> db.PlanRow:
    query = select(db.PlanRow).where(db.PlanRow.id == plan_id, db.PlanRow.run_id == run_id)
    row = session.scalar(query.with_for_update() if lock else query)
    require(row is not None, "NOT_FOUND", "Проект не найден", 404)
    return row


def check_revision(actual: int, expected: int):
    require(actual == expected, "REVISION_CONFLICT", "Данные изменились, обновите страницу", 409)


def check_evidence_ids(session: Session, case: db.CaseRow, ids: list[str]):
    require(len(ids) == len(set(ids)), "INVALID_EVIDENCE", "Доказательства повторяются")
    if ids:
        found = session.scalars(
            select(db.EvidenceRow).where(
                db.EvidenceRow.run_id == case.run_id,
                db.EvidenceRow.case_id == case.id,
                db.EvidenceRow.id.in_(ids),
            )
        ).all()
        require(len(found) == len(ids), "INVALID_EVIDENCE", "Доказательство не относится к случаю")


def audit(session: Session, run_id: str, actor_id: str, action: str, object_id: str,
          previous: int, new: int, reason: str, request_id: str):
    event = m.AuditEvent(
        eventId=str(uuid4()), scenarioRunId=run_id, actorId=actor_id,
        action=action, objectId=object_id, previousRevision=previous,
        newRevision=new, timestamp=utc_now(), requestId=request_id, reason=reason,
    )
    session.add(db.AuditRow(id=event.eventId, run_id=run_id, object_id=object_id,
                            timestamp=event.timestamp, body=wire(event)))


def create_run(session: Session, run: m.ScenarioSession):
    """Stage07 calls this after validating dataset, mode, and virtual time."""
    require(session.get(db.RunRow, run.scenarioRunId) is None,
            "RUN_EXISTS", "Сеанс уже существует", 409)
    session.add(db.RunRow(id=run.scenarioRunId, mode=run.mode,
                          virtual_time=run.virtualTime, body=wire(run)))
    session.flush()


def seed_reference_snapshot(session: Session, snapshot: m.Envelope[m.CaseSnapshot]):
    """Explicit adapter for a mounted canonical reference fixture, never truth input."""
    get = session.get(db.RunRow, snapshot.scenarioRunId)
    if get:
        return
    run_id = snapshot.scenarioRunId
    session.add(db.RunRow(id=run_id, mode="reference", virtual_time=snapshot.dataTime,
                          body={"scenarioRunId": run_id, "datasetId": "reference-slide29",
                                "seed": 0, "mode": "reference",
                                "virtualTime": snapshot.dataTime.isoformat(),
                                "replayReceivedAt": snapshot.dataTime.isoformat(),
                                "speed": 1, "paused": True, "revision": 1}))
    session.flush()
    value = snapshot.data
    asset, case, analysis = value.asset, value.case, value.analysis
    session.add(db.AssetRow(run_id=run_id, id=asset.assetId, site_id=asset.siteId,
                            asset_type=asset.assetType, body=wire(asset)))
    session.add(db.AnalysisRow(id=analysis.analysisRunId, run_id=run_id,
                               asset_id=asset.assetId, as_of=analysis.asOf,
                               priority=analysis.risk.priority,
                               bundle=wire(m.AnalysisBundle(analysis=analysis,
                                                            details=value.details)), series=[]))
    session.add(db.CaseRow(id=case.caseId, run_id=run_id, asset_id=case.assetId,
                           symptom_family=case.symptomFamily, state=case.state.value,
                           revision=case.revision, evidence_revision=case.evidenceRevision,
                           analysis_id=case.analysisRunId, body=wire(case)))
    session.add(db.SnapshotRow(run_id=run_id, case_id=case.caseId,
                               body=wire(value)))
    for evidence in value.evidence:
        session.add(db.EvidenceRow(id=evidence.evidenceId, run_id=run_id,
                                   case_id=case.caseId, revision=evidence.revision,
                                   body=wire(evidence)))


def store_analysis(
    session: Session, scenario_run_id: str, asset: m.Asset,
    bundle: m.AnalysisBundle, series: list[m.SeriesPoint], *,
    source_rows: list[m.Source], measurements: list[m.Measurement],
    symptom_family: str = "thermal_residual",
) -> m.Case | None:
    """Atomic ingest hook. Caller owns commit; duplicate analysis IDs are no-ops.

    Case merges by (run, asset, symptom family) while open. Normal/insufficient
    analyses update the asset queue but do not automatically close a case.
    """
    run = get_run(session, scenario_run_id)
    a = bundle.analysis
    require(a.scenarioRunId == scenario_run_id and a.assetId == asset.assetId,
            "RUN_MISMATCH", "Анализ относится к другому сеансу или активу")
    require(a.mode == run.mode and a.asOf <= as_utc(run.virtual_time),
            "TIME_MISMATCH", "Анализ позже времени данных")
    require(all(point.eventTime <= a.asOf for point in series),
            "TIME_MISMATCH", "Ряд содержит будущие точки")
    require(all(s.assetId == asset.assetId and s.origin == "synthetic" for s in source_rows),
            "SOURCE_MISMATCH", "Источник не относится к активу")
    require(all(x.assetId == asset.assetId and x.scenarioRunId == scenario_run_id
                and x.origin == "synthetic" for x in measurements),
            "MEASUREMENT_MISMATCH", "Измерение не относится к сеансу")
    known_sources = {x.sourceId for x in source_rows}
    missing_source_ids = {x.sourceId for x in measurements} - known_sources
    if missing_source_ids:
        known_sources.update(session.scalars(select(db.SourceRow.id).where(
            db.SourceRow.run_id == scenario_run_id,
            db.SourceRow.id.in_(missing_source_ids),
        )).all())
    require(all(x.sourceId in known_sources for x in measurements),
            "SOURCE_MISMATCH", "Измерение ссылается на неизвестный источник")
    if session.get(db.AnalysisRow, a.analysisRunId):
        return None
    session.merge(db.AssetRow(run_id=scenario_run_id, id=asset.assetId,
                              site_id=asset.siteId, asset_type=asset.assetType,
                              body=wire(asset)))
    for source in source_rows:
        session.merge(db.SourceRow(run_id=scenario_run_id, id=source.sourceId,
                                   asset_id=asset.assetId, body=wire(source)))
    unique_measurements = {}
    for measurement in measurements:
        previous = unique_measurements.get(measurement.measurementId)
        require(previous is None or previous == measurement, "DUPLICATE_MEASUREMENT",
                "Повторный ID измерения содержит другие данные", 409)
        unique_measurements[measurement.measurementId] = measurement
    identifiers = list(unique_measurements)
    for start in range(0, len(identifiers), 1000):
        part = identifiers[start:start + 1000]
        existing = {row.id: row.body for row in session.scalars(
            select(db.MeasurementRow).where(db.MeasurementRow.run_id == scenario_run_id,
                                            db.MeasurementRow.id.in_(part))
        )}
        new_rows = []
        for identifier in part:
            measurement = unique_measurements[identifier]
            value = wire(measurement)
            if identifier in existing:
                require(existing[identifier] == value, "DUPLICATE_MEASUREMENT",
                        "Сохраненное измерение неизменяемо", 409)
            else:
                new_rows.append(db.MeasurementRow(
                    run_id=scenario_run_id, id=identifier, asset_id=asset.assetId,
                    source_id=measurement.sourceId, metric=measurement.metric,
                    quality=measurement.quality, event_time=measurement.eventTime,
                    body=value,
                ))
        session.add_all(new_rows)
    session.add(db.AnalysisRow(
        id=a.analysisRunId, run_id=scenario_run_id, asset_id=asset.assetId,
        as_of=a.asOf, priority=a.risk.priority, bundle=wire(bundle),
        series=[wire(point) for point in series],
    ))
    existing = session.scalar(select(db.CaseRow).where(
        db.CaseRow.run_id == scenario_run_id, db.CaseRow.asset_id == asset.assetId,
        db.CaseRow.symptom_family == symptom_family,
        db.CaseRow.state != m.CaseState.CLOSED.value,
    ).with_for_update())
    if existing is None and a.status != "requires_review":
        return None
    if existing is None:
        case = m.Case(caseId=str(uuid4()), scenarioRunId=scenario_run_id,
                      assetId=asset.assetId, symptomFamily=symptom_family,
                      state=m.CaseState.DETECTED, revision=1, evidenceRevision=1,
                      analysisRunId=a.analysisRunId, openedAt=a.asOf,
                      assignedTo=None, outcome=None)
        session.add(db.CaseRow(id=case.caseId, run_id=scenario_run_id,
                               asset_id=asset.assetId, symptom_family=symptom_family,
                               state=case.state.value, revision=1, evidence_revision=1,
                               analysis_id=a.analysisRunId, body=wire(case)))
        audit(session, scenario_run_id, "system-analysis", "case.detected", case.caseId,
              0, 1, "Синтетический анализ требует проверки", str(uuid4()))
    else:
        case = m.Case.model_validate({**existing.body, "revision": existing.revision + 1,
                                      "analysisRunId": a.analysisRunId})
        existing.revision = case.revision
        existing.analysis_id = a.analysisRunId
        existing.body = wire(case)
        mark_plans_stale(session, existing)
        audit(session, scenario_run_id, "system-analysis", "case.analysis_updated", existing.id,
              case.revision - 1, case.revision, "Новая версия анализа", str(uuid4()))
    return case


def mark_plans_stale(session: Session, case: db.CaseRow):
    plans = session.scalars(select(db.PlanRow).where(
        db.PlanRow.run_id == case.run_id, db.PlanRow.case_id == case.id,
        db.PlanRow.state.in_([m.PlanState.SUBMITTED.value, m.PlanState.APPROVED.value]),
    )).all()
    for row in plans:
        row.body = {**row.body, "staleReview": True}


def mutate_case(session: Session, case: db.CaseRow, body: m.CaseDecision,
                actor_id: str, request_id: str) -> m.Case:
    from packages.domain_contracts.workflow import CASE_TRANSITIONS
    check_revision(case.revision, body.expectedRevision)
    check_revision(case.evidence_revision, body.evidenceRevision)
    require(body.targetState in CASE_TRANSITIONS[m.CaseState(case.state)],
            "INVALID_TRANSITION", "Недопустимый переход случая")
    check_evidence_ids(session, case, body.evidenceIds)
    if body.targetState == m.CaseState.CONFIRMED:
        require(bool(body.evidenceIds), "EVIDENCE_REQUIRED", "Для подтверждения нужны доказательства")
    if body.targetState == m.CaseState.CLOSED:
        require(bool(body.evidenceIds) and bool(body.outcome), "VERIFICATION_REQUIRED",
                "Для закрытия нужны исход и результаты проверки")
        plans = session.scalars(select(db.PlanRow).where(
            db.PlanRow.run_id == case.run_id, db.PlanRow.case_id == case.id,
            db.PlanRow.state == m.PlanState.COMPLETED.value,
        )).all()
        require(any(all(step["status"] == "verified" and step["resultEvidenceIds"]
                        for step in p.body["steps"]) for p in plans),
                "VERIFICATION_REQUIRED", "Нет выполненного плана с проверенными результатами")
    updated = m.Case.model_validate({**case.body, "state": body.targetState,
                                     "revision": case.revision + 1, "outcome": body.outcome})
    previous = case.revision
    case.revision, case.state, case.body = updated.revision, updated.state.value, wire(updated)
    if body.targetState == m.CaseState.CONFIRMED:
        defect = m.Defect(defectId=str(uuid4()), scenarioRunId=case.run_id,
                          caseId=case.id, confirmedBy=actor_id, confirmedAt=utc_now(),
                          evidenceIds=body.evidenceIds, reason=body.reason)
        session.add(db.DefectRow(id=defect.defectId, run_id=case.run_id,
                                 case_id=case.id, body=wire(defect)))
    audit(session, case.run_id, actor_id, f"case.{body.targetState.value}", case.id,
          previous, updated.revision, body.reason, request_id)
    return updated


def append_evidence(session: Session, case: db.CaseRow, body: m.EvidenceCreate,
                    actor_id: str, request_id: str) -> m.Evidence:
    check_revision(case.evidence_revision, body.expectedRevision)
    run = get_run(session, case.run_id)
    require(body.observedAt <= as_utc(run.virtual_time),
            "TIME_MISMATCH", "Доказательство позже времени данных")
    require(body.origin == "synthetic", "INVALID_ORIGIN", "Допустимы только синтетические данные")
    require(body.kind != "measurement" or body.measurement is not None,
            "MEASUREMENT_REQUIRED", "Требуется измерение")
    require(body.kind == "measurement" or body.measurement is None,
            "INVALID_MEASUREMENT", "Измерение не соответствует типу доказательства")
    if body.measurement:
        require(body.measurement.assetId == case.asset_id
                and body.measurement.scenarioRunId == case.run_id
                and body.measurement.origin == "synthetic", "MEASUREMENT_MISMATCH",
                "Измерение относится к другому активу или сеансу")
    content = body.model_dump_json().encode()
    evidence = m.Evidence(
        evidenceId=str(uuid4()), scenarioRunId=case.run_id, assetId=case.asset_id,
        revision=case.evidence_revision + 1, origin="synthetic", authorId=actor_id,
        observedAt=body.observedAt, receivedAt=utc_now(), kind=body.kind,
        verification="unverified", text=body.text, measurement=body.measurement,
        uri=None, sha256=hashlib.sha256(content).hexdigest(), hasImage=False,
    )
    session.add(db.EvidenceRow(id=evidence.evidenceId, run_id=case.run_id,
                               case_id=case.id, revision=evidence.revision,
                               body=wire(evidence)))
    previous = case.revision
    case.evidence_revision = evidence.revision
    case.revision += 1
    case.body = {**case.body, "revision": case.revision,
                 "evidenceRevision": case.evidence_revision}
    mark_plans_stale(session, case)
    audit(session, case.run_id, actor_id, "evidence.add", case.id,
          previous, case.revision, body.reason, request_id)
    return evidence


def create_plan(session: Session, case: db.CaseRow, body: m.PlanDraft,
                actor_id: str, request_id: str) -> m.WorkPlan:
    check_revision(case.revision, body.expectedCaseRevision)
    check_revision(case.evidence_revision, body.evidenceRevision)
    require(case.analysis_id == body.analysisRunId, "ANALYSIS_CONFLICT",
            "Анализ изменился, обновите случай", 409)
    plan = m.WorkPlan(planId=str(uuid4()), scenarioRunId=case.run_id,
                      caseId=case.id, analysisRunId=body.analysisRunId,
                      evidenceRevision=body.evidenceRevision, revision=1,
                      authorId=actor_id, state=m.PlanState.DRAFT,
                      staleReview=False, steps=body.steps)
    session.add(db.PlanRow(id=plan.planId, run_id=case.run_id, case_id=case.id,
                           state=plan.state.value, revision=1, body=wire(plan)))
    audit(session, case.run_id, actor_id, "plan.create", plan.planId,
          0, 1, body.reason, request_id)
    return plan


def update_plan(session: Session, row: db.PlanRow, body: m.PlanEdit,
                actor_id: str, request_id: str) -> m.WorkPlan:
    check_revision(row.revision, body.expectedRevision)
    require(row.state == m.PlanState.DRAFT.value, "INVALID_TRANSITION",
            "Редактировать можно только проект")
    case = get_case(session, row.run_id, row.case_id, lock=True)
    check_evidence_ids(session, case, body.evidenceIds)
    plan = m.WorkPlan.model_validate({**row.body, "steps": [wire(s) for s in body.steps],
                                      "revision": row.revision + 1})
    previous = row.revision
    row.revision, row.body = plan.revision, wire(plan)
    audit(session, row.run_id, actor_id, "plan.edit", row.id,
          previous, plan.revision, body.reason, request_id)
    return plan


def transition_plan(session: Session, row: db.PlanRow, body: m.PlanSubmit | m.PlanDecision,
                    target: m.PlanState, actor_id: str, request_id: str) -> m.WorkPlan:
    from packages.domain_contracts.workflow import PLAN_TRANSITIONS
    check_revision(row.revision, body.expectedRevision)
    require(target in PLAN_TRANSITIONS[m.PlanState(row.state)],
            "INVALID_TRANSITION", "Недопустимый переход проекта")
    case = get_case(session, row.run_id, row.case_id, lock=True)
    check_evidence_ids(session, case, body.evidenceIds)
    require(row.body["analysisRunId"] == body.analysisRunId,
            "ANALYSIS_CONFLICT", "Анализ проекта не совпадает", 409)
    require(row.body["evidenceRevision"] == body.evidenceRevision,
            "EVIDENCE_CONFLICT", "Ревизия доказательств не совпадает", 409)
    if target in {m.PlanState.SUBMITTED, m.PlanState.APPROVED}:
        require(case.analysis_id == body.analysisRunId
                and case.evidence_revision == body.evidenceRevision
                and not row.body["staleReview"], "STALE_REVIEW",
                "Появились новые данные, нужен повторный просмотр", 409)
    steps = row.body["steps"]
    if target == m.PlanState.COMPLETED:
        require(all(s["status"] == "result_recorded" and s["resultEvidenceIds"]
                    for s in steps), "VERIFICATION_REQUIRED",
                "Нужны записанные результаты каждого шага")
        # An approver's completed decision explicitly verifies each recorded result.
        steps = [{**s, "status": "verified"} for s in steps]
    updated = m.WorkPlan.model_validate({**row.body, "state": target,
                                         "steps": steps, "revision": row.revision + 1})
    previous = row.revision
    row.state, row.revision, row.body = target.value, updated.revision, wire(updated)
    if target in {m.PlanState.APPROVED, m.PlanState.REJECTED}:
        approval = m.Approval(
            approvalId=str(uuid4()), scenarioRunId=row.run_id, planId=row.id,
            actorId=actor_id, action=target.value, approvedRevision=updated.revision,
            evidenceRevision=body.evidenceRevision, reason=body.reason,
            evidenceIds=body.evidenceIds, occurredAt=utc_now(),
        )
        session.add(db.ApprovalRow(id=approval.approvalId, run_id=row.run_id,
                                   plan_id=row.id, body=wire(approval)))
    audit(session, row.run_id, actor_id, f"plan.{target.value}", row.id,
          previous, updated.revision, body.reason, request_id)
    return updated


def record_step(session: Session, row: db.PlanRow, body: m.StepResult,
                actor_id: str, actor_role: m.Role, request_id: str) -> m.WorkPlan:
    check_revision(row.revision, body.expectedRevision)
    require(row.state in {m.PlanState.IN_PROGRESS.value,
                          m.PlanState.AWAITING_VERIFICATION.value},
            "INVALID_TRANSITION", "Проект еще не выполняется")
    case = get_case(session, row.run_id, row.case_id, lock=True)
    check_evidence_ids(session, case, body.evidenceIds)
    require(bool(body.evidenceIds), "EVIDENCE_REQUIRED", "Для результата нужны доказательства")
    steps = [dict(s) for s in row.body["steps"]]
    match = next((s for s in steps if s["stepId"] == body.stepId), None)
    require(match is not None, "NOT_FOUND", "Шаг не найден", 404)
    require(match["assigneeRole"] == actor_role.value
            and (match["assigneeId"] is None or match["assigneeId"] == actor_id),
            "FORBIDDEN", "Шаг назначен другому исполнителю", 403)
    require(match["status"] in {"not_started", "in_progress"},
            "INVALID_TRANSITION", "Результат шага уже записан")
    match["status"] = "result_recorded"
    match["resultEvidenceIds"] = body.evidenceIds
    updated = m.WorkPlan.model_validate({**row.body, "steps": steps,
                                         "revision": row.revision + 1})
    previous = row.revision
    row.revision, row.body = updated.revision, wire(updated)
    audit(session, row.run_id, actor_id, f"step.result:{body.stepId}", row.id,
          previous, updated.revision, body.reason, request_id)
    return updated


def idempotency_scope(actor_id: str, run_id: str, method: str, path: str, key: str) -> str:
    canonical = json.dumps([actor_id, run_id, method, path, key], separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def idempotency_lock(session: Session, scope: str):
    """Serialize same-key PostgreSQL requests before revision is checked."""
    if session.bind.dialect.name == "postgresql":
        lock_id = int.from_bytes(hashlib.sha256(scope.encode()).digest()[:8], "big", signed=True)
        session.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id})


def payload_hash(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def idempotent_result(session: Session, scope: str, digest: str) -> dict | None:
    row = session.get(db.IdempotencyRow, scope)
    if row:
        require(row.payload_hash == digest, "IDEMPOTENCY_CONFLICT",
                "Ключ уже использован с другим запросом", 409)
        return row.response
    return None


def remember_result(session: Session, scope: str, digest: str, response: dict):
    session.add(db.IdempotencyRow(scope=scope, payload_hash=digest, response=response))
