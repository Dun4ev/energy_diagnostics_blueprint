import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTokens, brand } from './config';
import { DiagnosticsApp } from './features';
import { Gallery } from './shell/Gallery';
import './style.css';

applyTokens();
document.title = brand.productName;
createRoot(document.getElementById('root')!).render(
  <StrictMode>{window.location.pathname === '/gallery' ? <Gallery /> : <DiagnosticsApp />}</StrictMode>,
);
