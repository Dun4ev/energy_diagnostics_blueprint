# Исходники и готовые ролики

| Папка | Назначение | Готовый файл |
|---|---|---|
| `energy-product-film-v3` | Самостоятельная презентация продукта, 68 секунд | [Высокое качество](energy-product-film-v3/renders/final.mp4), [легкая копия](energy-product-film-v3/renders/share.mp4) |
| `energy-motion-v2` | Показ интерфейса, указателей и результатов, 90 секунд | [MP4](energy-motion-v2/renders/share.mp4) |
| `energy-explainer` | Первая версия разбора интерфейса, 112 секунд | [MP4](energy-explainer/renders/share.mp4) |

Для показа функций с ведущим используйте также [сценарий](../docs/runbook/PRESENTATION.md). Все экраны относятся к синтетическим примерам; решения разных учебных запусков подписаны. Рисунок трансформатора в третьем ролике является иллюстрацией, не фотографией объекта. Запрос для его создания сохранен в `energy-product-film-v3/brief.md`. Музыка во второй и третьей версиях создана ранее в ElevenLabs.

В каждой папке `src/` содержит исходный код, `piece.json` параметры, `assets/` изображения, `brief.md` сценарий и источники, `LOG.md` фактические проверки. Готовый `index.html` можно открыть локально как визуальный предпросмотр. В браузерном предпросмотре используется синтезированная подложка; дорожка ElevenLabs добавляется при экспорте MP4.

## Пересборка на Mac

Экспорт использует [animate](https://github.com/cth9191/animate), Node.js, Playwright с Chromium и FFmpeg. Для зависимостей самого проекта предусмотрен Node 25 и `npm ci`; скачивание пакетов и Chromium требует интернет. Если FFmpeg еще не установлен, установите его удобным способом и убедитесь, что команда `ffmpeg -version` работает.

Если на Mac нет `~/.codex/skills/animate`, попросите Codex установить навык из `cth9191/animate`, путь `plugins/animate/skills/animate`. На Windows использовался файл `SKILL.md` с Git blob SHA `09a2f3c5f07f2be6b88e9a9ebe515fae8e5f31fb`, совпадающий с версией репозитория на момент проверки; точная идентичность остальных файлов навыка не проверялась. Установка и рендер на Mac в этой сессии не проверялись.

После подготовки зависимостей из корня проекта:

```bash
npm ci
npx playwright install chromium
export NODE_PATH="$PWD/node_modules"
video_skill="$HOME/.codex/skills/animate"
node "$video_skill/tools/build.mjs" pieces/energy-product-film-v3
node "$video_skill/tools/export.mjs" pieces/energy-product-film-v3 --workers 4 --share
node "$video_skill/tools/review.mjs" pieces/energy-product-film-v3
```

Для ролика с интерфейсом замените имя папки на `energy-motion-v2`. Экспорт создает временные `frames/`, аудиостемы и контрольные листы, а также заменяет `renders/final.mp4` и `renders/share.mp4`. При необходимости предварительно сохраните свою версию. Временные файлы не добавляются в Git; готовые MP4 и исходники сохраняются в репозитории. Из-за различий системных шрифтов и версий инструментов новый рендер может отличаться от опубликованного.
