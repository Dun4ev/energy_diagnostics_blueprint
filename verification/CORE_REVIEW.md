# Независимая численная проверка этапа 03

Проверялся baseline интеграции `d063f2a23900d83242bb60067acacccbbc87449b` без изменения production. Затем для повторной проверки в QA worktree cherry-pick исправлений интегратора `13a7c38` как `6c3b668` и `f0da3c9` как `6b3d9d6`. Это проверка синтетического ядра, не оценка точности на реальном оборудовании и не полная приемка G4.

## Проверки и результаты

Независимые black-box тесты в `tests/independent-core/test_numerical_review.py` используют только публичный `DeterministicAnalyzer` и frozen policy. Ряды созданы в тесте; `data/truth/` не открывался. Проверены точная baseline, warm-up 5 tau, unsupported breaker/cable, покрытие72ч и unknown/null, exclusion спорного residual при сохранении raw, отсутствие future/late leakage, линейный наклон24/72, состоявшаяся persistence, recovery, уникальность analysis identity по времени/policy/calibration/asset/run и explicit run mismatch.

На исходном `d063f2a` результат был `3 passed, 3 xfailed`: три xfail воспроизводили реальные дефекты. При одинаковых наблюдениях и разном `as_of` возвращался один `analysisRunId=analysis-4abbf1de84448037dee61982` для `risk.score=1.0/status=normal` и `risk.score=null/status=insufficient_data`. Одиночный пик давал `persistenceMinutes=0.0`, но `status=requires_review`. Пустые активы делили `analysis-4f53cda18c2baa0c0354bb5f` с `scenarioRunId=unknown-run`, непригодным для сохранения в конкретном run.

Исправление `13a7c38` закрыло эти три регрессии: после снятия xfail проверка дала `7 passed`. `inputSnapshotHash` остался хешем наблюдений; `analysisRunId` стал зависеть от полного контекста расчета. Пустой вход теперь принимает явный `scenario_run_id`, а несовпадающие измерения отклоняются. Hysteresis активируется после выдержки порога.

Дополнительно выявлен дефект **P2, исправлен `f0da3c9`**: при 5-минутных показаниях с превышением порога на интервале60мин спорная точка посередине получала `quality=suspect, residualC=null`, но `_persistence` фильтровал ее и соединял соседние валидные точки через 10мин. До исправления получалось `persistenceMinutes=60.0`, `status=requires_review`, `risk=3.5`. Исправление прерывает непрерывность на спорном/отсутствующем residual. Регрессия `test_disputed_midpoint_breaks_sixty_minute_persistence` теперь проходит без xfail.

Команды в QA worktree:

```text
uv run --offline --frozen pytest tests/independent-core -q --tb=short -rx
uv run --offline --frozen ruff check tests/independent-core
uv run --offline --frozen pytest tests/diagnostics/test_core.py -q --tb=short
PYTHONPATH=. uv run --offline --frozen python tests/diagnostics/evaluate_generated.py
rg -n 'data/truth|truth/|true_fault|profile' packages/diagnostics packages/domain_contracts/ports.py
```

После обоих исправлений: независимые `8 passed`; ruff passed; авторские core-тесты `8 passed`; packaged synthetic harness завершился без ошибки. Последний прогон harness: TP-177 residual +11.89 °C/slope72 +0.87 °C/сут, TP-306 unknown/null при расхождении датчиков, TP-307 unknown/null при недостатке данных, TP-308 residual +0.09 °C после восстановления. Поиск truth-ссылок в runtime-модулях пуст. Harness автора подтвержден запуском, но не подменяет независимые тесты.

## Границы вывода

Числа проверены на точной и packaged synthetic-калибровке. Blind mismatch и реальные полевые данные не проверялись. Результаты не доказывают эксплуатационные пороги, модель ресурса или вероятность отказа. Сохранение старой валидной оценки при потере связи, UI/экспорт и workflow должны проверяться отдельно интеграционным reviewer.
