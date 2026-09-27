# RFC/ADR-001: фундамент и freeze контракта

Статус: принято интегратором в рамках согласованного G0, 27.09.2026.
Base: e066e6bca7e88536b15411cdce5fe9c12de35060. Это решение этапа01, не разрешение operational функций.

## Совместимость

Measurement/AnalysisResult сохраняют wire schemaVersion 0.1.0 и все исходные поля. Pydantic стал каноническим источником; JSON Schema экспортируется, исходные reference fixtures не правятся. Conditional allOf metric/unit/quality/mode сохранены в schema_rules.py. Добавлены серверные semantic validators (UTC awareness, residual, unknown, freshness counts); schema validation не заменяет server-side semantic validation. Формат JSON Schema изменился ($defs), семантика reference сохраняется.

Новые поля не вставляются в AnalysisResult: AnalysisDetails/AnalysisBundle содержат окна24/72, persistence, counterEvidenceIds, methodStatus, provenance. Unsupported/warm_up требуют null risk и явной причины. Forecast отключен. inputSnapshotId остается ID, hash живет в details. Envelope использует mode, scenarioRunId, dataTime. ScenarioSession содержит scenarioRunId, отдельного конкурирующего ScenarioRun DTO нет.

API расширен GET work-plans/{id}, cases/{id}/series, cases/{id}/analyses и demo/sessions/{id}: иначе экран плана, рядов/истории и восстановление replay после reload не имели бы чтения. История audit и история immutable analyses раздельны. All business routes пока 501, health проверяет реальный PostgreSQL SELECT1. OpenAPI содержит x-implementation-status. Никаких fake success/операционных методов.

## Мутации и auth: контракт для этапа04

Identity извлекается только из server session. Cookie energy_session: HttpOnly, SameSite=Strict, Path=/; Secure=true при HTTPS. Для локального HTTP только на loopback Secure=false является явным demo transport mode, не production default. Все mutations кроме login требуют X-CSRF-Token и Idempotency-Key. Stage04 проверяет origin/CSRF; в stage01 проверяется только наличие headers и форма DTO, авторизация не реализована и все business mutations запрещены 501.

Idempotency scope=(actor, scenarioRunId, method, path, key); payload hash хранить. Повтор с тем же payload возвращает первоначальный статус/ответ без нового audit; иной payload ->409. Запись key/result и mutation/audit в одной транзакции. Хранить на срок жизни run (не удалять раньше), login исключен; logout scope session. Повтор rejected validation до транзакции не резервирует key.

expectedRevision относится к изменяемому aggregate, creation plan использует expectedCaseRevision. Submit/approve проверяют analysisRunId/evidenceRevision и staleReview; исторический план нельзя перепривязать автоматически. Нужна новая draft revision с явным review. Reason обязателен, evidenceIds обязателен как поле; для confirmation/close/completed нужен непустой перечень проверенных evidence и outcome/verification. Эти проверки persistence и permissions реализует stage04.

CASE_TRANSITIONS/PLAN_TRANSITIONS и target permissions экспортируются в workflow.json. case.confirm только explicit server grant. Admin не получает инженерные права. Cancel/supersede у approver; terminal состояния необратимы, кроме описанных rejected->draft новой revision. In-progress/verification отражают проверочные шаги, не команды оборудованию. Открытие detected выполняется worker по аналитике, подтверждение только человеком.

## Данные/источники

Runtime получает только observations. Protocol SourceAdapter имеет as_of и received_as_of; NumericalAnalyzer возвращает AnalysisBundle. Тренд 72ч основной для score, 24ч дополнительный. Initialization thermal state=a+b*L0², warm-up первые 5*tau часов; eventTime и receivedAt отсекаются до расчета. Никакого выбора диагноза по assetId. Все policy thresholds условные и публичные.

Стабильный актив без case имеет caseId=null. Breaker/cable ingest поддерживается этапом02, core этапа03 возвращает insufficient_data/unknown с methodStatus=unsupported. request_measurement из текста спецификации не новый action: использовать VERIFY_TELEMETRY с причиной. Срок simulation48ч от case.openedAt, reference anchor неизвестен.

Evidence stage01/первый срез: JSON note/measurement/thermography_metadata, origin=synthetic. Бинарный upload не обещается: соответствующего endpoint нет. DTO Evidence резервирует uri/hash для будущего RFC upload (MIME/size/path checks обязательны до включения). Нельзя принимать произвольный путь или текст как команду. Это сокращение scope, не скрытая реализация uploader.

## Владение и зависимости

npm/package-lock.json, uv/uv.lock принадлежат интегратору. TypeScript5.9.3 выбран по peer constraints openapi-typescript, а не через force. Node25.1.0/Python3.13.5 закреплены. Backend migrations будут apps/api/migrations, владелец stage04 после G1. Политика/config меняется через интегратора.

DESIGN.md сохраняется с исходным именем/содержимым; тест blueprint должен ссылаться на действительный регистр. Ссылки в исходных prompts читаются как DESIGN.md; документы источника не переписываются массово. .gitignore добавлен до installs. Отсутствующие project skills не устанавливаются.

Риски: синтетика не дает field validation; persistence/auth/workflow пока не реализованы. Новые DTO требуют обновления generated TS и drift tests, любые последующие изменения через RFC.
