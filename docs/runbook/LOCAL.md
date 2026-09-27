# Локальный запуск prototype

Runbook относится к интегрированному локальному стеку Energy Diagnostics. Runtime использует синтетические observations и reference fixture, сохраняет runs/workflow в PostgreSQL и показывает UI на `http://127.0.0.1:8080`. Это advisory prototype: внешняя AI выключена, подключений к полевым устройствам и команд управления нет.

## Первичная настройка

Все команды Compose выполняйте из основного checkout проекта, где находится его `infra/.env`. Для этой машины основной checkout: `/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint`. Не запускайте Compose с таким же именем проекта из worktree: bind mounts укажут на другой checkout.

Один раз сгенерируйте отсутствующие локальные пароли:

```bash
python scripts/init_local_env.py
```

Скрипт добавляет только отсутствующие ключи в `infra/.env`, устанавливает права `0600` и не показывает значения. Не коммитьте и не копируйте этот файл в worktree. Demo usernames: `engineer`, `approver`, `technician`, `viewer`, `admin`; пароли остаются в локальном `infra/.env`.

Проверьте Compose без вывода раскрытых переменных и запустите сервисы:

```bash
docker compose --env-file infra/.env -p energy-diagnostics -f infra/compose.yaml config --quiet
docker compose --env-file infra/.env -p energy-diagnostics -f infra/compose.yaml up --build -d --wait
docker compose --env-file infra/.env -p energy-diagnostics -f infra/compose.yaml ps
curl --fail --silent --show-error http://127.0.0.1:8080/api/v1/health
```

Ожидаемый health: база `ready`, business runtime `ready`, `advisoryOnly=true`, `controlCommandsAllowed=false`, `externalAiEnabled=false`. Публикуется только web port на loopback; база, API и worker остаются внутри Compose network. Worker получает `data/observations` в read-only mount; `data/truth/` не монтируется.

## Работа с данными и workflow

Откройте `http://127.0.0.1:8080`, войдите под одной из локальных demo-ролей и выберите REFERENCE или SIMULATION. Reference показывает illustrative snapshot. Simulation создает новый `scenarioRunId`, а worker рассчитывает доступный срез из observation fixtures и сохраняет результаты.

Reset означает создать новый run. Старый run и его evidence/workflow остаются в базе; endpoint для очистки данных или переиспользования того же run отсутствует. В API мутации используют серверную роль, CSRF и idempotency key; изменения состояния проверяют ожидаемую revision. Подтверждение случая и закрытие требуют отдельных человеческих действий и evidence.

Проверить сервисы можно командами `ps` и health выше. Не публикуйте вывод `docker compose config` без `--quiet`: он может содержать значения из env-файла.

## Остановка и повторный запуск

Остановите контейнеры с сохранением named volume PostgreSQL:

```bash
docker compose --env-file infra/.env -p energy-diagnostics -f infra/compose.yaml stop
```

Повторный запуск используйте командой `up --build -d --wait` из основного checkout. Не добавляйте `-v`, не выполняйте `down -v` и не удаляйте `postgres-data`: эти действия уничтожают локальное состояние.

## Backup и безопасная проверка restore

Сделайте backup запущенной локальной базы из основного checkout:

```bash
python scripts/backup_local.py
```

Скрипт находит контейнер БД по Compose labels и вызывает `pg_dump` внутри него, не читает `.env` и не выводит пароль. Custom-format архив создается с правами `0600` в `infra/.env.backups/` с правами папки `0700`. Путь проверяется через `git check-ignore`, архив проверяется командой `pg_restore --list`, затем печатаются размер и SHA-256. Папка игнорируется Git.

Проверьте backup, передав его путь:

```bash
python scripts/verify_restore.py infra/.env.backups/ИМЯ_АРХИВА.dump
```

Проверка создает новую уникально названную database в текущем PostgreSQL cluster/named volume, восстанавливает туда архив без `--clean`, `--create` или удаления объектов и проверяет таблицы и counts. Исходная БД не изменяется; volume теперь дополнительно содержит изолированную restore database. Тестовая база сохраняется. Скрипт никогда не удаляет restore target, в том числе при ошибке. Перед повторной проверкой используйте новый backup/target; удаление тестовой БД требует отдельного ручного решения после проверки ее имени и содержимого.

Локальный dump содержит пользовательские workflow и synthetic данные. Храните его в этой ignored папке с ограниченными правами и не отправляйте в Git или внешнее хранилище без отдельной оценки доступа. Успешный локальный restore подтверждает только читаемость данного архива и восстановление в этой локальной среде, не промышленную отказоустойчивость.

## API и ограничения

OpenAPI доступна через `/api/v1/openapi.json`. Основные read endpoints: `/api/v1/risks`, `/api/v1/cases`, `/api/v1/cases/{caseId}/snapshot`, `/api/v1/work-plans`, `/api/v1/assets`, `/api/v1/sources`, `/api/v1/demo/scenarios`. Для создания Simulation используется `/api/v1/demo/sessions`; advance привязан к run и требует разрешения demo-оператора.

Все видимые значения маркируются режимом данных и виртуальным временем. История immutable по run, replay будущего времени не меняет ранее сохраненные AnalysisRun. Нет telemetry в реальном времени, command endpoint, автоматического подтверждения дефекта или внешнего AI. Synthetic проверки не заменяют field validation.
