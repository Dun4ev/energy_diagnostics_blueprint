# 02 — Наблюдения, валидация и адаптер источника

Предусловие: G1, фиксированный commit контрактов. Ты отвечаешь только за ingestion-библиотеку, не backend workflow и не графики.

## Прочитать

AGENTS.md; `docs/data-spec.md`; разделы2–4/7 architecture; Measurement DTO; `data/manifest.json`; bounded sample `normalized_measurement_examples.json`; `scripts/generate_demo.py` как спецификацию источника, не готовый анализатор.

## Владение

OWNED: `packages/ingestion`, `tests/ingestion`, собственный handoff/RFC. READ-ONLY: generated `data`, `contracts`, root manifests, `apps/api`, `apps/worker`, `packages/diagnostics`, `apps/web`.

## Выполнить

Реализуй SourceAdapter, читающий CSV.gz потоком и выдающий нормализованные Measurement. Широкая строка разворачивается в отдельные load/ambient/tempA/independentA/tempB sources с явными единицами и местами. Фаза/источник/asset не смешиваются. `temp_a_c` пусто означает null+missing.

Проверяй единицы, идентификаторы, eventTime/receivedAt, допустимость DTO, timestamp drift, некорректный value; сохраняй raw record reference и причины quarantine. Сделай идемпотентную dedup policy по measurementId/source/time, не удаляя историю задержек. Поддержи late-arriving/out-of-order данные, не пересматривая прошлый immutable analysis молча.

Предоставь библиотечный cursor/iterator для replay с заданным asOf и виртуальным received time; он не создаёт UI сессию и не меняет case state. Выключатель/кабель — отдельные readers: событие операции и суточный sample, без бессмысленной 5-минутной интерполяции.

Runtime путь ограничен observations. Не передавай labels, true_heat или profile в analyzer. Не делай сетевой discovery/промышленные драйверы. Реальный adapter пока только Protocol/interface и документированный mapping.

## Приёмка

Тесты считывания compressed data, отсутствующих значений, incompatible unit rejection, dedup33→30, поздней доставки и отсутствия будущих точек в asOf. Проверить bounded memory и воспроизводимость порядка. Контрактные результаты доступны backend/core без import циклов. Не заявляй, что реальный OPC UA/IEC-коннектор создан.

## Общие ограничения и завершение

Соблюдай AGENTS.md. Не изменяй READ-ONLY пути и чужие незакоммиченные изменения. Новое поле/зависимость/общая настройка — RFC интегратору, не самовольный обход. Не расширяй задачу до полного цифрового двойника. Не устанавливай сторонние skills/hooks и не подключай внешние сервисы без отдельного разрешения. Не используй truth как вход runtime.

В конце создай `handoffs/02-ingestion.md`: базовый commit, изменённые файлы, входы/выходы, выполненные требования, фактические команды/результаты, непройденные проверки, ограничения и инструкции интегратору. Не объявляй работу завершённой только по успешному build. Честно раздели созданное, протестированное и предложенное.
