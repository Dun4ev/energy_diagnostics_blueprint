# Этап 08: независимая UI/integration приемка

База reviewer worktree: `989a5a6`; проверенный production build: `2e3617d` на `http://127.0.0.1:8080`. Я реализовал backend этапа 04, но не писал UI и replay. Мой backend ранее независимо проверен другим reviewer (`verification/WORKFLOW_REVIEW.md`), численное ядро отдельно проверено в `verification/CORE_REVIEW.md`.

Изменены только `tests/final-qa/acceptance.spec.mjs`, `tests/final-qa/playwright.config.mjs`, `verification/PROTOTYPE_ACCEPTANCE.md`, 24 снимка `verification/final-qa-*.png` и этот handoff. Production/контракты/инфраструктура не менялись. Временная локальная ссылка `node_modules` на зависимости основного checkout удалена перед commit. Контракт API 0.1.0 не менялся.

Фактический прогон:

```text
QA_ENV_FILE=/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint/infra/.env node_modules/.bin/playwright test -c tests/final-qa/playwright.config.mjs
3 passed (35.1 s), Chromium 153.0.8010.12
```

Реальный browser/API прогон подтвердил REFERENCE vs SIMULATION и export/print mode/time, T-2 unknown, ранний replay +1 час, поздний case evidence/decision/plan через UI, viewer approve 403 с действительным CSRF, stale submit 409 с сообщением, asset без case, loading/empty/404/offline/recovery, 390/1024/1440/1920 и CSS zoom125. В снимках вручную проверены читаемость, отсутствие горизонтального overflow документа, мобильная навигация и ось графика после исправления. Непредвиденных 5xx/внешних запросов/консольных ошибок в проверенном сценарии не зафиксировано. Полная матрица и границы находятся в `verification/PROTOTYPE_ACCEPTANCE.md`.

Не повторял собственноручно весь Python/Vitest/build/backup suite интегратора; его конкретные команды и результаты приведены в `handoffs/07-integration.md`. Это не проверка полевой точности и не разрешение на подключение к оборудованию. Единственное остаточное UX замечание низкой важности: мобильная таблица рисков требует горизонтальной прокрутки без явной подсказки. REFERENCE не содержит live seeded plan по согласованной границе; SIMULATION plan проверен.

Интегратору: перенести этот commit поверх текущего проекта, выполнить `node_modules/.bin/playwright test -c tests/final-qa/playwright.config.mjs` при запущенном локальном Compose и настроенном ignored `infra/.env`, сохранить 24 снимка с отчетом. Повторный прогон создает новые demo runs, но не удаляет прежние. Решение reviewer: локальный advisory demo принять, field validation не принимать.
