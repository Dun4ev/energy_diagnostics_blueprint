"""Independent direct-HTTP regressions for consequential work-plan steps."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from apps.api import db, main
from packages.domain_contracts import models as m

ROOT = Path(__file__).resolve().parents[2]
RUN = "reference-slide29"
CASE = "AG-2026-017"
ANALYSIS = "reference-ag-2026-017-r1"
ORIGIN = "http://localhost:8080"
VIRTUAL_TIME = "2026-07-24T07:42:00Z"


@pytest.fixture
def api(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'workflow.db'}")
    maker = sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(main, "factory", lambda: maker)
    monkeypatch.setenv(
        "API_REFERENCE_FIXTURE_PATH", str(ROOT / "contracts/fixtures/reference-snapshot.json")
    )
    monkeypatch.setenv("DEMO_ENGINEER_CASE_CONFIRM", "true")
    for role in m.Role:
        monkeypatch.setenv(f"DEMO_{role.value.upper()}_PASSWORD", f"private-{role.value}")
    with TestClient(main.app, base_url="https://testserver") as client:
        yield client, maker
    engine.dispose()


def login(client, role: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        headers={"Origin": ORIGIN},
        json={"username": role, "password": f"private-{role}"},
    )
    assert response.status_code == 200, response.text
    return response.json()["csrfToken"]


def post(client, path: str, body: dict, csrf: str):
    return client.post(
        path,
        json=body,
        headers={
            "Origin": ORIGIN,
            "X-CSRF-Token": csrf,
            "Idempotency-Key": str(uuid4()),
        },
    )


def prepare_plan(client, condition: str) -> tuple[str, str]:
    engineer = login(client, "engineer")
    evidence = post(
        client,
        f"/api/v1/evidence?scenarioRunId={RUN}",
        {
            "caseId": CASE,
            "expectedRevision": 1,
            "reason": "Record inspection evidence",
            "observedAt": VIRTUAL_TIME,
            "kind": "note",
            "text": "Independent synthetic inspection",
            "measurement": None,
            "origin": "synthetic",
        },
        engineer,
    )
    assert evidence.status_code == 200, evidence.text
    evidence_id = evidence.json()["data"]["evidenceId"]

    step = {
        "stepId": "conditioned-step",
        "number": 1,
        "actionCode": "VERIFY_TELEMETRY",
        "description": "Проверить результат по evidence",
        "assigneeRole": "technician",
        "assigneeId": None,
        "dueAt": None,
        "dueWithinHours": 24.0,
        "dueAnchor": "approved_at",
        "requiredEvidence": ["Протокол проверки"],
        "condition": condition,
        "status": "not_started",
        "resultEvidenceIds": [],
    }
    created = post(
        client,
        f"/api/v1/work-plans?scenarioRunId={RUN}",
        {
            "caseId": CASE,
            "analysisRunId": ANALYSIS,
            "evidenceRevision": 2,
            "expectedCaseRevision": 2,
            "reason": "Create a controlled verification step",
            "steps": [step],
        },
        engineer,
    )
    assert created.status_code == 200, created.text
    plan_id = created.json()["data"]["planId"]
    plan_url = f"/api/v1/work-plans/{plan_id}"
    submit_body = {
        "expectedRevision": 1,
        "reason": "Submit verification step",
        "evidenceIds": [evidence_id],
        "analysisRunId": ANALYSIS,
        "evidenceRevision": 2,
    }
    submitted = post(client, f"{plan_url}/submit?scenarioRunId={RUN}", submit_body, engineer)
    assert submitted.status_code == 200, submitted.text

    approver = login(client, "approver")
    approved_body = {**submit_body, "expectedRevision": 2, "action": "approved"}
    approved = post(client, f"{plan_url}/decisions?scenarioRunId={RUN}", approved_body, approver)
    assert approved.status_code == 200, approved.text

    technician = login(client, "technician")
    progress_body = {**submit_body, "expectedRevision": 3, "action": "in_progress"}
    progress = post(client, f"{plan_url}/decisions?scenarioRunId={RUN}", progress_body, technician)
    assert progress.status_code == 200, progress.text
    return plan_id, evidence_id


def test_defect_condition_cannot_record_before_case_confirmation(api):
    client, _ = api
    plan_id, evidence_id = prepare_plan(client, "defect_confirmed")
    technician = login(client, "technician")
    result = post(
        client,
        f"/api/v1/work-plans/{plan_id}/step-results?scenarioRunId={RUN}",
        {
            "expectedRevision": 4,
            "reason": "Attempt conditioned field action before confirmation",
            "evidenceIds": [evidence_id],
            "stepId": "conditioned-step",
            "observedAt": VIRTUAL_TIME,
            "conclusion": "Technician performed the conditioned action",
        },
        technician,
    )
    assert result.status_code == 422, result.text
    assert result.json()["code"] == "DEFECT_CONFIRMATION_REQUIRED"


def test_step_result_retains_observed_time_and_conclusion(api):
    client, maker = api
    plan_id, evidence_id = prepare_plan(client, "approved_plan")
    technician = login(client, "technician")
    base = {
        "expectedRevision": 4,
        "reason": "Record verified observation",
        "evidenceIds": [evidence_id],
        "stepId": "conditioned-step",
        "conclusion": "Independent measurement remained below the stated check limit.",
    }
    future = post(
        client,
        f"/api/v1/work-plans/{plan_id}/step-results?scenarioRunId={RUN}",
        {**base, "observedAt": "2026-07-24T07:43:00Z"},
        technician,
    )
    assert future.status_code == 422
    assert future.json()["code"] == "TIME_MISMATCH"

    result = post(
        client,
        f"/api/v1/work-plans/{plan_id}/step-results?scenarioRunId={RUN}",
        {**base, "observedAt": VIRTUAL_TIME},
        technician,
    )
    assert result.status_code == 200, result.text
    record = result.json()["data"]["steps"][0]["result"]
    assert record["actorId"]
    assert record["observedAt"] == VIRTUAL_TIME
    assert record["recordedAt"]
    assert record["conclusion"] == base["conclusion"]
    assert record["evidenceIds"] == [evidence_id]
    with maker() as session:
        row = session.scalar(select(db.PlanRow).where(db.PlanRow.id == plan_id))
        persisted_result = row.body["steps"][0]["result"]
        serialized = json.dumps(row.body, ensure_ascii=False)
    assert persisted_result == record
    assert VIRTUAL_TIME in serialized
