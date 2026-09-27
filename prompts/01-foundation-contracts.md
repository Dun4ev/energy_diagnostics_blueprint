# 01 — Scaffold и общий контракт (только интегратор)

Предусловие: G0 принят, рабочая папка и разрешения на локальную установку определены. Создай минимальный фундамент, не полноценный интерфейс или алгоритм.

## Прочитать

AGENTS.md; `docs/architecture.md`; `contracts/README.md`; обе JSON Schema; reference fixtures; `docs/implementation-plan.md`; разделы5–6 design.md.

## Владение

OWNED: корневые manifests/lockfiles, `packages/domain_contracts`, `contracts`, test/build configs, `infra`, scaffolds `apps/api`, `apps/worker`, `apps/web`, CI skeleton. После G1 feature-файлы передаются владельцам. READ-ONLY: reference images, generated observations/truth, исходная design specification (правки только отдельным RFC).

## Выполнить

Создай выбранный React/TS/Vite + FastAPI/Python + PostgreSQL монорепозиторий. Зафиксируй совместимые dependency versions, один frontend lockfile и один Python dependency lock. Создай build/test/typecheck/lint команды и локальный Compose skeleton с портом приложения только на localhost.

В `packages/domain_contracts` определи канонические Pydantic DTO: Measurement, AnalysisResult, Asset, Evidence, Case, WorkPlan/Step, Approval, RiskEntry, ScenarioSession, APIError. Сохрани смысл стартовых JSON Schema. Определи все переходы и роли из architecture. Экспортируй OpenAPI/JSON Schema и сгенерируй TypeScript клиент/типы; не веди вторую ручную копию DTO.

Создай типизированный API service interface, contract fixtures и MSW handlers для независимой разработки frontend. На этом этапе mock может возвращать REFERENCE, но всегда с правильным mode. Создай extension points источника, NumericalAnalyzer, Clock, EvidenceRepository, DecisionAdvisor (disabled). Зафиксируй API snapshot/revision/idempotency/error contract. Полные маршруты берутся из contracts/README.md; при уточнении решений записывай ADR.

Отдельно вынеси конфигурацию бренда/семантических цветов и feature registry. Никаких operational endpoints. Никакой runtime mount truth. Root router пока только регистрирует пустые feature exports, не делает недействующие красивые панели.

## Приёмка G1

Чистый install/build/typecheck; Python imports; valid reference contract; generated TS compile; contract drift test; одинаковая JSON семантика на обеих сторонах; local health check. Зафиксируй base commit для stages02–05. Укажи, какие методы пока stubs и запрещены для claims о готовности. После G1 не меняй shared contract параллельно без RFC.

## Общие ограничения и завершение

Соблюдай AGENTS.md. Не изменяй READ-ONLY пути и чужие незакоммиченные изменения. Новое поле/зависимость/общая настройка — RFC интегратору, не самовольный обход. Не расширяй задачу до полного цифрового двойника. Не устанавливай сторонние skills/hooks и не подключай внешние сервисы без отдельного разрешения. Не используй truth как вход runtime.

В конце создай `handoffs/01-foundation.md`: базовый commit, изменённые файлы, входы/выходы, выполненные требования, фактические команды/результаты, непройденные проверки, ограничения и инструкции интегратору. Не объявляй работу завершённой только по успешному build. Честно раздели созданное, протестированное и предложенное.
