"""Build the stand's recorded synthetic story in an isolated temporary database.

Only data/observations and config/diagnostic-policy.demo.json are read. The
business API is exercised over loopback with temporary demo users and the real
worker, including roles, CSRF, revisions and audit. The application's running
database, environment file, and data/truth are never used.
"""

from __future__ import annotations

import argparse
import hashlib
import http.cookiejar
import json
import os
import secrets
import socket
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
import uvicorn  # noqa: E402

from apps.api import db, main  # noqa: E402
from apps.worker.replay import END, SEED, START, tick  # noqa: E402
from packages.domain_contracts import models as m  # noqa: E402

ASSET = "tp177-t1"
ORIGIN = "http://127.0.0.1:8080"
SCENES = [
    ("overview", "Девять активов", "Синтетические наблюдения объединены в локальную очередь внимания.", 15, "early"),
    ("normal", "Обычный режим", "Нагрузка меняется, а модель показывает ожидаемое поведение.", 20, "early"),
    ("deviation", "Отклонение растет", "Сравниваем измеренную температуру с ожидаемой при той же нагрузке.", 30, "late"),
    ("hypothesis", "Гипотеза требует проверки", "Индекс помогает выбрать следующий шаг; это не вероятность отказа.", 25, "late"),
    ("evidence", "Проверка материалов", "Учебные записи добавлены отдельно; реальных измерений и термограммы нет.", 20, "late"),
    ("plan", "Проект плана", "Инженер готовит шаги проверки и передает проект на согласование.", 25, "late"),
    ("approval", "Согласование и результат", "Согласующий и исполнитель выполняют отдельные действия в учебном процессе.", 25, "late"),
    ("history", "Решение и история", "Автор, основания и ревизии сохраняются. Реальные работы не выполнялись.", 20, "late"),
]


