import { INTENT_META, PIPELINE_STAGES, SOURCE_TYPE_LABELS, STATE_BY_CODE } from '../constants';
import { lc } from '../text';
import type { Analytics, CountRow, DashboardStats, HistoricalRecord, Opportunity, OrganizationRecord, SourceInfo } from '../types';

const active = (o: Opportunity) => o.status !== 'MERGED' && o.intentLevel !== 'IRRELEVANT';

export function dashboardStats(all: Opportunity[], sources: SourceInfo[], now = new Date(), scheduler?: { running: boolean }): DashboardStats {
  const list = all.filter(active);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const in7 = now.getTime() + 7 * 86_400_000;
  const successes = sources.map((s) => s.lastSuccessAt).filter((x): x is string => !!x).sort();
  const nexts = sources.filter((s) => s.enabled && s.nextRunAt).map((s) => s.nextRunAt as string).sort();
  return {
    hotCount: list.filter((o) => o.intentLevel === 'HOT').length,
    newToday: list.filter((o) => new Date(o.discoveredAt) >= startOfDay).length,
    deadlinesUnder7: list.filter((o) => o.deadline && new Date(o.deadline).getTime() >= now.getTime() && new Date(o.deadline).getTime() <= in7).length,
    productMatches: list.filter((o) => o.matchLevel === 'EXACT' || o.matchLevel === 'HIGH').length,
    estimatedPipeline: list
      .filter((o) => !['LOST', 'WON'].includes(o.status) && (o.intentLevel === 'HOT' || o.intentLevel === 'WARM'))
      .reduce((s, o) => s + (o.estimatedOpportunityValue ?? 0), 0),
    activeSources: sources.filter((s) => s.enabled && (s.status === 'CONNECTED' || s.status === 'DEMO' || s.status === 'PARTIAL')).length,
    totalSources: sources.length,
    liveSources: sources.filter((s) => s.isLive && s.status === 'CONNECTED').length,
    totalOpportunities: list.length,
    demoCount: list.filter((o) => o.isDemo).length,
    liveCount: list.filter((o) => !o.isDemo).length,
    lastSuccessfulSync: successes[successes.length - 1] ?? null,
    nextScheduledSync: nexts[0] ?? null,
    schedulerRunning: scheduler?.running ?? false,
  };
}

