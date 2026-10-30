import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Api } from './api/client';
import { App } from './App';
import './index.css';

/**
 * API mode:
 *   VITE_API_MODE=server      → always use the Node backend (/api)
 *   VITE_API_MODE=standalone  → run the engine in the browser on DEMO DATA
 *   (default) auto            → use the backend if /api/health answers, else standalone
 */
async function pickApi(): Promise<Api> {
  const mode = (import.meta.env.VITE_API_MODE as string | undefined) ?? 'auto';
  if (mode !== 'standalone') {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch('/api/health', { signal: ctl.signal });
      clearTimeout(t);
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return (await import('./api/http')).httpApi;
    } catch {
      /* backend not reachable */
    }
    if (mode === 'server') return (await import('./api/http')).httpApi;
  }
  return (await import('./api/standalone')).standaloneApi;
}

pickApi().then((api) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App api={api} />
    </StrictMode>,
  );
});
