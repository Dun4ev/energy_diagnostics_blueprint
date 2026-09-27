# PREFLIGHT: этап 00, решение для G0

Дата проверки: 27.09.2026. Статус: **preflight подготовлен; G0 ожидает согласования пользователя**. Этап 01 не начат.

Рабочая папка: `/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint`.
Базовый commit: `e066e6bca7e88536b15411cdce5fe9c12de35060`, ветка `main`.

## 1. Проверенный объем и результат

Сначала прочитаны README.md и AGENTS.md, затем prompts/00-preflight.md и все обязательные входы: DESIGN.md, docs/source-review.md, docs/architecture.md, docs/implementation-plan.md, contracts/README.md, docs/tools-and-research.md. Изображение references/slide-29.png открыто и визуально изучено. Дополнительно прочитаны диагностика, data-spec, acceptance, стартовые схемы, demo policy, тест blueprint и prompts/01–08 для точного разделения этапов.

Вход: спецификации, schemas, reference fixtures, манифесты, фактическое окружение и доступные инструменты. Выход: только этот план, перечень пробелов и решение для G0. Единственный созданный файл: `handoffs/PREFLIGHT.md`. Контракты и исходные файлы не изменены; приложение не создавалось.

В начале проверки Git отсутствовал: `git status --short` вернул `fatal: not a git repository`. После прерывания и команды пользователя «продолжай» повторная проверка обнаружила указанный выше commit и чистое дерево. Инициализация/коммит не выполнялись агентом preflight. Дальнейшие этапы должны начинаться с новой проверки HEAD/status, а не с повторного git init.

## 2. Что действительно находится в папке

- Документы, 11 prompts, две JSON Schema (Measurement, AnalysisResult), reference fixtures, config, генератор и тесты пакета присутствуют.
- `apps/`, `packages/`, `infra/`, package.json, pyproject.toml, frontend/Python lockfiles, Compose и прикладные build/start/test-команды отсутствуют. requirements-validation.txt относится к проверке blueprint.
- SHA-256 и размеры 50 существующих файлов из PACKAGE_MANIFEST вне data/truth совпали. Отсутствуют четыре заявленных файла: `.gitignore` и три `.agents/skills/*/SKILL.md` (contract-first-module, diagnostic-visual-qa, energy-domain-guardrails). Они не установлены/не восстановлены в ходе preflight.
- Все семь файлов observations совпали по SHA-256 и размеру с data/manifest.json. Это проверка целостности, не доказательство корректности будущего алгоритма.
- Реальное имя визуальной спецификации: `DESIGN.md`; ссылки и тест используют `design.md`. На текущей файловой системе чтение по нижнему регистру работает. Для Linux/CI это проблема переносимости. На этапе 01 интегратор должен согласовать канонический регистр через RFC и исправить ссылки либо имя; сейчас файл не переименован.
- Корневой implementation-plan.md и docs/implementation-plan.md побайтово одинаковы. Каноническим для следующих этапов считать docs/implementation-plan.md, как предписывает prompt; копию не удалять.
- Содержимое data/truth в preflight не читалось. Перечень имен получен только при инвентаризации структуры.

## 3. Окружение и инструменты: факты

| Проверка | Фактический результат | Значение для плана |
|---|---|---|
| pwd, uname -sm, sw_vers | Нужная папка; Darwin arm64, macOS 26.6.2 (25G83) | Локальная среда разработки |
| git --version | 2.54.0 (Apple Git-157) | Git доступен; после паузы main чистая |
| python / python3 | Команды python нет; python3 = 3.14.4 | В командах не полагаться на python без venv |
| python3.13 / python3.12 | /opt/homebrew/bin: 3.13.5 / 3.12.12 | Выбрать имеющийся Python 3.13.5 для проектного venv |
| node --version | v25.1.0 | Текущий runtime доступен, совместимость выбранных зависимостей еще не проверена |
| npm --version | 11.13.0 | Выбран единственный frontend package manager |
| uv --version | 0.12.15 | Выбран для проектного venv и uv.lock |
| yarn --version | 1.22.22 | Доступен, не выбран |
| pnpm --version | Corepack сообщил о скачивании pnpm 12.6.0, затем MODULE_NOT_FOUND | Работоспособность не подтверждена; не выбран |
| docker --version / docker compose version | 29.3.1 / v5.1.0 | CLI есть |
| docker info | Нет сокета ~/.docker/run/docker.sock | Daemon недоступен; контейнеры не запускались |
| Python packages | В python3 нет jsonschema, FastAPI, Pydantic, pytest, Playwright; отдельно jsonschema отсутствует и в python3.13 | Прикладные тесты и JSON Schema suite здесь не запускались |
| playwright --version | 1.58.0 | CLI существует; это не версия проектного @playwright/test |
| Playwright MCP browser_tabs + browser_evaluate | about:blank; userAgent Chrome/153.0.0.0 | Реальная браузерная сессия отвечает; приложение еще не проверено |

