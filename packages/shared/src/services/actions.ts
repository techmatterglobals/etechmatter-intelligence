// Business actions shared by the REST API (server) and the standalone browser
// demo, so both behave identically.
import { HARDWARE_CATEGORIES, PIPELINE_STAGES } from '../constants';
import { rematchOpportunity } from '../engine/analyze';
import { analytics, dashboardStats } from '../query/aggregate';
import { csvRowToProduct, parseCsv } from '../query/csv';
import { parseSearch } from '../query/nlSearch';
import type { Repository } from '../store/repository';
import { newId } from '../text';
import type {
  AlertEvent,
  AlertRule,
  AppSettings,
  CountRow,
  DashboardStats,
  IntentWeights,
  Opportunity,
  OpportunityQuery,
  OpportunitySummary,
  PipelineStatus,
  SalesActivity,
  SourceInfo,
} from '../types';

export class ActionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface DashboardPayload {
  stats: DashboardStats;
  latest: OpportunitySummary[];
  hot: OpportunitySummary[];
  closingSoon: OpportunitySummary[];
  byIntent: CountRow[];
  byCategory: CountRow[];
  byDay: { date: string; count: number; hot: number }[];
  sources: SourceInfo[];
  alerts: AlertEvent[];
  ai: { name: string; model: string | null; configured: boolean; message: string };
  store: 'memory' | 'postgres' | 'browser';
  activeSyncId: string | null;
}

const act = (type: SalesActivity['type'], actor: string, detail: string): SalesActivity => ({
  id: newId('act'), type, actor, detail, createdAt: new Date().toISOString(),
});

async function must(repo: Repository, id: string) {
  const o = await repo.getOpportunity(id);
  if (!o) throw new ActionError(404, 'Opportunity not found');
  return o;
}

export async function buildDashboard(
  repo: Repository,
  sources: SourceInfo[],
  extra: { ai: DashboardPayload['ai']; store: DashboardPayload['store']; activeSyncId: string | null; schedulerRunning: boolean },
): Promise<DashboardPayload> {
  const rows = await repo.aggregationRows();
  const stats = dashboardStats(rows, sources, new Date(), { running: extra.schedulerRunning });
  const [latest, hot, closing, events] = await Promise.all([
    repo.listOpportunities({ sort: 'discovered', pageSize: 12 }),
    repo.listOpportunities({ intent: ['HOT'], sort: 'score', pageSize: 6 }),
    repo.listOpportunities({ deadlineWithin: '7d', sort: 'deadline', pageSize: 6 }),
    repo.listAlertEvents(8),
  ]);
  const a = analytics(rows, [], new Date());
  return {
    stats, latest: latest.items, hot: hot.items, closingSoon: closing.items, byIntent: a.byIntent, byCategory: a.byCategory.slice(0, 8),
    byDay: a.byDay, sources, alerts: events, ai: extra.ai, store: extra.store, activeSyncId: extra.activeSyncId,
  };
}

export async function getOpportunityView(repo: Repository, id: string) {
  const o = await must(repo, id);
  const dups = await Promise.all(o.duplicateCandidates.map((d) => repo.getOpportunity(d.opportunityId)));
  return { ...o, duplicateCandidates: o.duplicateCandidates.filter((_, i) => dups[i] && dups[i]!.status !== 'MERGED') };
}

export async function setStatus(repo: Repository, id: string, status: PipelineStatus, actor: string) {
  const o = await must(repo, id);
  if (!PIPELINE_STAGES.some((s) => s.key === status)) throw new ActionError(400, `Invalid status. Use one of ${PIPELINE_STAGES.map((s) => s.key).join(', ')}`);
  const patch: Partial<Opportunity> = { status, activities: [act('STATUS_CHANGE', actor, `${o.status} → ${status}`), ...o.activities] };
  if (status === 'CONTACTED') patch.lastContactedAt = new Date().toISOString();
  return repo.patchOpportunity(o.id, patch);
}

export async function assignOwner(repo: Repository, id: string, owner: string | null, actor: string) {
  const o = await must(repo, id);
  return repo.patchOpportunity(o.id, { owner, activities: [act('ASSIGNED', actor, owner ? `Assigned to ${owner}` : 'Unassigned'), ...o.activities] });
}

