import { useState, useEffect, useRef, type ReactNode } from 'react';
import { brand } from '../config';
import { Icon } from '../design-system/Icon';
import { Button, Badge } from '../design-system/components';
import type { components } from '../api/generated';
export type Mode = components['schemas']['AnalysisResult']['mode'];
export const formatTime = (value: string | null, options?: Intl.DateTimeFormatOptions) => value ? new Intl.DateTimeFormat('ru-RU', { timeZone: brand.timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', ...options }).format(new Date(value)) : 'Нет данных';
export type NavItem = { id: string; href: string; label: string; icon: string };
export function BrandMark({ title = brand.productName, logo = brand.logoLight }: { title?: string; logo?: string | null }) {
  const [failed, setFailed] = useState(false);
  return <a className="brand" href="/" aria-label={title}>{logo && !failed ? <img src={logo} alt={brand.logoAlt} onError={() => setFailed(true)} /> : <span className="brand-symbol"><Icon name="signal" size={27} /></span>}<span className="brand-text">{title.replace(' · DEMO', '')}<small>Советчик · DEMO</small></span></a>;
}
export function AppShell({ children, nav, active, mode, dataTime, connection, userLabel = 'Демонстрационный доступ', roleLabel = 'Просмотр', onLogout, headerActions, breadcrumb = 'Рабочее место инженера' }: {
  children: ReactNode; nav: NavItem[]; active: string; mode: Mode | null; dataTime: string | null;
  connection: 'online' | 'offline' | 'loading'; userLabel?: string; roleLabel?: string; onLogout?: () => void; headerActions?: ReactNode; breadcrumb?: string;
}) {
  const [menu, setMenu] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width:1023px)').matches);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width:1023px)');
    const update = () => { setCompact(media.matches); if (!media.matches) setMenu(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [menu]);
  return <div className={`app-layout ${menu ? 'menu-open' : ''}`}>
    <aside id="main-navigation" className="sidebar" inert={compact && !menu} aria-hidden={compact && !menu}><BrandMark /><div className="workspace-label">РАБОЧЕЕ МЕСТО</div><nav aria-label="Главная навигация" onClick={() => setMenu(false)}>{nav.map(item => <a key={item.id} href={item.href} className={`nav-link ${active === item.id ? 'active' : ''}`} aria-current={active === item.id ? 'page' : undefined} title={item.label}><Icon name={item.icon} /><span>{item.label}</span>{active === item.id && <span className="nav-current" />}</a>)}</nav><div className="sidebar-bottom"><div className="advisory-mark"><Icon name="shield" size={20} /><span>Советчик<br /><strong>Без команд в сеть</strong></span></div><div className="sidebar-version">Демонстрационный прототип<span>v0.1</span></div></div></aside>
    {menu && <button className="menu-overlay" aria-label="Закрыть меню" onClick={() => setMenu(false)} />}
    <div className="app-main"><header className="topbar"><Button ref={menuButton} aria-expanded={menu} aria-controls="main-navigation" className="mobile-menu" icon="menu" variant="ghost" aria-label="Открыть меню" onClick={() => setMenu(!menu)} /><div className="breadcrumb">Энергетические активы<Icon name="chevron" size={13} /><strong>{breadcrumb}</strong></div><div className="topbar-right"><span className={`connection ${connection}`} title={connection === 'online' ? 'Связь с сервером' : 'Нет актуального ответа сервера'} /><div className="profile"><span className="avatar"><Icon name="user" size={17} /></span><div><strong>{userLabel}</strong><small>{roleLabel}</small></div>{onLogout && <Button variant="ghost" onClick={onLogout} title="Выйти">Выйти</Button>}</div></div></header>
    <div className="data-context"><div className="data-context-left"><Badge tone={mode === 'simulation' ? 'blue' : 'unknown'} dot={false}>{mode === 'simulation' ? 'SIMULATION' : mode === 'reference' ? 'REFERENCE' : 'DEMO'}</Badge><span>{mode === 'simulation' ? 'Синтетические данные · не подключено к объекту' : mode === 'reference' ? 'Иллюстрация презентации · фиксированные значения' : 'Выберите набор для демонстрации'}</span></div><div className="data-context-right"><Icon name="clock" size={14} /><span>Время данных ({brand.timezone === 'Europe/Moscow' ? 'МСК' : brand.timezone}): <strong>{formatTime(dataTime)}</strong></span>{headerActions}</div></div>
    <main className="workspace">{children}</main><footer className="app-footer"><span>Решение остается за инженером</span><span>Индекс приоритета не является вероятностью отказа</span></footer></div>
  </div>;
}
