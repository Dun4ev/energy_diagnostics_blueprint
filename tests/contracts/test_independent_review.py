"""Independent G1 checks. Regression checks for defects found before contract freeze."""

import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from apps.api.main import app
from packages.domain_contracts import models as m

ROOT = Path(__file__).resolve().parents[2]


def fixture(path):
    return json.loads((ROOT / path).read_text())


@pytest.mark.parametrize(
    "model,fixture_path,schema_path,field,value",
    [
        (
            m.Measurement,
            "data/observations/normalized_measurement_examples.json",
            "contracts/measurement.schema.json",
            "value",
            True,
        ),
        (
            m.Measurement,
            "data/observations/normalized_measurement_examples.json",
            "contracts/measurement.schema.json",
            "value",
            "80",
        ),
        (
            m.AnalysisResult,
            "contracts/examples/reference-analysis.json",
            "contracts/analysis.schema.json",
            "risk.score",
            True,
        ),
        (
            m.AnalysisResult,
            "contracts/examples/reference-analysis.json",
            "contracts/analysis.schema.json",
            "risk.score",
            "7.2",
        ),
        (
            m.AnalysisResult,
            "contracts/examples/reference-analysis.json",
            "contracts/analysis.schema.json",
            "quality.freshSources",
            True,
        ),
    ],
)
def test_json_number_semantics_match_export(model, fixture_path, schema_path, field, value):
    data = fixture(fixture_path)
    if isinstance(data, list):
        data = data[0]
    data = copy.deepcopy(data)
    target = data
    parts = field.split(".")
    for part in parts[:-1]:
        target = target[part]
    target[parts[-1]] = value
    schema = fixture(schema_path)
    assert not Draft202012Validator(schema).is_valid(data)
    with pytest.raises(ValidationError):
        model.model_validate(data)


@pytest.mark.parametrize("field,value", [("mode", "simulation"), ("scenarioRunId", "other-run")])
def test_snapshot_envelope_cannot_mislabel_analysis(field, value):
    data = fixture("contracts/fixtures/reference-snapshot.json")
    data[field] = value
    with pytest.raises(ValidationError):
        m.Envelope[m.CaseSnapshot].model_validate(data)


def test_snapshot_data_time_equals_current_analysis_time():
    data = fixture("contracts/fixtures/reference-snapshot.json")
    data["dataTime"] = "2026-07-23T07:42:00Z"
    with pytest.raises(ValidationError):
        m.Envelope[m.CaseSnapshot].model_validate(data)


def test_session_data_time_equals_virtual_time():
    data = fixture("contracts/fixtures/reference-snapshot.json")
    data["data"] = {
        "scenarioRunId": data["scenarioRunId"],
        "datasetId": "demo",
        "seed": 1,
        "mode": "reference",
        "virtualTime": data["dataTime"],
        "replayReceivedAt": data["dataTime"],
        "speed": 1,
        "paused": True,
        "revision": 1,
    }
    data["dataTime"] = "2026-07-23T07:42:00Z"
    with pytest.raises(ValidationError):
        m.Envelope[m.ScenarioSession].model_validate(data)


def test_evidence_measurement_provenance_matches_parent():
    snapshot = fixture("contracts/fixtures/reference-snapshot.json")
    measurement = fixture("data/observations/normalized_measurement_examples.json")[0]
    evidence = {
        "evidenceId": "foreign-observation",
        "scenarioRunId": snapshot["scenarioRunId"],
        "assetId": snapshot["data"]["asset"]["assetId"],
        "revision": 1,
        "origin": "synthetic",
        "authorId": "reviewer",
        "observedAt": snapshot["dataTime"],
        "receivedAt": snapshot["dataTime"],
        "kind": "measurement",
        "verification": "unverified",
        "text": "Observation",
        "measurement": {**measurement, "assetId": "foreign-asset", "scenarioRunId": "foreign-run"},
        "uri": None,
        "sha256": None,
        "hasImage": False,
    }
    snapshot["data"]["evidence"].append(evidence)
    with pytest.raises(ValidationError):
        m.Envelope[m.CaseSnapshot].model_validate(snapshot)


def test_measurement_event_cannot_follow_receipt():
    data = fixture("data/observations/normalized_measurement_examples.json")[0]
    data["receivedAt"] = "2020-01-01T00:00:00Z"
    with pytest.raises(ValidationError):
        m.Measurement.model_validate(data)


def test_served_openapi_matches_frozen_export_and_marks_implementation():
    exported = fixture("contracts/openapi.json")
    with TestClient(app) as client:
        served = client.get("/openapi.json")
        assert served.status_code == 200
        assert served.json() == exported
    for path, operations in exported["paths"].items():
        for operation in operations.values():
            if isinstance(operation, dict):
                assert operation["x-implementation-status"] == "implemented"
