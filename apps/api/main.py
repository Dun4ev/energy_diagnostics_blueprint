"""Stage01 API: frozen interfaces, real DB readiness, fail-closed business stubs."""

import os
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select, text

from apps.api import auth, db
from apps.api import persistence as p
from apps.api.schema import complete_openapi
from packages.domain_contracts import models as m
from packages.domain_contracts.workflow import CASE_PERMISSION, PLAN_PERMISSION

app = FastAPI(title="Energy diagnostics advisory demo", version="0.1.0")


@lru_cache
def factory():
    return db.make_session_factory()


@app.on_event("startup")
def initialize():
    try:
        maker = factory()
    except RuntimeError:
        # Keep health available when no PostgreSQL configuration was supplied.
        return
    db.Base.metadata.create_all(maker.kw["bind"])
    with maker.begin() as session:
        auth.seed_users(session)
        path = os.getenv("API_REFERENCE_FIXTURE_PATH")
        if path:
            fixture = m.Envelope[m.CaseSnapshot].model_validate_json(Path(path).read_text())
            p.seed_reference_snapshot(session, fixture)


def error(code: str, message: str, status: int, request_id: str):
    body = m.APIError(code=code, message=message, details={}, requestId=request_id)
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"))


@app.middleware("http")
async def request_context(request: Request, call_next):
    request.state.request_id = str(uuid4())
    if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
        allowed = {x.strip() for x in os.getenv(
            "API_ALLOWED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080"
        ).split(",")}
        if request.headers.get("Origin") not in allowed:
            return error("ORIGIN_FORBIDDEN", "Недопустимый источник запроса", 403,
                         request.state.request_id)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    # Never return raw request values (passwords/evidence) in validation errors.
    return error("VALIDATION_ERROR", "Некорректный запрос", 422, request.state.request_id)


@app.exception_handler(p.DomainError)
async def domain_error(request: Request, exc: p.DomainError):
    return error(exc.code, exc.message, exc.status, request.state.request_id)


@app.get("/api/v1/health", response_model=m.Health, responses={503: {"model": m.Health}})
def health():
    try:
        with factory().begin() as session:
            session.execute(text("SELECT 1"))
        database = "ready"
    except Exception:
        database = "unavailable" if os.getenv("DB_HOST") else "unconfigured"
    runtime = "degraded"
    if database == "ready":
        try:
            from apps.worker.replay import RuntimeRow
            with factory()() as session:
                row = session.get(RuntimeRow, "worker")
                if row and (p.utc_now()-datetime.fromisoformat(row.body["at"])).total_seconds() < 120:
                    runtime = "ready"
        except Exception:
            pass
    result = m.Health(
        status="ok" if database == "ready" and runtime == "ready" else "degraded",
        stage="integrated",
        database=database,
        businessRuntime=runtime,
        advisoryOnly=True,
        controlCommandsAllowed=False,
        externalAiEnabled=False,
    )
    return JSONResponse(
        status_code=200 if database == "ready" else 503, content=result.model_dump(mode="json")
    )


def actor(session, request: Request, permission=m.Permission.READ, csrf: str | None = None):
    user, auth_session = auth.current_user(session, request.cookies.get(auth.COOKIE))
    auth.require_permission(user, permission)
    if csrf is not None:
        auth.csrf_valid(auth_session, csrf)
    return user


def envelope(run: db.RunRow, request: Request, data, data_time: datetime | None = None):
    timestamp = data_time or run.virtual_time
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return m.Envelope(schemaVersion="0.1.0", mode=run.mode, scenarioRunId=run.id,
                      dataTime=timestamp,
                      requestId=request.state.request_id, data=data)


def page(rows, total, offset, limit):
    return m.Page(items=rows, total=total, offset=offset, limit=limit)


def mutate(request, run_id, headers, body, permission, action):
    with factory().begin() as session:
        user = actor(session, request, permission, headers[1])
        run = p.get_run(session, run_id)
        scope = p.idempotency_scope(user.id, run_id, request.method, request.url.path, headers[0])
        digest = p.payload_hash(body.model_dump_json().encode())
        p.idempotency_lock(session, scope)
        prior = p.idempotent_result(session, scope, digest)
        if prior is not None:
            return prior
        result = action(session, user)
        value = envelope(run, request, result).model_dump(mode="json")
        p.remember_result(session, scope, digest, value)
        return value


