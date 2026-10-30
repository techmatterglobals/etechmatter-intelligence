import { SOURCE_TYPE_LABELS } from '@etm/shared';
import { useState } from 'react';
import { LuExternalLink, LuPlug, LuRefreshCw } from 'react-icons/lu';
import { ConfidencePill } from '../components/intel';
import { Button, Card, CardHeader, ErrorBox, Pill, Spinner } from '../components/ui';
import { useApp } from '../lib/appContext';
import { dateTime, timeAgo } from '../lib/format';
import { useAsync, useNow } from '../lib/hooks';
import { Link } from '../lib/router';
import { STATUS_LABEL, StatusDot } from './Dashboard';

export function Sources() {
  const { api, version, openSync } = useApp();
  const now = useNow();
  const { data, error, reload } = useAsync(() => api.sources(), [version]);
  const runs = useAsync(() => api.runs(), [version]);
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string } | 'running'>>({});
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Source → fetch → normalize → dedupe → classify → extract → score → match → store → alert</div>
          <h1 className="font-display text-2xl font-semibold text-ink">Sources</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/admin" className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-sunken">
            Configure
          </Link>
          <Button variant="primary" icon={<LuRefreshCw />} onClick={openSync}>
            Sync now
          </Button>
        </div>
      </div>
      {api.mode === 'standalone' && (
        <div className="rounded-lg border border-line-strong bg-surface p-3 text-sm text-ink-2">
          This is the standalone preview. Live connectors (SAM.gov, USAspending, state/local portals, public web) run in the Node backend, where API keys stay secret. Here, only the clearly labelled Demo Feed can run.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data.map((s) => {
          const t = tests[s.key];
          return (
            <Card key={s.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="eyebrow">{SOURCE_TYPE_LABELS[s.type]}</div>
                  <h2 className="font-display text-base font-semibold text-ink">{s.name}</h2>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs font-medium text-ink">
                  <StatusDot s={s.status} /> {STATUS_LABEL[s.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-2">{s.description}</p>
              <p className="mt-2 rounded-md bg-sunken p-2 text-xs text-ink-2">{s.statusMessage}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs tnum">
                <div>
                  <dt className="text-ink-3">Last successful run</dt>
                  <dd className="text-ink" title={dateTime(s.lastSuccessAt)}>{s.lastSuccessAt ? timeAgo(s.lastSuccessAt, now) : 'Never'}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Next scheduled run</dt>
                  <dd className="text-ink">{s.nextRunAt ? timeAgo(s.nextRunAt, now) : s.intervalMinutes ? 'Waiting for configuration' : 'Manual only'}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Interval</dt>
                  <dd className="text-ink">{s.intervalMinutes ? `Every ${s.intervalMinutes >= 60 ? `${s.intervalMinutes / 60}h` : `${s.intervalMinutes} min`}` : 'Manual'}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Confidence</dt>
                  <dd>
                    <ConfidencePill c={s.confidence} />
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {s.isDemo ? <Pill tone="demo">DEMO SOURCE</Pill> : s.isLive ? <Pill tone="verified">LIVE CONNECTOR</Pill> : null}
                {s.requiredEnv.map((e) => (
                  <Pill key={e} tone="outline">
                    env: {e}
                  </Pill>
                ))}
                <div className="ml-auto flex gap-2">
                  {s.docsUrl && (
                    <a href={s.docsUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 px-2 text-xs text-brand">
                      API docs <LuExternalLink />
                    </a>
                  )}
                  <Button
                    size="sm"
                    icon={<LuPlug />}
                    loading={t === 'running'}
                    onClick={async () => {
                      setTests({ ...tests, [s.key]: 'running' });
                      const r = await api.testSource(s.key).catch((e) => ({ ok: false, message: String(e) }));
                      setTests((x) => ({ ...x, [s.key]: r }));
                    }}
                  >
                    Test connection
                  </Button>
                </div>
              </div>
              {t && t !== 'running' && (
                <div className={`mt-2 rounded-md p-2 text-xs ${t.ok ? 'bg-low-soft text-low-ink' : 'bg-hot-soft text-hot-ink'}`}>{t.message}</div>
              )}
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader title="Run history" eyebrow="Every scheduled and manual run is recorded" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Started</th>
                <th className="py-1.5 pr-3 font-semibold">Source</th>
                <th className="py-1.5 pr-3 font-semibold">Trigger</th>
                <th className="py-1.5 pr-3 font-semibold">Status</th>
                <th className="py-1.5 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {(runs.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2 pr-3 text-xs text-ink-2 tnum">{dateTime(r.startedAt)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.sourceKey}</td>
                  <td className="py-2 pr-3 text-xs text-ink-2">{r.trigger}</td>
                  <td className="py-2 pr-3">
                    <Pill tone={r.status === 'SUCCESS' ? 'low' : r.status === 'ERROR' ? 'hot' : 'muted'}>{r.status}</Pill>
                  </td>
                  <td className="py-2 text-xs text-ink-2">{r.message}</td>
                </tr>
              ))}
              {!runs.data?.length && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-xs text-ink-3">
                    No runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
