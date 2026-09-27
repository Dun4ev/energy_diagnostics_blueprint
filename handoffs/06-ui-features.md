# Этап 06: связанные экраны диагностики

База работы: `dec2ab2` (core на базе G1 и shell stage05). Использованы актуальные типы frozen API для статуса подготовки сценария, списка планов и записи результата шага. Commit stage06 содержит только owned файлы; generated client обновляет интегратор.

## Измененные файлы

- `apps/web/src/features/index.ts`, `DiagnosticsApp.tsx`, `shared.ts`, `queue.tsx`, `case.tsx`, `chart.tsx`, `topology.tsx`, `plan.tsx`, `support.tsx`, `features.css`, `preview.tsx`.
- `tests/ui-features/playwright.config.ts`, `features.spec.ts`, `screenshots/*.png`.
- `handoffs/06-ui-features.md`.

## Входы и выходы

Компонент `DiagnosticsApp` и `featureRegistrations` экспортируются из `apps/web/src/features`. Интегратор подключает компонент к root `main.tsx`. Все запросы идут через типизированный `api`/generated client; собственных DTO, формул риска и обращений к `data/truth` нет. Режим и виртуальное время берутся из `ScenarioSession`/Envelope. Пользовательская роль и CSRF берутся только из `GET /auth/me`; локально сохраняется лишь ID запуска. Создание сессии использует контрактные datasetId/seed/time; экран ждет `processingStatus=ready` перед показом данных.

Очередь показывает риск, качество, свежесть, следующий шаг, фильтры в URL и переход к существующему случаю или активу. Карточка случая показывает серверные observed/expected/residual points, постранично забирает весь ряд, раскрывает доказательства, гипотезы, историю, схему связей и происхождение расчета. Экспорт JSON и печать содержат режим, время, версии и ограничения. План поддерживает проект, подачу, решение, проверочный результат и ревизии; заключение, даты и автор результата видны в таблице шагов. 403/409 видны пользователю без ложного успешного состояния. Минимальные экраны актива, модели и источников закрывают ссылки.

REFERENCE в UI подписан иллюстрацией презентации; SIMULATION отмечен синтетическим расчетом. Неизвестное состояние не трактуется как безопасное. Схема использует отдельные семантические цвета electrical state и подпись происхождения состояния. В reference фикстуре слайдового snapshot схема пуста, поэтому browser-тест подставляет узлы из frozen `reference-topology.json`; runtime берет узлы только с API.

## Фактическая проверка

- `npm run build`: typecheck и Vite build прошли. Предупреждение о размере lazy чанка ECharts 1,12 MB, gzip 372 kB.
- `./node_modules/.bin/eslint apps/web/src/features tests/ui-features`: прошел.
- `./node_modules/.bin/playwright test -c tests/ui-features/playwright.config.ts`: 3 теста прошли. Проверены единый analysisRunId и числа queue/case, reference маркировка, постраничная загрузка всех 15 точек, схема связей, 1440/1920/390 px без переполнения документа, 409/403 и CSRF/UUID/revision для решения по плану.
- Снимки: `tests/ui-features/screenshots/queue-1440.png`, `case-1440.png`, `case-1920.png`, `case-390.png`, `plan-1440.png`.

Зависимости установлены из локального npm cache через `npm ci --offline --ignore-scripts`; команда прошла, но среда Node 22/npm 10 ниже объявленных Node 25/npm 11. Проверка в целевой версии Node остается за интегратором.

## Ограничения и интеграция

Тесты используют контрактный reference fixture и Playwright route mocks; живой backend и полный межролевой workflow в этом worktree не проверялись. Root интегратор должен подключить `DiagnosticsApp`, использовать актуальный generated client, проверить вход engineer → approver → technician на live backend и подтвердить UI реального 30-дневного simulation. При изменении frozen API обновлять только generated client через интегратора. Браузерные снимки подтверждают только представление и взаимодействия, а не точность численной модели.
