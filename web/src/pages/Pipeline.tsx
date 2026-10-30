import { PIPELINE_STAGES, type OpportunitySummary, type PipelineStatus } from '@etm/shared';
import { useState } from 'react';
import { DeadlineText, DemoBadge, IntentBadge } from '../components/intel';
import { ErrorBox, Spinner } from '../components/ui';
import { useApp } from '../lib/appContext';
import { cn, money, num } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { Link } from '../lib/router';

export function Pipeline() {
  const { api, version, toast } = useApp();
  const { data, error, reload, setData } = useAsync(
    async () => {
      const cols = await Promise.all(
        PIPELINE_STAGES.map((s) =>
          api.listOpportunities(s.key === 'NEW' ? { status: ['NEW'], intent: ['HOT', 'WARM'], sort: 'score', pageSize: 25 } : { status: [s.key], sort: 'discovered', pageSize: 50 }),
        ),
      );
      return Object.fromEntries(PIPELINE_STAGES.map((s, i) => [s.key, cols[i]])) as Record<PipelineStatus, Awaited<ReturnType<typeof api.listOpportunities>>>;
    },
    [version],
  );
  const [drag, setDrag] = useState<OpportunitySummary | null>(null);
  const [over, setOver] = useState<PipelineStatus | null>(null);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  const move = async (o: OpportunitySummary, to: PipelineStatus) => {
    if (o.status === to) return;
    // optimistic
    const next = { ...data };
    next[o.status] = { ...next[o.status], items: next[o.status].items.filter((x) => x.id !== o.id), total: next[o.status].total - 1 };
    next[to] = { ...next[to], items: [{ ...o, status: to }, ...next[to].items], total: next[to].total + 1 };
    setData(next);
    try {
      await api.setStatus(o.id, to);
      toast(`Moved to ${to}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
      reload();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="eyebrow">Drag cards between stages · NEW shows unworked hot & warm leads</div>
        <h1 className="font-display text-2xl font-semibold text-ink">Sales pipeline</h1>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[84rem] grid-cols-7 gap-3">
          {PIPELINE_STAGES.map((s) => {
            const col = data[s.key];
            const value = col.items.reduce((sum, o) => sum + (o.estimatedOpportunityValue ?? 0), 0);
            return (
              <section
                key={s.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(s.key);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={() => {
                  if (drag) move(drag, s.key);
                  setDrag(null);
                  setOver(null);
                }}
                className={cn('flex min-h-[24rem] flex-col rounded-lg border bg-sunken p-2', over === s.key ? 'border-brand' : 'border-line')}
                aria-label={`${s.label} stage`}
              >
                <header className="mb-2 px-1">
                  <div className="flex items-center justify-between">
                    <h2 className={cn('font-display text-sm font-semibold', s.key === 'WON' ? 'text-low-ink' : s.key === 'LOST' ? 'text-ink-3' : 'text-ink')}>{s.label.toUpperCase()}</h2>
                    <span className="font-mono text-xs text-ink-3 tnum">{col.total}</span>
                  </div>
                  <div className="text-[11px] text-ink-3 tnum">{value ? `${money(value, true)} est.` : '—'}</div>
                </header>
                <ul className="flex flex-col gap-2">
                  {col.items.map((o) => (
                    <li
                      key={o.id}
                      draggable
                      onDragStart={() => setDrag(o)}
                      className="cursor-grab rounded-md border border-line bg-surface p-2 active:cursor-grabbing"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <IntentBadge level={o.intentLevel} score={o.intentScore} size="sm" />
                        {o.isDemo && <DemoBadge />}
                      </div>
                      <Link to={`/opportunities/${o.id}`} className="mt-1 block text-xs font-semibold text-ink hover:text-brand line-clamp-2">
                        {o.organizationName ?? 'Unknown organization'}
                      </Link>
                      <div className="text-[11px] text-ink-3 line-clamp-2">{o.requirementSummary}</div>
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <DeadlineText iso={o.deadline} withIcon={false} />
                        <span className="font-mono text-ink-2 tnum">{o.quantity ? `${num(o.quantity)}u` : ''}</span>
                      </div>
                      {o.owner && <div className="mt-1 text-[11px] text-ink-3">Owner: {o.owner}</div>}
                      <select
                        id={`mv-${o.id}`}
                        className="mt-1.5 w-full rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink-2"
                        value={o.status}
                        onChange={(e) => move(o, e.target.value as PipelineStatus)}
                        aria-label="Move to stage"
                      >
                        {PIPELINE_STAGES.map((t) => (
                          <option key={t.key} value={t.key}>
                            Move to {t.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                  {col.items.length === 0 && <li className="px-1 py-6 text-center text-[11px] text-ink-3">Drop here</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
