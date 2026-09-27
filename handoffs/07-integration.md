# Stage07: интеграция, G3

База: G1 `2be16f3929495846bd71b227ad2ba39fb16dd7a7`. Финальный production commit: `2e3617d`. Локальная интеграция выполнена 2026-09-27 на macOS arm64, Python 3.13.5, Node 25.1.0/npm 11.13.0, uv 0.12.15, Docker 29.3.1/Compose 5.1.0. Независимый G4 оформляется отдельно в `verification/PROTOTYPE_ACCEPTANCE.md`.

## Реализовано

SourceAdapter → bounded observations → PostgreSQL → persisted replay job → pure numerical core → immutable analysis → case/risk read model → реальный React UI. Worker публикует результаты девяти активов атомарно, повторное выполнение не размножает анализы/случаи. Контекст run и оба временных cutoff входят в идентичность анализа. Пауза, шаг, скорости 1/10/60, конец данных, новый run при другом времени; состояние сохраняется в PostgreSQL.

REFERENCE отделен от SIMULATION. Первый воспроизводит иллюстративный анализ и схему; готовый план из reference fixture не засеивается. Рабочие планы создаются и проходят workflow в SIMULATION. Расчетные значения не заменяются числами слайда. Вероятность отказа null; unknown не превращается в ноль. Runtime не читает truth; API не монтирует observations, worker монтирует только observations и необходимые конфигурации/fixtures read-only. Нет внешнего AI, полевых команд или изменения уставок.

UI: очередь, случай, график температуры/остатка, доказательства, планы, роли, аудит, экспорт, источники/модели, виртуальное время. Снимки доступны для чтения при потере связи; действия блокируются. Мобильная навигация, keyboard focus, отсутствие горизонтального overflow проверены. Повтор создания плана после потери ответа сохраняет тот же Idempotency-Key и возвращает тот же план.

## Файлы и контракты

Изменены/добавлены: `apps/worker/{main,replay}.py`, runtime wiring в `apps/api`, `apps/web/src/features/`, `apps/web/src/App.tsx`, компоненты shell/dialog, `infra/`, корневые build/CI configs, `tests/integration`, `tests/live`, скрипты local env/smoke/restart/workflow/backup/restore, `docs/runbook/{LOCAL,DEMO}.md`, README, отчеты verification. Полный точный список: `git diff --name-only 2be16f3929495846bd71b227ad2ba39fb16dd7a7 2e3617d` (включает интегрированные module commits).

Согласованные дополнения описаны в RFC handoffs: persisted ScenarioSession processing state, live health, сохраненный StepResultRecord. Контракт 0.1.0 и generated TypeScript/OpenAPI синхронизированы; старые fixtures совместимы с optional/default полями. Временных несовместимых DTO нет. Пароли только в ignored `infra/.env`; вывод проверок не содержит секретов.

## Фактические проверки

- `npm run test:python`: 60 passed (contracts, ingestion, core, API, integration, независимые core/workflow тесты).
- `npm test`: 22 passed; `npm run contracts:check`, `npm run lint`, `npm run build`: passed. После последней узкой правки создания плана повторены typecheck/lint и Docker web build.
- `uv run python tests/test_blueprint.py --report verification/local-data-checks.json`: 19 passed.
- `npm run test:e2e`: 1 passed. Live Playwright `demo.spec.ts`: 1 passed, реальные engineer/approver в разных browser contexts; `retry.spec.ts`: 1 passed, потерянный ответ создания плана не создает дубликат.
- `uv run python scripts/smoke_local.py`: REFERENCE 1 актив/случай за 0.57 s, SIMULATION 9 активов/2 случая за 4.17 s. Это один локальный замер, не нагрузочный benchmark. Same snapshot и session idempotency подтверждены (`verification/live-replay-smoke.json`).
- `uv run python scripts/check_restart.py`: API/worker restart сохранил девять снимков и session (`verification/restart-check.json`).
- `uv run python scripts/check_live_workflow.py`: engineer review/evidence/confirm → draft/submit → approver approve → technician result/evidence → approver verification → case closure. Viewer direct HTTP approval получает 403 (`verification/live-workflow.json`).
- Независимые проверки numerical leakage/hysteresis/unknown и workflow result gates: `CORE_REVIEW.md`, `WORKFLOW_REVIEW.md`. Backup восстановлен в отдельную новую БД; рабочая БД не заменялась.
- Docker публикует только 127.0.0.1:8080. Runtime mounts/images проверены на отсутствие truth. Live OpenAPI совпадает с frozen contract.

## Запуск, ограничения и следующий шаг

Выполнить команды README, открыть http://127.0.0.1:8080. Подробности start/stop/new run/backup/restore: `docs/runbook/LOCAL.md`; сценарий показа: `docs/runbook/DEMO.md`. Рабочий Compose оставлен запущенным. Старые runs, backup и отдельные restore databases сохранены.

Чистая установка на другом компьютере и удаленный CI не проверялись. Нет промышленной валидации/коннектора/термограмм/ТОиР. Известны предупреждения deprecated FastAPI lifespan/TestClient и размер lazy ECharts chunk; они не блокируют локальную демонстрацию. Реальный парк требует отдельной идентификации активов/датчиков и проверки модели. Следующий шаг: независимый G4 по финальному commit, затем показ заказчику. Build сам по себе не является приемкой.
