import type { AlertEvent } from '@etm/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  LuBell, LuBuilding2, LuChartColumn, LuFlame, LuLayoutDashboard, LuListFilter, LuMap, LuMenu, LuPackage, LuRadioTower,
  LuRefreshCw, LuSearch, LuSettings, LuSquareKanban, LuX, LuBellRing, LuLogIn ,
} from 'react-icons/lu';
import { cn, timeAgo } from '../lib/format';
import { useApp } from '../lib/appContext';
import { Link, navigate, usePath } from '../lib/router';
import { IntentIcon } from './intel';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LuLayoutDashboard },
  { to: '/opportunities', label: 'Live Opportunities', icon: LuListFilter },
  { to: '/hot', label: 'Hot Leads', icon: LuFlame },
  { to: '/map', label: 'Map', icon: LuMap },
  { to: '/organizations', label: 'Organizations', icon: LuBuilding2 },
  { to: '/products', label: 'Products', icon: LuPackage },
  { to: '/pipeline', label: 'Pipeline', icon: LuSquareKanban },
  { to: '/alerts', label: 'Alerts', icon: LuBell },
  { to: '/sources', label: 'Sources', icon: LuRadioTower },
  { to: '/analytics', label: 'Analytics', icon: LuChartColumn },
  { to: '/login', label: 'Login', icon: LuLogIn },
  { to: '/admin', label: 'Settings', icon: LuSettings },
];

