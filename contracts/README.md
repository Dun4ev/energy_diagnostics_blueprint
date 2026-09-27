# Контракты v0.1.0: точка синхронизации модулей

## Реализация этапа 01

Канонические DTO находятся в `packages/domain_contracts/models.py`; OpenAPI и обе JSON Schema генерируются командой `npm run contracts:generate`. Drift проверяется через `npm run contracts:check`. Референсные примеры сохранены; дополнительные согласованные fixtures в `contracts/fixtures`. Все бизнес-маршруты пока stubs501. См. `handoffs/RFC-foundation-contracts.md` и `contracts/NUMERICAL_ACCEPTANCE.md`.

## Исходный статус blueprint

В пакете уже есть валидируемые JSON Schema для `Measurement` и `AnalysisResult`, плюс reference fixtures. Это исходный контракт ядра, **не полный готовый OpenAPI**. Примеры очереди/плана/схемы пока являются источниками требований. Интегратор на этапе 01 дополняет `Asset`, `Case`, `Evidence`, `WorkPlan`, `Approval`, `RiskEntry`, `ScenarioSession`, ошибки и paginated responses, генерирует OpenAPI и типы TS. Параллельную feature-разработку запускать только после этой фиксации.

Схема здесь — каноническая семантика стартовых полей. После scaffold канонические Pydantic DTO хранятся в `packages/domain_contracts`, а JSON Schema/OpenAPI генерируются и сравниваются с зафиксированным export в CI. Не поддерживать два независимо редактируемых определения. Изменение поля требует версии и impact review.

## Обязательные договорённости

- Единицы: `degC`, `fraction`, `ms`, `dB_ref_demo`. Display-localization только на frontend.
- Для field-источника будущего коннектора `origin=field`; это разрешение типа, не наличие реальной интеграции. В MVP backend отклоняет field-origin по конфигурации окружения.
- Quality `missing` требует value=null. Quality `good` требует число. Unknown risk — score=null, не 0.
- `failureProbability` в v0.1.0 может быть только null. Изменение требует новой модели, контрактной версии и валидации.
- REFERENCE: `calculationOrigin=presentation_illustration`; modelVersion=null допустим. SIMULATION: `computed`, обязательные modelVersion/policyVersion.
- У measurement единицы согласуются с metric. Диапазон нагрузки в схеме 0–2 технически допускает перегрузку; это не разрешённая эксплуатационная нагрузка.
- Все автоматические рекомендации `requiresHumanApproval=true`. `controlCommandsAllowed=false` и `advisoryOnly=true` — обязательные константы.
- Схема не проверяет всю инженерную семантику. Дополнительно: residual=observed−expected; freshSources≤totalSources; границы окна; монотонные времена; asOf без будущего; интервал мониторинга; правила статусов.

## Предлагаемый набор endpoints для фиксации в этапе 01

| Method / path под `/api/v1` | Назначение | Контракт/важные условия |
|---|---|---|
| POST `/auth/login`; POST `/auth/logout`; GET `/auth/me` | Seeded demo auth | Server-side identity, secure cookie; никаких ролей из тела business mutations |
| GET `/assets` | Реестр | Фильтры, пагинация |
| GET `/assets/{id}` | Паспорт/текущий summary | Отдельно факты и последняя оценка |
| GET `/assets/{id}/measurements` | Ряды | from/to, metric, quality, limit; без скрытой truth |
| GET `/cases` | Реестр случаев | Статус/площадка/приоритет |
| GET `/cases/{id}/snapshot` | Согласованная карточка | Case+Asset+Analysis+Evidence, один snapshotId |
| GET `/cases/{id}/history` | История | Immutable analyses/решения |
| POST `/cases/{id}/decisions` | Инженерное решение | expectedRevision, reason, evidenceIds; explicit permission |
| GET `/risks` | Очередь | Результаты тех же AnalysisRun, не отдельная формула |
| POST `/evidence` | Добавить метаданные/измерение | Проверенный MIME/size; origin/author/time |
| POST `/work-plans` | Проект из случая | caseId, analysisRunId, evidenceRevision |
| PATCH `/work-plans/{id}` | Исправить draft | expectedRevision; после submit не править на месте |
| POST `/work-plans/{id}/submit` | Передать | Idempotency-Key и транзакционный audit |
| POST `/work-plans/{id}/decisions` | Approve/reject | Approver permission, revision, reason |
| POST `/work-plans/{id}/step-results` | Результат шага | исполнитель, evidence, время; не auto-close |
| GET `/demo/scenarios` | Каталог replay | Метаданные; truth файлы не публикуются |
| POST `/demo/sessions` | Новый изолированный run | dataset, seed, virtual time; demo only |
| POST `/demo/sessions/{id}/advance` | Шаг/скорость/пауза | Без изменения бизнес-истории другого run |
| GET `/models` и `/sources` | Версии/качество | Read-only в MVP |
| GET `/health` | Liveness/readiness | Без secrets |

Для reference-режима эти запросы могут иметь отдельный read-model/fixture provider. Общая envelope содержит dataMode и scenarioRunId. Операционное управление оборудованием **не добавлять** в OpenAPI.

## Примеры

`examples/reference-analysis.json` строго соответствует `analysis.schema.json`.
`data/observations/normalized_measurement_examples.json` соответствует `measurement.schema.json`.
Остальные examples — source fixtures, не результаты работающего API. Это различие сохранять в README приложения и handoff.

## Порядок изменения

Feature-агент создаёт `handoffs/RFC-<module>-<topic>.md` с проблемой, текущим и предлагаемым DTO, затрагиваемыми компонентами и миграцией. Только интегратор изменяет контракт/общий lockfile. После экспорта клиентские типы регенерируются, contract tests проходят, затем другие ветки обновляются. Не исправлять проблему с `any`, выключением валидации или вторым «временным» DTO.