def session_context(
    scenario_run_id: Annotated[str, Query(alias="scenarioRunId", min_length=1, max_length=128)],
):
    return scenario_run_id


def mutation_context(
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)],
    csrf_token: Annotated[str, Header(alias="X-CSRF-Token", min_length=1, max_length=256)],
):
    return idempotency_key, csrf_token


Run = Annotated[str, Depends(session_context)]
MutationHeaders = Annotated[tuple[str, str], Depends(mutation_context)]
Limit = Annotated[int, Query(ge=1, le=1000)]
Offset = Annotated[int, Query(ge=0)]
ERRORS = {code: {"model": m.APIError} for code in [401, 403, 404, 409, 422, 501]}


def stub(request: Request):
    return error(
        "NOT_IMPLEMENTED",
        "Метод описан контрактом; реализация запланирована на этап 04/07",
        501,
        request.state.request_id,
    )


@app.post("/api/v1/auth/login", response_model=m.Identity, responses=ERRORS)
def login(body: m.LoginRequest, request: Request, response: Response):
    p.require(request.url.scheme == "https" or request.url.hostname in {"localhost", "127.0.0.1"},
              "HTTPS_REQUIRED", "Для входа требуется HTTPS", 403)
    with factory().begin() as session:
        user = auth.verify_login(session, body.username, body.password)
        p.require(user is not None, "UNAUTHENTICATED", "Неверные учетные данные", 401)
        token, csrf = auth.create_session(session, user)
        identity = auth.identity(user, csrf)
    response.set_cookie(auth.COOKIE, token, httponly=True,
                        secure=request.url.scheme == "https", samesite="strict",
                        path="/api/v1", max_age=8 * 3600)
    return identity


@app.post("/api/v1/auth/logout", response_model=m.Identity, responses=ERRORS)
def logout(request: Request, response: Response, headers: MutationHeaders):
    with factory().begin() as session:
        user, auth_session = auth.current_user(session, request.cookies.get(auth.COOKIE))
        auth.csrf_valid(auth_session, headers[1])
        auth_session.revoked = True
        identity = auth.identity(user, auth.csrf_for_token(request.cookies[auth.COOKIE]))
    response.delete_cookie(auth.COOKIE, path="/api/v1")
    return identity


@app.get("/api/v1/auth/me", response_model=m.Identity, responses=ERRORS)
def me(request: Request):
    with factory()() as session:
        token = request.cookies.get(auth.COOKIE)
        user, _ = auth.current_user(session, token)
        return auth.identity(user, auth.csrf_for_token(token))


@app.get("/api/v1/assets", response_model=m.Envelope[m.Page[m.Asset]], responses=ERRORS)
def assets(
    request: Request,
    run: Run,
    limit: Limit = 100,
    offset: Offset = 0,
    siteId: str | None = None,
    assetType: str | None = None,
):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        query = select(db.AssetRow).where(db.AssetRow.run_id == run)
        if siteId:
            query = query.where(db.AssetRow.site_id == siteId)
        if assetType:
            query = query.where(db.AssetRow.asset_type == assetType)
        total = session.scalar(select(func.count()).select_from(query.subquery()))
        rows = session.scalars(query.order_by(db.AssetRow.id).offset(offset).limit(limit))
        return envelope(context, request,
                        page([m.Asset.model_validate(x.body) for x in rows], total, offset, limit))


@app.get("/api/v1/assets/{id}", response_model=m.Envelope[m.Asset], responses=ERRORS)
def asset(id: str, request: Request, run: Run):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        row = session.get(db.AssetRow, (run, id))
        p.require(row is not None, "NOT_FOUND", "Актив не найден", 404)
        return envelope(context, request, m.Asset.model_validate(row.body))


