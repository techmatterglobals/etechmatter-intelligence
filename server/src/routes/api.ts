import {
  ActionError,
  addNote,
  alertRuleFrom,
  analytics,
  assignOwner,
  buildDashboard,
  createProductFromInput,
  dashboardStats,
  dismissDuplicate,
  getOpportunityView,
  importProductsCsv,
  mergeDuplicate,
  opportunitiesToCsv,
  organizations,
  PRODUCT_CSV_TEMPLATE,
  rematchAll,
  saveLead,
  searchOpportunities,
  setStatus,
  stateSummary,
  updatePipeline,
  updateSettingsSafe,
  type AIProvider,
  type OpportunityQuery,
  type PipelineStatus,
  type Product,
  type Repository,
  type SourceConnector,
} from '@etm/shared';
import { publicConfig } from '../config/env';
import { describeSources } from '../connectors/registry';
import { HttpError, Router, type Handler, type Req } from '../http/router';
import type { SyncService } from '../services/syncService';

export interface ApiContext {
  repo: Repository;
  sync: SyncService;
  connectors: SourceConnector[];
  ai: AIProvider;
  aiStatus: { name: string; model: string | null; configured: boolean; message: string };
}

const arr = (q: URLSearchParams, k: string) => {
  const v = q.getAll(k).flatMap((x) => x.split(',')).map((s) => s.trim()).filter(Boolean);
  return v.length ? v : undefined;
};
const int = (q: URLSearchParams, k: string) => (q.get(k) ? parseInt(q.get(k)!, 10) : undefined);

/** Query-string → OpportunityQuery (arrays accept comma lists or repeated keys). */
export function parseQuery(q: URLSearchParams): OpportunityQuery {
  const s = (k: string) => q.get(k) ?? undefined;
  return {
    q: s('q'),
    intent: arr(q, 'intent') as OpportunityQuery['intent'],
    categories: arr(q, 'categories'),
    sourceTypes: arr(q, 'sourceTypes') as OpportunityQuery['sourceTypes'],
    sourceKeys: arr(q, 'sourceKeys'),
    states: arr(q, 'states')?.map((x) => x.toUpperCase()),
    orgTypes: arr(q, 'orgTypes') as OpportunityQuery['orgTypes'],
    procurementTypes: arr(q, 'procurementTypes') as OpportunityQuery['procurementTypes'],
    discovered: s('discovered') as OpportunityQuery['discovered'],
    posted: s('posted') as OpportunityQuery['posted'],
    dateFrom: s('dateFrom'),
    dateTo: s('dateTo'),
    deadlineWithin: s('deadlineWithin') as OpportunityQuery['deadlineWithin'],
    qtyMin: int(q, 'qtyMin'),
    qtyMax: int(q, 'qtyMax'),
    match: arr(q, 'match') as OpportunityQuery['match'],
    status: arr(q, 'status') as OpportunityQuery['status'],
    owner: s('owner'),
    saved: q.get('saved') === 'true' || undefined,
    includeIrrelevant: q.get('includeIrrelevant') === 'true' || undefined,
    includeMerged: q.get('includeMerged') === 'true' || undefined,
    data: s('data') as OpportunityQuery['data'],
    sort: s('sort') as OpportunityQuery['sort'],
    page: int(q, 'page'),
    pageSize: int(q, 'pageSize'),
  };
}

const actorOf = (req: Req) => (typeof req.body?.actor === 'string' && req.body.actor) || 'Sales user';

/** Maps shared ActionError → HTTP status. */
const wrap =
  (h: Handler): Handler =>
  async (req) => {
    try {
      return await h(req);
    } catch (e) {
      if (e instanceof ActionError) throw new HttpError(e.status, e.message);
      throw e;
    }
  };

