import { useState } from 'react';
import { DemoBadge } from '../components/intel';
import { Card, ErrorBox, Pill, Spinner, inputCls } from '../components/ui';
import { useApp } from '../lib/appContext';
import { money, timeAgo } from '../lib/format';
import { useAsync, useNow } from '../lib/hooks';
import { navigate } from '../lib/router';

export function Organizations() {
  const { api, version } = useApp();
  const now = useNow();
  const { data, error, reload } = useAsync(() => api.organizations(), [version]);
  const [q, setQ] = useState('');
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const rows = data.filter((o) => !q || `${o.name} ${o.state} ${o.type}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Buyers identified from source documents</div>
          <h1 className="font-display text-2xl font-semibold text-ink">Organizations</h1>
        </div>
        <input id="org-filter" className={`${inputCls} max-w-xs`} placeholder="Filter by name, state or type" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter organizations" />
      </div>
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-sunken text-left text-[11px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="px-3 py-2 font-semibold">Organization</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Location</th>
                <th className="px-3 py-2 text-right font-semibold">Opportunities</th>
                <th className="px-3 py-2 text-right font-semibold">Hot</th>
                <th className="px-3 py-2 text-right font-semibold">Est. value</th>
                <th className="px-3 py-2 font-semibold">Latest signal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="cursor-pointer border-t border-line hover:bg-sunken" onClick={() => navigate(`/opportunities?q=${encodeURIComponent(o.name)}`)}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink">{o.name}</span> {o.isDemo && <DemoBadge />}
                  </td>
                  <td className="px-3 py-2 text-ink-2">{o.type}</td>
                  <td className="px-3 py-2 text-ink-2">{[o.city, o.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tnum">{o.opportunityCount}</td>
                  <td className="px-3 py-2 text-right">{o.hotCount ? <Pill tone="hot">{o.hotCount}</Pill> : <span className="text-ink-3">0</span>}</td>
                  <td className="px-3 py-2 text-right font-mono tnum">{o.totalEstimatedValue ? money(o.totalEstimatedValue, true) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-ink-3 tnum">{timeAgo(o.latestDiscoveredAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-ink-3">Organizations are only created from names found in source documents. Contacts are never guessed; enrichment (website, size) fills in when a source states it.</p>
    </div>
  );
}
