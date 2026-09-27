# 04 — Backend, доказательства и согласование

Предусловие: G1. Реализуй хранение, права и workflow на frozen contract, используя stub NumericalAnalyzer interface, пока core не интегрирован.

## Прочитать

AGENTS.md; architecture целиком; contract definitions; design разделы7–11; acceptance W01–W10/S01–S08.

## Владение

OWNED: `apps/api`, `tests/api`, backend-specific migrations (в согласованном каталоге), handoff/RFC. READ-ONLY: root settings/lockfiles, contracts, worker, ingestion/core, frontend. Backend migrations — один владелец; не конфликтовать с scaffold интегратора.

## Выполнить

Создай persistence моделей assets/sources/measurements/immutable analyses/cases/evidence/plans/approvals/audit. Реализуй API по каноническому OpenAPI, включая согласованный CaseSnapshot. Очередь и case читают один AnalysisRun. Не дублируй numerical policy.

Реализуй server-side auth seeded demo users и роли. Создание проекта, редактирование только разрешённых ревизий, submit, approve/reject, результаты шага, инженерное подтверждение и закрытие проходят явные permissions/transition validation. Mutations: Idempotency-Key, expectedRevision, reason, transactional audit. Не принимай роль/actor из непроверенного body. Конфликт —409, permission—403, invalid transition—422.

Доказательства имеют автора, тип, время, hash/uri, verified state; file uploads ограничены MIME/size/path. Не исполняй SVG/HTML из файла. Старый evidence не удаляется при новом. Появление новой analysis/evidence revision помечает submitted plan как требующий повторного review. Нет auto-close от нормальной температуры.

Сделай query/indexing/pagination достаточными для demo dataset. В реальном режиме внешняя интеграция отсутствует и не имитируется. Не открывай control endpoints. Не создавай реальный наряд-допуск: лишь metadata/external reference.

## Приёмка

Проверки persistence после перезапуска, replay run isolation, RBAC через HTTP, двойной submit, revision conflict, invalid transition, audit completeness, file validation и same snapshot across views. Заглушка analyzer помечена; не выдавай её за вычислительное ядро до stage07.

## Общие ограничения и завершение

Соблюдай AGENTS.md. Не изменяй READ-ONLY пути и чужие незакоммиченные изменения. Новое поле/зависимость/общая настройка — RFC интегратору, не самовольный обход. Не расширяй задачу до полного цифрового двойника. Не устанавливай сторонние skills/hooks и не подключай внешние сервисы без отдельного разрешения. Не используй truth как вход runtime.

В конце создай `handoffs/04-backend.md`: базовый commit, изменённые файлы, входы/выходы, выполненные требования, фактические команды/результаты, непройденные проверки, ограничения и инструкции интегратору. Не объявляй работу завершённой только по успешному build. Честно раздели созданное, протестированное и предложенное.
