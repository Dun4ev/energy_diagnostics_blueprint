# Этап01: foundation и контракты G1

Базовый commit: e066e6bca7e88536b15411cdce5fe9c12de35060. G0 принят пользователем в чате. G1 принят по локальным проверкам и независимому review Sol. Frozen code commit будет отмечен локальным тегом stage01-g1; hash для следующих worktrees см. git rev-parse stage01-g1.

Созданы React/TS/Vite каркас, FastAPI endpoints с явными501, PostgreSQL health, disabled worker, Pydantic DTO/ports/workflow, schemas/OpenAPI/generated TS, typed client/MSW reference fixtures, root npm/uv locks, Compose, CI и команды проверки. Scope/ADR: RFC-foundation-contracts.md. Совместимость AnalysisResult/Measurement0.1.0 сохранена; новые детали вынесены отдельно. Канонические DTO принадлежат интегратору.

Выполнено: uv sync --frozen; npm ci; npm run lint/contracts:check/typecheck/build; pytest tests/contracts (27 passed, включая независимые regression tests без xfail); npm test (22 passed); blueprint (19 passed, verification/local-data-checks.json). Compose build/up успешен, health через localhost8080 возвращает database=ready; только web публикует127.0.0.1:8080, worker mount observations read-only, API truth path отсутствует. CI создан, удаленный CI не запускался.

Файлы: root manifests/locks/config; packages/domain_contracts; apps/api/apps/worker/apps/web; infra; contracts schemas/OpenAPI/workflow/fixtures/NUMERICAL_ACCEPTANCE; tests/contracts/frontend/e2e; scripts/check-client.mjs; .github/workflows; docs/runbook/LOCAL.md; handoffs; verification/local-data-checks.json. README/contracts README дополнены; тест blueprint исправлен на фактический регистр DESIGN.md. Исходные data/reference/design/prompts не изменены.

Не реализованы: runtime auth/RBAC, persistence workflow, core, ingestion/replay, рабочие три экрана. Health это проверка PostgreSQL, не готовность диагностики. Полные numerical/workflow/security/visual acceptance впереди. Playwright foundation smoke: 1 passed; screenshot verification/foundation-desktop.png сохранен и визуально просмотрен. Live OpenAPI и frozen export совпали по SHA-256. Внешний AI/OT/управление запрещены.

Окружение: macOS arm64, Python3.13.5, Node25.1.0/npm11.13.0, uv0.12.15, Docker29.3.1/Compose5.1.0. Локальный игнорируемый infra/.env создан с случайным DB credential, значение не выводилось. Установка project dependencies разрешена G0. Chromium installer использует общий browser cache и автоматически удалил старые unused browser revisions; plugins/skills/hooks не устанавливались. В дальнейшем использовать PLAYWRIGHT_SKIP_BROWSER_GC=1 при установке браузеров.

Известные предупреждения: Starlette TestClient помечает httpx как deprecated; Vitest под Node25 выводит предупреждение localstorage-file. Проверки успешны, suppress не добавлялся. Первая попытка npm dev dependencies обнаружила peer conflict TS7; исправлено pin5.9.3 без force. Команда uv add --exact не поддерживалась, исправлено на --bounds exact. Один запуск npx совпал с npm ci и не нашел executable; browser install повторен после окончания npm ci локальным бинарником.

Воспроизведение: docs/runbook/LOCAL.md. Следующее действие интегратора: запускать stages02–05 только от frozen G1 commit в отдельных worktrees, затем stage06/07/08. Изменение общего контракта и lockfiles через RFC. Пользователь разрешил Luna и Sol как исполнителей; оркестрация/интеграция остаются у ведущего.

## Независимая проверка и исправления

Luna подготовила infra в отдельном worktree base e066e6b; интегратор проверил и адаптировал root npm layout. Sol независимо проверил candidate d1c9cd0 и обнаружил coercion JSON numeric, несогласованность Envelope mode/run/time, чужое measurement внутри Evidence, неверный порядок времен и неограниченные mocks. Все исправлено до G1; независимые regression tests перенесены без xfail. Полная история и команды в handoffs/review-01.md.

Safety boundaries: failureProbability только null; reference7.2 не вероятность; strict numeric не принимает bool/string; future/mismatched snapshot и evidence отклоняются. Runtime data/truth отсутствует, расчеты еще не реализованы. Исходные data/references/DESIGN/prompts/AGENTS/generator не изменены (git diff от базового commit пуст для этих путей).

Создан только локальный код/контейнеры и commits, push/deploy вовне не выполнялся. CI YAML существует, удаленный CI не запускался. Stage01 не следует выдавать за готовый рабочий прототип диагностики.