@app.get(
    "/api/v1/assets/{id}/measurements",
    response_model=m.Envelope[m.Page[m.Measurement]],
    responses=ERRORS,
)
def measurements(
    id: str,
    request: Request,
    run: Run,
    from_: Annotated[m.Time, Query(alias="from")],
    to: m.Time,
    metric: m.Metric | None = None,
    quality: m.Quality | None = None,
    limit: Limit = 1000,
    offset: Offset = 0,
):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        p.require(from_ <= to, "INVALID_RANGE", "Неверный интервал")
        p.require(session.get(db.AssetRow, (run, id)) is not None,
                  "NOT_FOUND", "Актив не найден", 404)
        query = select(db.MeasurementRow).where(db.MeasurementRow.run_id == run,
            db.MeasurementRow.asset_id == id, db.MeasurementRow.event_time >= from_,
            db.MeasurementRow.event_time <= to)
        if metric:
            query = query.where(db.MeasurementRow.metric == metric)
        if quality:
            query = query.where(db.MeasurementRow.quality == quality)
        total = session.scalar(select(func.count()).select_from(query.subquery()))
        rows = session.scalars(query.order_by(db.MeasurementRow.event_time,
                                              db.MeasurementRow.id).offset(offset).limit(limit))
        return envelope(context, request, page([m.Measurement.model_validate(x.body)
                                                for x in rows], total, offset, limit))


@app.get("/api/v1/cases", response_model=m.Envelope[m.Page[m.Case]], responses=ERRORS)
def cases(
    request: Request,
    run: Run,
    state: m.CaseState | None = None,
    siteId: str | None = None,
    priority: m.Priority | None = None,
    limit: Limit = 100,
    offset: Offset = 0,
):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        query = select(db.CaseRow).where(db.CaseRow.run_id == run)
        if state:
            query = query.where(db.CaseRow.state == state.value)
        if siteId:
            query = query.join(db.AssetRow, (db.AssetRow.run_id == db.CaseRow.run_id)
                               & (db.AssetRow.id == db.CaseRow.asset_id))
            query = query.where(db.AssetRow.site_id == siteId)
        if priority:
            query = query.join(db.AnalysisRow, db.AnalysisRow.id == db.CaseRow.analysis_id)
            query = query.where(db.AnalysisRow.priority == priority)
        total = session.scalar(select(func.count()).select_from(query.subquery()))
        rows = session.scalars(query.order_by(db.CaseRow.id).offset(offset).limit(limit))
        return envelope(context, request, page([m.Case.model_validate(x.body)
                                                for x in rows], total, offset, limit))


@app.get("/api/v1/cases/{id}/snapshot", response_model=m.Envelope[m.CaseSnapshot], responses=ERRORS)
def snapshot(id: str, request: Request, run: Run):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        case = p.get_case(session, run, id)
        asset_row = session.get(db.AssetRow, (run, case.asset_id))
        analysis_row = session.get(db.AnalysisRow, case.analysis_id)
        bundle = m.AnalysisBundle.model_validate(analysis_row.bundle)
        evidence_rows = session.scalars(select(db.EvidenceRow).where(
            db.EvidenceRow.run_id == run, db.EvidenceRow.case_id == id,
        ).order_by(db.EvidenceRow.revision)).all()
        reference = session.get(db.SnapshotRow, (run, id))
        topology = (m.Topology.model_validate(reference.body["topology"]) if reference else
                    m.Topology(nodes=[], edges=[], label="Схема не предоставлена"))
        data = m.CaseSnapshot(snapshotId=f"{id}:{case.revision}:{case.analysis_id}",
                              case=m.Case.model_validate(case.body),
                              asset=m.Asset.model_validate(asset_row.body),
                              analysis=bundle.analysis, details=bundle.details,
                              evidence=[m.Evidence.model_validate(x.body) for x in evidence_rows],
                              topology=topology)
        return envelope(context, request, data, bundle.analysis.asOf)


