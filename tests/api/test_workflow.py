"""HTTP regression tests for permissions, revisions, persistence and run isolation."""

from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from apps.api import db, main
from apps.api import persistence as p
from packages.domain_contracts import models as m

ROOT = Path(__file__).resolve().parents[2]
RUN = "reference-slide29"
CASE = "AG-2026-017"
ANALYSIS = "reference-ag-2026-017-r1"
ORIGIN = "http://localhost:8080"


@pytest.fixture
def setup(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'api.db'}")
    maker = sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(main, "factory", lambda: maker)
    monkeypatch.setenv("API_REFERENCE_FIXTURE_PATH", str(ROOT / "contracts/fixtures/reference-snapshot.json"))
    for role in m.Role:
        monkeypatch.setenv(f"DEMO_{role.value.upper()}_PASSWORD", f"private-{role.value}")
    monkeypatch.setenv("DEMO_ENGINEER_CASE_CONFIRM", "true")
    with TestClient(main.app, base_url="https://testserver") as client:
        yield client, maker
    engine.dispose()


def login(client, role):
    response = client.post("/api/v1/auth/login", headers={"Origin": ORIGIN},
                           json={"username": role, "password": f"private-{role}"})
    assert response.status_code == 200
    return response.json()["csrfToken"]


def post(client, path, body, csrf, key=None):
    return client.post(path, json=body, headers={
        "Origin": ORIGIN, "X-CSRF-Token": csrf,
        "Idempotency-Key": key or str(uuid4()),
    })


def test_snapshot_queue_same_analysis_and_auth(setup):
    client, _ = setup
    assert client.get(f"/api/v1/cases/{CASE}/snapshot?scenarioRunId={RUN}").status_code == 401
    csrf = login(client, "viewer")
    snapshot = client.get(f"/api/v1/cases/{CASE}/snapshot?scenarioRunId={RUN}")
    risks = client.get(f"/api/v1/risks?scenarioRunId={RUN}")
    assert snapshot.status_code == risks.status_code == 200
    assert snapshot.json()["data"]["analysis"]["analysisRunId"] == risks.json()["data"]["items"][0]["analysis"]["analysisRunId"]
    assert post(client, f"/api/v1/cases/{CASE}/decisions?scenarioRunId={RUN}", {
        "expectedRevision": 1, "reason": "Review", "evidenceIds": [],
        "targetState": "awaiting_evidence", "evidenceRevision": 1, "outcome": None,
    }, csrf).status_code == 403
    assert client.get(f"/api/v1/cases/{CASE}/snapshot?scenarioRunId=other-run").status_code == 404


def test_revision_idempotency_audit_and_persistence(setup):
    client, maker = setup
    csrf = login(client, "engineer")
    url = f"/api/v1/cases/{CASE}/decisions?scenarioRunId={RUN}"
    body = {"expectedRevision": 1, "reason": "Need evidence", "evidenceIds": [],
            "targetState": "awaiting_evidence", "evidenceRevision": 1, "outcome": None}
    same_key = str(uuid4())
    first = post(client, url, body, csrf, same_key)
    second = post(client, url, body, csrf, same_key)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert post(client, url, body, csrf).status_code == 409
    bad = {**body, "expectedRevision": 2, "targetState": "under_review"}
    assert post(client, url, bad, csrf).status_code == 422
    with maker() as session:
        count = session.scalar(select(func.count()).select_from(db.AuditRow))
        assert count == 1
    # A new client uses the same database, proving the decision was persisted.
    with TestClient(main.app, base_url="https://testserver") as restarted:
        login(restarted, "engineer")
        value = restarted.get(f"/api/v1/cases/{CASE}/snapshot?scenarioRunId={RUN}").json()
        assert value["data"]["case"]["state"] == "awaiting_evidence"


