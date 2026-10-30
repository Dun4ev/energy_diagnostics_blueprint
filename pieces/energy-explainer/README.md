# Ролик о прототипе

Сценарий и временная сетка находятся в `brief.md`. Исходники кадров и движения находятся в `src/`, реальные снимки учебного приложения в `assets/`. `storyboard.png` хранит согласованную раскадровку. Каждая подпись о данных относится к SIMULATION; пример завершенного плана взят из другого учебного запуска.

Видео собирается навыком `animate`. Зависимости и браузер Chromium нужно подготовить на каждой машине отдельно. Общая инструкция для Mac находится в [pieces/README.md](../README.md).

Для повторной сборки из корня проекта в PowerShell:

```powershell
$videoNodeModules = (Resolve-Path 'pieces/energy-explainer/.tooling/node_modules').Path
$env:NODE_PATH = $videoNodeModules
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:LOCALAPPDATA 'ms-playwright'
$env:PATH = (Join-Path $videoNodeModules '.bin') + ';' + $env:PATH
$videoSkill = Join-Path $env:USERPROFILE '.codex\skills\animate'
node (Join-Path $videoSkill 'tools/build.mjs') pieces/energy-explainer
node (Join-Path $videoSkill 'tools/export.mjs') pieces/energy-explainer --workers 4 --share
node (Join-Path $videoSkill 'tools/review.mjs') pieces/energy-explainer
```

Экспорт создает или заменяет файлы в `frames/` и `renders/`. Перед повторной сборкой сохраните сделанные вручную изменения в этих папках. Папки зависимостей `.venv` и `node_modules` не входят в Git; на другой машине они и Chromium должны быть подготовлены отдельно.
