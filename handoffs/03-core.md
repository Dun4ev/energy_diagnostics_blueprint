# Stage03: deterministic numerical core

Базовый commit: `2be16f3929495846bd71b227ad2ba39fb16dd7a7` (stage01 G1).

## Создано

- `packages/diagnostics/core.py`: `DeterministicAnalyzer.analyze(...) -> AnalysisBundle` по `NumericalAnalyzer` Protocol и `analyze_series(...) -> (AnalysisBundle, list[SeriesPoint])` из того же вычислительного прохода.
- `packages/diagnostics/explanation.py`: русские шаблонные причины и численные фразы только из вычисленных DTO.
- `packages/diagnostics/__init__.py`: публичный импорт.
- `tests/diagnostics/test_core.py`: арифметика, единицы/окна, нагрузочная ступень, расхождение и залипание датчиков, выброс, warm-up, coverage, stale/unsupported, будущие/поздние данные, инвариантность диагноза к названию актива.
- `tests/diagnostics/evaluate_generated.py`: независимый harness только по `data/observations`, с утверждениями для семи синтетических рядов. Не читает `data/truth/`.
- `handoffs/RFC-03-analysis-history-policy.md`: вопросы истории последней валидной оценки и версионирования эвристик.

## Входы, метод, выходы

Вход: нормализованные `Measurement`, `Asset`, `DiagnosticPolicy`, `as_of`, `received_as_of`. Caller ограничивает длину окна, например 30 сутками; ядро не обращается к БД/файлам/HTTP. Оно отсекает будущее событие и позднюю доставку до расчета и hash, разрешает дубли по последнему доступному `receivedAt`. Источники по договоренности: `{assetId}:load`, `:ambient`, `:primary_a`, `:independent_a`, `:phase_b`.

Для transformer с калибровкой модель инициализирует thermal state как `a+b*L0²`, затем применяет first-order recurrence. Первые `5*tau` исключаются из residual-тренда. Нагрузка и ambient выравниваются только назад по времени до 600 с. Контактный residual агрегируется в часовые медианы; наклоны 24/72 ч считаются Theil-Sen. Текущий score использует 72-часовой наклон, frozen веса policy, а при недостаточном покрытии/свежести или спорном датчике становится null/unknown. При расхождении независимого канала спорные residual исключаются, raw observedC остается в `SeriesPoint` с `quality=suspect`. Результат содержит версии, input snapshot hash, provenance sourceIds, причины, неподтвержденные гипотезы, разрешенные action codes и `failureProbability=null`. Forecast выключен. Breaker/cable возвращают `methodStatus=unsupported`, score=null. Ни сигнал, ни recovery не меняют Case/Plan.

Контракт: общий DTO, policy, root config и lockfiles не менялись. `AnalysisResult.mode=simulation`, `calculationOrigin=computed`; `reference` значения не рассчитываются. Текущий `AnalysisBundle` совместим с v0.1.0. Тепловые константы сопоставления каналов принадлежат `modelVersion=deterministic-thermal-0.1.0`, предложены к переносу в policy через RFC.

## Фактическая проверка

- `uv run --offline --frozen pytest tests/diagnostics/test_core.py -q` -> 8 passed.
- `uv run --offline --frozen ruff check packages/diagnostics tests/diagnostics` -> All checks passed.
- `PYTHONPATH=. uv run --offline --frozen python tests/diagnostics/evaluate_generated.py` -> все встроенные synthetic assertions прошли.

Синтетическая оценка на последних ~108 ч каждого ряда: TP-177 residual +11.89 °C, slope72 +0.87 °C/сут, неподтвержденная гипотеза нагрева; TP-204/305 normal, median abs residual 0.14/0.14 °C; TP-306 sensor disagreement, текущий score null; TP-307 insufficient_data из-за отсутствия свежей первичной температуры; TP-308 residual +0.09 °C после восстановления, case не закрывается ядром; TP-309 slope24 +4.48 > slope72 +3.78 °C/сут. Это оценка на синтетике, не field validation и не доказательство точности на другом оборудовании.

## Ограничения и передача

При пропусках нагрузки термальное состояние обновляется после следующей доступной точки по последнему допустимому значению; без истории режима это может ошибаться, и точка/тренд должны рассматриваться осторожно. Простые правила не различают одновременно реальный нагрев и дрейф независимого датчика. Заданные пороги датчиков учебные; location подтверждается соглашением sourceId, отдельного реестра Source ядро не получает. Неизвестные/спорные данные не равны безопасному состоянию. История последней валидной оценки должна храниться и показываться сервисом отдельно. Независимый blind mismatch и полевые данные не проверялись.

Интегратору: использовать адаптер источников с указанными channel sourceIds, ограничивать наблюдения по окну, отдавать `SeriesPoint` через `analyze_series`, сохранить и явно маркировать последнюю валидную оценку, прочитать RFC. Reviewer должен отдельно проверить расчеты и ошибочные сценарии, а также серверные переходы case/plan.