def test_evidence_and_plan_stale_review(setup):
    client, maker = setup
    csrf = login(client, "engineer")
    case_url = f"/api/v1/cases/{CASE}/decisions?scenarioRunId={RUN}"
    assert post(client, case_url, {"expectedRevision": 1, "reason": "Review",
            "evidenceIds": [], "targetState": "awaiting_evidence",
            "evidenceRevision": 1, "outcome": None}, csrf).status_code == 200
    steps = [{"stepId": "step-1", "number": 1, "actionCode": "VERIFY_TELEMETRY",
              "description": "Проверить источник", "assigneeRole": "technician",
              "assigneeId": None, "dueAt": None, "dueWithinHours": 24.0,
              "dueAnchor": "approved_at", "requiredEvidence": ["Протокол"],
              "condition": "approved_plan", "status": "not_started", "resultEvidenceIds": []}]
    created = post(client, f"/api/v1/work-plans?scenarioRunId={RUN}", {
        "caseId": CASE, "analysisRunId": ANALYSIS, "evidenceRevision": 1,
        "expectedCaseRevision": 2, "reason": "Prepare check", "steps": steps,
    }, csrf)
    assert created.status_code == 200, created.text
    plan_id = created.json()["data"]["planId"]
    listed = client.get(f"/api/v1/work-plans?scenarioRunId={RUN}&caseId={CASE}")
    assert listed.status_code == 200
    assert [x["planId"] for x in listed.json()["data"]["items"]] == [plan_id]
    submit = {"expectedRevision": 1, "reason": "Review plan", "evidenceIds": [],
              "analysisRunId": ANALYSIS, "evidenceRevision": 1}
    submit_path = f"/api/v1/work-plans/{plan_id}/submit?scenarioRunId={RUN}"
    submit_key = str(uuid4())
    first_submit = post(client, submit_path, submit, csrf, submit_key)
    second_submit = post(client, submit_path, submit, csrf, submit_key)
    assert first_submit.status_code == second_submit.status_code == 200
    assert first_submit.json() == second_submit.json()
    assert post(client, submit_path, submit, csrf).status_code == 409
    viewer_csrf = login(client, "viewer")
    decision = {**submit, "expectedRevision": 2, "action": "approved"}
    assert post(client, f"/api/v1/work-plans/{plan_id}/decisions?scenarioRunId={RUN}",
                decision, viewer_csrf).status_code == 403
    csrf = login(client, "engineer")
    evidence = post(client, f"/api/v1/evidence?scenarioRunId={RUN}", {
        "caseId": CASE, "expectedRevision": 1, "reason": "New finding",
        "observedAt": "2026-07-24T07:42:00Z", "kind": "note",
        "text": "Результат осмотра", "measurement": None, "origin": "synthetic",
    }, csrf)
    assert evidence.status_code == 200, evidence.text
    plan = client.get(f"/api/v1/work-plans/{plan_id}?scenarioRunId={RUN}").json()["data"]
    assert plan["staleReview"] is True
    csrf = login(client, "approver")
    assert post(client, f"/api/v1/work-plans/{plan_id}/decisions?scenarioRunId={RUN}",
                decision, csrf).status_code == 409
    with maker() as session:
        assert session.scalar(select(func.count()).select_from(db.ApprovalRow)) == 0


def test_origin_csrf_and_no_binary_upload(setup):
    client, _ = setup
    csrf = login(client, "engineer")
    body = {"caseId": CASE, "expectedRevision": 1, "reason": "Finding",
            "observedAt": "2026-07-24T07:42:00Z", "kind": "note",
            "text": "Info", "measurement": None, "origin": "synthetic"}
    path = f"/api/v1/evidence?scenarioRunId={RUN}"
    assert client.post(path, json=body, headers={"Idempotency-Key": str(uuid4()),
                                                   "X-CSRF-Token": csrf}).status_code == 403
    assert client.post(path, json=body, headers={"Origin": ORIGIN,
        "Idempotency-Key": str(uuid4()), "X-CSRF-Token": "wrong"}).status_code == 403
    assert post(client, path, {**body, "uri": "file:///etc/passwd"}, csrf).status_code == 422
    assert client.post(path, files={"file": ("x.svg", b"<svg/>", "image/svg+xml")},
                       headers={"Origin": ORIGIN, "X-CSRF-Token": csrf,
                                "Idempotency-Key": str(uuid4())}).status_code == 422


