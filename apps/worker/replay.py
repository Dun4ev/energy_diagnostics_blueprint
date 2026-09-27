"""Persisted replay queue and deterministic publication, observations only."""
from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import JSON, String, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api import db
from apps.api import persistence as p
from packages.diagnostics import DeterministicAnalyzer
from packages.domain_contracts import models as m
from packages.ingestion import SyntheticAdapter

START = datetime(2026, 6, 24, 7, 40, tzinfo=timezone.utc)
END = datetime(2026, 7, 24, 7, 40, tzinfo=timezone.utc)
REFERENCE_TIME = datetime(2026, 7, 24, 7, 42, tzinfo=timezone.utc)
DATASET = "synthetic-energy-30d"
SEED = 20260925


class RuntimeRow(db.Base):
    __tablename__ = "runtime_status"
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


def catalog() -> list[m.Scenario]:
    return [
        m.Scenario(datasetId="reference-slide29", title="Слайд 29 · иллюстрация", startsAt=REFERENCE_TIME,
                   endsAt=REFERENCE_TIME, origin="presentation_illustration"),
        m.Scenario(datasetId=DATASET, title="9 активов · 30 суток наблюдений", startsAt=START,
                   endsAt=END, origin="synthetic"),
    ]


def validate_create(body: m.SessionCreate):
    expected = "reference-slide29" if body.mode == "reference" else DATASET
    p.require(body.datasetId == expected, "DATASET_MODE", "Набор не соответствует режиму")
    if body.mode == "simulation":
        p.require(body.seed == SEED, "DATASET_SEED", "Подготовленный набор использует seed 20260925")
        p.require(START <= body.virtualTime <= END, "DATA_TIME", "Время вне набора наблюдений")
    else:
        p.require(body.virtualTime == REFERENCE_TIME, "DATA_TIME", "Иллюстрация имеет фиксированное время")


def new_run(session, body: m.SessionCreate, actor: str, request_id: str) -> m.ScenarioSession:
    validate_create(body)
    run = m.ScenarioSession(scenarioRunId=str(uuid4()), datasetId=body.datasetId, seed=body.seed,
                           mode=body.mode, virtualTime=body.virtualTime,
                           replayReceivedAt=body.virtualTime, speed=1, paused=True, revision=1,
                           processingStatus="queued")
    p.create_run(session, run)
    p.audit(session, run.scenarioRunId, actor, "session.created", run.scenarioRunId,
            0, 1, body.reason, request_id)
    return run


def advance_run(session, row: db.RunRow, body: m.SessionAdvance, actor: str, request_id: str):
    run = m.ScenarioSession.model_validate(row.body)
    p.check_revision(run.revision, body.expectedRevision)
    p.require(run.processingStatus == "ready", "RUN_BUSY", "Дождитесь завершения расчета", 409)
    p.require(run.mode == "simulation", "REFERENCE_FIXED", "Иллюстрация имеет фиксированное время")
    value = run.model_dump()
    if body.action == "step":
        p.require(body.seconds > 0, "STEP_SIZE", "Шаг должен быть больше нуля")
        value.update(virtualTime=min(END, run.virtualTime + timedelta(seconds=body.seconds)),
                     paused=True, processingStatus="queued")
        value["replayReceivedAt"] = value["virtualTime"]
    elif body.action == "pause":
        value["paused"] = True
    elif body.action == "resume":
        p.require(run.virtualTime < END, "END_OF_DATA", "Достигнут конец наблюдений")
        value["paused"] = False
    else:
        value["speed"] = body.speed
    value["revision"] += 1
    updated = m.ScenarioSession.model_validate(value)
    row.body, row.virtual_time = p.wire(updated), updated.virtualTime
    session.merge(RuntimeRow(key="clock:" + row.id, body={"wallTime": p.utc_now().isoformat()}))
    p.audit(session, row.id, actor, "session." + body.action, row.id,
            run.revision, updated.revision, body.reason, request_id)
    return updated


