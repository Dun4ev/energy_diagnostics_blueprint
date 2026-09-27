# Локальный каркас: этап01

Это запускаемый фундамент, не диагностика. Только health выполняет реальную проверку БД. Остальные API возвращают 501; auth, persistence business models, replay, numerical core и три рабочих экрана появятся на этапах02–07. Никакие кнопки согласования не симулируются.

## Окружение

Node25.1.0 / npm11.13.0, Python3.13.5 / uv0.12.15; точные зависимости в package-lock.json и uv.lock. Docker daemon должен отвечать. Все команды из корня проекта. Глобальные настройки не менять.

```bash
uv sync --frozen
npm ci
npm run lint
npm run contracts:check
uv run --frozen pytest tests/contracts
npm test
npm run build
```

Для первого запуска нужен локальный `infra/.env` (игнорируется Git). Создать один раз, не перезаписывать существующий пароль:

```bash
python3 - <<'PY'
from pathlib import Path
import os, secrets
p = Path('infra/.env')
fd = os.open(p, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(fd, 'w') as stream:
    stream.write('POSTGRES_PASSWORD=' + secrets.token_urlsafe(32) + '\n')
PY

docker compose --env-file infra/.env -p energy-diagnostics -f infra/compose.yaml config --quiet
docker compose --env-file infra/.env -p energy-diagnostics -f infra/compose.yaml up --build -d --wait
curl --fail http://127.0.0.1:8080/api/v1/health
```

Открыть http://127.0.0.1:8080. Единственный опубликованный порт привязан к loopback; API/БД/worker внутренние. Worker пока только ожидает остановки, не создает AnalysisRun. observations примонтированы ему read-only; truth отсутствует в образах и mounts. `docker compose config` без --quiet может напечатать пароль, не использовать в отчетах.

Остановка с сохранением базы:

```bash
docker compose --env-file infra/.env -p energy-diagnostics -f infra/compose.yaml stop
```

Повторный запуск той же командой up. Не удалять volumes и не менять DB пароль поверх существующего volume. Reset/backup/restore бизнес-данных будут добавлены и проверены на этапе07, пока такой функции нет.

## Контракты и mocks

Канон packages/domain_contracts. После согласованного RFC:

```bash
npm run contracts:generate
npm run contracts:check
```

mocks.ts не импортируется production entry. Он предназначен для tests и будущего отдельного UI harness. Generated API types и openapi-fetch служат typed service interface; контекст run передается явно. Изменения schemas/locks делает интегратор.

Численные допуски: contracts/NUMERICAL_ACCEPTANCE.md. Решения по ревизиям, auth, evidence, unsupported: handoffs/RFC-foundation-contracts.md. Source fixtures в contracts/examples не являются живыми API responses.

## Browser smoke

Проектный @playwright/test закреплен. Если Chromium еще не доступен, его установка является проектным QA prerequisite:

```bash
PLAYWRIGHT_SKIP_BROWSER_GC=1 npx --no-install playwright install chromium
npm run test:e2e
```

Playwright MCP можно использовать для ручного просмотра. Smoke проверяет только каркас/health/501, не workflow или численную правильность.