def test_confirmation_requires_explicit_grant_and_evidence(setup):
    client, maker = setup
    csrf = login(client, "engineer")
    path = f"/api/v1/cases/{CASE}/decisions?scenarioRunId={RUN}"
    assert post(client, path, {"expectedRevision": 1, "reason": "Review",
        "evidenceIds": [], "targetState": "awaiting_evidence",
        "evidenceRevision": 1, "outcome": None}, csrf).status_code == 200
    created = post(client, f"/api/v1/evidence?scenarioRunId={RUN}", {
        "caseId": CASE, "expectedRevision": 1, "reason": "Inspection",
        "observedAt": "2026-07-24T07:42:00Z", "kind": "note",
        "text": "Independent inspection", "measurement": None, "origin": "synthetic",
    }, csrf)
    assert created.status_code == 200
    evidence_id = created.json()["data"]["evidenceId"]
    decision = {"expectedRevision": 3, "reason": "Engineering finding",
                "evidenceIds": [evidence_id], "targetState": "confirmed",
                "evidenceRevision": 2, "outcome": None}
    approver_csrf = login(client, "approver")
    assert post(client, path, decision, approver_csrf).status_code == 403
    csrf = login(client, "engineer")
    assert post(client, path, {**decision, "evidenceIds": []}, csrf).status_code == 422
    confirmed = post(client, path, decision, csrf)
    assert confirmed.status_code == 200
    assert confirmed.json()["data"]["state"] == "confirmed"
    with maker() as session:
        assert session.scalar(select(func.count()).select_from(db.DefectRow)) == 1
    for revision, target in [(4, "remediation_planned"), (5, "verification")]:
        moved = post(client, path, {**decision, "expectedRevision": revision,
                                    "targetState": target}, csrf)
        assert moved.status_code == 200, moved.text
    approver_csrf = login(client, "approver")
    close = post(client, path, {**decision, "expectedRevision": 6,
                                "targetState": "closed", "outcome": "Checked"},
                 approver_csrf)
    assert close.status_code == 422
    assert close.json()["code"] == "VERIFICATION_REQUIRED"


def test_store_analysis_isolated_run_and_immutable_history(setup):
    client, maker = setup
    fixture = m.Envelope[m.CaseSnapshot].model_validate_json(
        (ROOT / "contracts/fixtures/reference-snapshot.json").read_text())
    separate = "reference-second-run"
    run = m.ScenarioSession(scenarioRunId=separate, datasetId="reference-slide29",
                            seed=1, mode="reference", virtualTime=fixture.dataTime,
                            replayReceivedAt=fixture.dataTime, speed=1, paused=True,
                            revision=1)
    analysis = fixture.data.analysis.model_dump(mode="json")
    analysis["scenarioRunId"] = separate
    analysis["analysisRunId"] = "second-analysis"
    details = fixture.data.details.model_dump(mode="json")
    details["analysisRunId"] = "second-analysis"
    bundle = m.AnalysisBundle(analysis=m.AnalysisResult.model_validate(analysis),
                              details=m.AnalysisDetails.model_validate(details))
    source = m.Source(sourceId="source-1", assetId=fixture.data.asset.assetId,
                      metric="contact_temperature", unit="degC", location="demo sensor",
                      channel="primary_a", frequencySeconds=300, maxAgeSeconds=900,
                      origin="synthetic")
    measurement = m.Measurement(schemaVersion="0.1.0", measurementId="measurement-1",
                                assetId=fixture.data.asset.assetId, sourceId=source.sourceId,
                                metric="contact_temperature", eventTime=fixture.dataTime,
                                receivedAt=fixture.dataTime, value=80.0, unit="degC",
                                quality="good", origin="synthetic", scenarioRunId=separate)
    with maker.begin() as session:
        p.create_run(session, run)
        case = p.store_analysis(session, separate, fixture.data.asset, bundle, [],
                                source_rows=[source], measurements=[measurement])
        assert case is not None
    with maker.begin() as session:
        assert p.store_analysis(session, separate, fixture.data.asset, bundle, [],
                                source_rows=[source], measurements=[measurement]) is None
    next_analysis = {**analysis, "analysisRunId": "third-analysis"}
    next_details = {**details, "analysisRunId": "third-analysis"}
    next_bundle = m.AnalysisBundle(analysis=m.AnalysisResult.model_validate(next_analysis),
                                   details=m.AnalysisDetails.model_validate(next_details))
    changed_measurement = m.Measurement.model_validate({**measurement.model_dump(mode="json"),
                                                        "value": 81.0})
    with pytest.raises(p.DomainError, match="неизменяемо"):
        with maker.begin() as session:
            p.store_analysis(session, separate, fixture.data.asset, next_bundle, [],
                             source_rows=[source], measurements=[changed_measurement])
    login(client, "viewer")
    first = client.get(f"/api/v1/risks?scenarioRunId={RUN}").json()["data"]["items"]
    second = client.get(f"/api/v1/risks?scenarioRunId={separate}").json()["data"]["items"]
    assert first[0]["analysis"]["analysisRunId"] == ANALYSIS
    assert second[0]["analysis"]["analysisRunId"] == "second-analysis"
    with maker() as session:
        assert session.scalar(select(func.count()).select_from(db.AnalysisRow)) == 2
        assert session.scalar(select(func.count()).select_from(db.MeasurementRow)) == 1