def _publish_reference(session, row):
    path = Path(os.getenv("API_REFERENCE_FIXTURE_PATH", "contracts/fixtures/reference-snapshot.json"))
    raw = json.loads(path.read_text())
    old_run = raw["scenarioRunId"]
    # The fixture is explicitly illustrative, cloned to an isolated run identity.
    raw = json.loads(json.dumps(raw).replace(old_run, row.id))
    value = m.CaseSnapshot.model_validate(raw["data"])
    case_id, analysis_id = str(uuid4()), str(uuid4())
    value = value.model_copy(update={
        "case": value.case.model_copy(update={"caseId": case_id, "analysisRunId": analysis_id}),
        "analysis": value.analysis.model_copy(update={"analysisRunId": analysis_id}),
        "details": value.details.model_copy(update={"analysisRunId": analysis_id}),
    })
    chart_path = Path(os.getenv("API_REFERENCE_EXAMPLES_DIR", "contracts/examples")) / "reference-chart-reconstruction.json"
    chart = json.loads(chart_path.read_text())["points"]
    series = [m.SeriesPoint(eventTime=x["eventTime"], observedC=x["observedC"], expectedC=x["expectedC"],
                            residualC=round(x["observedC"]-x["expectedC"], 2), loadFraction=None,
                            ambientC=None, quality="good", sourceIds=["presentation-slide29"],
                            historicalLowerC=x["illustrativeBandLowC"], historicalUpperC=x["illustrativeBandHighC"])
              for x in chart]
    topology_raw = json.loads((chart_path.parent / "reference-topology.json").read_text())
    states = {node["id"]: node["state"] for node in topology_raw["nodes"]}
    topology = m.Topology(
        nodes=[m.TopologyNode(nodeId=node["id"], assetId=node["id"] if node["id"] == value.asset.assetId else None,
                              label=node["label"], state=node["state"], origin="model", observedAt=REFERENCE_TIME)
               for node in topology_raw["nodes"]],
        edges=[m.TopologyEdge(source=edge["from"], target=edge["to"], state=states[edge["to"]])
               for edge in topology_raw["edges"]],
        label="Иллюстрация схемы из презентации. Состояние модели, не подтверждено телеметрией. Т-2: неизвестно.")
    value = value.model_copy(update={"topology": topology})
    asset, case, analysis = value.asset, value.case, value.analysis
    session.add(db.AssetRow(run_id=row.id, id=asset.assetId, site_id=asset.siteId,
                            asset_type=asset.assetType, body=p.wire(asset)))
    session.add(db.AnalysisRow(id=analysis_id, run_id=row.id, asset_id=asset.assetId,
                               as_of=analysis.asOf, priority=analysis.risk.priority,
                               bundle=p.wire(m.AnalysisBundle(analysis=analysis, details=value.details)),
                               series=[p.wire(x) for x in series]))
    session.add(db.CaseRow(id=case_id, run_id=row.id, asset_id=asset.assetId,
                           symptom_family=case.symptomFamily, state=case.state.value,
                           revision=case.revision, evidence_revision=case.evidenceRevision,
                           analysis_id=analysis_id, body=p.wire(case)))
    session.add(db.SnapshotRow(run_id=row.id, case_id=case_id, body=p.wire(value)))


def _publish_simulation(session, row, run):
    adapter = SyntheticAdapter(Path(os.getenv("OBSERVATIONS_DIR", "data/observations")))
    policy = m.DiagnosticPolicy.model_validate_json(
        Path(os.getenv("DIAGNOSTIC_POLICY_PATH", "config/diagnostic-policy.demo.json")).read_text())
    observations = defaultdict(list)
    for observation in adapter.observations(scenario_run_id=row.id, as_of=run.virtualTime,
                                           received_as_of=run.replayReceivedAt,
                                           since=run.virtualTime - timedelta(hours=108)):
        observations[observation.assetId].append(observation)
    sources = adapter.sources()
    analyzer = DeterministicAnalyzer()
    for asset in adapter.assets():
        values = observations[asset.assetId]
        bundle, series = analyzer.analyze_series(values, asset, policy,
                                                 as_of=run.virtualTime, received_as_of=run.replayReceivedAt,
                                                 scenario_run_id=row.id)
        p.store_analysis(session, row.id, asset, bundle, series,
                         source_rows=[x for x in sources if x.assetId == asset.assetId], measurements=values)


def tick(factory) -> bool:
    """One queued revision is one durable job; lock spans atomic publication.

    A crash rolls back publication and leaves the job queued. Multiple workers
    use SKIP LOCKED. Core's deterministic analysis ID makes a retried slice a no-op.
    """
    with factory.begin() as session:
        session.merge(RuntimeRow(key="worker", body={"at": p.utc_now().isoformat()}))
    with factory.begin() as session:
        rows = session.scalars(select(db.RunRow).order_by(db.RunRow.id).with_for_update(skip_locked=True)).all()
        for row in rows:
            run = m.ScenarioSession.model_validate(row.body)
            if run.processingStatus == "ready" and not run.paused and run.mode == "simulation":
                clock = session.get(RuntimeRow, "clock:" + row.id)
                now = p.utc_now()
                last = datetime.fromisoformat(clock.body["wallTime"]) if clock else now
                elapsed = int((now-last).total_seconds() * run.speed)
                if elapsed < 300:
                    continue
                time = min(END, run.virtualTime + timedelta(seconds=min(elapsed, 86400)))
                run = run.model_copy(update={"virtualTime": time, "replayReceivedAt": time,
                                              "processingStatus": "queued", "revision": run.revision+1,
                                              "paused": time == END})
                row.body, row.virtual_time = p.wire(run), time
                session.merge(RuntimeRow(key="clock:"+row.id, body={"wallTime":now.isoformat()}))
            if run.processingStatus != "queued":
                continue
            # Savepoint prevents partial asset publication even if a single input is invalid.
            try:
                with session.begin_nested():
                    if run.mode == "reference":
                        _publish_reference(session, row)
                    else:
                        _publish_simulation(session, row, run)
                done = run.model_copy(update={"processingStatus": "ready", "processingError": None,
                                              "processedAt": p.utc_now()})
            except Exception as exc:
                # Never return raw DB errors, paths or credentials to the browser.
                print(f"Replay failed: {type(exc).__name__}", flush=True)
                done = run.model_copy(update={"processingStatus": "failed",
                                              "processingError": "Не удалось рассчитать срез. Проверьте локальные входные данные и повторите в новом сеансе."})
            row.body = p.wire(done)
            session.merge(RuntimeRow(key="worker", body={"at": p.utc_now().isoformat()}))
            return True
    return False
