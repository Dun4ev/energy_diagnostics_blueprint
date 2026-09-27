# Независимое ревью G1 foundation

База: `d1c9cd02256feee19c985a08817edb55162e2d32`, detached worktree `foundation-review`. Проверка проводилась до исправлений интегратора. Вердикт: **G1 пока не замораживать**. Business routes честно возвращают 501; отсутствие готовых auth, core и workflow не считается дефектом этапа 01.

## Блокеры

1. **P1: Python принимает JSON-значения, которые каноническая JSON Schema отвергает.** `DTO` не включает strict-валидацию (`models.py:47-48`), а числовые поля объявлены как `float`/`int` (`models.py:23-24,60,88,121`). Поэтому `Measurement.value=true` или `"80"`, `AnalysisResult.risk.score=true` или `"7.2"`, `quality.freshSources=true` принимаются Pydantic, хотя экспортированная схема отвергает их. Это нарушает критерий G1 «одинаковая JSON семантика на обеих сторонах» и может незаметно превратить `true` в числовой риск или телеметрию. Воспроизведение: `pytest tests/contracts/test_independent_review.py -q`, пять strict xfail. Исправить строгую JSON-валидацию чисел/целых/булевых во всех wire DTO и добавить отрицательный корпус в drift/contract tests. Не менять schema так, чтобы она принимала строки или bool.

2. **P1: Envelope допускает ложный mode/run/time для вложенного снимка.** `Envelope` (`models.py:548-554`) не сверяет `mode` и `scenarioRunId` с `AnalysisResult` и `CaseSnapshot`, а `dataTime` с текущим `analysis.asOf`. Из валидного `reference-snapshot.json` замена только envelope `mode="simulation"`, `scenarioRunId="other-run"` или `dataTime` на предыдущий день все еще принимается. `ScenarioSession` также принимает `dataTime`, отличный от `virtualTime`. Это позволяет UI/экспорту маркировать REFERENCE как SIMULATION и смешивать run или виртуальное время. Воспроизведение: четыре strict xfail в независимом тесте. Проверить связи на всех envelope response DTO, включая страницы и историю; для текущего snapshot нужна согласованность времени, для истории достаточно `asOf <= dataTime`.

3. **P1: Evidence может содержать измерение другого asset/run.** `Evidence` (`models.py:231-246`) не сравнивает `measurement.assetId`/`scenarioRunId` со своими полями. `CaseSnapshot` проверяет только внешний Evidence (`models.py:493-497`), поэтому валидирует снимок с чужим вложенным измерением. Это нарушает происхождение evidence и изоляцию демонстрационных run. Один strict xfail в тесте. Нужна проверка на границе DTO и серверное связывание с case/source при записи.

## Важные замечания до feature-этапов

4. **P2: Порядок времен измерения не проверяется.** `Measurement` принимает `receivedAt` раньше `eventTime` (`models.py:58-83`), несмотря на требование монотонности в `contracts/README.md` и ограничение входа по `receivedAt` в архитектуре. Один strict xfail. Либо отклонять такой пакет, либо явно описать и тестировать политику часов источника; молча включать его в replay нельзя.

5. **P2: Reference-моки игнорируют идентичность запроса.** `apps/web/src/api/mocks.ts:8-13` отдает один и тот же reference snapshot/risks для любого `:id`, `scenarioRunId` и фильтров. Эти моки не подключены к entry point, поэтому runtime дефекта сейчас нет. Перед stage05 ограничить их известным reference run/case и возвращать 404/501 на остальные запросы, чтобы фронтенд не привык к смешению run.

## Положительные проверки и ограничения

- Файл `contracts/openapi.json` полностью равен OpenAPI, который отдает `TestClient(app).get('/openapi.json')`; все business paths помечены `x-implementation-status=stub`, health помечен `implemented` и GET risks возвращает 501. Это проверяет серверный артефакт в данном worktree, не внешний деплой.
- `python -m packages.domain_contracts.export --check` завершился `Contract exports match`. Исходные contract tests: `15 passed`. Независимые tests: `1 passed, 11 xfailed` (strict xfail воспроизводят перечисленные дефекты). После исправлений снять соответствующие xfail-маркеры: xpass намеренно считается провалом.
- В `infra/compose.yaml` нет mount `data/truth/`; Docker ignore backend также не включает truth. Поиск runtime-модулей не выявил чтения truth. Compose здесь не запускался; live health и browser smoke проверял интегратор отдельно.
- Тесты запускались через существующий root `.venv/bin/python` с `PYTHONPATH=.`; установки зависимостей и чтения `.env` не было. `StarletteDeprecationWarning` от TestClient не влияет на выводы.

