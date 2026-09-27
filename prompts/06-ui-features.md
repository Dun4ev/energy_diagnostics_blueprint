# 06 — Связанные экраны диагностики

Предусловия: G1 и готовый интерфейс компонентов stage05. Реализуй три связанных маршрута по design.md. До stage07 используй MSW только на замороженных контрактах с явной маркировкой mock/reference.

## Прочитать

AGENTS.md; design.md; reference-slide29 визуально; component handoff05; generated API client; reference examples; architecture transitions.

## Владение

OWNED: `apps/web/src/features`, `tests/ui-features`, handoff/RFC. READ-ONLY: design-system/shell, root router/lockfiles, DTO, API/core. Экспортируй route registrations из своего каталога; общую сборку выполняет интегратор.

## Выполнить

1. Risk queue: фильтры/сортировка/свежесть/next step, переход по существующему caseId или в asset без case. Не отображай все строки как одинаковые температурные датчики.
2. Case: title/meta, observed/expected chart и residual view, freshness/evidence drawer, гипотеза/альтернативы, numerical facts with provenance, topology model state, stepper/history. Только один AppShell. Forecast условный и отдельный либо честно отсутствует. Не вычисляй score/trend в React.
3. Plan: шаги/сроки/условия/ответственные/evidence, draft save, submit, approve/reject, результат проверки. Привязывай к analysis/evidence revision. Пока API не отвечает, не показывай одобрение успешным.
4. Asset/model-source minimal screens для ссылок; не делай десятки пустых будущих модулей. Printable HTML/JSON export содержит mode/origin/time/versions и ограничения.

Реализуй loading/empty/partial/stale/offline/403/409, keyboard навигацию, сохранение URL-фильтров. Референсные7.2/80/68/12 маркируются как иллюстрация; simulation получает computed результаты. Согласование не выполняется изменением localStorage роли. Последние данные при offline видны, но явно устарели.

## Приёмка

Фактический browser review минимум1440/1920 и узких размеров, screenshot paths, interactions test, единые цифры/analysisRunId между экраном и очередью. MSW handlers строго соответствуют API. Не отмечай интеграцию завершённой до отключения mocks в stage07.

## Общие ограничения и завершение

Соблюдай AGENTS.md. Не изменяй READ-ONLY пути и чужие незакоммиченные изменения. Новое поле/зависимость/общая настройка — RFC интегратору, не самовольный обход. Не расширяй задачу до полного цифрового двойника. Не устанавливай сторонние skills/hooks и не подключай внешние сервисы без отдельного разрешения. Не используй truth как вход runtime.

В конце создай `handoffs/06-ui-features.md`: базовый commit, изменённые файлы, входы/выходы, выполненные требования, фактические команды/результаты, непройденные проверки, ограничения и инструкции интегратору. Не объявляй работу завершённой только по успешному build. Честно раздели созданное, протестированное и предложенное.
