import {
  CATEGORY_GROUPS, PROCUREMENT_LABELS, SOURCE_TYPE_LABELS, STATES,
  type IntentLevel, type MatchLevel, type OpportunityQuery, type OpportunitySummary, type ParsedSearch, type SourceType, type TimeWindow,
} from '@etm/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LuChevronLeft, LuChevronRight, LuDownload, LuLayoutGrid, LuSearch, LuSlidersHorizontal, LuTable, LuX, LuCopy } from 'react-icons/lu';
import { DeadlineText, DemoBadge, IntentBadge, MatchPill, OpportunityCard } from '../components/intel';
import { Button, Card, ChipToggle, Empty, ErrorBox, Modal, Pill, Spinner, inp } from '../components/ui';
import { useApp } from '../lib/appContext';
import { cn, copyText, downloadText, num, timeAgo } from '../lib/format';
import { useAsync, useDebounced, useLocalState, useNow } from '../lib/hooks';
import { Link, navigate, usePath } from '../lib/router';

const CATS = ['Laptops', 'Desktop PCs', 'Workstations', 'Servers', 'Storage', 'Networking', 'Switches', 'Firewalls', 'Wireless Access Points', 'Monitors', 'Docking Stations', 'UPS', 'Printers', 'Racks', 'GPUs', 'SSD'];
const SOURCES: { key: SourceType; label: string }[] = [
  { key: 'FEDERAL_PROCUREMENT', label: 'SAM.gov / Federal' },
  { key: 'STATE_PROCUREMENT', label: 'State' },
  { key: 'LOCAL_PROCUREMENT', label: 'Local' },
  { key: 'EDUCATION', label: 'Education' },
  { key: 'HEALTHCARE', label: 'Healthcare' },
  { key: 'PUBLIC_WEB', label: 'Public Web' },
];
const DATES: { key: TimeWindow; label: string }[] = [
  { key: '15m', label: 'Last 15 minutes' },
  { key: '1h', label: 'Last hour' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'custom', label: 'Custom' },
];
const DEADLINES: { key: NonNullable<OpportunityQuery['deadlineWithin']>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '3d', label: '3 days' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];
const QTY: { label: string; min?: number; max?: number }[] = [
  { label: '1–10', min: 1, max: 10 },
  { label: '10–50', min: 10, max: 50 },
  { label: '50–100', min: 50, max: 100 },
  { label: '100–500', min: 100, max: 500 },
  { label: '500+', min: 500 },
];

function fromPath(path: string, preset: OpportunityQuery): { filters: OpportunityQuery; q: string } {
  const p = new URLSearchParams(path.split('?')[1] ?? '');
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(',') : undefined);
  return {
    q: p.get('q') ?? '',
    filters: {
      ...preset,
      ...(list('intent') ? { intent: list('intent') as IntentLevel[] } : {}),
      ...(list('categories') ? { categories: list('categories') } : {}),
      ...(list('states') ? { states: list('states') } : {}),
      ...(list('match') ? { match: list('match') as MatchLevel[] } : {}),
      ...(list('sourceTypes') ? { sourceTypes: list('sourceTypes') as SourceType[] } : {}),
      ...(p.get('discovered') ? { discovered: p.get('discovered') as TimeWindow } : {}),
      ...(p.get('deadlineWithin') ? { deadlineWithin: p.get('deadlineWithin') as OpportunityQuery['deadlineWithin'] } : {}),
      ...(p.get('sort') ? { sort: p.get('sort') as OpportunityQuery['sort'] } : {}),
    },
  };
}

const toggle = <T,>(list: T[] | undefined, v: T): T[] | undefined => {
  const cur = list ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
};

