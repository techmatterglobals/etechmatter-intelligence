import type { SourceInfo } from '@etm/shared';
import type { ReactNode } from 'react';
import { LuBadgeCheck, LuCalendar, LuDollarSign, LuFlame, LuRadioTower, LuSparkles, LuTarget } from 'react-icons/lu';
import { Columns, StackedBar } from '../components/charts';
import { DeadlineText, IntentBadge, OpportunityCard } from '../components/intel';
import { Card, CardHeader, ErrorBox, Pill, Spinner } from '../components/ui';
import { useApp } from '../lib/appContext';
import { cn, money, shortDate, timeAgo } from '../lib/format';
import { useAsync, useNow } from '../lib/hooks';
import { Link } from '../lib/router';

export function StatusDot({ s }: { s: SourceInfo['status'] }) {
  const c: Record<SourceInfo['status'], string> = {
    CONNECTED: 'bg-low', DEMO: 'bg-demo', PARTIAL: 'bg-warm', CONFIG_REQUIRED: 'bg-warm', NOT_CONFIGURED: 'bg-muted', ERROR: 'bg-hot', DISABLED: 'bg-muted',
  };
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', c[s])} aria-hidden />;
}
export const STATUS_LABEL: Record<SourceInfo['status'], string> = {
  CONNECTED: 'Connected', DEMO: 'Demo data', PARTIAL: 'Partial', CONFIG_REQUIRED: 'Configuration required', NOT_CONFIGURED: 'Not configured', ERROR: 'Error', DISABLED: 'Disabled',
};

function Kpi({ icon, label, value, sub, to, tone }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; to: string; tone?: 'hot' }) {
  return (
    <Link to={to} className="group block rounded-lg border border-line bg-surface p-3.5 hover:border-line-strong">
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <span className={cn('text-base', tone === 'hot' ? 'text-hot' : 'text-ink-3')}>{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 font-display text-[28px] font-semibold leading-none text-ink tnum">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-ink-3">{sub}</div>}
    </Link>
  );
}

