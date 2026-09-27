# RFC07: async replay и доступность сохраненных планов

Решение интегратора, 2026-09-27. Основание: stage07 требует реального worker, UI не должен выдавать queued job за готовый расчет. Совместимое расширение ScenarioSession: processingStatus queued/running/ready/failed (default ready для старых reference fixtures), processingError nullable, processedAt nullable. virtualTime остается временем запрошенного среза; published analysis хранит собственный asOf. До ready UI явно показывает подготовку/предыдущий срез. Worker публикует все активы среза атомарно и только затем ready. При ошибке сохраняется last published analysis, ошибка явно видна.

Health расширен stage=integrated, businessRuntime=ready/degraded; foundation значения допустимы для старых fixtures. Готовность runtime проверяется heartbeat worker, не подменяется успешным SELECT1.

GET /api/v1/work-plans: Envelope[Page[WorkPlan]], run required, caseId optional, limit/offset. Нужен для восстановления списка после reload/другим пользователем. Backend owner реализует; интегратор экспортирует контракт. Никаких временных DTO.

Без изменения численной семантики AnalysisResult0.1.0. failureProbability=null, management equipment запрещено. Проверка: contract tests/drift, integration queued->ready/failed, HTTP plans list access/run isolation.

Независимый numerical review выявил необходимость контекста пустого среза: NumericalAnalyzer.analyze и analyze_series принимают optional scenario_run_id; runtime всегда передает его, чтобы отсутствие наблюдений давало корректный unknown snapshot данного run. Непустые наблюдения другого run отклоняются. Analysis identity включает полный asset/policy/model и оба cutoff времени; inputSnapshotHash остается хешем входных наблюдений. Hysteresis активируется только после выдержанного persistMinutes эпизода, не одиночного превышения.