Изменены только `handoffs/review-01.md` и `tests/contracts/test_independent_review.py`. Production код, контракты, lockfiles и fixtures не менялись; совместимость wire-контракта сохранена. Следующее действие интегратора: исправить P1, согласовать временную семантику P2, прогнать независимые тесты без xfail и повторить contract export/typecheck перед freeze G1.

## Повторная независимая проверка исправлений

Проверен основной checkout `/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint` после исправлений интегратора. HEAD по-прежнему `d1c9cd02256feee19c985a08817edb55162e2d32`; **исправления на момент проверки не закоммичены**. Эта запись подтверждает состояние конкретного fixset, а не нового G1 commit.

Точные файлы проверенного fixset, SHA-256:

- `packages/domain_contracts/models.py`: `7dffd8cf6def78f7bcc0268a8cccc3fdaa878647885c5eb8cfabe459d3220683`
- `apps/web/src/api/mocks.ts`: `7a8d90dcf6ca4515dd872dde53c709f8371379c641394b33e3964c9024ae5e34`
- `contracts/openapi.json`: `83a7c687bb1745f6029b3d253213e4be06787db5da2e52efba1c5901df36ce95`
- `tests/contracts/test_independent_review.py`: `f8af46820aef49d46b7592a7d0eedf216e523549c615b51d1402508d9270f3cd`
- `contracts/fixtures/wire-corpus.json`: `b60c570ed72c998435a1b7716b3091158074464536dc103ab841e79672e0a122`
- `tests/frontend/contracts.test.ts`: `d6a3999ad2c68d12afffa7efde9380d59e3c0ee13c595cbfbc99fa50357f0731`

Read-only команды в основном checkout и результаты:

- `PYTHONPATH=. .venv/bin/python -m pytest tests/contracts -q` -> **27 passed** (включая 12 независимых тестов без xfail), одно предупреждение Starlette/httpx.
- `PYTHONPATH=. .venv/bin/python -m packages.domain_contracts.export --check` -> **Contract exports match**.
- `npm run contracts:check` -> **Contract exports match; Generated TS matches OpenAPI**.
- `npm test` -> **21 passed**; предупреждение Node localstorage-file.

Просмотр diff подтвердил строгие Number/Integer/boolean/timestamp types, проверку `eventTime <= receivedAt`, рекурсивную сверку вложенных run/mode и границы времени в Envelope, совпадение времени текущего snapshot и session, проверку provenance вложенного Evidence. MSW теперь отвергает чужие case id/run; frontend-тест это покрывает. **P1 1-3 и P2 4 закрыты в проверенном fixset.** P2 5 закрыт по идентичности id/run. Фильтры `/risks` (`priority`, `siteId`, `includeNormal`, пагинация) reference-мок еще не применяет; это оставшаяся граница мока для stage05, не блокер заморозки G1 при его явной contract-only маркировке.

Новый итог: **по проверенным контрактным блокерам G1 можно замораживать после фиксации именно этого fixset**. Сборка/CI/browser/Compose и промышленная достоверность этой повторной проверкой не подтверждаются; интегратор проверяет соответствующие части отдельно.

## Финальная проверка reference-мока

В основном checkout повторно проверены `apps/web/src/api/mocks.ts` (SHA-256 `78d5ae87fe3b802a7437267f9fc6d24cfe37c9436d6eff14e02236b12faff991`) и `tests/frontend/contracts.test.ts` (SHA-256 `83885a18d0dfc191366e702143e30f7c79a0521e0ada0dec1849c3ab604d90e9`). HEAD остается `d1c9cd02256feee19c985a08817edb55162e2d32`; fixset еще незакоммичен.

MSW теперь сверяет case id/run и применяет `priority`, `siteId`, `includeNormal`, `limit`, `offset` в `/risks`; некорректные числовые/enum параметры дают 422. Команда `npm test` в основном checkout завершилась **22 passed**. Ранее отмеченный остаток P2 по фильтрам закрыт в этом проверенном состоянии.

**G1 accepted для объема foundation** после фиксации проверенного fixset. Это не приемка будущих auth/core/workflow, deployment или промышленной точности.
