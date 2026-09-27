"""Stage01 API: frozen interfaces, real DB readiness, fail-closed business stubs."""

import os
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import URL, create_engine, text

from apps.api.schema import complete_openapi
from packages.domain_contracts import models as m

app = FastAPI(title="Energy diagnostics advisory demo", version="0.1.0")


def error(code: str, message: str, status: int, request_id: str):
    body = m.APIError(code=code, message=message, details={}, requestId=request_id)
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"))


@app.middleware("http")
async def request_context(request: Request, call_next):
    request.state.request_id = str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    # Never return raw request values (passwords/evidence) in validation errors.
    return error("VALIDATION_ERROR", "Некорректный запрос", 422, request.state.request_id)


@app.get("/api/v1/health", response_model=m.Health, responses={503: {"model": m.Health}})
def health():
    database = "unconfigured"
    if os.getenv("DB_HOST"):
        engine = create_engine(
            URL.create(
                "postgresql+psycopg",
                username=os.getenv("DB_USER", "energy"),
                password=os.getenv("DB_PASSWORD"),
                host=os.environ["DB_HOST"],
                database=os.getenv("DB_NAME", "energy"),
            ),
            connect_args={"connect_timeout": 2},
            pool_pre_ping=True,
        )
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            database = "ready"
        except Exception:
            database = "unavailable"
        finally:
            engine.dispose()
    result = m.Health(
        status="ok" if database == "ready" else "degraded",
        stage="foundation",
        database=database,
        businessRuntime="not_implemented",
        advisoryOnly=True,
        controlCommandsAllowed=False,
        externalAiEnabled=False,
    )
    return JSONResponse(
        status_code=200 if database == "ready" else 503, content=result.model_dump(mode="json")
    )


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
def login(body: m.LoginRequest, request: Request):
    return stub(request)


@app.post("/api/v1/auth/logout", response_model=m.Identity, responses=ERRORS)
def logout(request: Request, headers: MutationHeaders):
    return stub(request)


@app.get("/api/v1/auth/me", response_model=m.Identity, responses=ERRORS)
def me(request: Request):
    return stub(request)


@app.get("/api/v1/assets", response_model=m.Envelope[m.Page[m.Asset]], responses=ERRORS)
def assets(
    request: Request,
    run: Run,
    limit: Limit = 100,
    offset: Offset = 0,
    siteId: str | None = None,
    assetType: str | None = None,
):
    return stub(request)


@app.get("/api/v1/assets/{id}", response_model=m.Envelope[m.Asset], responses=ERRORS)
def asset(id: str, request: Request, run: Run):
    return stub(request)


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
    return stub(request)


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
    return stub(request)


@app.get("/api/v1/cases/{id}/snapshot", response_model=m.Envelope[m.CaseSnapshot], responses=ERRORS)
def snapshot(id: str, request: Request, run: Run):
    return stub(request)


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
    return stub(request)


@app.get(
    "/api/v1/cases/{id}/history", response_model=m.Envelope[m.Page[m.AuditEvent]], responses=ERRORS
)
def history(id: str, request: Request, run: Run, limit: Limit = 100, offset: Offset = 0):
    return stub(request)


@app.get(
    "/api/v1/cases/{id}/analyses",
    response_model=m.Envelope[m.Page[m.AnalysisBundle]],
    responses=ERRORS,
)
def analyses(id: str, request: Request, run: Run, limit: Limit = 100, offset: Offset = 0):
    return stub(request)


@app.post("/api/v1/cases/{id}/decisions", response_model=m.Envelope[m.Case], responses=ERRORS)
def case_decision(
    id: str, body: m.CaseDecision, request: Request, run: Run, headers: MutationHeaders
):
    return stub(request)


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
    return stub(request)


@app.post("/api/v1/evidence", response_model=m.Envelope[m.Evidence], responses=ERRORS)
def evidence(body: m.EvidenceCreate, request: Request, run: Run, headers: MutationHeaders):
    return stub(request)


@app.get("/api/v1/work-plans/{id}", response_model=m.Envelope[m.WorkPlan], responses=ERRORS)
def plan(id: str, request: Request, run: Run):
    return stub(request)


@app.post("/api/v1/work-plans", response_model=m.Envelope[m.WorkPlan], responses=ERRORS)
def create_plan(body: m.PlanDraft, request: Request, run: Run, headers: MutationHeaders):
    return stub(request)


@app.patch("/api/v1/work-plans/{id}", response_model=m.Envelope[m.WorkPlan], responses=ERRORS)
def edit_plan(id: str, body: m.PlanEdit, request: Request, run: Run, headers: MutationHeaders):
    return stub(request)


@app.post("/api/v1/work-plans/{id}/submit", response_model=m.Envelope[m.WorkPlan], responses=ERRORS)
def submit(id: str, body: m.PlanSubmit, request: Request, run: Run, headers: MutationHeaders):
    return stub(request)


@app.post(
    "/api/v1/work-plans/{id}/decisions", response_model=m.Envelope[m.WorkPlan], responses=ERRORS
)
def decide_plan(
    id: str, body: m.PlanDecision, request: Request, run: Run, headers: MutationHeaders
):
    return stub(request)


@app.post(
    "/api/v1/work-plans/{id}/step-results", response_model=m.Envelope[m.WorkPlan], responses=ERRORS
)
def step_result(id: str, body: m.StepResult, request: Request, run: Run, headers: MutationHeaders):
    return stub(request)


@app.get("/api/v1/demo/scenarios", response_model=m.Page[m.Scenario], responses=ERRORS)
def scenarios(request: Request):
    return stub(request)


@app.post("/api/v1/demo/sessions", response_model=m.Envelope[m.ScenarioSession], responses=ERRORS)
def create_session(body: m.SessionCreate, request: Request, headers: MutationHeaders):
    return stub(request)


@app.get(
    "/api/v1/demo/sessions/{id}", response_model=m.Envelope[m.ScenarioSession], responses=ERRORS
)
def get_session(id: str, request: Request):
    return stub(request)


@app.post(
    "/api/v1/demo/sessions/{id}/advance",
    response_model=m.Envelope[m.ScenarioSession],
    responses=ERRORS,
)
def advance(id: str, body: m.SessionAdvance, request: Request, headers: MutationHeaders):
    return stub(request)


@app.get("/api/v1/models", response_model=m.Envelope[m.Page[m.ModelInfo]], responses=ERRORS)
def models(request: Request, run: Run):
    return stub(request)


@app.get("/api/v1/sources", response_model=m.Envelope[m.Page[m.Source]], responses=ERRORS)
def sources(request: Request, run: Run, limit: Limit = 100, offset: Offset = 0):
    return stub(request)


# Keep served OpenAPI and generated client contract identical.

_base_openapi = app.openapi


def contract_openapi():
    return complete_openapi(_base_openapi())


app.openapi = contract_openapi
