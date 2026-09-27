# 03 — Чистое вычислительное ядро

Предусловие: G1. Реализуй детерминированную диагностику на observations, без HTTP, UI, database и внешнего AI.

## Прочитать

AGENTS.md; `docs/diagnostics.md`; `docs/data-spec.md`; `config/diagnostic-policy.demo.json`; canonical Asset/Measurement/AnalysisResult DTO; acceptance C01–C10. Не использовать truth при запуске analyzer; независимый тестовый harness может сравнивать с truth после расчёта.

## Владение

OWNED: `packages/diagnostics`, `tests/diagnostics`, handoff/RFC. READ-ONLY: DTO/policy (изменение через RFC), ingestion, API, frontend, root lockfiles и data.

## Выполнить

Реализуй `analyze(observations, assetContext, policy, asOf) -> AnalysisResult`. Для синтетического contact temperature: инерционная baseline, residual, hourly medians, робастный тренд24/72ч, coverage/freshness, persistence/hysteresis, прозрачный pilot score, гипотезы/контраргументы, разрешённые action codes. Проверяй места датчиков и independent corroboration. Missing/stale → unknown, не safe0.

Раздели построение численного результата и русское шаблонное объяснение: числа берутся из структуры, не сочиняются. Укажи modelVersion/policyVersion/inputSnapshotId. `failureProbability=null`. Forecast по умолчанию выключен; его реализация отдельным флагом разрешена только как условная экстраполяция с явными предположениями и без «даты отказа». Полосу с произвольной шириной не называй95%.

Сигнал не подтверждает дефект и не закрывает case: только suggestion/quality. Важные симптомы при потере связи не исчезают в зелёный. Не создавай формулу, специально дающую reference7.2. Не выбирай диагноз по assetId/scenario name. Для breaker/cable либо отдельные ограниченные handlers согласно утверждённому scope, либо честное unsupported; не применять к ним thermal model.

## Приёмка

До реализации зафиксируй тестовые допуски. Пройди exact no-noise arithmetic/units, sign/window trend, нормальную ступень нагрузки, drift disagreement, spike/stuck, insufficient data и no future leakage. Отдельно сверяй generated scenarios и документируй, что это synthetic evaluation, не field validation. Отчёт должен назвать случаи, на которых метод неопределёнен/ошибается. Dependency additions только через интегратора.

## Общие ограничения и завершение

Соблюдай AGENTS.md. Не изменяй READ-ONLY пути и чужие незакоммиченные изменения. Новое поле/зависимость/общая настройка — RFC интегратору, не самовольный обход. Не расширяй задачу до полного цифрового двойника. Не устанавливай сторонние skills/hooks и не подключай внешние сервисы без отдельного разрешения. Не используй truth как вход runtime.

В конце создай `handoffs/03-core.md`: базовый commit, изменённые файлы, входы/выходы, выполненные требования, фактические команды/результаты, непройденные проверки, ограничения и инструкции интегратору. Не объявляй работу завершённой только по успешному build. Честно раздели созданное, протестированное и предложенное.
