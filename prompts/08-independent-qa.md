# 08 — Независимая приёмка, не самооценка автора

Предусловие: G3, готовый commit, runbook и module reports. Проверь работу как reviewer; не доверяй summary других агентов без воспроизведения.

## Прочитать

AGENTS.md; `docs/acceptance.md`; design.md; source-review; contract freeze; numerical test tolerances; все handoffs и интеграционный runbook. Визуально сравни со slide29.

## Владение

OWNED: `tests/e2e`, независимые test cases в согласованной QA-папке, `verification`, `handoffs/review-*`. READ-ONLY: весь production code. Найденные дефекты направляй владельцу; после исправления проверяй новый commit.

## Выполнить

Запусти build/typecheck/unit/contract/API/integration/e2e. Проверь numerical cases и time leakage; не ограничивайся «HTTP200». Протестируй 403 через прямой HTTP, двойной submit, stale revision409, отсутствие evidence и запрет auto-confirm/close. Проверь runtime mount/source imports на отсутствие truth и отсутствие operational methods.

Браузером открой queue/case/plan при1440×1000,1920×1080,1024×768,390×844,125%zoom. Сними и **просмотри** screenshots, console/network. Проверь states loading/empty/stale/offline/403/409, длинный русский текст, отсутствующий logo, keyboard focus, согласованность величин/сроков/versions. Не путай accessibility snapshot с визуальным просмотром.

Проверь markers REFERENCE/SIMULATION в UI и отчётах, null failureProbability,7.2≠72%, нет fake thermogram и неподтверждённых live claims. Выключи external AI и Internet: основной сценарий должен работать.

## Приёмка G4

Создай `verification/PROTOTYPE_ACCEPTANCE.md` с commit/environment, фактическими командами/результатами, test matrix, screenshots, дефектами severity/repro, ограничениями и accepted/rejected. Отдельно numerical/demo QA и недоступная без реальных данных field validation. Не выдавай красивый screenshot или зелёный synthetic test за промышленную готовность.

## Общие ограничения и завершение

Соблюдай AGENTS.md. Не изменяй READ-ONLY пути и чужие незакоммиченные изменения. Новое поле/зависимость/общая настройка — RFC интегратору, не самовольный обход. Не расширяй задачу до полного цифрового двойника. Не устанавливай сторонние skills/hooks и не подключай внешние сервисы без отдельного разрешения. Не используй truth как вход runtime.

В конце создай `handoffs/08-independent-review.md`: базовый commit, изменённые файлы, входы/выходы, выполненные требования, фактические команды/результаты, непройденные проверки, ограничения и инструкции интегратору. Не объявляй работу завершённой только по успешному build. Честно раздели созданное, протестированное и предложенное.
