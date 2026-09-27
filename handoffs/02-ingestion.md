# Этап 02: ingestion и replay

## Основа и изменения

- Базовый commit G1: `2be16f3929495846bd71b227ad2ba39fb16dd7a7`.
- Изменены только OWNED пути: `packages/ingestion/`, `tests/ingestion/` и этот handoff.
- DTO, OpenAPI, схемы, manifests, lockfiles и приложения не менялись.
- `SyntheticAdapter` структурно реализует `SourceAdapter.observations`; обязательные аргументы Protocol сохранены. Дополнительный keyword-only `since` необязателен и совместим с прежними вызовами.

## Входы, выходы и mapping

Адаптер принимает путь непосредственно к `data/observations`. Он возвращает 9 канонических `Asset`, 37 канонических `Source` и поток `Measurement`. Широкие строки gzip CSV разворачиваются в load, ambient, primary A, independent A и phase B. Для пустого значения создается `value=null, quality=missing`. JSON-массивы breaker/cable и JSONL transport fixture читаются инкрементально; события выключателя и суточные кабельные значения не интерполируются.

Source IDs зафиксированы в `packages/ingestion/README.md`: `{assetId}:load`, `:ambient`, `:primary_a`, `:independent_a`, `:phase_b`, `:event`, `:daily`. Единицы и metric согласованы с `Measurement` DTO. `measurementId` широкого CSV имеет вид `{record_id}:{channel}`; для JSONL сохраняется исходный measurement ID, а legacy source ID переводится в канонический.

`as_of` ограничивает `eventTime`, `received_as_of` ограничивает доступность по `receivedAt`. Опциональный `since` включает нижнюю границу `eventTime >= since` и отбрасывает старые CSV строки до преобразования значений и создания DTO. Gzip все равно декомпрессируется с начала файла. Порядок совпадает с порядком исходных файлов и стабилен между повторными replay.

Дедупликация выполняется по `(measurementId, sourceId, eventTime)`. Для основного потока ключи хранятся во временном SQLite индексе, поэтому память не растет с числом наблюдений. Нормализованный test fixture содержит 33 пакета и выдает 30 уникальных Measurement; у позднего пакета остается исходный `receivedAt` на 20 минут позже `eventTime`.

Quarantine сохраняет логическую ссылку на файл и строку/элемент, причину и raw поля. Callback `quarantine_sink` получает все записи; свойство `quarantine_records` хранит последние 1000 записей для диагностики. Невозможная хронология `eventTime > receivedAt`, пустые/naive timestamps, неверные значения, единицы и контрактные семантики отклоняются. В фикстурах нет доверенного источника времени, поэтому отдельный порог clock drift не придуман.

В `assets.json` у breaker и cable отсутствует обязательный DTO `demoConsequenceWeight`; адаптер подставляет `0.5`, нейтральное значение reference fixture. Это только синтетический placeholder, не оценка последствий; thermal analyzer должен оставаться ограничен трансформаторами. В breaker/cable raw записи также нет `receivedAt`; для них адаптер использует `eventTime` как время поступления.

Публичный manifest указывает диапазон eventTime наблюдений `2026-06-24T07:40:00Z` — `2026-07-24T07:40:00Z`. Runtime адаптера обращается только к переданному каталогу observations и не открывает `data/truth/`.

## Проверки

Из worktree этапа 02, с уже существующим root `.venv` Python 3.13:

```bash
/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint/.venv/bin/python -m pytest -q tests/ingestion/test_adapter.py
/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint/.venv/bin/python -m ruff check packages/ingestion tests/ingestion
/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint/.venv/bin/python -m ruff format --check packages/ingestion tests/ingestion
/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint/.venv/bin/python -m compileall -q packages/ingestion tests/ingestion
git diff --check
```

Фактический результат: `6 passed` (последний запуск 19.81 s); Ruff lint и format прошли; compileall и `git diff --check` завершились без ошибок. Полный streaming test обработал 302497 Measurement: 302435 из широких рядов плюс 31 breaker event и 31 cable sample, с проверкой Python peak allocation ниже 32 MiB и повторяемого порядка.

## Ограничения и интеграция

- `since` сокращает число созданных DTO, но сжатый CSV нельзя быстро перемотать к этому времени; для каждого replay он все еще читается последовательно.
- Исторический receive time отсутствует в breaker/cable файлах, поэтому там он равен event time.
- Свежесть и cadence источников заданы синтетическими значениями в адаптере; их нельзя трактовать как политику реального оборудования.
- Проверка timestamp drift ограничена невозможной последовательностью времени и UTC/asOf cutoffs; отдельная clock-drift tolerance требует решения владельца данных.
- OPC UA/IEC, сетевой discovery, внешние AI и управление оборудованием не реализованы.

Следующий шаг интегратора на этапе07: передавать `since=as_of - timedelta(hours=108)` в `observations`, сохранив `scenario_run_id`, `as_of` и `received_as_of`. Для сценариев можно брать временные границы из публичного `data/manifest.json`, без выбора диагнозов по имени или asset ID.