@app.get(
    "/api/v1/cases/{id}/series", response_model=m.Envelope[m.Page[m.SeriesPoint]], responses=ERRORS
)
def series(
    id: str,
    request: Request,
    run: Run,
    analysisRunId: str,
    from_: Annotated[m.Time, Query(alias="from")],
    to: m.Time,
    limit: Limit = 1000,
    offset: Offset = 0,
):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        case = p.get_case(session, run, id)
        p.require(from_ <= to, "INVALID_RANGE", "Неверный интервал")
        row = session.get(db.AnalysisRow, analysisRunId)
        p.require(row is not None and row.run_id == run and row.asset_id == case.asset_id,
                  "NOT_FOUND", "Анализ не найден", 404)
        values = [m.SeriesPoint.model_validate(x) for x in row.series
                  if from_ <= datetime.fromisoformat(x["eventTime"].replace("Z", "+00:00")) <= to]
        return envelope(context, request,
                        page(values[offset:offset + limit], len(values), offset, limit))


@app.get(
    "/api/v1/cases/{id}/history", response_model=m.Envelope[m.Page[m.AuditEvent]], responses=ERRORS
)
def history(id: str, request: Request, run: Run, limit: Limit = 100, offset: Offset = 0):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        p.get_case(session, run, id)
        plan_ids = select(db.PlanRow.id).where(db.PlanRow.run_id == run,
                                                db.PlanRow.case_id == id)
        query = select(db.AuditRow).where(db.AuditRow.run_id == run,
            or_(db.AuditRow.object_id == id, db.AuditRow.object_id.in_(plan_ids)))
        total = session.scalar(select(func.count()).select_from(query.subquery()))
        rows = session.scalars(query.order_by(db.AuditRow.timestamp, db.AuditRow.id)
                               .offset(offset).limit(limit))
        return envelope(context, request, page([m.AuditEvent.model_validate(x.body)
                                                for x in rows], total, offset, limit))


@app.get(
    "/api/v1/cases/{id}/analyses",
    response_model=m.Envelope[m.Page[m.AnalysisBundle]],
    responses=ERRORS,
)
def analyses(id: str, request: Request, run: Run, limit: Limit = 100, offset: Offset = 0):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        case = p.get_case(session, run, id)
        query = select(db.AnalysisRow).where(db.AnalysisRow.run_id == run,
                                             db.AnalysisRow.asset_id == case.asset_id)
        total = session.scalar(select(func.count()).select_from(query.subquery()))
        rows = session.scalars(query.order_by(db.AnalysisRow.as_of.desc(), db.AnalysisRow.id)
                               .offset(offset).limit(limit))
        return envelope(context, request, page([m.AnalysisBundle.model_validate(x.bundle)
                                                for x in rows], total, offset, limit))


@app.post("/api/v1/cases/{id}/decisions", response_model=m.Envelope[m.Case], responses=ERRORS)
def case_decision(
    id: str, body: m.CaseDecision, request: Request, run: Run, headers: MutationHeaders
):
    return mutate(request, run, headers, body, CASE_PERMISSION[body.targetState],
                  lambda session, user: p.mutate_case(
                      session, p.get_case(session, run, id, lock=True), body,
                      user.id, request.state.request_id))


@app.get("/api/v1/risks", response_model=m.Envelope[m.Page[m.RiskEntry]], responses=ERRORS)
def risks(
    request: Request,
    run: Run,
    priority: m.Priority | None = None,
    siteId: str | None = None,
    includeNormal: bool = False,
    limit: Limit = 100,
    offset: Offset = 0,
):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        assets = session.scalars(select(db.AssetRow).where(db.AssetRow.run_id == run)).all()
        entries = []
        for asset_row in assets:
            if siteId and asset_row.site_id != siteId:
                continue
            row = session.scalar(select(db.AnalysisRow).where(
                db.AnalysisRow.run_id == run, db.AnalysisRow.asset_id == asset_row.id,
            ).order_by(db.AnalysisRow.as_of.desc(), db.AnalysisRow.id.desc()).limit(1))
            if not row:
                continue
            analysis = m.AnalysisBundle.model_validate(row.bundle).analysis
            if priority and analysis.risk.priority != priority:
                continue
            if not includeNormal and analysis.status == "normal":
                continue
            case = session.scalar(select(db.CaseRow).where(
                db.CaseRow.run_id == run, db.CaseRow.asset_id == asset_row.id,
                db.CaseRow.state != m.CaseState.CLOSED.value,
            ).order_by(db.CaseRow.id).limit(1))
            entries.append(m.RiskEntry(asset=m.Asset.model_validate(asset_row.body),
                                       caseId=case.id if case else None,
                                       analysis=analysis,
                                       assignedTo=case.body["assignedTo"] if case else None,
                                       nextDueAt=None))
        rank = {"high": 0, "medium": 1, "unknown": 2, "low": 3}
        entries.sort(key=lambda x: (rank[x.analysis.risk.priority], x.asset.assetId))
        return envelope(context, request,
                        page(entries[offset:offset + limit], len(entries), offset, limit))