Особенность инвентаризации: обычный вызов `pnpm --version` неожиданно активировал Corepack и сообщение о загрузке. Команд установки агент не задавал; pnpm завершился ошибкой. Нельзя утверждать отсутствие побочных изменений Corepack cache или успешную установку. Повторных попыток не было. В дальнейшем проверки shim-команд выполнять с запретом сети. Plugins, skills, hooks и глобальные настройки агент не менял.

Доступны инструменты exec_command, apply_patch, view_image, web, Codex app tools, Playwright MCP и CUA. Для этого этапа использованы чтение/команды, view_image и read-only вызовы Playwright. Наличие инструмента не означает проверку всех его функций. Веб-источники из исследования от 25.09 не перепроверялись: обновление внешних рекомендаций и установка не входят в этот этап.

### Один UI skill и один browser путь

- **Основной UI skill для этапа 05: frontend-design**, локальный файл `/Users/j15/.agents/skills/frontend-design/SKILL.md` существует; назначение проверено. Применять с приоритетом DESIGN.md, плотности инженерного интерфейса и семантических цветов. На этапе 00 UI не создается, skill инвентаризирован, а не применен для генерации дизайна.
- Product Design реально представлен в каталоге этой сессии и локальном `/Users/j15/.codex/plugins/cache/openai-curated-remote/product-design/0.1.56/skills/index/SKILL.md`. Это набор skills, а не доказательство отдельного работающего design API. Не подключать вторым конкурирующим визуальным набором. Формулировку prompt05 об обоих инструментах трактовать в рамках выбора одного основного skill из prompt00; при необходимости отдельного UX-аудита пересмотреть scope явно.
- **Browser путь: имеющийся Playwright MCP** для просмотра, screenshots, console/network и интеракций. Проверен ответ живой браузерной сессии. Для повторяемого e2e этап 01 добавит проектный Playwright Test и зафиксирует browser version; это та же технология проверки, не установка второго MCP/глобального browser skill.
- Локальный playwright skill существует, но его npx wrapper не запускается: он может загрузить пакет. CUA, agent-browser и другие пути не добавляются к выбранному процессу. Наличие ChatGPT connector/plugin не принимается за наличие проектной зависимости или локального CLI.

## 4. Визуальное решение по слайду 29

Проверено визуально: слева подробный случай, справа сверху очередь, справа снизу проект задания. Общие признаки: темно-синяя навигация, светлые компактные панели, оранжевая observed и синяя expected линии, отдельная схема, источники и гипотеза, таблица шагов.

Реализовать три маршрута в одном AppShell: `/risks`, `/diagnostics/cases/:caseId`, `/work-plans/:planId`. Не переносить внешний баннер презентации и три sidebar на одну страницу. Основной экран случая: график/схема слева, доказательства/вывод справа; на узкой ширине одна колонка. Бренд нейтральный, из config; системные шрифты без CDN.

Расхождения источника сохранять явно: серый Т-2 означает неизвестное состояние по проектному решению, не доказанное отключение; «ожидает согласования» рядом с кнопкой отправки разделить на draft/submitted; «Мониторинг» и «Обзор активов» свести к последнему. Цвет риска не заменяет электрическое состояние. Исторический график не является прогнозом, термограмма без изображения не является подтвержденным обследованием.

## 5. Выбранный стек для согласования

- Frontend: React + TypeScript + Vite, TanStack Query/Table, Apache ECharts, общий небольшой UI-kit и CSS tokens из config. Никаких вычислений риска в React.
- Backend: FastAPI + Pydantic, SQLAlchemy + Alembic, PostgreSQL; модульный монолит и отдельный worker из того же Python-проекта. Очередь jobs в PostgreSQL; Redis/Kafka не нужны.
- Numerical core: чистый Python, без HTTP/БД/LLM; baseline, residual, hourly medians, Theil–Sen, quality/persistence/hysteresis, прозрачная demo policy. Новые библиотеки только через интегратора с конкретным обоснованием.
- Contracts: канонические Pydantic DTO в packages/domain_contracts; экспорт JSON Schema/OpenAPI и генерация TS; дрейф проверяется автоматически.
- Runtime: локальный Docker Compose, один reverse proxy, приложение только на 127.0.0.1, внутренние БД/worker без опубликованных портов. Монтировать observations read-only, никогда весь корень проекта/data с truth в runtime-контейнеры.
- Dependencies: npm/package-lock.json и uv/uv.lock; Python 3.13.5 уже доступен. Текущий Node 25.1.0 является проверенным кандидатом, не обещанием совместимости или поддержки. На этапе 01 зафиксировать проверенную Node-версию и точные совместимые версии пакетов/образов. Если потребуется другой runtime, не переключать глобальные defaults молча.
- QA: pytest для Python, контрактные проверки, frontend typecheck/build и Playwright Test/MCP. MSW только до интеграции. AI/Jev выключен и не нужен для первого среза.

