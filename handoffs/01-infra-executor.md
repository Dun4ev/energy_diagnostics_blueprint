# Stage 01 infrastructure handoff

- Base commit: `e066e6bca7e88536b15411cdce5fe9c12de35060`.
- Scope: Compose services and container build/proxy configuration only. No contracts, manifests, lockfiles, or application code changed.

## Files

- `infra/backend.Dockerfile`
- `infra/backend.Dockerfile.dockerignore`
- `infra/frontend.Dockerfile`
- `infra/frontend.Dockerfile.dockerignore`
- `infra/compose.yaml`
- `infra/nginx/default.conf`
- `infra/.gitignore`
- `handoffs/01-infra-executor.md`

## Runtime and compatibility

- Backend image uses Python `3.13.5-slim-bookworm` and uv `0.12.15`; it copies only the root Python manifests, `packages/`, `apps/api/`, and `apps/worker/`, then runs `uv sync --frozen --no-dev`. Its default command is `uvicorn apps.api.main:app` on port 8000.
- Frontend build uses Node `25.1.0-bookworm-slim`, root `package.json`, `package-lock.json`, and `tsconfig.json`, plus `apps/web/`, `config/`, and `contracts/fixtures/`; it runs the root `npm run build` script and copies only `apps/web/dist` into nginx `1.29.3-alpine`. It does not assume npm workspaces or nested package manifests.
- PostgreSQL is pinned to `17.6-alpine3.22`. The selected Python, uv, Node, nginx, and PostgreSQL image tags all passed `docker manifest inspect` during this task.
- Nginx is the only published service, bound to `127.0.0.1:8080`. It serves the Vite SPA through an `index.html` fallback, redirects the exact `/api/v1` prefix to `/api/v1/`, and proxies `/api/v1/` to the internal API while preserving the request path. Database, API, and worker have no host ports.
- The worker uses `python -m apps.worker.main`, receives `WORKER_ENABLED=false`, and mounts only `data/observations` read-only at `/app/data/observations`. The Dockerfile-specific context filters exclude `data/truth` and other unrelated repository paths before they are sent to the Docker daemon.
- Compose passes the PostgreSQL password separately as `DB_PASSWORD`; it requires `POSTGRES_PASSWORD` at configuration time. The ignored local file `infra/.env` is not created by this handoff and must contain a locally chosen value before startup.
- The API healthcheck expects the integrator to provide `GET /api/v1/health`. No contracts or DTOs were changed.

## Verification and gaps

Commands run:

- `docker --version` -> Docker `29.3.1`.
- `docker compose version` -> Docker Compose `v5.1.0`.
- `docker manifest inspect` for all five pinned image references -> all available.
- `POSTGRES_PASSWORD=validation-only docker compose -f infra/compose.yaml config --quiet` -> passed. The validation value was not written to a file or container.
- `git check-ignore -v infra/.env` -> ignored by `infra/.gitignore`.

Image builds and full-stack startup were not run: the base worktree did not yet contain the root manifests or app scaffolds being created by the integrator, and the full stack was explicitly out of scope. The worker's no-op behavior and API health route depend on those application files. The backend build also requires the Python lock to include `psycopg` and the Python workspace packages.

## Reproduction and integration

1. Create `infra/.env` locally with `POSTGRES_PASSWORD=<locally chosen value>`; do not commit it.
2. From the repository root run `docker compose --env-file infra/.env -f infra/compose.yaml config --quiet` to validate configuration.
3. When the integrator has added the app files and lockfiles, run `docker compose --env-file infra/.env -f infra/compose.yaml up --build` and check the `web`, `api`, and `db` health states.
4. The integrator should ensure `psycopg` is locked, the root `npm run build` emits `apps/web/dist`, the root TypeScript config compiles `apps/web/src`, the worker main module announces that processing is disabled and sleeps, and `/api/v1/health` is implemented before building the stack.
