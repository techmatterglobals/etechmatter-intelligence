import { STATES, STATE_BY_CODE, type CountRow } from '@etm/shared';
import { useState } from 'react';
import { OpportunityCard } from '../components/intel';
import { Card, CardHeader, ErrorBox, Pill, Spinner } from '../components/ui';
import { useApp } from '../lib/appContext';
import { cn } from '../lib/format';
import { useAsync, useNow } from '../lib/hooks';
import { Link } from '../lib/router';

const SEQ = ['var(--color-sunken)', 'var(--color-seq-1)', 'var(--color-seq-2)', 'var(--color-seq-3)', 'var(--color-seq-4)', 'var(--color-seq-5)'];

/**
 * Equal-area tile map: every state gets the same tile so small eastern states
 * are as clickable as Texas. Tile shade = opportunity count; the dot = hot count.
 */
export function MapPage() {
  const { api, version } = useApp();
  const now = useNow();
  const { data, error, reload } = useAsync(() => api.map(), [version]);
  const [sel, setSel] = useState<string | null>(null);
  const list = useAsync(() => (sel ? api.listOpportunities({ states: [sel], sort: 'score', pageSize: 20 }) : Promise.resolve(null)), [sel, version]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const by: Record<string, CountRow> = Object.fromEntries(data.states.map((r) => [r.key, r]));
  const max = Math.max(1, ...data.states.map((r) => r.count));
  const shade = (n: number) => (n === 0 ? SEQ[0] : SEQ[Math.min(5, 1 + Math.floor(((n - 1) / max) * 5))]);
  const row = sel ? by[sel] : null;
  const top = [...data.states].filter((r) => r.key !== 'Unknown').slice(0, 6);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div>
        <div className="eyebrow">Geographic view</div>
        <h1 className="font-display text-2xl font-semibold text-ink">Where the demand is</h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <div className="overflow-x-auto">
            <div className="grid min-w-[36rem] gap-1" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
              {Array.from({ length: 8 * 12 }).map((_, i) => {
                const col = i % 12;
                const r = Math.floor(i / 12);
                const st = STATES.find((s) => s.col === col && s.row === r);
                if (!st) return <div key={i} />;
                const c = by[st.code];
                const n = c?.count ?? 0;
                const dark = n > 0 && Math.min(5, 1 + Math.floor(((n - 1) / max) * 5)) >= 3;
                return (
                  <button
                    key={st.code}
                    onClick={() => setSel(sel === st.code ? null : st.code)}
                    title={`${st.name}: ${n} opportunit${n === 1 ? 'y' : 'ies'}${c?.hot ? `, ${c.hot} hot` : ''}`}
                    aria-pressed={sel === st.code}
                    className={cn('relative flex aspect-square flex-col items-center justify-center rounded-md text-[11px] font-semibold transition-transform cursor-pointer', sel === st.code ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-105')}
                    style={{ background: shade(n), color: dark ? '#fff' : 'var(--color-ink-2)' }}
                  >
                    {st.code}
                    {n > 0 && <span className="font-mono text-[10px] font-medium opacity-90 tnum">{n}</span>}
                    {!!c?.hot && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-hot ring-1 ring-surface" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
            <span>Fewer</span>
            {SEQ.slice(1).map((c) => (
              <span key={c} className="h-3 w-6 rounded-sm" style={{ background: c }} />
            ))}
            <span>More opportunities</span>
            <span className="ml-3 inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-hot" /> has hot opportunities
            </span>
          </div>
        </Card>
        <Card>
          {row && sel ? (
            <>
              <CardHeader title={STATE_BY_CODE[sel]} eyebrow="Selected state" right={<button className="text-xs text-ink-3 cursor-pointer" onClick={() => setSel(null)}>Clear</button>} />
              <div className="font-display text-3xl font-semibold text-ink tnum">{row.count}</div>
              <div className="text-xs text-ink-3">opportunities</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill tone="hot">🔥 {row.hot} Hot</Pill>
                <Pill tone="warm">{row.warm} Warm</Pill>
                <Pill tone="low">{row.low} Low</Pill>
              </div>
              <Link to={`/opportunities?states=${sel}`} className="mt-4 block text-sm font-medium text-brand">
                Open in Live Opportunities →
              </Link>
            </>
          ) : (
            <>
              <CardHeader title="Top states" eyebrow="Click a tile to drill in" />
              <ul className="flex flex-col divide-y divide-line">
                {top.map((r) => (
                  <li key={r.key}>
                    <button className="flex w-full items-center justify-between py-2 text-sm cursor-pointer" onClick={() => setSel(r.key)}>
                      <span className="text-ink">{r.label}</span>
                      <span className="flex items-center gap-2 text-xs text-ink-3 tnum">
                        {!!r.hot && <Pill tone="hot">{r.hot} hot</Pill>}
                        <b className="font-mono text-ink">{r.count}</b>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
      {sel && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">Opportunities in {STATE_BY_CODE[sel]}</h2>
          {list.data?.items.map((o) => <OpportunityCard key={o.id} o={o} now={now} />)}
          {list.data && list.data.items.length === 0 && <div className="text-sm text-ink-3">No active opportunities in this state.</div>}
        </div>
      )}
    </div>
  );
}
