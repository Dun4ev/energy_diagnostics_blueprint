import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api/client';
import { applyTokens, brand } from './config';
import { featureRegistrations } from './features';
import './style.css';
import { Gallery } from './shell/Gallery';

function Foundation() {
  const [status, setStatus] = useState('Проверка связи с backend...');
  useEffect(() => {
    api.GET('/api/v1/health').then(({ data }) => {
      setStatus(data?.status === 'ok' ? 'Backend и PostgreSQL доступны' : 'Backend или база данных недоступны');
    }).catch(() => setStatus('Нет связи с backend'));
  }, []);
  return <main>
    <p>DEMO · Каркас приложения</p>
    <h1>{brand.productName}</h1>
    <p role="status">{status}</p>
    <p>Диагностика, replay и согласование еще не реализованы.</p>
    <p>Режим данных не выбран. Время данных отсутствует.</p>
    <p>Советчик без управления оборудованием. Внешний AI отключен.</p>
    {featureRegistrations.filter(f => f.implemented).map(f => <a href={f.route} key={f.id}>{f.label}</a>)}
  </main>;
}
applyTokens();
document.title = brand.productName;
createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.pathname === '/gallery' ? <Gallery /> : <Foundation />}</StrictMode>);
