"""Restart only this prototype's API/worker, verify stored snapshots and login survive."""
import json
import subprocess
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
credentials = dict(line.split("=",1) for line in (ROOT/"infra/.env").read_text().splitlines()
                   if "=" in line and not line.startswith("#"))
run = json.loads((ROOT/"verification/live-replay-smoke.json").read_text())["simulation"]["run"]
base = "http://127.0.0.1:8080"
with httpx.Client(base_url=base, headers={"Origin":base}, timeout=15) as client:
    response = client.post("/api/v1/auth/login", json={"username":"engineer", "password":credentials["DEMO_ENGINEER_PASSWORD"]})
    response.raise_for_status()
    query={"scenarioRunId":run,"includeNormal":True}
    before=client.get("/api/v1/risks",params=query).json()["data"]
    subprocess.run(["docker","compose","--env-file","infra/.env","-p","energy-diagnostics","-f","infra/compose.yaml","restart","api","worker"],cwd=ROOT,check=True,capture_output=True)
    for _ in range(60):
        try:
            health=client.get("/api/v1/health")
            if health.status_code==200 and health.json()["businessRuntime"]=="ready":
                break
        except (httpx.HTTPError,ValueError):
            pass
        time.sleep(.5)
    after=client.get("/api/v1/risks",params=query)
    after.raise_for_status()
    assert after.json()["data"]==before
    assert client.get("/api/v1/auth/me").status_code==200
result={"run":run,"assets":len(before["items"]),"sameSnapshots":True,"serverSessionSurvivesRestart":True}
(ROOT/"verification/restart-check.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result))
