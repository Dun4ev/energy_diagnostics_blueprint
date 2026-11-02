# Стенд: автопоказ и ведущий

Стенд показывает запись учебной SIMULATION из синтетических наблюдений. Время данных относится к июлю 2026 года. Записанные решения и результаты относятся только к учебному сценарию и не являются действиями на оборудовании.

## Подготовка

На машине стенда заранее подготовьте Docker Desktop и локальные образы проекта. Из основного checkout, при работающем Docker Desktop, запустите полный локальный стек по [LOCAL.md](LOCAL.md). Не выводите содержимое `infra/.env` на экран. После сборки web откройте `http://127.0.0.1:8080/stand` и проверьте весь показ на целевом экране. Команды ниже не загружают и не пересобирают образы.

Если backend не нужен или недоступен, запустите только web, не затрагивая базу:

```powershell
docker compose --env-file infra/.env -p energy-diagnostics -f infra/compose.yaml up --no-build --pull never --no-deps -d web
```

Автопоказ открывается без входа и работает без интернет-соединения и ответа API. Для живого показа заранее запустите полный стек:

```powershell
docker compose --env-file infra/.env -p energy-diagnostics -f infra/compose.yaml up --no-build --pull never -d --wait
```

На целевом компьютере отдельно проверьте запуск без интернета. Никакие команды здесь не удаляют volume базы. Не используйте `down -v`.

## Показ

- Откройте `/stand`; восемь эпизодов идут по кругу в течение трех минут. Кнопки позволяют остановить показ, перемещаться между эпизодами и включить полноэкранный режим.
- Нажмите «Продолжить с ведущим». При необходимости войдите как `engineer`: пароль хранится в `infra/.env` как `DEMO_ENGINEER_PASSWORD`. Появится отдельный живой запуск с объектом и временем выбранного эпизода; учебные решения из записи в него не копируются.
- Если выбранный ранний срез не содержит диагностического случая, откроется карточка актива. В эпизодах плана и согласования ведущий начинает собственный разбор случая.
- Выполняйте живые действия только в SIMULATION. Для согласования и результатов используйте отдельные роли `approver` и `technician`, как описано в [REHEARSAL.md](REHEARSAL.md). Записи и решения сохраняются в локальной базе.
- Для возврата нажмите «Вернуться к автопоказу». Существующий учебный запуск при этом сохраняется.
- При недоступном API вернитесь к автопоказу, восстановите локальный стек и повторите переход. При нехватке прав выйдите и войдите как `engineer`.

## Пересоздание пакета

Скрипт `scripts/prepare_stand.py` создает пакет в `apps/web/public/stand-data.json` из синтетических observations с использованием временной SQLite-базы. Он не использует работающую базу, `infra/.env` или `data/truth/`. Запускайте его только в проектном Python-окружении с зависимостями backend; команда меняет указанный выходной файл. После обновления пакета необходимо пересобрать web-образ и снова проверить стенд. Различия в учебных идентификаторах и времени записи истории не означают изменения численного расчета.

`provenance.observationHashes` хранит SHA-256 исходных байтов каждого файла в момент записи пакета. Проверка стенда сначала сверяет эти байты точно. Для UTF-8 файлов `.json` и `.jsonl` она также допускает разницу только в единообразных переводах строк LF и CRLF и выводит предупреждение с исходным и текущим хешами: это совпадение с учетом переводов строк, а не побайтовая идентичность. Смешанные переводы строк не нормализуются. Для архивов и других файлов требуется точное совпадение байтов; изменение содержимого не допускается. Сам пакет и записанные в нем хеши при проверке не меняются.

Например, в PowerShell можно использовать уже собранный локальный backend-образ. Следующая команда заменит только подготовленный пакет и выполнится без сети:

```powershell
$standRoot = (Get-Location).Path
docker run --rm --network none `
  --mount "type=bind,source=$standRoot\scripts\prepare_stand.py,target=/app/scripts/prepare_stand.py,readonly" `
  --mount "type=bind,source=$standRoot\packages,target=/app/packages,readonly" `
  --mount "type=bind,source=$standRoot\apps\api,target=/app/apps/api,readonly" `
  --mount "type=bind,source=$standRoot\apps\worker,target=/app/apps/worker,readonly" `
  --mount "type=bind,source=$standRoot\data\observations,target=/app/data/observations,readonly" `
  --mount "type=bind,source=$standRoot\config,target=/app/config,readonly" `
  --mount "type=bind,source=$standRoot\apps\web\public,target=/app/apps/web/public" `
  --entrypoint python energy-diagnostics-api scripts/prepare_stand.py
```

Аналогичная команда из корня проекта на macOS:

```bash
docker run --rm --network none \
  --mount "type=bind,source=$PWD/scripts/prepare_stand.py,target=/app/scripts/prepare_stand.py,readonly" \
  --mount "type=bind,source=$PWD/packages,target=/app/packages,readonly" \
  --mount "type=bind,source=$PWD/apps/api,target=/app/apps/api,readonly" \
  --mount "type=bind,source=$PWD/apps/worker,target=/app/apps/worker,readonly" \
  --mount "type=bind,source=$PWD/data/observations,target=/app/data/observations,readonly" \
  --mount "type=bind,source=$PWD/config,target=/app/config,readonly" \
  --mount "type=bind,source=$PWD/apps/web/public,target=/app/apps/web/public" \
  --entrypoint python energy-diagnostics-api scripts/prepare_stand.py
```

В демонстрации нет реальной термограммы, команд оборудованию или оценки вероятности отказа. Не выдавайте учебный случай и согласование за реальные инженерные работы.