export async function addNote(repo: Repository, id: string, body: string, actor: string) {
  const o = await must(repo, id);
  const text = body.trim();
  if (!text) throw new ActionError(400, 'Note body required');
  const note = { id: newId('note'), author: actor, body: text, createdAt: new Date().toISOString() };
  return repo.patchOpportunity(o.id, { notes: [note, ...o.notes], activities: [act('NOTE', actor, text.slice(0, 120)), ...o.activities] });
}

export async function updatePipeline(
  repo: Repository,
  id: string,
  b: Partial<Pick<Opportunity, 'nextFollowUp' | 'expectedCloseDate' | 'lastContactedAt' | 'quoteValue'>>,
  actor: string,
) {
  const o = await must(repo, id);
  const patch: Partial<Opportunity> = {};
  for (const k of ['nextFollowUp', 'expectedCloseDate', 'lastContactedAt'] as const) if (k in b) patch[k] = b[k] || null;
  if ('quoteValue' in b) patch.quoteValue = b.quoteValue === null || (b.quoteValue as unknown) === '' ? null : Number(b.quoteValue);
  const detail = [
    patch.quoteValue != null ? `Quote value $${patch.quoteValue.toLocaleString('en-US')}` : '',
    patch.nextFollowUp ? `Follow-up ${patch.nextFollowUp.slice(0, 10)}` : '',
    patch.expectedCloseDate ? `Expected close ${patch.expectedCloseDate.slice(0, 10)}` : '',
  ].filter(Boolean).join(' · ');
  patch.activities = [act(patch.quoteValue != null ? 'QUOTE' : 'STATUS_CHANGE', actor, detail || 'Pipeline details updated'), ...o.activities];
  return repo.patchOpportunity(o.id, patch);
}

export async function saveLead(repo: Repository, id: string, saved: boolean, actor: string) {
  const o = await must(repo, id);
  return repo.patchOpportunity(o.id, { saved, activities: [act('SAVED', actor, saved ? 'Saved lead' : 'Removed from saved'), ...o.activities] });
}

export async function mergeDuplicate(repo: Repository, primaryId: string, duplicateId: string, actor: string) {
  const primary = await must(repo, primaryId);
  const dup = await must(repo, duplicateId);
  if (dup.id === primary.id) throw new ActionError(400, 'Cannot merge an opportunity into itself');
  const mergedSources = [...primary.mergedSources, { source: dup.source, sourceUrl: dup.sourceUrl, sourceId: dup.sourceId }, ...dup.mergedSources];
  const evidence = [
    ...primary.evidence,
    ...dup.evidence.filter((e) => !primary.evidence.some((p) => p.snippet === e.snippet)).map((e) => ({ ...e, id: newId('ev') })),
  ];
  const fill = <K extends keyof Opportunity>(k: K) => (primary[k] ?? dup[k]) as Opportunity[K];
  await repo.patchOpportunity(dup.id, {
    status: 'MERGED',
    mergedIntoId: primary.id,
    activities: [act('MERGE', actor, `Merged into "${primary.title}"`), ...dup.activities],
  });
  return repo.saveOpportunity({
    ...primary,
    mergedSources,
    evidence,
    buyerName: fill('buyerName'),
    buyerTitle: fill('buyerTitle'),
    buyerEmail: fill('buyerEmail'),
    buyerPhone: fill('buyerPhone'),
    deadline: fill('deadline'),
    budget: fill('budget'),
    quantity: fill('quantity'),
    contacts: primary.contacts.length ? primary.contacts : dup.contacts,
    duplicateCandidates: primary.duplicateCandidates.filter((d) => d.opportunityId !== dup.id),
    activities: [act('MERGE', actor, `Merged duplicate from ${dup.source}`), ...primary.activities],
  });
}

export async function dismissDuplicate(repo: Repository, id: string, otherId: string) {
  const o = await must(repo, id);
  await repo.patchOpportunity(o.id, { duplicateCandidates: o.duplicateCandidates.filter((d) => d.opportunityId !== otherId) });
  const b = await repo.getOpportunity(otherId);
  if (b) await repo.patchOpportunity(b.id, { duplicateCandidates: b.duplicateCandidates.filter((d) => d.opportunityId !== o.id) });
  return repo.getOpportunity(o.id);
}

