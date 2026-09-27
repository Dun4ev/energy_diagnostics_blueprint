/** Browser-review mount point. The application entry remains owned by the integrator. */
import { createRoot } from 'react-dom/client';
import { applyTokens } from '../config';
import { DiagnosticsApp } from './DiagnosticsApp';

export function mountDiagnosticsPreview() {
  applyTokens();
  const foundation = document.getElementById('root');
  if (foundation) foundation.hidden = true;
  const target = document.createElement('div');
  target.id = 'feature-preview';
  document.body.append(target);
  createRoot(target).render(<DiagnosticsApp />);
}
