import { MATCH_LABELS, type MatchLevel } from '@etm/shared';
import { BarList, ChartCard, Columns, StackedBar } from '../components/charts';
import { Card, CardHeader, ErrorBox, Pill, Spinner } from '../components/ui';
import { useApp } from '../lib/appContext';
import { money, num, shortDate } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { navigate } from '../lib/router';

const INTENT_COLOR: Record<string, string> = { HOT: 'var(--color-hot)', WARM: 'var(--color-warm)', LOW: 'var(--color-low)', IRRELEVANT: 'var(--color-muted)' };
const MATCH_COLOR: Record<MatchLevel, string> = { EXACT: 'var(--color-verified)', HIGH: 'var(--color-series-1)', ALTERNATIVE: 'var(--color-inferred)', NONE: 'var(--color-muted)' };

export function Analytics() {
  const { api, version } = useApp();
  const { data: a, error, reload } = useAsync(() => api.analytics(), [version]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!a) return <Spinner />;
  const funnelMax = Math.max(1, ...a.funnel.map((f) => f.count));
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div>
        <div className="eyebrow">Buying signals (current demand) — historical spending is reported separately below</div>
        <h1 className="font-display text-2xl font-semibold text-ink">Analytics</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="eyebrow">Product match rate</div>
          <div className="mt-1 font-display text-3xl font-semibold text-ink tnum">{Math.round(a.matchRate.rate * 100)}%</div>
          <div className="text-xs text-ink-3 tnum">
            {a.matchRate.matched} of {a.matchRate.total} active opportunities have a catalog match
          </div>
        </Card>
        <Card>
          <div className="eyebrow">Average opportunity size</div>
          <div className="mt-1 font-display text-3xl font-semibold text-ink tnum">{money(a.averageOpportunityValue, true)}</div>
          <div className="text-xs text-ink-3 tnum">Across {a.valuedCount} opportunities with a stated budget or catalog estimate</div>
        </Card>
        <Card>
          <div className="eyebrow">Deadlines in the next 7 days</div>
          <div className="mt-1 font-display text-3xl font-semibold text-ink tnum">{a.deadlines.filter((d) => d.bucket === '≤ 3 days' || d.bucket === '4–7 days').reduce((s, d) => s + d.count, 0)}</div>
          <div className="text-xs text-ink-3">Respond-now workload</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Opportunities by day" eyebrow="Discovered · last 14 days · red = hot" table={{ head: ['Day', 'Total', 'Hot'], rows: a.byDay.map((d) => [d.date, d.count, d.hot]) }}>
          <Columns highlightLabel="hot" data={a.byDay.map((d) => ({ label: shortDate(d.date + 'T12:00:00'), value: d.count, highlight: d.hot }))} />
        </ChartCard>
        <ChartCard title="Opportunities by intent" eyebrow="All tracked documents" table={{ head: ['Intent', 'Count'], rows: a.byIntent.map((r) => [r.label, r.count]) }}>
          <BarList data={a.byIntent.map((r) => ({ key: r.key, label: r.label, value: r.count, color: INTENT_COLOR[r.key], onClick: r.key !== 'IRRELEVANT' ? () => navigate(`/opportunities?intent=${r.key}`) : undefined }))} />
        </ChartCard>
        <ChartCard title="Opportunities by hardware category" table={{ head: ['Category', 'Count', 'Hot'], rows: a.byCategory.map((r) => [r.label, r.count, r.hot ?? 0]) }}>
          <BarList data={a.byCategory.slice(0, 12).map((r) => ({ key: r.key, label: r.label, value: r.count, sub: `${r.hot} hot`, onClick: () => navigate(`/opportunities?categories=${encodeURIComponent(r.key)}`) }))} />
        </ChartCard>
        <ChartCard title="Opportunities by state" table={{ head: ['State', 'Count', 'Hot'], rows: a.byState.map((r) => [r.label, r.count, r.hot ?? 0]) }}>
          <BarList data={a.byState.slice(0, 12).map((r) => ({ key: r.key, label: r.label, value: r.count, sub: `${r.hot} hot`, onClick: () => navigate(`/opportunities?states=${r.key}`) }))} />
        </ChartCard>
        <ChartCard title="Opportunities by source" table={{ head: ['Source type', 'Count'], rows: a.bySource.map((r) => [r.label, r.count]) }}>
          <BarList data={a.bySource.map((r) => ({ key: r.key, label: r.label, value: r.count, onClick: () => navigate(`/opportunities?sourceTypes=${r.key}`) }))} />
        </ChartCard>
        <ChartCard title="Deadlines approaching" eyebrow="Active opportunities with a stated deadline" table={{ head: ['Window', 'Count'], rows: a.deadlines.map((d) => [d.bucket, d.count]) }}>
          <BarList data={a.deadlines.map((d) => ({ key: d.bucket, label: d.bucket, value: d.count, color: d.bucket === '≤ 3 days' ? 'var(--color-hot)' : d.bucket === '4–7 days' ? 'var(--color-warm)' : d.bucket === 'Overdue' ? 'var(--color-muted)' : undefined }))} />
        </ChartCard>
        <ChartCard title="Opportunity funnel" eyebrow="Pipeline stages" table={{ head: ['Stage', 'Count'], rows: a.funnel.map((f) => [f.label, f.count]) }}>
          <ul className="flex flex-col gap-1">
            {a.funnel.map((f) => (
              <li key={f.key} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-xs">
                <span className="text-ink-2">{f.label}</span>
                <span className="flex justify-center">
                  <span className="h-5 rounded-sm" style={{ width: `${Math.max(2, (f.count / funnelMax) * 100)}%`, background: f.key === 'LOST' ? 'var(--color-muted)' : f.key === 'WON' ? 'var(--color-low)' : 'var(--color-series-1)' }} />
                </span>
                <span className="text-right font-mono text-ink tnum">{f.count}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
        <ChartCard title="Catalog match quality" table={{ head: ['Match', 'Count'], rows: a.matchRate.byLevel.map((r) => [MATCH_LABELS[r.key as MatchLevel], r.count]) }}>
          <StackedBar parts={a.matchRate.byLevel.map((r) => ({ label: MATCH_LABELS[r.key as MatchLevel], value: r.count, color: MATCH_COLOR[r.key as MatchLevel] }))} />
        </ChartCard>
      </div>

      <Card accent="strong">
        <CardHeader
          eyebrow="Historical procurement activity — NOT current demand"
          title="Who has bought IT hardware before"
          right={a.historical.isDemo ? <Pill tone="demo">DEMO DATA</Pill> : <Pill tone="verified">USAspending.gov</Pill>}
        />
        <p className="mb-3 text-sm text-ink-2">
          Past federal awards show which agencies buy the hardware ETechMatter sells. Use them for account targeting and to anticipate refresh cycles. A past award is not a request to buy.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="eyebrow mb-2">Award value by agency</div>
            <BarList format={(n) => money(n, true)} data={a.historical.byAgency.map((r) => ({ key: r.key, label: r.label, value: r.value ?? 0, color: 'var(--color-series-2)' }))} empty="No historical awards loaded — USAspending syncs daily on the backend." />
          </div>
          <div className="overflow-x-auto">
            <div className="eyebrow mb-2">Recent awards ({num(a.historical.totalRecords)} total · {money(a.historical.totalAmount, true)})</div>
            <table className="w-full min-w-[26rem] text-xs">
              <tbody>
                {a.historical.recent.map((h) => (
                  <tr key={h.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2 text-ink-3 tnum whitespace-nowrap">{h.actionDate}</td>
                    <td className="py-1.5 pr-2">
                      <div className="text-ink">{h.awardingAgency}</div>
                      <div className="text-ink-3">{h.description}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-ink-2">{h.state}</td>
                    <td className="py-1.5 text-right font-mono tnum">{h.sourceUrl ? <a href={h.sourceUrl} target="_blank" rel="noreferrer" className="text-brand">{money(h.amount, true)}</a> : money(h.amount, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
