import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Api } from './api/client';
import { Layout } from './components/Layout';
import { SyncDialog } from './components/SyncDialog';
import { Toast } from './components/ui';
import { AppContext } from './lib/appContext';
import { matchRoute, navigate, usePath } from './lib/router';
import { Admin } from './pages/Admin';
import { Alerts } from './pages/Alerts';
import { Analytics } from './pages/Analytics';
import { Dashboard } from './pages/Dashboard';
import { MapPage } from './pages/MapPage';
import { Opportunities } from './pages/Opportunities';
import { OpportunityDetail } from './pages/OpportunityDetail';
import { Organizations } from './pages/Organizations';
import { Pipeline } from './pages/Pipeline';
import { Products } from './pages/Products';
import { Sources } from './pages/Sources';

function Routes() {
  const path = usePath();
  const base = path.split('?')[0];
  const detail = matchRoute('/opportunities/:id', base);
  if (detail) return <OpportunityDetail id={detail.id} />;
  switch (base) {
    case '/':
      return <Dashboard />;
    case '/opportunities':
      return <Opportunities />;
    case '/hot':
      return <Opportunities preset={{ intent: ['HOT'] }} title="Hot Leads" eyebrow="Explicit, current, high-intent buying requests" />;
    case '/map':
      return <MapPage />;
    case '/organizations':
      return <Organizations />;
    case '/products':
      return <Products />;
    case '/pipeline':
      return <Pipeline />;
    case '/alerts':
      return <Alerts />;
    case '/sources':
      return <Sources />;
    case '/analytics':
      return <Analytics />;
    case '/admin':
    case '/settings':
      return <Admin />;
    default:
      return (
        <div className="py-16 text-center text-ink-2">
          Page not found. <a className="text-brand" href="#/">Go to the dashboard</a>
        </div>
      );
  }
}

export function App({ api }: { api: Api }) {
  const [version, setVersion] = useState(0);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const ctx = useMemo(() => ({ api, version, refresh, toast: setToast, openSync: () => setSyncOpen(true) }), [api, version, refresh]);
  useEffect(() => {
    // support a real /admin URL (server serves index.html for it)
    if (window.location.pathname.replace(/\/$/, '').endsWith('/admin') && !window.location.hash) navigate('/admin');
  }, []);
  return (
    <AppContext.Provider value={ctx}>
      <Layout>
        <Routes />
      </Layout>
      <SyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} />
      <Toast message={toastMsg} onDone={() => setToast(null)} />
    </AppContext.Provider>
  );
}