export function Opportunities({ preset = {}, title = 'Live Opportunities', eyebrow = 'Buying signals from all sources' }: { preset?: OpportunityQuery; title?: string; eyebrow?: string }) {
  const { api, version } = useApp();
  const path = usePath();
  const now = useNow();
  const init = useMemo(() => fromPath(path, preset), [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const [filters, setFilters] = useState<OpportunityQuery>({ sort: 'score', ...init.filters });
  const [q, setQ] = useState(init.q);
  const [page, setPage] = useState(1);
  const [view, setView] = useLocalState<'cards' | 'table'>('etm.view', 'cards');
  const [showFilters, setShowFilters] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const dq = useDebounced(q, 350);

  useEffect(() => {
    setFilters({ sort: 'score', ...init.filters });
    setQ(init.q);
    setPage(1);
  }, [init]);
  useEffect(() => setPage(1), [filters, dq]);

  const query: OpportunityQuery = { ...filters, page, pageSize: 20 };
  const { data, error, loading, reload } = useAsync<{ parsed: ParsedSearch | null; results: Awaited<ReturnType<typeof api.listOpportunities>> }>(
    async () => (dq.trim() ? api.search(dq.trim(), query) : { parsed: null, results: await api.listOpportunities(query) }),
    [JSON.stringify(query), dq, version],
  );

  const set = (patch: Partial<OpportunityQuery>) => setFilters((f) => ({ ...f, ...patch }));
  const activeCount = ['intent', 'categories', 'sourceTypes', 'states', 'discovered', 'deadlineWithin', 'qtyMin', 'match', 'data', 'includeIrrelevant', 'status', 'saved']
    .filter((k) => {
      const v = (filters as Record<string, unknown>)[k];
      return v !== undefined && !(Array.isArray(v) && !v.length) && JSON.stringify(v) !== JSON.stringify((preset as Record<string, unknown>)[k]);
    }).length;

  const filterPanel = (
    <div className="flex flex-col gap-4">
      <FilterGroup label="Intent">
        {(['HOT', 'WARM', 'LOW'] as IntentLevel[]).map((l) => (
          <ChipToggle key={l} active={!!filters.intent?.includes(l)} onClick={() => set({ intent: toggle(filters.intent, l) })}>
            {l === 'HOT' ? 'Hot' : l === 'WARM' ? 'Warm' : 'Low'}
          </ChipToggle>
        ))}
        <ChipToggle active={!!filters.includeIrrelevant} onClick={() => set({ includeIrrelevant: !filters.includeIrrelevant || undefined })}>
          Include non-buying docs
        </ChipToggle>
      </FilterGroup>
      <FilterGroup label="Product">
        {CATS.map((c) => (
          <ChipToggle key={c} active={!!filters.categories?.includes(c)} onClick={() => set({ categories: toggle(filters.categories, c) })}>
            {c}
            {CATEGORY_GROUPS[c] && c === 'Networking' ? ' (all)' : ''}
          </ChipToggle>
        ))}
      </FilterGroup>
      <FilterGroup label="Source">
        {SOURCES.map((s) => (
          <ChipToggle key={s.key} active={!!filters.sourceTypes?.includes(s.key)} onClick={() => set({ sourceTypes: toggle(filters.sourceTypes, s.key) })}>
            {s.label}
          </ChipToggle>
        ))}
      </FilterGroup>
      <FilterGroup label="State">
        <select
          id="filter-state"
          className={inp({ size: 'sm' })}
          value=""
          onChange={(e) => e.target.value && set({ states: [...new Set([...(filters.states ?? []), e.target.value])] })}
          aria-label="Add a state"
        >
          <option value="">All 50 states — add…</option>
          {[...STATES].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        {(filters.states ?? []).map((s) => (
          <ChipToggle key={s} active onClick={() => set({ states: toggle(filters.states, s) })}>
            {s} <LuX aria-hidden />
          </ChipToggle>
        ))}
      </FilterGroup>
      <FilterGroup label="Discovered">
        {DATES.map((d) => (
          <ChipToggle key={d.key} active={filters.discovered === d.key} onClick={() => set({ discovered: filters.discovered === d.key ? undefined : d.key })}>
            {d.label}
          </ChipToggle>
        ))}
        {filters.discovered === 'custom' && (
          <div className="flex w-full gap-2">
            <input id="date-from" type="date" className={inp({ size: 'sm' })} value={filters.dateFrom ?? ''} onChange={(e) => set({ dateFrom: e.target.value || undefined })} aria-label="From date" />
            <input id="date-to" type="date" className={inp({ size: 'sm' })} value={filters.dateTo ?? ''} onChange={(e) => set({ dateTo: e.target.value || undefined })} aria-label="To date" />
          </div>
        )}
      </FilterGroup>
      <FilterGroup label="Deadline within">
        {DEADLINES.map((d) => (
          <ChipToggle key={d.key} active={filters.deadlineWithin === d.key} onClick={() => set({ deadlineWithin: filters.deadlineWithin === d.key ? undefined : d.key })}>
            {d.label}
          </ChipToggle>
        ))}
      </FilterGroup>
      <FilterGroup label="Quantity">
        {QTY.map((r) => {
          const on = filters.qtyMin === r.min && filters.qtyMax === r.max;
          return (
            <ChipToggle key={r.label} active={on} onClick={() => set(on ? { qtyMin: undefined, qtyMax: undefined } : { qtyMin: r.min, qtyMax: r.max })}>
              {r.label}
            </ChipToggle>
          );
        })}
      </FilterGroup>
      <FilterGroup label="Catalog match">
        {(['EXACT', 'HIGH', 'ALTERNATIVE', 'NONE'] as MatchLevel[]).map((m) => (
          <ChipToggle key={m} active={!!filters.match?.includes(m)} onClick={() => set({ match: toggle(filters.match, m) })}>
            {m === 'NONE' ? 'No match' : m.charAt(0) + m.slice(1).toLowerCase()}
          </ChipToggle>
        ))}
      </FilterGroup>
      <FilterGroup label="Data">
        {(['all', 'live', 'demo'] as const).map((d) => (
          <ChipToggle key={d} active={(filters.data ?? 'all') === d} onClick={() => set({ data: d === 'all' ? undefined : d })}>
            {d === 'all' ? 'All' : d === 'live' ? 'Live only' : 'Demo only'}
          </ChipToggle>
        ))}
      </FilterGroup>
      {activeCount > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setFilters({ sort: filters.sort, ...preset })}>
          Clear filters
        </Button>
      )}
    </div>
  );

  const res = data?.results;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" icon={<LuDownload />} onClick={() => setExportOpen(true)}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <LuSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            id="opp-search"
            className={inp({ px: 'pl-9 pr-3' })}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Try: show hot opportunities with more than 100 laptops"
            aria-label="Search in plain English"
          />
        </div>
        <select id="opp-sort" className={inp({ w: 'w-auto' })} value={filters.sort ?? 'score'} onChange={(e) => set({ sort: e.target.value as OpportunityQuery['sort'] })} aria-label="Sort by">
          <option value="score">Best opportunity</option>
          <option value="discovered">Newest discovered</option>
          <option value="published">Newest posted</option>
          <option value="deadline">Deadline soonest</option>
          <option value="value">Largest est. value</option>
          <option value="intent">Intent score</option>
        </select>
        <Button className="lg:hidden" icon={<LuSlidersHorizontal />} onClick={() => setShowFilters(true)}>
          Filters{activeCount ? ` (${activeCount})` : ''}
        </Button>
        <div className="flex rounded-md border border-line-strong" role="group" aria-label="View">
          <button className={cn('flex h-9 w-9 items-center justify-center cursor-pointer', view === 'cards' ? 'bg-sunken text-ink' : 'text-ink-3')} onClick={() => setView('cards')} aria-label="Card view" aria-pressed={view === 'cards'}>
            <LuLayoutGrid />
          </button>
          <button className={cn('flex h-9 w-9 items-center justify-center border-l border-line-strong cursor-pointer', view === 'table' ? 'bg-sunken text-ink' : 'text-ink-3')} onClick={() => setView('table')} aria-label="Table view" aria-pressed={view === 'table'}>
            <LuTable />
          </button>
        </div>
      </div>

      {data?.parsed && data.parsed.interpretations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink-3">Understood as:</span>
          {data.parsed.interpretations.map((t) => (
            <Pill key={t} tone="brand">
              {t}
            </Pill>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-20">{filterPanel}</div>
        </aside>
        <div className="min-w-0">
          {error && <ErrorBox message={error} onRetry={reload} />}
          {!res && !error && <Spinner />}
          {res && (
            <>
              <div className="mb-2 flex items-center justify-between text-xs text-ink-3 tnum">
                <span>
                  {num(res.total)} opportunit{res.total === 1 ? 'y' : 'ies'}
                  {loading && ' · updating…'}
                </span>
                <span>
                  Page {res.page} of {res.totalPages}
                </span>
              </div>
              {res.items.length === 0 ? (
                <Card>
                  <Empty title="No opportunities match these filters">Widen the date range, remove a filter, or run a sync to pull new notices.</Empty>
                </Card>
              ) : view === 'cards' ? (
                <div className="flex flex-col gap-3">
                  {res.items.map((o) => (
                    <OpportunityCard key={o.id} o={o} now={now} />
                  ))}
                </div>
              ) : (
                <OppTable items={res.items} now={now} />
              )}
              {res.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button size="sm" icon={<LuChevronLeft />} disabled={res.page <= 1} onClick={() => setPage(res.page - 1)}>
                    Previous
                  </Button>
                  <span className="text-xs text-ink-3 tnum">
                    {res.page} / {res.totalPages}
                  </span>
                  <Button size="sm" disabled={res.page >= res.totalPages} onClick={() => setPage(res.page + 1)}>
                    Next <LuChevronRight />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal open={showFilters} onClose={() => setShowFilters(false)} title="Filters">
        {filterPanel}
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={() => setShowFilters(false)}>
            Show {res ? num(res.total) : ''} results
          </Button>
        </div>
      </Modal>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} query={dq.trim() && data?.parsed ? { ...data.parsed.filters, ...filters } : { ...filters, q: undefined }} />
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="eyebrow mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

export function OppTable({ items, now }: { items: OpportunitySummary[]; now: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="bg-sunken text-left text-[11px] uppercase tracking-wider text-ink-3">
          <tr>
            <th className="px-3 py-2 font-semibold">Intent</th>
            <th className="px-3 py-2 font-semibold">Organization / requirement</th>
            <th className="px-3 py-2 font-semibold">Location</th>
            <th className="px-3 py-2 text-right font-semibold">Qty</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Deadline</th>
            <th className="px-3 py-2 font-semibold">Match</th>
            <th className="px-3 py-2 font-semibold">Source</th>
            <th className="px-3 py-2 font-semibold">Discovered</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.id} className="border-t border-line align-top hover:bg-sunken cursor-pointer" onClick={() => navigate(`/opportunities/${o.id}`)}>
              <td className="px-3 py-2">
                <IntentBadge level={o.intentLevel} score={o.intentScore} size="sm" />
              </td>
              <td className="px-3 py-2">
                <Link to={`/opportunities/${o.id}`} className="font-medium text-ink hover:text-brand">
                  {o.organizationName ?? 'Organization not identified'}
                </Link>{' '}
                {o.isDemo && <DemoBadge />}
                <div className="text-xs text-ink-3 line-clamp-1">{o.requirementSummary}</div>
              </td>
              <td className="px-3 py-2 text-xs text-ink-2 whitespace-nowrap">{[o.city, o.state].filter(Boolean).join(', ') || '—'}</td>
              <td className="px-3 py-2 text-right font-mono text-xs tnum">{num(o.quantity)}</td>
              <td className="px-3 py-2 text-xs text-ink-2 whitespace-nowrap">{PROCUREMENT_LABELS[o.procurementType]}</td>
              <td className="px-3 py-2 text-xs whitespace-nowrap">
                <DeadlineText iso={o.deadline} withIcon={false} />
              </td>
              <td className="px-3 py-2">
                <MatchPill level={o.matchLevel} score={o.matchScore} />
              </td>
              <td className="px-3 py-2 text-xs text-ink-2">
                {o.source}
                <div className="text-ink-3">{SOURCE_TYPE_LABELS[o.sourceType]}</div>
              </td>
              <td className="px-3 py-2 text-xs text-ink-2 whitespace-nowrap tnum">{timeAgo(o.discoveredAt, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportDialog({ open, onClose, query }: { open: boolean; onClose: () => void; query: OpportunityQuery }) {
  const { api } = useApp();
  const [csv, setCsv] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setCsv(null);
    setMsg(null);
    api.exportCsv({ ...query, page: undefined, pageSize: undefined }).then(setCsv).catch((e) => setMsg(String(e)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = csv ? csv.split(/\r?\n/).length - 1 : 0;
  // embedded previews (sandboxed iframes) block file downloads — offer Copy only there
  const embedded = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  const name = `etechmatter-opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
  return (
    <Modal open={open} onClose={onClose} title="Export to CSV" wide>
      {!csv && !msg && <Spinner label="Preparing export…" />}
      {csv && (
        <>
          <p className="text-sm text-ink-2">
            <b className="tnum">{rows}</b> rows with the current filters. Columns: Company, Website, Contact, Title, Email, Phone, State, City, Product, Quantity, Intent, Score, Deadline, Source, Source URL, Published Date, Discovered Date, Status (+ Data Type).
          </p>
          <textarea id="csv-preview" readOnly className="mt-3 h-48 w-full rounded-md border border-line bg-sunken p-2 font-mono text-[11px] text-ink-2" value={csv} />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button icon={<LuCopy />} onClick={async () => setMsg((await copyText(csv)) ? 'Copied to clipboard' : 'Copy blocked — select the text above and copy it')}>
              Copy
            </Button>
            {!embedded && (
              <Button variant="primary" icon={<LuDownload />} onClick={() => setMsg(downloadText(name, csv) ? `Downloading ${name}` : 'Download blocked here — use Copy instead')}>
                Download {name}
              </Button>
            )}
          </div>
        </>
      )}
      {msg && <div className="mt-2 text-right text-xs text-ink-3">{msg}</div>}
    </Modal>
  );
}
