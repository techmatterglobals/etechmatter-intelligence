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
  const mode = (import.meta.env.VITE_API_MODE as string | undefined) ?? 'server';

  if (mode === 'standalone') {
    // Explicit development/demo mode only.
    return (await import('./api/standalone')).standaloneApi;
  }

  const httpApi = (await import('./api/http')).httpApi;

  try {
    const response = await fetch('/api/health', {
      signal: AbortSignal.timeout(2500),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`API health check failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data?.ok !== true) {
      throw new Error('API health check returned an invalid response');
    }

    return httpApi;
  } catch (error) {
    console.error('Backend unavailable; demo fallback disabled.', error);
    throw new Error(
      'ETechMatter API is unavailable. Start the backend and refresh the page.',
    );
  }
}


pickApi()
  .then((api) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App api={api} />
      </StrictMode>,
    );
  })
  .catch((error) => {
    const root = document.getElementById('root');
    if (root) {
      root.textContent =
        error instanceof Error ? error.message : 'Unable to start the application.';
    }
  });
