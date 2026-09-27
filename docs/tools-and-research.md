# Skills, plugins и инструменты: проверка 25.09.2026

## 1. Рекомендованный минимальный набор

| Инструмент | Место в работе | Решение для этого проекта |
|---|---|---|
| Product Design в Codex | Пользовательский путь, состояния, компоновка | Использовать на этапах 00/05; проверять по design.md, не сочинять иной продукт |
| frontend-design | Реализация согласованного интерфейса | Один основной design-skill; инженерная плотность важнее декоративной оригинальности |
| Playwright: браузерные средства + automated tests | Визуальный просмотр, console/network, screenshots, e2e | Обязательно иметь один рабочий browser QA путь, не три одновременно |
| Собственные skills из `.agents/skills/` | Инженерные ограничения, контракт, QA | Входят в пакет, instruction-only, без исполняемых hooks |
| Impeccable | Отдельный audit/critique/polish после реализации | Опционально; не давать переписать промышленный интерфейс под лендинг |
| Vercel agent-skills | Избирательный review React/доступности | Опционально; выбирать нужные skills, не весь marketplace |
| awesome-jev | Справочник примеров для отдельного spike | Не runtime dependency и не инженерная модель |

Это подбор под задачу, а не объективный рейтинг всех доступных расширений. Наличие плагина здесь, в ChatGPT, не означает его установки в локальном Codex. Сначала preflight проверяет реально доступные skills/versions/permissions и уже имеющийся browser tool.

## 2. Что подтверждено официальной документацией

**Codex skills.** Документация описывает `SKILL.md` с metadata и репозиторные `.agents/skills`. Длинные инструкции лучше выносить из корневого AGENTS.md в тематические документы и загружать по задаче. В пакете именно такая структура. Источники:
- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/app/worktrees

**Product Design.** В официальном каталоге видеоматериалов Codex есть материал о прототипировании с Product Design. Это подтверждает инструмент, но не гарантирует его доступность в конкретной установленной версии/подписке: https://developers.openai.com/codex/videos . Не выдумывать локальный CLI установки или manifest, пока preflight не проверил доступный способ.

**frontend-design.** В исходном skill Anthropic есть требование следовать фиксированному brief. Для нас фиксированным brief служит слайд29 + design.md; не нужны случайный стиль и обобщённый «premium SaaS». Источник: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md . Существующий локальный вариант не перезаписывать без просмотра: он может быть другой версией/провайдером.

**Playwright.** Microsoft поддерживает CLI и MCP. В README MCP отдельно обсуждается более экономный по контексту путь CLI+skills для coding agents; MCP полезен для устойчивой браузерной сессии. Выбор зависит от уже доступных инструментов. Автоматическое сравнение screenshot — отдельная функция Playwright Test, не просто ручной просмотр accessibility tree:
- https://github.com/microsoft/playwright-cli
- https://github.com/microsoft/playwright-mcp
- https://playwright.dev/docs/test-snapshots

**Impeccable.** Репозиторий предлагает установщик и поддерживает Codex. Текущий install-процесс может ставить CLI binary и project hooks. Поэтому установка — явный отдельный шаг с просмотром diff/разрешений, не автоматическая часть «создай UI». Не включать hooks глобально и не выполнять неизвестные скрипты без проверки: https://github.com/pbakaus/impeccable . Вызов навыка проверять в локальном списке skills; не полагаться на старые `/prompts:`-инструкции из чужих статей.

**Vercel agent-skills.** Полезны выборочно React performance/composition и web-design-guidelines. Это review, не второй источник визуальной системы: https://github.com/vercel-labs/agent-skills . Название каталога и активируемое имя skill могут различаться, смотреть установленный SKILL.md.

## 3. Что говорят тематические обсуждения

Просмотрены два обсуждения, а не статистическая выборка всей индустрии:

1. r/claudeskills — `Searching for better frontend-design skills`:
   https://www.reddit.com/r/claudeskills/comments/1v1v9qq/searching_for_better_frontenddesign_skills/
2. r/codex — `Has anyone learned ways to make Codex better at ...`:
   https://www.reddit.com/r/codex/comments/1rx5wy7/has_anyone_learned_ways_to_make_codex_better_at/