## 6. Недостающие контракты и решения интегратора до G1

Это предложения для RFC/ADR этапа 01, а не изменения стартовых схем.

| Пробел | Решение, которое нужно заморозить |
|---|---|
| Полного OpenAPI нет | Все маршруты contracts/README.md: request/response, pagination/filter/time bounds, auth, health и ошибки |
| Сущности workflow отсутствуют | Asset, Source, Evidence, Case, WorkPlan/Step, Approval, Defect, AuditEvent, RiskEntry, ScenarioSession и APIError |
| Нет общего согласованного snapshot | CaseSnapshot: snapshotId, analysisRunId, evidenceRevision, revision, mode/data time; очередь и карточка читают один AnalysisRun |
| Разные имена в тексте и схеме | Схема использует mode, inputSnapshotId, risk.score; текст также dataMode, inputSnapshotHash, pilotPriorityScore, ScenarioRun/ScenarioSession. Зафиксировать mapping без второго временного DTO |
| AnalysisResult уже, чем требования core/UI | Окна тренда 24/72, persistence, coverage по окнам, контраргументы и provenance; API временных рядов observed/expected/residual/load/ambient и historical band. В существующей схеме только один slope/window и supportEvidenceIds |
| Нет контракта unsupported | Для breaker/cable вернуть явную причину неподдерживаемого анализа и unknown/null; не маскировать отсутствие метода низким риском. Семантику согласовать, не добавлять enum самовольно |
| Временные гарантии | eventTime <= asOf и receivedAt <= replayReceivedAt; late arrivals, timezone, Clock, reset как новый run, warm-up, начало отсчета сроков |
| Ревизии и состояния | Полная таблица переходов Case/WorkPlan, permission matrix, evidence/reason, expectedRevision; stale-review и запрет неявной перепривязки historical plan |
| Идемпотентность и транзакции | Scope/TTL/reuse Idempotency-Key, поведение при другом payload, 403/409/422, atomic mutation+audit; create без существующей revision определить отдельно |
| Auth/evidence | Server-side demo identity, cookie/CSRF/logout, безопасная локальная схема transport/cookie; MIME/size/URI/hash/версии evidence. Роль не берется из mutation body |
| Политика и семантика | unknown => score=null, freshSources<=totalSources, residual arithmetic, границы окон; числовые допуски C01–C08 до реализации, не после подгонки |
| UI/exports/config | BrandConfig, semantic tokens, feature registry/route exports, topology provenance, printable HTML/JSON с mode/time/versions |

Недостающие cross-field проверки не считать уже реализованными только из-за JSON Schema. failureProbability в текущей схеме допускает исключительно null. Расширения выпускает только интегратор с версией/impact review, сохранением смысла исходных fixtures и регенерацией клиента.

Найденное частное противоречие: diagnostics.md приводит `nextAction=request_measurement`, которого нет в allowedActionCodes. Предложение: трактовать это как описание потребности в данных и использовать VERIFY_TELEMETRY/подходящий разрешенный код с причиной. Новый action code вводить только через RFC. Forecast в design описан как возможность, но config и prompt03 по умолчанию его выключают; в первом срезе не показывать выдуманный прогноз.

## 7. Самый короткий вертикальный срез

1. SourceAdapter читает transformer observations, нормализует отдельные источники, фильтрует по двум временам и сохраняет raw provenance.
2. Core рассчитывает ожидаемый режим и остаток, тренд 24/72, качество и индекс по публичной demo policy. Не получает truth, labels или имя сценария как диагностический признак.
3. Worker сохраняет immutable AnalysisRun; backend формирует согласованные queue/case snapshots, агрегируя случай по run/asset/symptomFamily.
4. Инженер просматривает доказательства и создает draft плана, привязанный к analysis/evidence revision; submit сохраняется вместе с audit.
5. Отдельная серверная identity approver утверждает актуальную ревизию. Проверки результата/закрытие остаются действиями человека; спад температуры не закрывает случай.
6. Повторить на нормальном росте нагрузки, дрейфе датчика и утрате данных. Показать сохранение после перезапуска и ошибки 403/409/повторный submit.