export async function searchOpportunities(repo: Repository, text: string, extra: OpportunityQuery = {}) {
  const parsed = parseSearch(text);
  const results = await repo.listOpportunities({ ...parsed.filters, ...extra });
  return { parsed, results };
}

export async function rematchAll(repo: Repository) {
  const catalog = await repo.listProducts();
  let n = 0;
  for (const row of await repo.aggregationRows()) {
    const o = await repo.getOpportunity(row.id);
    if (!o || o.status === 'MERGED') continue;
    await repo.patchOpportunity(o.id, rematchOpportunity(o, catalog));
    n++;
  }
  return { rematched: n };
}

export async function importProductsCsv(repo: Repository, csv: string, replaceDemo = false) {
  const rows = parseCsv(csv);
  const errors: string[] = [];
  let imported = 0;
  for (const row of rows) {
    const p = csvRowToProduct(row);
    if ('error' in p) errors.push(p.error);
    else {
      await repo.createProduct({ ...p, isDemo: false });
      imported++;
    }
  }
  if (replaceDemo && imported) for (const p of await repo.listProducts()) if (p.isDemo) await repo.deleteProduct(p.id);
  return { imported, errors, total: rows.length };
}

export async function createProductFromInput(repo: Repository, input: Record<string, unknown>) {
  const row = Object.fromEntries(Object.entries(input).map(([k, v]) => [k.replace(/([A-Z])/g, '_$1').toLowerCase(), v == null ? '' : String(v)]));
  const res = csvRowToProduct(row);
  if ('error' in res) throw new ActionError(400, res.error);
  return repo.createProduct({ ...res, isDemo: false });
}

export function alertRuleFrom(b: Record<string, any>, base?: AlertRule): AlertRule {
  const numOr = (k: 'minQuantity' | 'minMatchScore') =>
    b[k] === '' || b[k] === null || b[k] === undefined ? (base && !(k in b) ? base[k] : null) : Number(b[k]);
  return {
    id: base?.id ?? newId('alr'),
    name: String(b.name ?? base?.name ?? 'Untitled alert'),
    categories: b.categories ?? base?.categories ?? [],
    states: (b.states ?? base?.states ?? []).map((s: string) => s.toUpperCase()),
    intentLevels: b.intentLevels ?? base?.intentLevels ?? ['HOT'],
    minQuantity: numOr('minQuantity'),
    minMatchScore: numOr('minMatchScore'),
    keywords: b.keywords ?? base?.keywords ?? [],
    channels: b.channels ?? base?.channels ?? ['IN_APP'],
    email: b.email ?? base?.email ?? null,
    webhookUrl: b.webhookUrl ?? base?.webhookUrl ?? null,
    active: b.active ?? base?.active ?? true,
    createdAt: base?.createdAt ?? new Date().toISOString(),
    lastTriggeredAt: base?.lastTriggeredAt ?? null,
    triggerCount: base?.triggerCount ?? 0,
  };
}

export async function updateSettingsSafe(repo: Repository, b: Partial<AppSettings>) {
  const patch: Partial<AppSettings> = {};
  if (Array.isArray(b.buyingKeywords)) patch.buyingKeywords = b.buyingKeywords.map(String).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(b.intentPhrases)) patch.intentPhrases = b.intentPhrases.map(String).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(b.categories)) patch.categories = [...new Set([...HARDWARE_CATEGORIES, ...b.categories.map(String).map((s) => s.trim()).filter(Boolean)])];
  if (b.intentWeights) {
    const w = { ...(await repo.getSettings()).intentWeights } as IntentWeights;
    for (const [k, v] of Object.entries(b.intentWeights)) if (k in w && Number.isFinite(Number(v))) (w as unknown as Record<string, number>)[k] = Number(v);
    patch.intentWeights = w;
  }
  if (b.thresholds) {
    const t = { hot: Number(b.thresholds.hot), warm: Number(b.thresholds.warm), low: Number(b.thresholds.low) };
    if (!(t.hot > t.warm && t.warm > t.low && t.low >= 0 && t.hot <= 100)) throw new ActionError(400, 'Thresholds must satisfy 100 ≥ hot > warm > low ≥ 0');
    patch.thresholds = t;
  }
  return repo.updateSettings(patch);
}
