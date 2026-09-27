# 07 — Интеграция и демонстрационный replay (интегратор)

Предусловия: G2 по ingestion/core/backend/UI, совместимые commits контрактов. Цель — один работающий vertical slice без внешней AI и без MSW.

## Прочитать

AGENTS.md; все stage handoffs; architecture; contracts; acceptance; data-spec.

## Владение

OWNED: `apps/worker`, `infra`, root integration configs/router, `tests/integration`, docs/runbook, contract exports/lockfiles при согласованных RFC. Module production fixes передавать владельцу либо брать явно последовательным change, не редактировать параллельно его ветке.

## Выполнить

Слей ветки по очереди с tests после каждой. Подключи SourceAdapter→persisted observations→jobs→pure core→immutable AnalysisRun→case/risk read-model. Worker должен быть идемпотентным; case не создаётся каждые5мин заново.

Сделай управляемый Clock и ScenarioSession: пауза, шаг, скорости, конец данных, новый run при reset/перемотке. Временная давность и сроки считают виртуальное время. Reference provider отдельно от simulation provider, source marker везде. Подключи UI к реальному API; MSW недоступен в integrated build.

Проведи весь сценарий: нормальный период, рост остатка, недостаток доказательств, проект плана, submit/approve, результат, повторная проверка. Отдельно drift, normal load rise, data loss. Не подменяй реальные вычисления curated numbers. Никаких потребностей в API key/Internet при обычном запуске.

Compose публикует только приложение на localhost; storage volumes и seed команды документированы. Монтируется observations, не truth. Seeded passwords берутся из env; .env.example без рабочих секретов. Добавь health/readiness и понятный runbook start/stop/reset/backup/restore.

## Приёмка G3

Чистый запуск по README; два разных браузерных пользователя; сохранение после перезапуска; same snapshot consistency; approval409/403/idempotency; worker duplicate jobs; отключение сети и восстановление; работа без external AI. Укажи фактическое время/окружение, не общие обещания производительности. Передай независимому QA commit и runnable commands.

## Общие ограничения и завершение

Соблюдай AGENTS.md. Не изменяй READ-ONLY пути и чужие незакоммиченные изменения. Новое поле/зависимость/общая настройка — RFC интегратору, не самовольный обход. Не расширяй задачу до полного цифрового двойника. Не устанавливай сторонние skills/hooks и не подключай внешние сервисы без отдельного разрешения. Не используй truth как вход runtime.

В конце создай `handoffs/07-integration.md`: базовый commit, изменённые файлы, входы/выходы, выполненные требования, фактические команды/результаты, непройденные проверки, ограничения и инструкции интегратору. Не объявляй работу завершённой только по успешному build. Честно раздели созданное, протестированное и предложенное.