function countBy(list: Opportunity[], keyFn: (o: Opportunity) => string[] | string | null, labelFn?: (k: string) => string): CountRow[] {
  const map = new Map<string, CountRow>();
  for (const o of list) {
    const keys = keyFn(o);
    for (const k of Array.isArray(keys) ? keys : keys ? [keys] : ['Unknown']) {
      const row = map.get(k) ?? { key: k, label: labelFn ? labelFn(k) : k, count: 0, hot: 0, warm: 0, low: 0, value: 0 };
      row.count++;
      if (o.intentLevel === 'HOT') row.hot!++;
      if (o.intentLevel === 'WARM') row.warm!++;
      if (o.intentLevel === 'LOW') row.low!++;
      row.value! += o.estimatedOpportunityValue ?? 0;
      map.set(k, row);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function stateSummary(all: Opportunity[]): CountRow[] {
  return countBy(all.filter(active), (o) => o.state, (k) => STATE_BY_CODE[k] ?? k);
}

export function analytics(all: Opportunity[], historical: HistoricalRecord[], now = new Date()): Analytics {
  const list = all.filter((o) => o.status !== 'MERGED');
  const relevant = list.filter(active);
  const days: { date: string; count: number; hot: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = d.getTime() + 86_400_000;
    const inDay = relevant.filter((o) => {
      const t = new Date(o.discoveredAt).getTime();
      return t >= d.getTime() && t < next;
    });
    days.push({ date: d.toISOString().slice(0, 10), count: inDay.length, hot: inDay.filter((o) => o.intentLevel === 'HOT').length });
  }
  const valued = relevant.filter((o) => o.estimatedOpportunityValue);
  const matched = relevant.filter((o) => o.matchLevel !== 'NONE');
  const buckets = [
    { bucket: 'Overdue', test: (d: number) => d < 0 },
    { bucket: '≤ 3 days', test: (d: number) => d >= 0 && d <= 3 },
    { bucket: '4–7 days', test: (d: number) => d > 3 && d <= 7 },
    { bucket: '8–14 days', test: (d: number) => d > 7 && d <= 14 },
    { bucket: '15–30 days', test: (d: number) => d > 14 && d <= 30 },
    { bucket: '30+ days', test: (d: number) => d > 30 },
  ];
  const withDl = relevant.filter((o) => o.deadline);
  const agencyMap = new Map<string, CountRow>();
  for (const h of historical) {
    const k = h.awardingAgency ?? 'Unknown';
    const r = agencyMap.get(k) ?? { key: k, label: k, count: 0, value: 0 };
    r.count++;
    r.value! += h.amount ?? 0;
    agencyMap.set(k, r);
  }
  return {
    byState: countBy(relevant, (o) => o.state, (k) => STATE_BY_CODE[k] ?? k),
    byCategory: countBy(relevant, (o) => (o.categories.length ? o.categories : null)),
    bySource: countBy(relevant, (o) => o.sourceType, (k) => SOURCE_TYPE_LABELS[k as keyof typeof SOURCE_TYPE_LABELS] ?? k),
    byIntent: (['HOT', 'WARM', 'LOW', 'IRRELEVANT'] as const).map((k) => ({ key: k, label: INTENT_META[k].label, count: list.filter((o) => o.intentLevel === k).length })),
    byDay: days,
    funnel: PIPELINE_STAGES.map((s) => ({ key: s.key, label: s.label, count: relevant.filter((o) => o.status === s.key).length })),
    matchRate: {
      matched: matched.length,
      total: relevant.length,
      rate: relevant.length ? matched.length / relevant.length : 0,
      byLevel: (['EXACT', 'HIGH', 'ALTERNATIVE', 'NONE'] as const).map((k) => ({ key: k, label: k, count: relevant.filter((o) => o.matchLevel === k).length })),
    },
    averageOpportunityValue: valued.length ? Math.round(valued.reduce((s, o) => s + (o.estimatedOpportunityValue ?? 0), 0) / valued.length) : null,
    valuedCount: valued.length,
    deadlines: buckets.map((b) => ({ bucket: b.bucket, count: withDl.filter((o) => b.test((new Date(o.deadline!).getTime() - now.getTime()) / 86_400_000)).length })),
    historical: {
      totalRecords: historical.length,
      totalAmount: historical.reduce((s, h) => s + (h.amount ?? 0), 0),
      byAgency: [...agencyMap.values()].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 8),
      recent: [...historical].sort((a, b) => (b.actionDate ?? '').localeCompare(a.actionDate ?? '')).slice(0, 10),
      isDemo: historical.length > 0 && historical.every((h) => h.isDemo),
    },
  };
}

export function organizationKey(name: string | null): string | null {
  if (!name) return null;
  return lc(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function organizations(all: Opportunity[]): OrganizationRecord[] {
  const map = new Map<string, OrganizationRecord>();
  for (const o of all) {
    if (o.status === 'MERGED' || o.intentLevel === 'IRRELEVANT') continue;
    const key = organizationKey(o.organizationName);
    if (!key) continue;
    const r =
      map.get(key) ??
      ({
        id: key, name: o.organizationName!, type: o.organizationType, website: o.organizationWebsite, city: o.city, state: o.state,
        industry: o.industry, employeeCount: o.employeeCount, opportunityCount: 0, hotCount: 0, latestDiscoveredAt: null, totalEstimatedValue: 0, isDemo: o.isDemo,
      } as OrganizationRecord);
    r.opportunityCount++;
    if (o.intentLevel === 'HOT') r.hotCount++;
    r.totalEstimatedValue += o.estimatedOpportunityValue ?? 0;
    if (!r.latestDiscoveredAt || o.discoveredAt > r.latestDiscoveredAt) r.latestDiscoveredAt = o.discoveredAt;
    r.website ??= o.organizationWebsite;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => b.hotCount - a.hotCount || b.opportunityCount - a.opportunityCount);
}
