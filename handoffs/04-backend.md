# Этап 04: backend workflow

База: `2be16f3929495846bd71b227ad2ba39fb16dd7a7` (`stage01-g1`). Работа в отдельном worktree `backend-workflow`. OWNED: `apps/api`, `tests/api`, этот handoff/RFC. Shared contracts, root config, worker и frontend не менялись.

## Создано

- `apps/api/db.py`: SQLAlchemy таблицы для run, assets, sources, immutable measurements и analyses/series, cases, evidence, work plans, approvals, defects, audit, idempotency, demo users и HTTP sessions; индексы run/asset/time/status.
- `apps/api/persistence.py`: `create_run(session, ScenarioSession)` и `store_analysis(session, scenario_run_id, asset, bundle, series, *, source_rows, measurements, symptom_family='thermal_residual') -> Case | None`. Caller owns transaction/commit. Один `AnalysisRow` служит очереди, snapshot и истории. Открытый случай обновляется по `(run, asset, symptomFamily)`; normal/insufficient не закрывает его автоматически. Duplicate analysis ID — no-op. Повторный measurement ID с измененным содержимым — 409. Измерения проверяются и загружаются пачками по 1000 ID, без запроса на каждую точку.
- `apps/api/auth.py`: seeded demo accounts `engineer`, `approver`, `technician`, `viewer`, `admin`. Пароли только из `DEMO_<ROLE>_PASSWORD`, иначе аккаунт отключен; PBKDF2 hash с солью. `DEMO_ENGINEER_CASE_CONFIRM=true` — явное разрешение `case.confirm` для инженера демонстрации. Роли/actor только из серверной сессии, cookie HttpOnly SameSite=Strict, Secure при HTTPS. HTTP вход ограничен loopback. Mutations проверяют Origin (`API_ALLOWED_ORIGINS`, по умолчанию localhost/127.0.0.1:8080), CSRF и permission.
- `apps/api/main.py`: read endpoints и workflow endpoints frozen API, плюс `GET /work-plans` по RFC. Все изменения работают с expectedRevision, Idempotency-Key и audit в одной транзакции. Для PostgreSQL одинаковый idempotency scope сериализован advisory transaction lock до проверки ревизии. 403/409/422 возвращаются без traceback и секретов. `POST /evidence` принимает только строгий JSON note/measurement/thermography_metadata; бинарных upload, URI/path/MIME от клиента нет, лишние поля и multipart отклоняются. Evidence сохраняет автора, время, SHA-256 JSON, unverified и никогда не удаляется новым evidence. Submitted/approved plan становится staleReview при новой версии evidence/analysis. Завершение плана требует результаты всех шагов и явного решения approver; закрытие case требует outcome, evidence и завершенный план с проверенными шагами.
- `apps/api/migrations/versions/0001_demo_persistence.py`: начальная схема Alembic; destructive downgrade отключен. API создает отсутствующие таблицы при startup для локального MVP; для управляемого deployment следует подключить миграции к общей конфигурации интегратора.
- `tests/api/test_workflow.py`: HTTP auth, queue/snapshot identity, run isolation, RBAC, double submit/idempotency, revision conflict, invalid transition, audit, restart persistence, staleReview, JSON/file rejection, immutable analysis/measurement.

## Контракт и интеграция

DTO `packages/domain_contracts` не менялись. `GET /work-plans` и `x-implementation-status` требуют экспорта OpenAPI/TS интегратором: `handoffs/RFC-backend-plan-list.md`. Reference adapter ожидает `API_REFERENCE_FIXTURE_PATH=/app/reference/reference-snapshot.json`, где файл взят из `contracts/fixtures` и смонтирован read-only. Для chart reconstruction отдельный loader/`API_REFERENCE_EXAMPLES_DIR` должен подключить интегратор на этапе 07; сейчас reference series пустой. `API_REFERENCE_FIXTURE_PATH` необязателен; без него reference run не создается. Никакого чтения `data/truth/` нет.

Stage07 вызывает `create_run` и `store_analysis` в своей SQL транзакции, обновляет `RunRow.virtual_time` и соответствующие поля `RunRow.body` при advance. Анализатор в backend отсутствует, расчет не имитируется. `GET /demo/scenarios`, `POST /demo/sessions`, `POST /demo/sessions/{id}/advance` пока явные 501 после auth: интегратор реализует orchestration. `GET /demo/sessions/{id}` читает сохраненный run. `GET /models` пока возвращает пустую страницу, пока stage07 не подключит policy metadata.

## Проверено

- `uv run ruff check apps/api tests/api`: passed.
- `uv run pytest tests/api -q`: 6 passed. SQLite file использован только как тестовый backend; runtime требует PostgreSQL переменные `DB_HOST`/`DB_PASSWORD`.
- Отдельный временный PostgreSQL 17.6 container с случайным credential: HTTP login/snapshot 200, 15 таблиц, сохраненный случай; вторым запуском decision 200, повтор с тем же ключом 200 с тем же ответом, ровно одно audit событие. Контейнер удален, текущий стек проекта не изменялся.
- `uv run pytest tests/contracts -q`: 24 passed, 3 failed. Два падения из-за frozen OpenAPI export (новый list route и implementation status), одно из-за устаревшего stage01 теста, ожидающего бизнес-заглушки и не настроенную БД. Интегратор обновляет export и этот тест после интеграции. `contracts:check` на этой ветке ожидаемо не пройдет до его действий.

## Непроверенное и границы

Не тестировались полный replay, большой 30-дневный набор, параллельные запросы в нагрузке, backup/restore, реальный браузерный cookie за reverse proxy и промышленная безопасность. Файлы не загружаются, поэтому ограничения MIME/size/path применены как запрет бинарного upload; для будущего файлового API нужен отдельный контракт, storage и AV/sanitization policy. `AuditRow` append-only на уровне приложения, не защищен от администратора БД. `create_all` не заменяет управляемые миграции после изменения схемы. База локального прототипа не является источником данных объекта.

Следующий шаг интегратора: экспортировать новый OpenAPI/TS, примонтировать reference fixture, подключить stage07 replay к сервисным функциям и провести E2E на PostgreSQL и браузере. Независимый reviewer должен проверить workflow/security и фактический UI, не опираясь только на эти unit/HTTP проверки.
