# 05 — Design system и общая оболочка

Предусловие: G1. Используй Product Design для структуры и frontend-design для реализации, только если они реально доступны. Их общие стилевые рекомендации подчиняются design.md.

## Прочитать и увидеть

AGENTS.md; `design.md` целиком; `references/slide-29.png` визуально; source-review про три экрана и расхождения; BrandConfig и frozen routing/component interfaces. Не копируй верхний презентационный баннер.

## Владение

OWNED: `apps/web/src/design-system`, `apps/web/src/shell`, `tests/ui-shell`, handoff/RFC. READ-ONLY: root router/lockfile/config (предлагай нужный export/RFC), `apps/web/src/features`, backend/core/DTO.

## Выполнить

Создай единый AppShell, BrandMark fallback, navigation, header/breadcrumb, mode/clock/connection banners, Typography/Button/Badge/Card/Table/Dialog/Drawer/Empty/Error/Loading primitives и токены. Светлые инженерные панели, dark navy sidebar, небольшие радиусы; не generic AI SaaS landing.

Бренд из config, semantic colors отдельно. Риск, статус случая, качество и electrical state — разные компоненты/варианты. Компоненты поддерживают keyboard/focus/aria и длинный русский текст. Системные шрифты с Cyrillic fallback без обязательного CDN.

Сделай изолированную UI-gallery/harness с длинным названием, отсутствующим логотипом, high/unknown/stale и кнопками разных состояний. Responsive1440/1920/1024/390. Не создавай псевдоработающий case или own DTO; передай feature-агенту явные props/events и usage examples.

## Приёмка

Собери и реально открой gallery браузером. Скриншоты основных размеров, проверка контраста, focus, переполнения, logo fallback,125% zoom. Проверь, что полоса времени означает время данных, а не случайный new Date(). Запиши компоненты/export paths и визуальные ограничения. Не правь feature-экраны за другого владельца.

## Общие ограничения и завершение

Соблюдай AGENTS.md. Не изменяй READ-ONLY пути и чужие незакоммиченные изменения. Новое поле/зависимость/общая настройка — RFC интегратору, не самовольный обход. Не расширяй задачу до полного цифрового двойника. Не устанавливай сторонние skills/hooks и не подключай внешние сервисы без отдельного разрешения. Не используй truth как вход runtime.

В конце создай `handoffs/05-ui-shell.md`: базовый commit, изменённые файлы, входы/выходы, выполненные требования, фактические команды/результаты, непройденные проверки, ограничения и инструкции интегратору. Не объявляй работу завершённой только по успешному build. Честно раздели созданное, протестированное и предложенное.
