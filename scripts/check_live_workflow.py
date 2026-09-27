"""Exercise human gates with separate authenticated demo clients, local synthetic data."""
import json
import time
from pathlib import Path
from uuid import uuid4

import httpx

ROOT=Path(__file__).resolve().parents[1]
secret=dict(line.split("=",1) for line in (ROOT/"infra/.env").read_text().splitlines()
            if "=" in line and not line.startswith("#"))
BASE="http://127.0.0.1:8080"
clients={}
for role in ["engineer","approver","technician","viewer"]:
    client=httpx.Client(base_url=BASE,headers={"Origin":BASE},timeout=30)
    response=client.post("/api/v1/auth/login",json={"username":role,"password":secret[f"DEMO_{role.upper()}_PASSWORD"]})
    response.raise_for_status()
    client.headers["X-CSRF-Token"]=response.json()["csrfToken"]
    clients[role]=client

def post(role,path,body,expected=200,key=None):
    response=clients[role].post(path,json=body,headers={"Idempotency-Key":key or str(uuid4())})
    assert response.status_code==expected,(path,response.status_code,response.text)
    return response.json()

run=post("engineer","/api/v1/demo/sessions",{"datasetId":"synthetic-energy-30d","seed":20260925,
         "mode":"simulation","virtualTime":"2026-07-24T07:40:00Z","reason":"Проверка полного workflow"})["scenarioRunId"]
for _ in range(120):
    value=clients["engineer"].get(f"/api/v1/demo/sessions/{run}").json()["data"]
    if value["processingStatus"] in {"ready","failed"}:
        break
    time.sleep(.5)
assert value["processingStatus"]=="ready"
q=f"?scenarioRunId={run}"
rows=clients["engineer"].get("/api/v1/risks"+q).json()["data"]["items"]
case_id=next(row["caseId"] for row in rows if row["asset"]["assetId"]=="tp177-t1")
def snapshot():
    return clients["engineer"].get(f"/api/v1/cases/{case_id}/snapshot"+q).json()["data"]
def evidence(role,text):
    snap=snapshot()
    return post(role,"/api/v1/evidence"+q,{"caseId":case_id,"expectedRevision":snap["case"]["evidenceRevision"],
                "reason":"Синтетическая проверка", "observedAt":snap["analysis"]["asOf"],"kind":"note",
                "text":text,"measurement":None,"origin":"synthetic"})["data"]["evidenceId"]
def case_decision(target,role="engineer",ids=None):
    snap=snapshot()
    return post(role,f"/api/v1/cases/{case_id}/decisions"+q,{"expectedRevision":snap["case"]["revision"],
                "evidenceRevision":snap["case"]["evidenceRevision"],"reason":"Решение в учебном сценарии",
                "evidenceIds":ids or [],"targetState":target,"outcome":"Синтетическая проверка выполнена" if target=="closed" else None})
case_decision("under_review")
case_decision("awaiting_evidence")
initial=evidence("engineer","Синтетический протокол: независимое измерение подтверждает дополнительный нагрев. Не данные реального объекта.")
case_decision("confirmed",ids=[initial])
snap=snapshot()
plan=post("engineer","/api/v1/work-plans"+q,{"caseId":case_id,"analysisRunId":snap["analysis"]["analysisRunId"],
          "evidenceRevision":snap["case"]["evidenceRevision"],"expectedCaseRevision":snap["case"]["revision"],
          "reason":"Учебный план проверки","steps":[{"stepId":"check-1","number":1,"actionCode":"VERIFY_AFTER_ACTION",
          "description":"Повторная независимая проверка синтетического результата","assigneeRole":"technician",
          "assigneeId":"technician","dueAt":None,"dueWithinHours":48,"dueAnchor":"approved_at",
          "requiredEvidence":["Протокол проверки"],"condition":"defect_confirmed","status":"not_started","resultEvidenceIds":[]} ]})["data"]
path=f'/api/v1/work-plans/{plan["planId"]}'
def plan_decision(target,role,expected=200):
    global plan
    body={"expectedRevision":plan["revision"],"analysisRunId":plan["analysisRunId"],"evidenceRevision":plan["evidenceRevision"],
          "reason":"Явное решение участника демонстрации","evidenceIds":[initial]}
    result=post(role,path+("/submit" if target=="submitted" else "/decisions")+q,
                body if target=="submitted" else {**body,"action":target},expected)
    if expected==200:
        plan=result["data"]
plan_decision("submitted","engineer")
plan_decision("approved","viewer",403)
plan_decision("approved","approver")
case_decision("remediation_planned",ids=[initial])
plan_decision("in_progress","technician")
result_evidence=evidence("technician","Синтетический результат повторной проверки: вывод исполнителя и условия измерения сохранены.")
conclusion="Учебная повторная проверка завершена; требуется независимая проверка согласующим."
plan=post("technician",path+"/step-results"+q,{"stepId":"check-1","expectedRevision":plan["revision"],
          "reason":"Запись результата","observedAt":snap["analysis"]["asOf"],"conclusion":conclusion,"evidenceIds":[result_evidence]})["data"]
assert plan["steps"][0]["result"]["conclusion"]==conclusion
plan_decision("awaiting_verification","technician")
plan_decision("completed","approver")
assert plan["steps"][0]["status"]=="verified"
case_decision("verification",ids=[result_evidence])
case_decision("closed","approver",[result_evidence])
assert snapshot()["case"]["state"]=="closed"
result={"run":run,"caseId":case_id,"planId":plan["planId"],"caseState":"closed","planState":"completed",
        "viewerApprove":403,"resultConclusionPersisted":True,"separateAuthenticatedClients":4}
(ROOT/"verification/live-workflow.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(result,ensure_ascii=False))
for client in clients.values():
    client.close()