@app.post("/api/v1/evidence", response_model=m.Envelope[m.Evidence], responses=ERRORS)
def evidence(body: m.EvidenceCreate, request: Request, run: Run, headers: MutationHeaders):
    return mutate(request, run, headers, body, m.Permission.EVIDENCE_ADD,
                  lambda session, user: p.append_evidence(
                      session, p.get_case(session, run, body.caseId, lock=True), body,
                      user.id, request.state.request_id))


@app.get("/api/v1/work-plans", response_model=m.Envelope[m.Page[m.WorkPlan]], responses=ERRORS)
def plans(request: Request, run: Run, caseId: str | None = None,
          limit: Limit = 100, offset: Offset = 0):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        query = select(db.PlanRow).where(db.PlanRow.run_id == run)
        if caseId:
            p.get_case(session, run, caseId)
            query = query.where(db.PlanRow.case_id == caseId)
        total = session.scalar(select(func.count()).select_from(query.subquery()))
        rows = session.scalars(query.order_by(db.PlanRow.id).offset(offset).limit(limit))
        return envelope(context, request, page([m.WorkPlan.model_validate(x.body)
                                                for x in rows], total, offset, limit))


@app.get("/api/v1/work-plans/{id}", response_model=m.Envelope[m.WorkPlan], responses=ERRORS)
def plan(id: str, request: Request, run: Run):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        return envelope(context, request,
                        m.WorkPlan.model_validate(p.get_plan(session, run, id).body))


@app.post("/api/v1/work-plans", response_model=m.Envelope[m.WorkPlan], responses=ERRORS)
def create_plan(body: m.PlanDraft, request: Request, run: Run, headers: MutationHeaders):
    return mutate(request, run, headers, body, m.Permission.PLAN_EDIT,
                  lambda session, user: p.create_plan(
                      session, p.get_case(session, run, body.caseId, lock=True), body,
                      user.id, request.state.request_id))


@app.patch("/api/v1/work-plans/{id}", response_model=m.Envelope[m.WorkPlan], responses=ERRORS)
def edit_plan(id: str, body: m.PlanEdit, request: Request, run: Run, headers: MutationHeaders):
    return mutate(request, run, headers, body, m.Permission.PLAN_EDIT,
                  lambda session, user: p.update_plan(
                      session, p.get_plan(session, run, id, lock=True), body,
                      user.id, request.state.request_id))


@app.post("/api/v1/work-plans/{id}/submit", response_model=m.Envelope[m.WorkPlan], responses=ERRORS)
def submit(id: str, body: m.PlanSubmit, request: Request, run: Run, headers: MutationHeaders):
    return mutate(request, run, headers, body, m.Permission.PLAN_EDIT,
                  lambda session, user: p.transition_plan(
                      session, p.get_plan(session, run, id, lock=True), body,
                      m.PlanState.SUBMITTED, user.id, request.state.request_id))


@app.post(
    "/api/v1/work-plans/{id}/decisions", response_model=m.Envelope[m.WorkPlan], responses=ERRORS
)
def decide_plan(
    id: str, body: m.PlanDecision, request: Request, run: Run, headers: MutationHeaders
):
    target = m.PlanState(body.action)
    return mutate(request, run, headers, body, PLAN_PERMISSION[target],
                  lambda session, user: p.transition_plan(
                      session, p.get_plan(session, run, id, lock=True), body,
                      target, user.id, request.state.request_id))


