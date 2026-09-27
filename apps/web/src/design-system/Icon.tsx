import type { CSSProperties } from 'react';
const shapes: Record<string, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  signal: 'M3 12h4l3-8 4 16 3-8h4',
  risk: 'M12 3 2 21h20L12 3ZM12 9v5M12 17v1',
  plan: 'M8 5H5v16h14V5h-3M8 3h8v5H8zM8 12h8M8 16h5',
  data: 'M3 5c0-4 18-4 18 0s-18 4-18 0Zm0 0v7c0 4 18 4 18 0V5M3 12v7c0 4 18 4 18 0v-7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l4 2',
  shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Zm-4 10 3 3 5-6',
  temperature: 'M9 5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0V5Zm3 2v10',
  bolt: 'm13 2-9 12h7l-1 8L21 9h-8l0-7Z',
  user: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-3c0-6 16-6 16 0v3',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7v1',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  refresh: 'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-3l1 2M4 17l1 2a8 8 0 0 0 14-3',
  play: 'm8 4 12 8-12 8V4Z',
  pause: 'M8 4v16M16 4v16',
  menu: 'M3 5h18M3 12h18M3 19h18',
  history: 'M3 4v6h6M4 9a9 9 0 1 1 0 7M12 7v6l3 2',
  file: 'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8M8 16h6',
};
export function Icon({ name, size = 18, style }: { name: string; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={shapes[name] ?? shapes.info} /></svg>;
}
