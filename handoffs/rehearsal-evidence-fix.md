# Исправление репетиционного маршрута

Base: b3a07c551948d97c771d929205bff3e87872eec2. Пользователь разрешил исправление приложения перед созданием полной Canvas-инструкции.

## Проблема и изменение

EvidenceChoice запрещал выбрать unverified, хотя UI создает именно такие записи, а backend требует приложить evidenceIds к результату. Разрешен выбор unverified; rejected остается отключенным. Видимый статус не изменяется, добавлено пояснение: выбор не означает проверку. Согласующий по-прежнему отдельно завершает план и проверяет записанные результаты. Сервер, контракты, permissions, revision checks и аудит не менялись.

Изменения: apps/web/src/features/plan.tsx; tests/live/rehearsal-workflow.spec.ts; docs/runbook/REHEARSAL.md; verification/rehearsal-ui.json; verification/rehearsal-closed.png.

## Фактические проверки

- npm run build: passed (существующее предупреждение о размере chart chunk).
- uv run --frozen pytest tests/independent-workflow/test_step_result_gates.py -q: 2 passed.
- ./node_modules/.bin/eslint apps/web/src/features/plan.tsx: passed.
- docker compose --env-file infra/.env -p energy-diagnostics -f infra/compose.yaml up --build -d --wait web: локальный web обновлен, сервисы healthy.
- ./node_modules/.bin/playwright test -c tests/live/playwright.config.ts rehearsal-workflow.spec.ts: 1 passed, 10.9 s.

UI-тест создал новый синтетический run, прошел case review/evidence/confirmation, план из реальных nextActions (2 шага), смену четырех ролей, выбор непроверенной записи для каждого результата, отдельное завершение согласующим и закрытие случая. Отсутствие кнопки согласования у viewer проверено. Два предыдущих запуска выявили гонки ожидания в самом новом тесте; ожидания появления входа и кнопок результата исправлены. Учебные записи этих запусков сохранены, удаления не было.

Независимый reviewer Luna: обхода контрактов или человеческих проверок не обнаружено. Замечание об устаревшем REHEARSAL.md исправлено.

## Ограничения

Это локальная проверка UI и серверных gates на синтетике, не промышленная валидация и не внешний deployment. Роли и полномочия не расширены. Следующий результат: Canvas-инструкция по прошедшему маршруту.

## Финальный повтор и Canvas

Последний сквозной запуск UI: 1 passed (17.8 s), с дополнительным снимком формы результата verification/rehearsal-result-dialog.png. Во время промежуточных повторов встречались таймауты; причины задержек среды не установлены. Последний проход завершен полностью.

Создан docs/animation/rehearsal/index.html: 38 шагов, 16:9, 7:12, ручной просмотр и автопоказ, тексты полей и реплики в DOM. Canvas проверен через verify.mjs: 432 кадра, JS errors=0, repeatable frames, управление и mobile overflow checks passed. Контрольные листы просмотрены. Контракт API приложения не изменен.
