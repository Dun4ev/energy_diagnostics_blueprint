# Stage05: общая оболочка

Base: stage01-g1, 2be16f3929495846bd71b227ad2ba39fb16dd7a7. Реализовано интегратором последовательно.

Компоненты: `apps/web/src/design-system/components.tsx` экспортирует Button, Badge, Card, Banner, Empty, Loading, ErrorState, Dialog (drawer=true для панели), PageHeading, DataTable. Icon принимает name/size. `shell/AppShell.tsx`: AppShell (nav, active, mode, dataTime, connection, userLabel, roleLabel, onLogout, headerActions, breadcrumb, children), BrandMark (title/logo), formatTime. Единственный shell должен оборачивать связанные экраны. Галерея `/gallery` изолирована от диагностических функций.

Изменены OWNED design-system/shell/tests/ui-shell; интегратор подключил main.tsx и общие style.css. DTO и расчетов в оболочке нет. Токены/brand читаются из config; время данных приходит через props и форматируется в timezone бренда. Логотип имеет текстовый fallback. Native dialog обеспечивает Escape/focus trap; формы имеют label. Риск/unknown различаются словом и цветом.

Фактически: npm run build и npm run lint успешно; Playwright tests/ui-shell 5 passed на 1440/1920/1024/390 и 125% zoom. Проверены отсутствие горизонтального переполнения документа, открытие/закрытие диалога и восстановление фокуса, длинное имя/отсутствующий логотип. Скриншоты verification/shell-*.png просмотрены. После просмотра исправлены spacing footer и область CSS скрытия текста logo при 1024. Контраст семантических токенов проверен blueprint tests ранее; независимый финальный UI review еще впереди. Узкая таблица имеет локальную прокрутку.

Воспроизведение: npm run dev -- --port 5173; в другом терминале ./node_modules/.bin/playwright test -c tests/ui-shell/playwright.config.ts. Это галерея, не доказательство бизнес-интеграции. Следующее действие: features в stage06 используют эти exports и frozen generated client; успешные серверные операции показывать только после ответа API. Общие изменения запрашивать у интегратора.
