import { useState } from 'react';
import { AppShell, BrandMark } from './AppShell';
import { Badge, Banner, Button, Card, DataTable, Dialog, Empty, Loading, PageHeading } from '../design-system/components';
export function Gallery() {
  const [dialog, setDialog] = useState(false);
  return <AppShell active="gallery" nav={[{ id: 'gallery', href: '/gallery', label: 'Компоненты интерфейса', icon: 'grid' }]} mode="reference" dataTime="2026-07-24T07:42:00Z" connection="online" breadcrumb="Галерея компонентов">
    <PageHeading eyebrow="Проверка дизайн-системы" title="Единое рабочее пространство" subtitle="Изолированная галерея. Не является работающим диагностическим случаем." actions={<Button variant="primary" icon="plan" onClick={() => setDialog(true)}>Проверить диалог</Button>} />
    <Banner title="Референс презентации">Числа иллюстративны, данные зафиксированы во времени. Качество, риск и состояние процесса различаются.</Banner>
    <div className="two-column"><Card title="Семантические состояния" subtitle="Цвет всегда сопровождается подписью"><div className="stack"><div className="inline"><Badge tone="high">Высокий приоритет</Badge><Badge tone="medium">Требует проверки</Badge></div><div className="inline"><Badge tone="low">Низкий приоритет</Badge><Badge tone="unknown">Недостаточно данных</Badge></div><Banner tone="medium" title="Данные частично устарели">Последняя достоверная оценка сохраняется с отметкой времени.</Banner><div className="inline"><Button variant="primary">Основное действие</Button><Button>Вторичное</Button><Button disabled title="Недостаточно прав">Недоступно</Button></div></div></Card>
    <Card title="Пустое состояние"><Empty title="В этом диапазоне нет наблюдений">Измените период или проверьте поступление данных.</Empty></Card></div>
    <Card title="Таблица и длинные подписи"><DataTable label="Пример таблицы"><thead><tr><th>Объект</th><th>Качество</th><th>Следующий шаг</th></tr></thead><tbody><tr><td>Трансформаторный пункт с длинным названием / Т-1</td><td><Badge tone="unknown">Нет оценки</Badge></td><td>Проверить поступление измерений</td></tr></tbody></DataTable></Card>
    <div className="two-column"><Card title="Загрузка"><Loading /></Card><Card title="Fallback бренда"><div className="brand-preview"><BrandMark title="Длинное название демонстрационной энергетической организации" logo="/missing-logo.png" /></div></Card></div>
    <Dialog open={dialog} onClose={() => setDialog(false)} title="Проверка доступности диалога"><p>Фокус остается внутри. Escape или кнопка закрывают диалог.</p><label className="field">Основание<textarea placeholder="Комментарий инженера" /></label><div className="dialog-actions"><Button onClick={() => setDialog(false)}>Отмена</Button><Button variant="primary" onClick={() => setDialog(false)}>Завершить проверку</Button></div></Dialog>
  </AppShell>;
}
