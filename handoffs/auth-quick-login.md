# Локальный быстрый вход: интеграционный handoff

База: f1263096cf38a70e1421059142e92a25106203c2. Последовательная реализация по текущему запросу. Пользовательское изменение docs/runbook/REHEARSAL.md не редактировалось.

## Измененные файлы

- apps/api/auth.py, apps/api/main.py: opt-in быстрый вход только для включенных demo-ролей, отзыв прежней сессии.
- packages/domain_contracts/models.py, contracts/openapi.json, apps/web/src/api/generated.ts: поля quickLogin=false и demoQuickLoginEnabled=false; старые API-запросы совместимы. RFC: RFC-auth-quick-login.md.
- apps/web/src/features/DiagnosticsApp.tsx, features.css, apps/web/src/shell/AppShell.tsx: роли на экране входа, переключатель в профиле, компактная кнопка на мобильном.
- infra/compose.yaml, infra/.env.example: флаг DEMO_QUICK_LOGIN=false по умолчанию.
- docs/runbook/LOCAL.md: включение, отключение и повторный запуск API.
- tests/api/test_workflow.py, tests/live/quick-login.spec.ts: регрессии auth и живой UI.
- verification/quick-login-desktop.png, quick-login-mobile.png: снимки интерфейса.
- Локальный ignored infra/.env: DEMO_QUICK_LOGIN=true; пароли сохранены, значения не выводились.

## Проверки

npm run build: успешно, typecheck и Vite build. Предупреждение о размере chart bundle.
npm run contracts:check: экспорты и клиент совпадают.
uv run --frozen pytest tests/api/test_workflow.py tests/contracts/test_contracts.py -q: 22 passed; deprecation warnings FastAPI/Starlette.
ruff check измененных Python и eslint измененных TSX: успешно.
npx playwright test --config tests/live/playwright.config.ts tests/live/quick-login.spec.ts: 1 passed. Все пять ролей, сохранение URL и заполненной reference-карточки, viewer read-only, выход, ширина 390, отсутствие browser pageerror. Тест не меняет workflow.
Compose api/web пересобраны и активированы; health ok, DB/runtime ready, advisory only, внешняя AI выключена.

## Воспроизведение и возврат

Открыть http://127.0.0.1:8080, обновить страницу, выбрать роль или нажать «Сменить пользователя». Данные и бизнес-права сохраняются; пароли не попадают в браузер.

Для возврата установить DEMO_QUICK_LOGIN=false в infra/.env, выполнить команду пересоздания API из docs/runbook/LOCAL.md и обновить страницу. Уже открытые сессии требуют выхода, чтобы увидеть форму пароля.

## Ограничения и следующий шаг

Полный QA/численные тесты не запускались, независимый reviewer в этом изменении не привлекался. Изменение не затрагивает численные расчеты или workflow-контракты. Следующее интеграционное действие: независимый review auth diff и нового сценария, при необходимости отдельный commit. Публикации/push не выполнялись.