class LocalClient:
    def __init__(self, base: str):
        self.base = base
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self.csrf = ""

    def request(self, method: str, path: str, body: dict | None = None, expected: int = 200):
        headers = {"Origin": ORIGIN}
        payload = None
        if body is not None:
            payload = json.dumps(body, ensure_ascii=False).encode()
            headers.update({"Content-Type": "application/json", "X-CSRF-Token": self.csrf,
                            "Idempotency-Key": str(uuid4())})
        request = urllib.request.Request(self.base + path, data=payload, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            value = json.load(response)
            if response.status != expected:
                raise RuntimeError(f"{method} {path.split('?')[0]}: HTTP {response.status}, expected {expected}")
            return value

    def login(self, role: str, password: str):
        result = self.request("POST", "/api/v1/auth/login", {"username": role, "password": password})
        self.csrf = result["csrfToken"]


def snapshot(client: LocalClient, run: str, case: str) -> dict:
    return client.request("GET", f"/api/v1/cases/{case}/snapshot?scenarioRunId={run}")["data"]


def create_slice(client: LocalClient, factory, virtual_time):
    body = {"datasetId": "synthetic-energy-30d", "seed": SEED, "mode": "simulation",
            "virtualTime": virtual_time.isoformat(), "reason": "Подготовка учебной записи стенда"}
    run = client.request("POST", "/api/v1/demo/sessions", body)["scenarioRunId"]
    if not tick(factory):
        raise RuntimeError("Worker did not process the requested synthetic run")
    state = client.request("GET", f"/api/v1/demo/sessions/{run}")["data"]
    if state["processingStatus"] != "ready":
        raise RuntimeError("Synthetic calculation did not become ready")
    risks = client.request("GET", f"/api/v1/risks?scenarioRunId={run}&includeNormal=true&limit=1000")["data"]["items"]
    chosen = next(item for item in risks if item["asset"]["assetId"] == ASSET)
    with factory() as session:
        row = session.scalar(select(db.AnalysisRow).where(db.AnalysisRow.run_id == run,
                             db.AnalysisRow.asset_id == ASSET))
        # The API intentionally exposes a series only when a case exists. The
        # normal early slice has no case, so read the worker's persisted series.
        points = [m.SeriesPoint.model_validate(value).model_dump(mode="json") for value in row.series]
    return {"virtualTime": state["virtualTime"], "risks": risks, "series": points}, run, chosen


def make_story(clients: dict[str, LocalClient], run: str, case: str):
    query = f"?scenarioRunId={run}"
    engineer = clients["engineer"]
    initial = snapshot(engineer, run, case)
    case_path = f"/api/v1/cases/{case}/decisions{query}"

    def case_decision(target, role="engineer", evidence_ids=None):
        current = snapshot(engineer, run, case)
        body = {"expectedRevision": current["case"]["revision"],
                "evidenceRevision": current["case"]["evidenceRevision"],
                "reason": "Учебное решение для записи стенда; реальных работ нет.",
                "evidenceIds": evidence_ids or [], "targetState": target,
                "outcome": "Учебный результат проверен" if target == "closed" else None}
        return clients[role].request("POST", case_path, body)["data"]

    def evidence(role, text):
        current = snapshot(engineer, run, case)
        body = {"caseId": case, "expectedRevision": current["case"]["evidenceRevision"],
                "reason": "Учебная синтетическая запись для стенда",
                "observedAt": current["analysis"]["asOf"], "kind": "note", "text": text,
                "measurement": None, "origin": "synthetic"}
        return clients[role].request("POST", "/api/v1/evidence" + query, body)["data"]["evidenceId"]

    case_decision("under_review")
    case_decision("awaiting_evidence")
    first = evidence("engineer", "Учебный протокол: по условию сценария независимая проверка "
                     "подтвердила дополнительный нагрев. Это синтетические данные, не реальные измерения.")
    case_decision("confirmed", evidence_ids=[first])
    current = snapshot(engineer, run, case)
    draft_body = {"caseId": case, "analysisRunId": current["analysis"]["analysisRunId"],
                  "evidenceRevision": current["case"]["evidenceRevision"],
                  "expectedCaseRevision": current["case"]["revision"],
                  "reason": "Учебный проект проверки для стенда", "steps": [{
                      "stepId": "stand-check-1", "number": 1, "actionCode": "VERIFY_AFTER_ACTION",
                      "description": "Сопоставить синтетические показания и условия измерения",
                      "assigneeRole": "technician", "assigneeId": "technician", "dueAt": None,
                      "dueWithinHours": 48, "dueAnchor": "approved_at",
                      "requiredEvidence": ["Учебный протокол проверки"],
                      "condition": "defect_confirmed", "status": "not_started", "resultEvidenceIds": []}]}
    draft = engineer.request("POST", "/api/v1/work-plans" + query, draft_body)["data"]
    plan_path = f'/api/v1/work-plans/{draft["planId"]}'
    plan = draft

    def plan_decision(target, role, expected=200):
        nonlocal plan
        body = {"expectedRevision": plan["revision"], "analysisRunId": plan["analysisRunId"],
                "evidenceRevision": plan["evidenceRevision"],
                "reason": "Учебное решение для записи стенда; реальных работ нет.",
                "evidenceIds": [first]}
        path = plan_path + ("/submit" if target == "submitted" else "/decisions") + query
        if target != "submitted":
            body["action"] = target
        result = clients[role].request("POST", path, body, expected)
        if expected == 200:
            plan = result["data"]
        return result

    submitted = plan_decision("submitted", "engineer")["data"]
    plan_decision("approved", "viewer", expected=403)
    approved = plan_decision("approved", "approver")["data"]
    case_decision("remediation_planned", evidence_ids=[first])
    plan_decision("in_progress", "technician")
    result_id = evidence("technician", "Учебный результат: описание проверки подготовлено; "
                         "фактических измерений и работ не проводилось.")
    result_body = {"stepId": "stand-check-1", "expectedRevision": plan["revision"],
                   "reason": "Учебная запись результата", "observedAt": initial["analysis"]["asOf"],
                   "conclusion": "Учебный результат требует отдельной проверки согласующим.",
                   "evidenceIds": [result_id]}
    plan = clients["technician"].request("POST", plan_path + "/step-results" + query, result_body)["data"]
    plan_decision("awaiting_verification", "technician")
    completed = plan_decision("completed", "approver")["data"]
    case_decision("verification", evidence_ids=[result_id])
    case_decision("closed", "approver", evidence_ids=[result_id])
    final = snapshot(engineer, run, case)
    audit = engineer.request("GET", f"/api/v1/cases/{case}/history{query}&limit=1000")["data"]["items"]
    return initial, {"evidence": final["evidence"], "draft": draft, "submitted": submitted,
                     "approved": approved, "completed": completed, "audit": audit}


def prepare() -> dict:
    observations = ROOT / "data" / "observations"
    if not observations.is_dir():
        raise RuntimeError("Synthetic observations directory is missing")
    os.chdir(ROOT)
    # All credentials are generated in process and exist only until exit.
    passwords = {role.value: secrets.token_urlsafe(24) for role in m.Role}
    for role, password in passwords.items():
        os.environ[f"DEMO_{role.upper()}_PASSWORD"] = password
    os.environ.update({"DEMO_ENGINEER_CASE_CONFIRM": "true", "API_ALLOWED_ORIGINS": ORIGIN,
                       "OBSERVATIONS_DIR": str(observations),
                       "DIAGNOSTIC_POLICY_PATH": str(ROOT / "config" / "diagnostic-policy.demo.json")})
    os.environ.pop("API_REFERENCE_FIXTURE_PATH", None)

    with tempfile.TemporaryDirectory(prefix="stand-package-") as temp:
        engine = create_engine(f"sqlite:///{Path(temp) / 'stand.sqlite'}",
                               connect_args={"check_same_thread": False})
        maker = sessionmaker(engine, expire_on_commit=False)
        main.factory = lambda: maker
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", 0))
        sock.listen(32)
        port = sock.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=port,
                                               log_level="error", lifespan="on"))
        thread = threading.Thread(target=lambda: server.run(sockets=[sock]), daemon=True)
        thread.start()
        try:
            for _ in range(200):
                if server.started:
                    break
                if not thread.is_alive():
                    raise RuntimeError("Local temporary API stopped during startup")
                time.sleep(0.05)
            if not server.started:
                raise RuntimeError("Local temporary API did not start")
            clients = {role: LocalClient(f"http://127.0.0.1:{port}") for role in passwords}
            for role, client in clients.items():
                client.login(role, passwords[role])
            early, _, _ = create_slice(clients["engineer"], maker, START + timedelta(days=7))
            late, run, target = create_slice(clients["engineer"], maker, END)
            if not target["caseId"]:
                raise RuntimeError("No diagnostic case for the selected synthetic asset")
            late["snapshot"], story = make_story(clients, run, target["caseId"])
            policy = m.DiagnosticPolicy.model_validate_json(
                (ROOT / "config" / "diagnostic-policy.demo.json").read_text(encoding="utf-8"))
            hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                      for path in sorted(observations.iterdir()) if path.is_file()}
            return {"version": 1,
                    "provenance": {"datasetId": "synthetic-energy-30d", "seed": SEED,
                                   "modelVersion": target["analysis"]["modelVersion"],
                                   "policyVersion": policy.version, "observationHashes": hashes},
                    "slices": {"early": early, "late": late}, "story": story,
                    "scenes": [{"id": sid, "kind": sid, "title": title, "description": description,
                                "durationSeconds": duration, "slice": which, "assetId": ASSET}
                               for sid, title, description, duration, which in SCENES]}
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            sock.close()
            engine.dispose()


def main_cli():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "apps/web/public/stand-data.json")
    args = parser.parse_args()
    package = prepare()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(package['scenes'])} scenes / {sum(x['durationSeconds'] for x in package['scenes'])} s: {args.out}")


if __name__ == "__main__":
    main_cli()