Сначала один тепловой случай как сквозной путь, затем все семь transformer-сценариев в приемке. Breaker/cable читаются отдельными ingestion readers, в REFERENCE сохраняются строки слайда; в SIMULATION до отдельной методики анализ явно unsupported. Это предложенное ограничение G0, разрешенное prompt03, а не скрытая имитация результата.

Инварианты: REFERENCE 7.2/10 берется из иллюстрации с неизвестной формулой и не равно 72%; 3/4 свежих источника не равно 75% уверенности. SIMULATION считает по observations. failureProbability=null; unknown не превращается в zero/low. Осмотр <=48 ч, мониторинг 7–14 дней и условный прогноз порога имеют разный смысл. Управление аппаратами, изменение уставок, автоматическое подтверждение дефекта/утверждение работ исключены из API, прав и кода. Реальной OT-интеграции нет.

## 8. Этапы, владельцы и gates

Владельцы ниже являются ролями будущей реализации, а не уже запущенными агентами. Preflight выполнен одним агентом. После G1 использовать отдельные worktrees с base commit; сначала проверить доступные слоты среды. При лимите четыре включая интегратора запускать не более трех исполнителей одновременно, оставшийся модуль следующей волной. Нельзя копировать предложение о пяти одновременных сессиях без учета лимита.

| Этап / владелец | OWNED | Вход, выход и gate |
|---|---|---|
| 00 / ведущий | handoffs/PREFLIGHT.md, предложения RFC | Инвентаризация -> этот план. G0 принимает пользователь |
| 01 / интегратор | Root manifests/locks/config, packages/domain_contracts, contracts, infra, scaffolds apps/api, apps/worker, apps/web, CI/test configs | Принятый G0 -> freeze DTO/OpenAPI/TS, MSW fixtures, protocols, health, build/test skeleton. G1: install/build/typecheck/imports/schema/drift/health и base commit |
| 02 / ingestion | packages/ingestion, tests/ingestion, свой handoff/RFC | Frozen Measurement/Clock -> streaming adapter, dedup33→30, quarantine, late delivery/no future leakage. G2 модуля |
| 03 / numerical core | packages/diagnostics, tests/diagnostics, свой handoff/RFC | Frozen DTO/policy/tolerances -> реальные вычисления и explanations, synthetic tests. G2 модуля |
| 04 / backend | apps/api, tests/api; migrations в apps/api/migrations после передачи от интегратора | DTO -> persistence, auth/RBAC, transitions, revisions/idempotency/audit, evidence. G2 модуля; analyzer stub явно отмечен |
| 05 / UI shell | apps/web/src/design-system, apps/web/src/shell, tests/ui-shell | Frozen config/contracts -> tokens, компоненты, единая оболочка, gallery и browser review. G2 оболочки |
| 06 / UI features | apps/web/src/features, tests/ui-features | G1 + handoff05 -> три экрана, asset/model links, exports, error states; mocks только контрактные. G2 UI |
| 07 / интегратор | apps/worker, infra, root router/integration configs, tests/integration, docs/runbook | G2 модулей -> реальный replay/API/UI без MSW, persistence/restart/run isolation, backup/restore. G3 |
| 08 / независимый reviewer | tests/e2e, согласованные независимые tests, verification, handoffs/review-* | G3 commit/runbook -> numerical/workflow/security/visual matrix и PROTOTYPE_ACCEPTANCE.md. G4: accepted/rejected с дефектами |

Root router, общие DTO, root configs и lockfiles остаются у интегратора. Владельцы features публикуют exports и RFC. Backend migrations передаются одному владельцу после scaffold. Reviewer не исправляет production code молча. Truth допустим только независимому evaluation harness после расчета, вне runtime mounts/imports. Этап 09 Jev и этап 10 расширения не входят в G0 этого среза.

## 9. Блокеры отдельно от demo-предположений

### Требуют решения / устранения

- **Перед этапом 01: принятие G0 пользователем.** Подтвердить выбранный локальный стек, разрешение проектных dependency installs/scaffold и scope: transformer core; breaker/cable unsupported в SIMULATION; forecast/AI выключены. Текущий запрос разрешает только preflight.
- **Для Compose/health части G1: доступный Docker daemon.** CLI недостаточно. Уточнить/запустить уже установленный runtime в рамках следующего разрешенного этапа; не заменять PostgreSQL на SQLite молча.
- **До G1: закрыть таблицу контрактных решений**, определить numeric tolerances, cookie/transport и точные dependency versions. Это работа интегратора, не вопросы об отсутствующих промышленных данных к пользователю.
- **До Linux/CI и установки: решить регистр DESIGN.md и отсутствие .gitignore.** Через согласованное изменение этапа 01; до installs предусмотреть исключения .env, venv, node_modules и артефактов. Отсутствующие project skills документировать; восстановление/установка не требуется для G0 и не разрешена сейчас.
- Git-блокер обнаруженный в начале **снят после паузы**: базовый commit теперь существует. Remote/публикация для локального среза не нужны.

