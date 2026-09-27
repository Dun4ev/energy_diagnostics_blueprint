import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './Icon';
export type Tone = 'high' | 'medium' | 'low' | 'unknown' | 'blue';
export function Badge({ tone = 'unknown', children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={`badge badge-${tone}`}>{dot && <span className="badge-dot" />}{children}</span>;
}
export function Button({ variant = 'secondary', icon, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: string }) {
  return <button {...props} className={`button button-${variant} ${className}`}>{icon && <Icon name={icon} />}{children}</button>;
}
export function Card({ title, subtitle, actions, children, className = '', id }: { title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return <section className={`panel ${className}`} id={id}>{(title || actions) && <header className="panel-heading"><div>{title && <h2>{title}</h2>}{subtitle && <p className="muted small">{subtitle}</p>}</div>{actions}</header>}<div className="panel-body">{children}</div></section>;
}
export function Banner({ tone = 'blue', title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  return <div className={`banner banner-${tone}`} role={tone === 'high' ? 'alert' : 'status'}><Icon name={tone === 'high' || tone === 'medium' ? 'risk' : 'info'} /><div><strong>{title}</strong>{children && <div className="small">{children}</div>}</div></div>;
}
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="data" size={28} /></span><h3>{title}</h3><p className="muted">{children}</p>{action}</div>;
}
export function Loading({ label = 'Загружаем данные...' }: { label?: string }) { return <div className="loading-state" role="status"><span className="spinner" />{label}</div>; }
export function ErrorState({ message, requestId, retry }: { message: string; requestId?: string; retry?: () => void }) {
  return <Banner tone="high" title={message}>{requestId && <p>Код обращения: {requestId}</p>}{retry && <Button onClick={retry} icon="refresh">Повторить</Button>}</Banner>;
}
export function Dialog({ open, onClose, title, children, drawer = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close(); }, [open]);
  return <dialog ref={ref} className={drawer ? 'dialog drawer' : 'dialog'} onCancel={onClose} onClose={onClose} aria-labelledby="dialog-title"><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><Button variant="ghost" onClick={onClose} aria-label="Закрыть" icon="close" /></div><div className="dialog-body">{children}</div></dialog>;
}
export function PageHeading({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{subtitle && <div className="muted page-subtitle">{subtitle}</div>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
export function DataTable({ children, label }: { children: ReactNode; label: string }) { return <div className="table-scroll" tabIndex={0} role="region" aria-label={label}><table className="data-table">{children}</table></div>; }