В первом обсуждении есть рекомендации фиксировать spacing/type/colors/density в DESIGN.md, давать визуальные примеры и проверять результат браузером. Есть продвижение авторами собственных инструментов, поэтому это не независимый benchmark. Во втором встречается опыт улучшения результата за счёт небольшой библиотеки компонентов и строгих токенов; другие участники предпочитают альтернативные генераторы/модели. Единого консенсуса о «лучшем skill» нет.

Практический вывод для **этого** проекта: согласованный визуальный контракт и цикл «сделал → открыл → проверил → исправил» полезнее бесконтрольного одновременного включения нескольких стилевых наборов. Это инженерная рекомендация по прочитанному, не доказанный численный выигрыш.

Независимого сравнительного исследования перечисленных skills именно на промышленных диагностических интерфейсах в проверенных источниках не найдено. Поэтому качество оценивается по нашему acceptance matrix, не по популярности репозитория.

## 4. Что действительно скачивать

**Для начала — этот пакет.** Клонировать большие готовые dashboard/SCADA/agent-platform repos не требуется. Они могут навязать чужие сущности, зависимости и условия лицензии. Сам Codex из исходников также не нужен.

На этапе 01 интегратор устанавливает выбранные npm/Python dependencies в проект, фиксирует lockfiles и версии browser. Нужны библиотеки, а не копии их GitHub исходников. Команды выбираются под уже принятый package manager; `npm`, `pnpm` и `yarn` не смешиваются.

Опционально, только после согласованного preflight:

```bash
# Справочник Jev: вне автозагружаемых skills, без запуска содержимого.
git clone --depth 1 https://github.com/Ai-trainee/awesome-jev research/awesome-jev
git -C research/awesome-jev rev-parse HEAD
```

Зафиксировать полученный commit в dependency register, просмотреть LICENSE и SKILL.md. Не активировать весь справочник для каждой задачи численного ядра.

Официальные README на дату исследования показывают, в частности:

```bash
# Альтернатива, если подходящего browser capability в Codex ещё нет:
npm install -g @playwright/cli@latest
playwright-cli install --skills

# ДРУГАЯ альтернатива, не требующая одновременного выбора первой:
codex mcp add playwright npx "@playwright/mcp@latest"

# Опциональный дизайн-аудитор:
npx impeccable install --providers=codex --scope=project
```

Это примеры **не выполненных здесь** команд из актуальных способов установки. Перед реальным выполнением проверить версию/README, разрешения и network access. Для воспроизводимой сборки фиксировать рассмотренную версию вместо плавающего latest. Установка global CLI — не обязательна; уже работающий локальный/native browser tool предпочтительнее дублирования. Установщик Impeccable может изменить hooks; необходим отдельный просмотр.

Не скачивать одновременно десятки skills, weights неизвестных «OpenJev», чужие private model binaries или файлы из форумных комментариев. Не предполагать, что community clone эквивалентен Jev TypeSafe.

## 5. Jev: проверенные границы

- Пользовательский репозиторий: https://github.com/Ai-trainee/awesome-jev — подборка применений и справочных материалов.
- Официальные primitives: https://docs.typesafe.ai/introduction . Это структурированные ответы модели, не готовая функция теплового прогноза.
- Официальное представление продукта: https://typesafe.ai/blog/introducing-system-one-models-and-jev . Раннее представление продукта в сентябре2026 не является валидацией для энергетики.

Заявления поставщика о calibration/typed answers не считать доказательством точности на наших активах. Типизированный, но неверный ответ всё ещё возможен. Доступность весов/on-prem режима и коммерческие условия отдельно не подтверждены; не закладывать их как обещанную возможность. Включение AI — только после сравнительного spike по `prompts/09-optional-jev.md`.

## 6. Справочные первичные источники по архитектуре

- FastAPI, OpenAPI/Pydantic: https://fastapi.tiangolo.com/features/
- Apache ECharts, примеры временных рядов и полос: https://echarts.apache.org/examples/en/index.html
- Калибровка вероятностей: https://scikit-learn.org/stable/modules/calibration.html
- NIST OT Security, SP800-82r3: https://csrc.nist.gov/pubs/sp/800/82/r3/final

Ссылки фиксируют основания рекомендаций. Они не доказывают, что предлагаемый прототип уже реализован, безопасен для OT, откалиброван или сертифицирован. Все зависимости проверяются повторно при фактической установке; ни один сторонний репозиторий/плагин в ходе подготовки этого пакета не устанавливался.
