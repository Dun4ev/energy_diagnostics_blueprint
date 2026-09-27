import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import ValidationError

from apps.api.main import app
from packages.domain_contracts import models as m
from packages.domain_contracts.export import artifacts
from packages.domain_contracts.workflow import CASE_TRANSITIONS, PLAN_TRANSITIONS, ROLE_PERMISSIONS

ROOT = Path(__file__).resolve().parents[2]


def read(name):
    return json.loads((ROOT / name).read_text())


def reference():
    return read("contracts/examples/reference-analysis.json")


def test_reference_and_measurements_round_trip():
    ref = reference()
    assert m.AnalysisResult.model_validate(ref).model_dump(mode="json") == ref
    for item in read("data/observations/normalized_measurement_examples.json"):
        assert m.Measurement.model_validate(item).model_dump(mode="json") == item
    m.DiagnosticPolicy.model_validate(read("config/diagnostic-policy.demo.json"))


@pytest.mark.parametrize("field,value", [("failureProbability", 0.72), ("residualC", 11)])
def test_reject_wrong_numeric_semantics(field, value):
    data = reference()
    data["metrics"][field] = value
    with pytest.raises(ValidationError):
        m.AnalysisResult.model_validate(data)


@pytest.mark.parametrize(
    "mode,origin,model,policy",
    [
        ("simulation", "presentation_illustration", "demo", "demo"),
        ("simulation", "computed", None, "demo"),
        ("simulation", "computed", "demo", None),
        ("reference", "computed", None, None),
    ],
)
def test_modes_cannot_masquerade(mode, origin, model, policy):
    data = reference()
    data.update(mode=mode, calculationOrigin=origin, modelVersion=model, policyVersion=policy)
    with pytest.raises(ValidationError):
        m.AnalysisResult.model_validate(data)


def test_unknown_not_safe_zero():
    data = reference()
    data["quality"]["overall"] = "insufficient"
    data["status"] = "insufficient_data"
    with pytest.raises(ValidationError):
        m.AnalysisResult.model_validate(data)
    data["risk"].update(score=None, priority="unknown")
    assert m.AnalysisResult.model_validate(data).risk.score is None
    data["risk"]["score"] = 0
    with pytest.raises(ValidationError):
        m.AnalysisResult.model_validate(data)


def test_measurement_unit_missing_timezone_and_unknown_fields():
    base = read("data/observations/normalized_measurement_examples.json")[0]
    for patch in [
        {"unit": "ms"},
        {"quality": "missing"},
        {"value": None},
        {"eventTime": "2026-01-01T00:00:00"},
        {"truth": 1},
    ]:
        with pytest.raises(ValidationError):
            m.Measurement.model_validate({**base, **patch})
    assert m.Measurement.model_validate({**base, "value": None, "quality": "missing"}).value is None


def test_export_drift_and_json_schema():
    for path, expected in artifacts().items():
        assert read(path) == expected, path
    for name in ["measurement", "analysis"]:
        Draft202012Validator.check_schema(read(f"contracts/{name}.schema.json"))
    for item in read("contracts/fixtures/wire-corpus.json"):
        schema = read(f"contracts/{item['schema']}.schema.json")
        valid = Draft202012Validator(schema, format_checker=FormatChecker()).is_valid(item["value"])
        model = m.Measurement if item["schema"] == "measurement" else m.AnalysisResult
        try:
            model.model_validate(item["value"])
            python_valid = True
        except ValidationError:
            python_valid = False
        assert valid == item["valid"] == python_valid, item["name"]


def test_reference_snapshot():
    fixture = read("contracts/fixtures/reference-snapshot.json")
    snapshot = m.Envelope[m.CaseSnapshot].model_validate(fixture)
    assert snapshot.data.analysis.risk.score == 7.2
    wrong = copy.deepcopy(fixture)
    wrong["data"]["case"]["analysisRunId"] = "another-analysis"
    with pytest.raises(ValidationError):
        m.Envelope[m.CaseSnapshot].model_validate(wrong)


def test_transition_maps_are_complete_and_no_implicit_confirm():
    assert set(CASE_TRANSITIONS) == set(m.CaseState)
    assert set(PLAN_TRANSITIONS) == set(m.PlanState)
    assert CASE_TRANSITIONS[m.CaseState.CLOSED] == set()
    assert m.CaseState.CONFIRMED not in CASE_TRANSITIONS[m.CaseState.DETECTED]
    assert m.PlanState.APPROVED not in PLAN_TRANSITIONS[m.PlanState.DRAFT]
    assert all(m.Permission.CASE_CONFIRM not in grants for grants in ROLE_PERMISSIONS.values())
    assert m.Permission.PLAN_APPROVE not in ROLE_PERMISSIONS[m.Role.ADMIN]
    assert ROLE_PERMISSIONS[m.Role.VIEWER] == {m.Permission.READ}


def test_api_unconfigured_health_and_safe_validation(monkeypatch):
    monkeypatch.delenv("DB_HOST", raising=False)
    with TestClient(app, headers={"Origin": "http://localhost:8080"}) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 503
        assert response.json()["businessRuntime"] == "degraded"
        response = client.post(
            "/api/v1/auth/login", json={"username": "x", "password": "private", "role": "approver"}
        )
        assert response.status_code == 422
        assert "private" not in response.text
        response = client.post(
            "/api/v1/work-plans/p/submit?scenarioRunId=x",
            json={
                "expectedRevision": 1,
                "reason": "review",
                "evidenceIds": [],
                "analysisRunId": "a",
                "evidenceRevision": 1,
            },
        )
        assert response.status_code == 422  # Required idempotency and CSRF headers.


def test_no_operational_routes_or_runtime_truth():
    paths = artifacts()["contracts/openapi.json"]["paths"]
    assert len(paths) >= 23
    assert not any(
        word in path.lower()
        for path in paths
        for word in ["setpoint", "/trip", "/switch", "/control"]
    )
    for folder in ["apps/api", "apps/worker", "packages/domain_contracts"]:
        for path in (ROOT / folder).glob("*.py"):
            assert 'open("data/truth' not in path.read_text()


def test_disabled_advisor():
    from packages.domain_contracts.ports import DisabledDecisionAdvisor

    advisor = DisabledDecisionAdvisor()
    assert advisor.enabled is False
    assert advisor.suggest(m.AnalysisResult.model_validate(reference())) == []