### Допустимые предположения для DEMO

- Условный контакт фазы A, публичная модель a=4, b=60, tau=2 и demo consequence weights; это не паспорт/эксплуатационные пределы.
- Русский UI, нейтральный бренд, UTC в API и Europe/Moscow для reference; время/дедлайны SIMULATION от виртуального Clock.
- Forecast отключен; при unsupported/missing/invalid численный риск неизвестен. Последняя достоверная оценка показывается отдельно с возрастом.
- Seeded серверные роли; реальные корпоративные роли/OIDC отложены. Срок 48 ч в simulation предлагается считать от открытия случая, freeze в stage01; в reference точка отсчета не домысливается.
- Polling 5 секунд, без SSE/WebSocket в первом срезе. Локальные volumes, без внешних сервисов.
- Отсутствие настоящей термограммы показывается прямо; синтетический результат маркируется и не означает фактическое выполнение работ.

Паспорта/теги/история подтвержденных исходов/смысл УРЧ/реальные полномочия и регламенты остаются UNKNOWN до отдельного промышленного пилота. Это не блокирует synthetic DEMO и не дает оснований заявлять field accuracy, вероятность отказа или промышленную безопасность.

## 10. Проверки: выполненное и непроверенное

Фактически выполнены: чтение файлов через cat/sed/rg --files; визуальный view_image; pwd/git status/rev-parse/log; версии CLI из таблицы; docker info; проверка наличия Python packages через importlib.metadata/importlib.util; сравнение двух планов; SHA-256/size non-truth файлов по PACKAGE_MANIFEST и семи observations по data manifest; assertions reference score=7.2, failureProbability is None, calculationOrigin=presentation_illustration; read-only browser_tabs/browser_evaluate на about:blank.

Поставленный verification/data-checks.json сообщает о 19/19 тестах от 25.09.2026 11:57:31 UTC, Python 3.13.5, jsonschema 4.26.0. Это сохраненный результат подготовки пакета, **не повторный запуск 27.09**. В текущем Python jsonschema нет; suite не запускался и ничего для него не устанавливалось. Генератор также не запускался. Не проверены build/typecheck/API/RBAC/runtime numerical core, e2e приложения, запуск Compose, model accuracy или deployment: приложения пока нет.

Секреты/.env не читались, установки plugins/skills/hooks не выполнялись, публикации и подключения OT не было. Единственный намеренно записанный проектный артефакт этого этапа: handoffs/PREFLIGHT.md. Побочный эффект вызова Corepack описан отдельно выше.

## 11. Следующее действие и команды этапа 01

Остановиться здесь до принятия G0. Затем открыть prompts/01-foundation-contracts.md и действовать только как интегратор. Не запускать stages02–05 до G1.

Существующие команды повторной проверки (не требуют scaffold):

```bash
git status --short --branch
git rev-parse HEAD
/opt/homebrew/bin/python3.13 --version
node --version
npm --version
uv --version
docker info
docker compose version
```

После согласования installs и подготовки .gitignore: создать проектный venv через `uv venv --python /opt/homebrew/bin/python3.13 .venv`, определить manifests и зафиксировать зависимости. `uv lock` и `npm install` допустимы только после создания и проверки этих manifests. Никаких global installs или plugins/hooks.

Командный контракт, который этап 01 **должен создать** (сейчас команд приложения нет):

```bash
uv sync --frozen
npm ci
npm run build
npm run typecheck
npm run lint
uv run --frozen pytest tests/contracts
npm run contracts:check
docker compose -f infra/compose.yaml config
docker compose -f infra/compose.yaml up --build -d
curl --fail http://127.0.0.1:8080/api/v1/health
```

Пути tests/contracts, infra/compose.yaml, npm scripts и порт 8080 здесь предложены для stage01, а не выданы за существующие/исполненные. Интегратор фиксирует их в runbook, проверяет exports/TS, imports и local health, помечает stubs, затем создает handoffs/01-foundation.md с фактическими результатами и frozen base commit.

**Решение на согласование G0:** принять план и ограничения выше либо указать изменения. G1–G4 еще не пройдены. Готовый прототип не создан.
