"""Authenticated local smoke. Credentials stay in memory and are never printed."""
import json
import time
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
values = dict(line.split("=", 1) for line in (ROOT / "infra/.env").read_text().splitlines()
              if "=" in line and not line.startswith("#"))
base = "http://127.0.0.1:8080"
results = {}
with httpx.Client(base_url=base, headers={"Origin": base}, timeout=30) as client:
    health = client.get("/api/v1/health")
    health.raise_for_status()
    assert health.json()["businessRuntime"] == "ready", health.json()
    response = client.post("/api/v1/auth/login", json={"username": "engineer", "password": values["DEMO_ENGINEER_PASSWORD"]})
    response.raise_for_status()
    csrf = response.json()["csrfToken"]
    for mode, dataset, clock in [("reference", "reference-slide29", "2026-07-24T07:42:00Z"),
                                  ("simulation", "synthetic-energy-30d", "2026-07-24T07:40:00Z")]:
        started = time.monotonic()
        body = {"datasetId": dataset, "seed": 20260925 if mode == "simulation" else 0,
                "mode": mode, "virtualTime": clock, "reason": "Локальная интеграционная проверка"}
        headers = {"X-CSRF-Token": csrf, "Idempotency-Key": str(uuid4())}
        response = client.post("/api/v1/demo/sessions", json=body, headers=headers)
        response.raise_for_status()
        run = response.json()["scenarioRunId"]
        duplicate = client.post("/api/v1/demo/sessions", json=body, headers=headers)
        assert duplicate.json() == response.json()
        for _ in range(120):
            status = client.get(f"/api/v1/demo/sessions/{run}").json()["data"]
            if status["processingStatus"] in {"ready", "failed"}:
                break
            time.sleep(0.5)
        assert status["processingStatus"] == "ready", status
        risk_response = client.get("/api/v1/risks", params={"scenarioRunId":run, "includeNormal":True})
        risk_response.raise_for_status()
        rows = risk_response.json()["data"]["items"]
        assert len(rows) == (9 if mode == "simulation" else 1), len(rows)
        assert all(x["analysis"]["metrics"]["failureProbability"] is None for x in rows)
        for row in rows:
            if row["caseId"]:
                snap = client.get(f'/api/v1/cases/{row["caseId"]}/snapshot', params={"scenarioRunId":run})
                snap.raise_for_status()
                assert snap.json()["data"]["analysis"] == row["analysis"]
        models = client.get("/api/v1/models", params={"scenarioRunId":run})
        models.raise_for_status()
        results[mode] = {"run":run, "seconds":round(time.monotonic()-started, 2),
                         "assets":len(rows), "cases":sum(bool(x["caseId"]) for x in rows),
                         "priorities":{x["asset"]["assetId"]:x["analysis"]["risk"]["priority"] for x in rows}}
print(json.dumps(results, ensure_ascii=False, indent=2))
(ROOT / "verification/live-replay-smoke.json").write_text(json.dumps(results, ensure_ascii=False, indent=2)+"\n")