export function buildApi(ctx: ApiContext): Router {
  const { repo, sync } = ctx;
  const r = new Router();
  const get = (p: string, h: Handler) => r.get(p, wrap(h));
  const post = (p: string, h: Handler) => r.post(p, wrap(h));
  const put = (p: string, h: Handler) => r.put(p, wrap(h));
  const del = (p: string, h: Handler) => r.delete(p, wrap(h));
  const sources = () => describeSources(repo, ctx.connectors, sync.nextRuns);

  // ------------------------------------------------------------------ system
  get('/api/health', async () => ({ ok: true, store: repo.kind, time: new Date().toISOString() }));
  get('/api/config', async () => ({ ...publicConfig(), ai: ctx.aiStatus, store: repo.kind }));

  // ------------------------------------------------------------------ dashboard
  get('/api/dashboard', async () =>
    buildDashboard(repo, await sources(), { ai: ctx.aiStatus, store: repo.kind, activeSyncId: sync.activeRunId, schedulerRunning: sync.running }),
  );

  // ------------------------------------------------------------------ opportunities
  get('/api/opportunities', async (req) => repo.listOpportunities(parseQuery(req.query)));
  get('/api/opportunities/stats', async () => dashboardStats(await repo.aggregationRows(), await sources(), new Date(), { running: sync.running }));
  get('/api/opportunities/hot', async (req) => repo.listOpportunities({ ...parseQuery(req.query), intent: ['HOT'], sort: 'score' }));
  get('/api/opportunities/recent', async (req) => repo.listOpportunities({ ...parseQuery(req.query), sort: 'discovered' }));
  get('/api/opportunities/export.csv', async (req) => ({
    status: 200,
    text: opportunitiesToCsv(await repo.exportRows(parseQuery(req.query), 10_000)),
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="etechmatter-opportunities-${new Date().toISOString().slice(0, 10)}.csv"` },
  }));
  post('/api/opportunities/rematch', async () => rematchAll(repo));
  get('/api/opportunities/:id', async (req) => getOpportunityView(repo, req.params.id));
  post('/api/opportunities/:id/status', async (req) => setStatus(repo, req.params.id, req.body?.status as PipelineStatus, actorOf(req)));
  post('/api/opportunities/:id/assign', async (req) => assignOwner(repo, req.params.id, (req.body?.owner as string) || null, actorOf(req)));
  post('/api/opportunities/:id/notes', async (req) => addNote(repo, req.params.id, String(req.body?.body ?? ''), actorOf(req)));
  post('/api/opportunities/:id/pipeline', async (req) => updatePipeline(repo, req.params.id, req.body ?? {}, actorOf(req)));
  post('/api/opportunities/:id/save', async (req) => saveLead(repo, req.params.id, req.body?.saved !== false, actorOf(req)));
  post('/api/opportunities/:id/merge', async (req) => mergeDuplicate(repo, req.params.id, String(req.body?.duplicateId ?? ''), actorOf(req)));
  post('/api/opportunities/:id/dismiss-duplicate', async (req) => dismissDuplicate(repo, req.params.id, String(req.body?.duplicateId ?? '')));

  // ------------------------------------------------------------------ search / map / orgs / analytics
  post('/api/search', async (req) =>
    searchOpportunities(repo, String(req.body?.query ?? ''), { ...(req.body?.filters ?? {}), page: req.body?.page, pageSize: req.body?.pageSize ?? 20 }),
  );
  get('/api/map', async () => ({ states: stateSummary(await repo.aggregationRows()) }));
  get('/api/organizations', async () => organizations(await repo.aggregationRows()));
  get('/api/analytics', async () => analytics(await repo.aggregationRows(), await repo.listHistorical(500)));
  get('/api/historical', async () => repo.listHistorical(200));

  // ------------------------------------------------------------------ products & categories
  get('/api/products', async () => repo.listProducts());
  get('/api/products/template.csv', async () => ({
    status: 200,
    text: PRODUCT_CSV_TEMPLATE,
    headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="etechmatter-product-template.csv"' },
  }));
  post('/api/products', async (req) => createProductFromInput(repo, req.body ?? {}));
  put('/api/products/:id', async (req) => {
    const p = await repo.updateProduct(req.params.id, req.body as Partial<Product>);
    if (!p) throw new HttpError(404, 'Product not found');
    return p;
  });
  del('/api/products/:id', async (req) => ({ deleted: await repo.deleteProduct(req.params.id) }));
  post('/api/products/import', async (req) =>
    importProductsCsv(repo, typeof req.body === 'string' ? req.body : String(req.body?.csv ?? ''), !!req.body?.replaceDemo),
  );
  get('/api/categories', async () => (await repo.getSettings()).categories);
  post('/api/categories', async (req) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw new HttpError(400, 'Category name required');
    const s = await repo.getSettings();
    return (await updateSettingsSafe(repo, { categories: [...s.categories, name] })).categories;
  });

  // ------------------------------------------------------------------ sources & sync
  get('/api/sources', async () => sources());
  get('/api/sources/runs', async (req) => repo.listRuns(int(req.query, 'limit') ?? 50, req.query.get('source') ?? undefined));
  post('/api/sources/test', async (req) => {
    const key = String(req.body?.key ?? '');
    const c = ctx.connectors.find((x) => x.key === key);
    if (!c) throw new HttpError(404, 'Unknown source');
    const cfg = (await repo.getSourceConfigs()).find((x) => x.key === key);
    const config = cfg?.config ?? {};
    const res = await c.test(config);
    await repo.upsertSourceConfig(key, { config });
    return { key, ...res, testedAt: new Date().toISOString() };
  });
  put('/api/sources/:key', async (req) => {
    const c = ctx.connectors.find((x) => x.key === req.params.key);
    if (!c) throw new HttpError(404, 'Unknown source');
    const b = req.body ?? {};
    const cur = (await repo.getSourceConfigs()).find((x) => x.key === c.key);
    const patch: Record<string, unknown> = {};
    if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
    if (b.intervalMinutes !== undefined) patch.intervalMinutes = Math.max(0, Math.min(10_080, Number(b.intervalMinutes) || 0));
    if (b.config && typeof b.config === 'object') {
      // secrets are never accepted through the API — they belong in server env vars
      const clean = Object.fromEntries(Object.entries(b.config).filter(([k]) => !/key|secret|token|password/i.test(k)));
      patch.config = { ...(cur?.config ?? {}), ...clean };
    }
    await repo.upsertSourceConfig(c.key, patch);
    return (await sources()).find((s) => s.key === c.key);
  });
  post('/api/sync', async (req) => {
    const keys = Array.isArray(req.body?.sources) && req.body.sources.length ? (req.body.sources as string[]) : undefined;
    return sync.start('MANUAL', keys);
  });
  get('/api/sync/status', async () => ({ activeRunId: sync.activeRunId, schedulerRunning: sync.running, nextRuns: sync.nextRuns }));
  get('/api/sync/:runId', async (req) => {
    const p = sync.getProgress(req.params.runId);
    if (!p) throw new HttpError(404, 'Unknown sync run');
    return p;
  });

  // ------------------------------------------------------------------ alerts
  get('/api/alerts', async () => repo.listAlertRules());
  post('/api/alerts', async (req) => repo.saveAlertRule(alertRuleFrom(req.body ?? {})));
  put('/api/alerts/:id', async (req) => {
    const cur = (await repo.listAlertRules()).find((x) => x.id === req.params.id);
    if (!cur) throw new HttpError(404, 'Alert not found');
    return repo.saveAlertRule(alertRuleFrom(req.body ?? {}, cur));
  });
  del('/api/alerts/:id', async (req) => ({ deleted: await repo.deleteAlertRule(req.params.id) }));
  get('/api/alerts/events', async (req) => repo.listAlertEvents(int(req.query, 'limit') ?? 50));
  post('/api/alerts/events/read', async (req) => {
    await repo.markAlertEventsRead(req.body?.ids ?? 'all');
    return { ok: true };
  });

  // ------------------------------------------------------------------ admin
  get('/api/settings', async () => repo.getSettings());
  put('/api/settings', async (req) => updateSettingsSafe(repo, req.body ?? {}));
  get('/api/users', async () => repo.listUsers());
  post('/api/users', async (req) => {
    const b = req.body ?? {};
    if (!b.email || !b.name) throw new HttpError(400, 'name and email required');
    return repo.createUser({ name: String(b.name), email: String(b.email), role: ['ADMIN', 'SALES', 'VIEWER'].includes(b.role) ? b.role : 'SALES' });
  });

  return r;
}