export function Dashboard() {
  const { api, version, openSync } = useApp();
  const now = useNow();
  const { data, error, loading, reload } = useAsync(() => api.dashboard(), [version]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner label={loading ? 'Loading buying signals…' : undefined} />;
  const s = data.stats;
  const live = data.sources.filter((x) => x.isLive && x.status === 'CONNECTED');
  const intent = Object.fromEntries(data.byIntent.map((r) => [r.key, r.count]));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      {/* heading */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Real-Time U.S. IT Hardware Buying Signals</div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-[28px]">Who needs IT hardware right now?</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2 tnum">
          <span>
            Last successful sync: <b className="text-ink">{s.lastSuccessfulSync ? timeAgo(s.lastSuccessfulSync, now) : 'never'}</b>
          </span>
          <span>
            Next scheduled sync: <b className="text-ink">{s.nextScheduledSync ? timeAgo(s.nextScheduledSync, now) : data.store === 'browser' ? 'manual (standalone)' : 'no live source scheduled'}</b>
          </span>
        </div>
      </div>

      {/* data honesty banner */}
      {s.demoCount > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-demo bg-demo-soft px-4 py-3 text-sm text-demo-ink sm:flex-row sm:items-center sm:justify-between">
          <div>
            <b>You are viewing DEMO DATA.</b> {s.demoCount} fictional sample notices were processed by the real pipeline so the workflow is usable today.{' '}
            {live.length ? `${live.length} live source(s) connected.` : 'No live source is connected yet — live SAM.gov data starts after SAM_API_KEY is configured on the server.'}
          </div>
          <Link to="/sources" className="shrink-0 font-semibold underline">
            Connect sources
          </Link>
        </div>
      )}

      {/* source status strip */}
      <div className="flex flex-wrap gap-2">
        {data.sources.map((src) => (
          <Link key={src.key} to="/sources" className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs hover:border-line-strong" title={src.statusMessage}>
            <StatusDot s={src.status} />
            <span className="font-medium text-ink">{src.name.replace(/ \(.*\)$/, '')}</span>
            <span className="text-ink-3">{STATUS_LABEL[src.status]}</span>
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<LuFlame />} tone="hot" label="Hot Opportunities" value={s.hotCount} sub="Active, high-intent requests" to="/hot" />
        <Kpi icon={<LuSparkles />} label="New Today" value={s.newToday} sub="Discovered since midnight" to="/opportunities?discovered=today" />
        <Kpi icon={<LuCalendar />} label="Deadlines < 7 Days" value={s.deadlinesUnder7} sub="Respond before they close" to="/opportunities?deadlineWithin=7d&sort=deadline" />
        <Kpi icon={<LuTarget />} label="Product Matches" value={s.productMatches} sub="Exact or high catalog match" to="/opportunities?match=EXACT,HIGH" />
        <Kpi icon={<LuDollarSign />} label="Estimated Pipeline" value={money(s.estimatedPipeline, true)} sub="Hot + warm, stated budget or catalog estimate" to="/pipeline" />
        <Kpi icon={<LuRadioTower />} label="Active Sources" value={`${s.activeSources}/${s.totalSources}`} sub={`${s.liveSources} live · ${s.activeSources - s.liveSources} demo/partial`} to="/sources" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* feed */}
        <div className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <div className="eyebrow">Newest first · by discovery time</div>
              <h2 className="font-display text-lg font-semibold text-ink">Latest Buying Signals</h2>
            </div>
            <Link to="/opportunities" className="text-sm font-medium text-brand">
              All opportunities →
            </Link>
          </div>
          {data.latest.length === 0 && (
            <Card>
              <div className="text-sm text-ink-2">
                No opportunities yet. <button className="text-brand underline cursor-pointer" onClick={openSync}>Run a sync</button>.
              </div>
            </Card>
          )}
          {data.latest.map((o) => (
            <OpportunityCard key={o.id} o={o} now={now} />
          ))}
        </div>

        {/* intelligence rail */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Closing within 7 days" eyebrow="Deadline pressure" />
            {data.closingSoon.length === 0 ? (
              <div className="text-xs text-ink-3">Nothing closes in the next 7 days.</div>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {data.closingSoon.map((o) => (
                  <li key={o.id} className="py-2 first:pt-0 last:pb-0">
                    <Link to={`/opportunities/${o.id}`} className="block group">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink group-hover:text-brand">{o.organizationName ?? 'Unknown organization'}</span>
                        <IntentBadge level={o.intentLevel} score={o.intentScore} size="sm" />
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink-3">
                        <span className="truncate">{o.requirementSummary}</span>
                        <DeadlineText iso={o.deadline} withIcon={false} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Intent mix" eyebrow="All tracked documents" />
            <StackedBar
              parts={[
                { label: 'Hot', value: intent.HOT ?? 0, color: 'var(--color-hot)' },
                { label: 'Warm', value: intent.WARM ?? 0, color: 'var(--color-warm)' },
                { label: 'Low', value: intent.LOW ?? 0, color: 'var(--color-low)' },
                { label: 'Not a buying signal', value: intent.IRRELEVANT ?? 0, color: 'var(--color-muted)' },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Signals discovered" eyebrow="Last 14 days" right={<Pill tone="hot">■ hot</Pill>} />
            <Columns
              height={110}
              highlightLabel="hot"
              data={data.byDay.map((d) => ({ label: shortDate(d.date + 'T12:00:00'), value: d.count, highlight: d.hot }))}
            />
          </Card>

          <Card>
            <CardHeader title="Recent alerts" eyebrow="Your alert rules" right={<Link to="/alerts" className="text-xs text-brand">Manage</Link>} />
            {data.alerts.length === 0 ? (
              <div className="text-xs text-ink-3">No alerts triggered yet. Alerts fire when a newly discovered opportunity matches a rule.</div>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.alerts.slice(0, 5).map((a) => (
                  <li key={a.id} className="text-xs">
                    <Link to={`/opportunities/${a.opportunityId}`} className="text-ink hover:text-brand">
                      {a.opportunityTitle}
                    </Link>
                    <div className="text-ink-3">
                      {a.ruleName} · {timeAgo(a.createdAt, now)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-start gap-2 text-xs text-ink-2">
              <LuBadgeCheck className="mt-0.5 shrink-0 text-verified" />
              <div>
                <b className="text-ink">AI engine:</b> {data.ai.message}. Every opportunity keeps its source evidence; extracted values are tagged SOURCE VERIFIED or AI INFERENCE.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