export function RadarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#12243b" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="#2e4f7a" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="5.5" fill="none" stroke="#2e4f7a" strokeWidth="1.2" />
      <g className="radar-sweep">
        <path d="M16 16 L16 6 A10 10 0 0 1 24.6 11 Z" fill="#4d8dff" opacity="0.35" />
        <line x1="16" y1="16" x2="24.6" y2="11" stroke="#6aa1ff" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <circle cx="21.5" cy="20" r="1.9" fill="#ff6b4a" />
      <circle cx="16" cy="16" r="1.6" fill="#8fb6ff" />
    </svg>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePath();
  const { api } = useApp();
  const active = (to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(to + '/') || path.startsWith(to + '?'));
  return (
    <nav className="flex h-full flex-col bg-nav text-nav-ink" aria-label="Main">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-5">
        <RadarMark className="h-8 w-8 shrink-0" />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-semibold tracking-wide text-white">ETechMatter</div>
          <div className="font-display text-[11px] font-medium uppercase tracking-[0.16em] text-nav-muted">Intelligence</div>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-0.5 px-2 overflow-y-auto scroll-thin">
        {NAV.map((n) => (
          <li key={n.to}>
            <Link
              to={n.to}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                active(n.to) ? 'bg-nav-2 text-white' : 'text-nav-muted hover:bg-nav-2 hover:text-nav-ink',
              )}
            >
              <span onClick={onNavigate} className="contents">
                <n.icon className={cn('h-4 w-4 shrink-0', active(n.to) && n.to === '/hot' && 'text-signal')} aria-hidden />
                {n.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="m-3 rounded-md border border-nav-line p-3 text-[11px] leading-snug text-nav-muted">
        {api.mode === 'standalone' ? (
          <>
            <div className="font-semibold text-nav-ink">Standalone demo</div>
            Engine running in your browser on DEMO DATA. Live connectors run on the backend server.
          </>
        ) : (
          <>
            <div className="font-semibold text-nav-ink">Connected to API</div>
            Live connectors, scheduler and database run on the server.
          </>
        )}
        <a href="https://etechmatter.com" target="_blank" rel="noreferrer" className="mt-2 block text-nav-ink hover:text-white">
          etechmatter.com ↗
        </a>
      </div>
    </nav>
  );
}

function Notifications() {
  const { api, version } = useApp();
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api.alertEvents().then((ev) => {
        if (!alive) return;
        // browser notifications for newly arrived alerts (only after permission)
        if (!first.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          for (const e of ev.filter((x) => !seen.current.has(x.id)).slice(0, 3)) {
            try {
              new Notification(`${e.intentLevel === 'HOT' ? '🔥 ' : ''}${e.ruleName}`, { body: e.opportunityTitle });
            } catch {
              /* notifications unavailable */
            }
          }
        }
        ev.forEach((x) => seen.current.add(x.id));
        first.current = false;
        setEvents(ev);
      }).catch(() => undefined);
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [api, version]);
  const unread = events.filter((e) => !e.read).length;
  return (
    <div className="relative">
      <button
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:bg-sunken cursor-pointer"
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <LuBell />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-hot px-1 text-center text-[10px] font-bold leading-4 text-white tnum">{unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="font-display text-sm font-semibold">Alerts</span>
            <div className="flex items-center gap-2">
              {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
                <button
                  className="text-[11px] text-brand hover:underline cursor-pointer inline-flex items-center gap-1"
                  onClick={() => Notification.requestPermission().catch(() => undefined)}
                >
                  <LuBellRing /> Browser alerts
                </button>
              )}
              <button
                className="text-[11px] text-ink-3 hover:text-ink cursor-pointer"
                onClick={() => api.markAlertsRead().then(() => setEvents(events.map((e) => ({ ...e, read: true }))))}
              >
                Mark all read
              </button>
            </div>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {events.length === 0 && <li className="px-3 py-6 text-center text-xs text-ink-3">No alerts yet. Create alert rules to be notified when matching opportunities arrive.</li>}
            {events.map((e) => (
              <li key={e.id} className={cn('border-b border-line last:border-0', !e.read && 'bg-brand-soft')}>
                <Link to={`/opportunities/${e.opportunityId}`} className="block px-3 py-2 hover:bg-sunken">
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
                    <IntentIcon level={e.intentLevel} /> {e.ruleName} · {timeAgo(e.createdAt)}
                  </div>
                  <div className="text-xs text-ink line-clamp-2">{e.opportunityTitle}</div>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/alerts" className="block border-t border-line px-3 py-2 text-center text-xs font-medium text-brand">
            Manage alert rules
          </Link>
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { openSync ,api } = useApp();
const handleLogout = async () => {
  try {
    await api.logout();
    setCurrentUser(null);
    navigate('/login');
  } catch (error) {
    console.error('Logout failed:', error);
  }
};
const [currentUser, setCurrentUser] = useState<{
  name: string;
  email?: string;
  role?: string;
} | null>(null);

useEffect(() => {
  let active = true;

  fetch('/api/auth/me', {
    credentials: 'include',
  })
    .then(async (response) => {
      if (!response.ok) return null;
      return response.json();
    })
    .then((data) => {
      if (active && data?.user) {
        setCurrentUser(data.user);
      }
    })
    .catch(() => {
      if (active) setCurrentUser(null);
    });

  return () => {
    active = false;
  };
}, []);

const initials =
  currentUser?.name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
  const [q, setQ] = useState('');
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <button className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-sunken cursor-pointer" onClick={onMenu} aria-label="Open menu">
        <LuMenu />
      </button>
      <form
        className="relative min-w-0 flex-1 max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/opportunities?q=${encodeURIComponent(q.trim())}`);
        }}
        role="search"
      >
        <LuSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          id="global-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask: hospitals in Texas looking for servers"
          className="h-9 w-full rounded-md border border-line bg-sunken pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:bg-surface focus:outline-none"
          aria-label="Search opportunities in plain English"
        />
      </form>
      <button
        onClick={openSync}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-strong cursor-pointer whitespace-nowrap"
      >
        <LuRefreshCw aria-hidden /> <span className="hidden sm:inline">SYNC NOW</span>
      </button>
      <Notifications />
      <div
  className="hidden md:flex items-center gap-2 pl-1"
  title={
    currentUser
      ? `${currentUser.name}${currentUser.role ? ` (${currentUser.role})` : ''}`
      : 'Current user'
  }
>
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nav text-xs font-semibold text-white">
    {initials}
  </div>
<button
  type="button"
  onClick={handleLogout}
  className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-sunken"
>
  Logout
</button>
  <div className="min-w-0 max-w-40">
    <div className="truncate text-sm font-medium text-ink">
      {currentUser?.name || 'Loading user...'}
    </div>

    {currentUser?.role && (
      <div className="text-[11px] text-ink-3">
        {currentUser.role}
      </div>
    )}
  </div>
</div>
    </header>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const path = usePath();
  useEffect(() => setMenu(false), [path]);
  return (
    <div className="flex min-h-full">
      <aside className="hidden lg:block w-56 shrink-0">
        <div className="fixed inset-y-0 w-56">
          <Sidebar />
        </div>
      </aside>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            <Sidebar onNavigate={() => setMenu(false)} />
            <button className="absolute right-2 top-4 rounded p-1 text-nav-ink cursor-pointer" onClick={() => setMenu(false)} aria-label="Close menu">
              <LuX />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="flex-1 px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
