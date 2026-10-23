// In-memory query engine (used by the memory repository and the browser demo).
// The Prisma repository translates the same OpportunityQuery into SQL WHERE clauses.

import { CATEGORY_GROUPS, INTENT_META } from '../constants';
import { lc } from '../text';
import type { Opportunity, OpportunityQuery, OpportunitySummary, Page, TimeWindow } from '../types';

export function expandCategories(cats: string[]): string[] {
  const out = new Set<string>();
  for (const c of cats) {
    out.add(c);
    for (const m of CATEGORY_GROUPS[c] ?? []) out.add(m);
  }
  return [...out];
}

export function windowRange(w: TimeWindow | undefined, now: Date, from?: string, to?: string): [number, number] | null {
  if (!w) return null;
  const t = now.getTime();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  switch (w) {
    case '15m':
      return [t - 15 * 60_000, t + 1];
    case '1h':
      return [t - 3_600_000, t + 1];
    case 'today':
      return [startOfDay.getTime(), t + 86_400_000];
    case 'yesterday':
      return [startOfDay.getTime() - 86_400_000, startOfDay.getTime()];
    case '7d':
      return [t - 7 * 86_400_000, t + 1];
    case '30d':
      return [t - 30 * 86_400_000, t + 1];
    case 'custom':
      return [from ? new Date(from).getTime() : 0, to ? new Date(to).getTime() + 86_400_000 : t + 1];
  }
}

export function deadlineRange(d: OpportunityQuery['deadlineWithin'], now: Date): [number, number] | null {
  if (!d) return null;
  const t = now.getTime();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const days = d === 'today' ? 0 : d === '3d' ? 3 : d === '7d' ? 7 : 30;
  return [t, end.getTime() + days * 86_400_000];
}

export function searchText(o: Opportunity): string {
  return lc(
    [
      o.title, o.organizationName, o.description.slice(0, 4000), o.requirementSummary, o.aiSummary, o.city, o.state, o.source,
      o.categories.join(' '), o.productsRequested.join(' '), o.brandsRequested.join(' '), o.modelsRequested.join(' '), o.partNumbers.join(' '),
    ].join(' '),
  );
}

export function matchesQuery(o: Opportunity, q: OpportunityQuery, now: Date): boolean {
  if (!q.includeMerged && o.status === 'MERGED') return false;
  if (!q.includeIrrelevant && o.intentLevel === 'IRRELEVANT' && !(q.intent ?? []).includes('IRRELEVANT')) return false;
  if (q.intent?.length && !q.intent.includes(o.intentLevel)) return false;
  if (q.categories?.length) {
    const cats = expandCategories(q.categories);
    if (!o.categories.some((c) => cats.includes(c))) return false;
  }
  if (q.sourceTypes?.length && !q.sourceTypes.includes(o.sourceType)) return false;
  if (q.sourceKeys?.length && !q.sourceKeys.includes(o.sourceKey)) return false;
  if (q.states?.length && (!o.state || !q.states.includes(o.state))) return false;
  if (q.orgTypes?.length && !q.orgTypes.includes(o.organizationType)) return false;
  if (q.procurementTypes?.length && !q.procurementTypes.includes(o.procurementType)) return false;
  if (q.match?.length && !q.match.includes(o.matchLevel)) return false;
  if (q.status?.length && !q.status.includes(o.status)) return false;
  if (q.owner && o.owner !== q.owner) return false;
  if (q.saved && !o.saved) return false;
  if (q.data === 'live' && o.isDemo) return false;
  if (q.data === 'demo' && !o.isDemo) return false;
  if (q.qtyMin != null && (o.quantity == null || o.quantity < q.qtyMin)) return false;
  if (q.qtyMax != null && (o.quantity == null || o.quantity > q.qtyMax)) return false;
  const disc = windowRange(q.discovered, now, q.dateFrom, q.dateTo);
  if (disc) {
    const t = new Date(o.discoveredAt).getTime();
    if (t < disc[0] || t >= disc[1]) return false;
  }
  const pub = windowRange(q.posted, now, q.dateFrom, q.dateTo);
  if (pub) {
    if (!o.publishedAt) return false;
    const t = new Date(o.publishedAt).getTime();
    if (t < pub[0] || t >= pub[1]) return false;
  }
  const dl = deadlineRange(q.deadlineWithin, now);
  if (dl) {
    if (!o.deadline) return false;
    const t = new Date(o.deadline).getTime();
    if (t < dl[0] || t > dl[1]) return false;
  }
  if (q.q?.trim()) {
    const hay = searchText(o);
    const terms = lc(q.q).split(/\s+/).filter(Boolean);
    if (!terms.every((term) => hay.includes(term))) return false;
  }
  return true;
}

export function sortOpportunities(list: Opportunity[], sort: OpportunityQuery['sort'] = 'score'): Opportunity[] {
  const by = [...list];
  const time = (s: string | null) => (s ? new Date(s).getTime() : 0);
  switch (sort) {
    case 'discovered':
      return by.sort((a, b) => time(b.discoveredAt) - time(a.discoveredAt));
    case 'published':
      return by.sort((a, b) => time(b.publishedAt) - time(a.publishedAt));
    case 'deadline':
      return by.sort((a, b) => (a.deadline ? time(a.deadline) : Infinity) - (b.deadline ? time(b.deadline) : Infinity));
    case 'value':
      return by.sort((a, b) => (b.estimatedOpportunityValue ?? -1) - (a.estimatedOpportunityValue ?? -1));
    case 'intent':
      return by.sort((a, b) => INTENT_META[a.intentLevel].order - INTENT_META[b.intentLevel].order || b.intentScore - a.intentScore);
    default:
      return by.sort((a, b) => b.overallOpportunityScore - a.overallOpportunityScore || b.intentScore - a.intentScore);
  }
}

export function toSummary(o: Opportunity): OpportunitySummary {
  return {
    id: o.id, title: o.title, source: o.source, sourceKey: o.sourceKey, sourceType: o.sourceType, sourceConfidence: o.sourceConfidence,
    sourceUrl: o.sourceUrl, isDemo: o.isDemo, publishedAt: o.publishedAt, discoveredAt: o.discoveredAt, deadline: o.deadline,
    organizationName: o.organizationName, organizationType: o.organizationType, city: o.city, state: o.state,
    requirementSummary: o.requirementSummary, hardwareCategory: o.hardwareCategory, categories: o.categories, quantity: o.quantity,
    procurementType: o.procurementType, intentLevel: o.intentLevel, intentScore: o.intentScore, urgencyScore: o.urgencyScore,
    matchScore: o.matchScore, matchLevel: o.matchLevel, overallOpportunityScore: o.overallOpportunityScore,
    estimatedOpportunityValue: o.estimatedOpportunityValue, status: o.status, owner: o.owner, saved: o.saved,
    buyerName: o.buyerName, buyerEmail: o.buyerEmail, buyerPhone: o.buyerPhone, buyerTitle: o.buyerTitle,
    organizationWebsite: o.organizationWebsite, hasDuplicates: o.duplicateCandidates.length > 0,
  };
}

export function applyQuery(all: Opportunity[], q: OpportunityQuery, now = new Date()): Page<OpportunitySummary> {
  const filtered = sortOpportunities(all.filter((o) => matchesQuery(o, q, now)), q.sort);
  const pageSize = Math.min(Math.max(q.pageSize ?? 20, 1), 100);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(q.page ?? 1, 1), totalPages);
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize).map(toSummary),
    total: filtered.length,
    page,
    pageSize,
    totalPages,
  };
}
