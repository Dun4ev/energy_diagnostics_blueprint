import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTokens, brand } from './config';
import { DiagnosticsApp } from './features';
import { Gallery } from './shell/Gallery';
import { StandDisplay } from './stand/StandDisplay';
import { StandContinue } from './features/StandContinue';
import { beginStandHandoff } from './features/standContext';
import './style.css';

applyTokens();
document.title = brand.productName;
createRoot(document.getElementById('root')!).render(
  <StrictMode>{window.location.pathname === '/gallery' ? <Gallery />
    : window.location.pathname === '/stand' ? <StandDisplay onContinue={beginStandHandoff} />
      : window.location.pathname === '/stand/continue' ? <StandContinue /> : <DiagnosticsApp />}</StrictMode>,
);