@app.post(
    "/api/v1/work-plans/{id}/step-results", response_model=m.Envelope[m.WorkPlan], responses=ERRORS
)
def step_result(id: str, body: m.StepResult, request: Request, run: Run, headers: MutationHeaders):
    return mutate(request, run, headers, body, m.Permission.STEP_RESULT,
                  lambda session, user: p.record_step(
                      session, p.get_plan(session, run, id, lock=True), body,
                      user.id, m.Role(user.role), request.state.request_id))


@app.get("/api/v1/demo/scenarios", response_model=m.Page[m.Scenario], responses=ERRORS)
def scenarios(request: Request):
    with factory()() as session:
        actor(session, request)
    from apps.worker.replay import catalog
    values = catalog()
    return page(values, len(values), 0, 100)


@app.post("/api/v1/demo/sessions", response_model=m.Envelope[m.ScenarioSession], responses=ERRORS)
def create_session(body: m.SessionCreate, request: Request, headers: MutationHeaders):
    from apps.worker.replay import new_run
    with factory().begin() as session:
        user = actor(session, request, m.Permission.DEMO_ADVANCE, headers[1])
        scope = p.idempotency_scope(user.id, "new-run", request.method, request.url.path, headers[0])
        digest = p.payload_hash(body.model_dump_json().encode())
        p.idempotency_lock(session, scope)
        prior = p.idempotent_result(session, scope, digest)
        if prior is not None:
            return prior
        run = new_run(session, body, user.id, request.state.request_id)
        value = envelope(p.get_run(session, run.scenarioRunId), request, run).model_dump(mode="json")
        p.remember_result(session, scope, digest, value)
        return value


@app.get(
    "/api/v1/demo/sessions/{id}", response_model=m.Envelope[m.ScenarioSession], responses=ERRORS
)
def get_session(id: str, request: Request):
    with factory()() as session:
        actor(session, request)
        run = p.get_run(session, id)
        return envelope(run, request, m.ScenarioSession.model_validate(run.body))


@app.post(
    "/api/v1/demo/sessions/{id}/advance",
    response_model=m.Envelope[m.ScenarioSession],
    responses=ERRORS,
)
def advance(id: str, body: m.SessionAdvance, request: Request, headers: MutationHeaders):
    from apps.worker.replay import advance_run
    def action(session, user):
        row = session.scalar(select(db.RunRow).where(db.RunRow.id == id).with_for_update())
        p.require(row is not None, "NOT_FOUND", "Сеанс не найден", 404)
        return advance_run(session, row, body, user.id, request.state.request_id)
    return mutate(request, id, headers, body, m.Permission.DEMO_ADVANCE, action)


@app.get("/api/v1/models", response_model=m.Envelope[m.Page[m.ModelInfo]], responses=ERRORS)
def models(request: Request, run: Run):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        from packages.diagnostics.core import MODEL_VERSION
        policy = m.DiagnosticPolicy.model_validate_json(Path(os.getenv(
            "DIAGNOSTIC_POLICY_PATH", "config/diagnostic-policy.demo.json")).read_text())
        value = m.ModelInfo(modelVersion=MODEL_VERSION, policyVersion=policy.version,
                            supportedAssetTypes=["transformer"], advisoryOnly=True, forecastEnabled=False)
        return envelope(context, request, page([value], 1, 0, 100))


@app.get("/api/v1/sources", response_model=m.Envelope[m.Page[m.Source]], responses=ERRORS)
def sources(request: Request, run: Run, limit: Limit = 100, offset: Offset = 0):
    with factory()() as session:
        actor(session, request)
        context = p.get_run(session, run)
        query = select(db.SourceRow).where(db.SourceRow.run_id == run)
        total = session.scalar(select(func.count()).select_from(query.subquery()))
        rows = session.scalars(query.order_by(db.SourceRow.id).offset(offset).limit(limit))
        return envelope(context, request, page([m.Source.model_validate(x.body)
                                                for x in rows], total, offset, limit))


# Keep served OpenAPI and generated client contract identical.

_base_openapi = app.openapi


def contract_openapi():
    return complete_openapi(_base_openapi())


app.openapi = contract_openapi
