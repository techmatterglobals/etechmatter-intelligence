// Lightweight, dependency-free charts drawn to scale with HTML/CSS.
// One scale per chart, text in ink tokens, hover tooltips, table view for accessibility.
import { useState, type ReactNode } from 'react';
import { cn, num } from '../lib/format';
import { Card, CardHeader } from './ui';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  sub?: string;
  color?: string; // CSS color (token var)
  onClick?: () => void;
}

export function ChartCard({ title, eyebrow, children, table, note }: { title: string; eyebrow?: string; children: ReactNode; table?: { head: string[]; rows: (string | number)[][] }; note?: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card>
      <CardHeader
        title={title}
        eyebrow={eyebrow}
        right={
          table && (
            <button className="text-[11px] font-medium text-ink-3 hover:text-ink cursor-pointer" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
              {asTable ? 'Chart' : 'Table'}
            </button>
          )
        }
      />
      {asTable && table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tnum">
            <thead>
              <tr className="text-left text-ink-3">
                {table.head.map((h) => (
                  <th key={h} className="py-1 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {r.map((c, j) => (
                    <td key={j} className="py-1 pr-3 text-ink-2">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      {note && <div className="mt-3 text-[11px] text-ink-3">{note}</div>}
    </Card>
  );
}

/** Horizontal bars — magnitude by category. */
export function BarList({ data, max, format = num, empty = 'No data yet' }: { data: BarDatum[]; max?: number; format?: (n: number) => string; empty?: string }) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="py-6 text-center text-xs text-ink-3">{empty}</div>;
  return (
    <ul className="flex flex-col gap-1.5">
      {data.map((d) => (
        <li key={d.key}>
          <button
            type="button"
            onClick={d.onClick}
            disabled={!d.onClick}
            className={cn('group grid w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-left text-xs', d.onClick && 'cursor-pointer')}
            title={`${d.label}: ${format(d.value)}${d.sub ? ` · ${d.sub}` : ''}`}
          >
            <span className="truncate text-ink-2 group-hover:text-ink">{d.label}</span>
            <span className="relative h-4 rounded-sm bg-sunken">
              <span
                className="absolute inset-y-0 left-0 rounded-r-sm"
                style={{ width: `${Math.max(1.5, (d.value / m) * 100)}%`, background: d.color ?? 'var(--color-series-1)' }}
              />
            </span>
            <span className="w-12 text-right font-mono text-ink tnum">{format(d.value)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Vertical columns — change over time. Optional highlighted sub-series (e.g. HOT). */
export function Columns({
  data, height = 140, highlightLabel,
}: { data: { label: string; value: number; highlight?: number; tip?: string }[]; height?: number; highlightLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-ink-3 tnum text-right" style={{ height }}>
          {[...ticks].reverse().map((t) => (
            <span key={t} className="leading-none">
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => (
              <div
                key={d.label}
                className="relative flex h-full flex-1 flex-col justify-end cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${d.label}: ${d.value}${d.highlight !== undefined ? `, ${d.highlight} ${highlightLabel}` : ''}`}
              >
                <div className="relative w-full rounded-t-[3px]" style={{ height: `${(d.value / top) * 100}%`, background: hover === i ? 'var(--color-seq-4)' : 'var(--color-seq-3)' }}>
                  {!!d.highlight && (
                    <div className="absolute inset-x-0 bottom-0 rounded-t-[3px] border-t-2 border-surface" style={{ height: `${(d.highlight / Math.max(1, d.value)) * 100}%`, background: 'var(--color-hot)' }} />
                  )}
                </div>
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-nav px-2 py-1 text-[11px] text-nav-ink shadow">
                    <div className="font-semibold">{d.tip ?? d.label}</div>
                    <div className="tnum">
                      {d.value} total{d.highlight !== undefined ? ` · ${d.highlight} ${highlightLabel}` : ''}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-6 mt-1 flex justify-between text-[10px] text-ink-3 tnum">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const out: number[] = [];
  for (let t = 0; t <= max + step - 1 && out.length < 7; t += step) out.push(t);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

/** 100% stacked bar with legend (intent mix, match mix). */
export function StackedBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-sm bg-sunken gap-[2px]">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 text-ink-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label} <span className="font-mono text-ink tnum">{p.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
