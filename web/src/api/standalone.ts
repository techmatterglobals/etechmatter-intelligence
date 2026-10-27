// Standalone mode: the full engine (classifier, extractor, scoring, matching,
// dedupe, pipeline, alerts) runs in the browser against an in-memory store
// seeded with clearly-labelled DEMO DATA. Used when no backend is reachable
// (e.g. the hosted preview). Live connectors are shown as not configured —
// they only run on the server, where API keys are kept.

import {
  ActionError,
  addNote,
  alertRuleFrom,
  analytics,
  assignOwner,
  BaseConnector,
  buildDashboard,
  createProductFromInput,
  DemoFeedConnector,
  dismissDuplicate,
  getOpportunityView,
  HeuristicProvider,
  importProductsCsv,
  MemoryStore,
  mergeDuplicate,
  newId,
  opportunitiesToCsv,
  organizations,
  rematchAll,
  runSync,
  saveLead,
  searchOpportunities,
  seedDemo,
  setStatus,
  stateSummary,
  updatePipeline,
  updateSettingsSafe,
  type ConnectorStatusReport,
  type SourceConnector,
  type SourceInfo,
  type SourceType,
  type SyncProgress,
} from '@etm/shared';
import type { Api } from './client';

class ServerOnlyConnector extends BaseConnector<never> {
  readonly isLive = true;
  readonly confidence = 'HIGH' as const;
  readonly defaultIntervalMinutes: number;
  override readonly docsUrl: string | null;
  override readonly requiredEnv: string[];
  constructor(
    readonly key: string,
    readonly name: string,
    readonly type: SourceType,
    readonly description: string,
    private report: ConnectorStatusReport,
    interval: number,
    docsUrl: string | null = null,
    env: string[] = [],
  ) {
    super();
    this.defaultIntervalMinutes = interval;
    this.docsUrl = docsUrl;
    this.requiredEnv = env;
  }
  status() {
    return this.report;
  }
  async fetch() {
    return [];
  }
  normalize() {
    return null;
  }
}

const demo = new DemoFeedConnector();
const connectors: SourceConnector[] = [
  new ServerOnlyConnector('sam_gov', 'SAM.gov Contract Opportunities', 'FEDERAL_PROCUREMENT', 'Official federal procurement notices (solicitations, RFQs, combined synopses, sources sought).',
    { status: 'NOT_CONFIGURED', message: 'Live SAM.gov connector not configured — runs on the backend with SAM_API_KEY.' }, 15, 'https://open.gsa.gov/api/get-opportunities-public-api/', ['SAM_API_KEY']),
  new ServerOnlyConnector('state_local', 'State & Local Procurement Portals', 'STATE_PROCUREMENT', 'Configurable adapters for state, county, city, school, university and public-hospital bid boards.',
    { status: 'CONFIG_REQUIRED', message: 'Adapter ready — add public portal feeds on the backend to activate.' }, 60),
  new ServerOnlyConnector('public_web', 'Public Web Discovery', 'PUBLIC_WEB', 'Publicly accessible pages & feeds with buying-intent phrases. robots.txt respected.',
    { status: 'CONFIG_REQUIRED', message: 'Configuration required — add public pages or RSS feeds to monitor.' }, 120),
  new ServerOnlyConnector('usaspending', 'USAspending.gov (historical awards)', 'HISTORICAL_SPENDING', 'Past federal IT hardware awards — targeting intelligence, not current demand.',
    { status: 'NOT_CONFIGURED', message: 'Runs on the backend server (public API, no key). Historical data shown here is DEMO.' }, 1440, 'https://api.usaspending.gov/'),
  demo,
];

const repo = new MemoryStore();
const ai = new HeuristicProvider();
const aiStatus = { name: 'heuristic-rules', model: null, configured: true, message: 'Built-in rules engine (standalone demo)' };
const progress = new Map<string, SyncProgress>();
let activeRun: string | null = null;

let ready: Promise<void> | null = null;
function init() {
  ready ??= (async () => {
    await seedDemo(repo, { ai });
  })();
  return ready;
}

async function sourcesInfo(): Promise<SourceInfo[]> {
  const cfgs = await repo.getSourceConfigs();
  return connectors.map((c) => {
    const cfg = cfgs.find((x) => x.key === c.key);
    if (c === demo) ((cfg?.config.released as string[] | undefined) ?? []).forEach((k) => demo.released.add(k));
    const st = cfg && !cfg.enabled ? { status: 'DISABLED' as const, message: 'Disabled in admin' } : c.status(cfg?.config ?? {});
    return {
      key: c.key, name: c.name, type: c.type, confidence: c.confidence, description: c.description, status: st.status, statusMessage: st.message,
      enabled: cfg?.enabled ?? true, intervalMinutes: cfg?.intervalMinutes ?? c.defaultIntervalMinutes, isLive: c.isLive, isDemo: c.isDemo,
      lastRunAt: cfg?.lastRunAt ?? null, lastSuccessAt: cfg?.lastSuccessAt ?? null, nextRunAt: null, lastRunNew: cfg?.lastRunNew ?? null,
      docsUrl: c.docsUrl, requiredEnv: c.requiredEnv, config: cfg?.config ?? {},
    };
  });
}

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  await init();
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ActionError) throw new Error(e.message);
    throw e;
  }
};
const must = <T>(v: T | null): T => {
  if (!v) throw new Error('Not found');
  return v;
};
const ACTOR = 'You (demo)';

export const standaloneApi: Api = {
  mode: 'standalone',
  config: async () => ({
    store: 'browser',
    schedulerEnabled: false,
    keys: [
      { name: 'DATABASE_URL', configured: false, purpose: 'PostgreSQL connection (backend)' },
      { name: 'SAM_API_KEY', configured: false, purpose: 'SAM.gov Contract Opportunities API (backend)' },
      { name: 'ANTHROPIC_API_KEY / OPENAI_API_KEY', configured: false, purpose: 'Optional LLM provider (backend)' },
      { name: 'EMAIL_API_KEY', configured: false, purpose: 'Alert e-mail delivery (backend)' },
    ],
    ai: aiStatus,
  }),
  dashboard: () => wrap(async () => buildDashboard(repo, await sourcesInfo(), { ai: aiStatus, store: 'browser', activeSyncId: activeRun, schedulerRunning: false })),
  listOpportunities: (q) => wrap(() => repo.listOpportunities(q)),
  search: (query, filters) => wrap(() => searchOpportunities(repo, query, filters)),
  getOpportunity: (id) => wrap(() => getOpportunityView(repo, id)),
  setStatus: (id, s) => wrap(async () => must(await setStatus(repo, id, s, ACTOR))),
  assign: (id, owner) => wrap(async () => must(await assignOwner(repo, id, owner, ACTOR))),
  addNote: (id, body) => wrap(async () => must(await addNote(repo, id, body, ACTOR))),
  updatePipeline: (id, patch) => wrap(async () => must(await updatePipeline(repo, id, patch, ACTOR))),
  save: (id, saved) => wrap(async () => must(await saveLead(repo, id, saved, ACTOR))),
  merge: (id, dupId) => wrap(() => mergeDuplicate(repo, id, dupId, ACTOR)),
  dismissDuplicate: (id, dupId) => wrap(async () => must(await dismissDuplicate(repo, id, dupId))),
  exportCsv: (q) => wrap(async () => opportunitiesToCsv(await repo.exportRows(q, 10_000))),
  map: () => wrap(async () => ({ states: stateSummary(await repo.aggregationRows()) })),
  organizations: () => wrap(async () => organizations(await repo.aggregationRows())),
  analytics: () => wrap(async () => analytics(await repo.aggregationRows(), await repo.listHistorical(500))),
  historical: () => wrap(() => repo.listHistorical(200)),
  products: () => wrap(() => repo.listProducts()),
  createProduct: (p) => wrap(() => createProductFromInput(repo, p)),
  deleteProduct: (id) => wrap(async () => void (await repo.deleteProduct(id))),
  importProducts: (csv, replaceDemo) => wrap(() => importProductsCsv(repo, csv, replaceDemo)),
  rematch: () => wrap(() => rematchAll(repo)),
  addCategory: (name) => wrap(async () => (await updateSettingsSafe(repo, { categories: [...(await repo.getSettings()).categories, name] })).categories),
  sources: () => wrap(sourcesInfo),
  runs: () => wrap(() => repo.listRuns(40)),
  testSource: (key) =>
    wrap(async () => {
      const c = must(connectors.find((x) => x.key === key) ?? null);
      return c.test({});
    }),
  updateSource: (key, patch) =>
    wrap(async () => {
      const cur = (await repo.getSourceConfigs()).find((x) => x.key === key);
      await repo.upsertSourceConfig(key, {
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.intervalMinutes !== undefined ? { intervalMinutes: patch.intervalMinutes } : {}),
        ...(patch.config ? { config: { ...(cur?.config ?? {}), ...patch.config } } : {}),
      });
      return must((await sourcesInfo()).find((s) => s.key === key) ?? null);
    }),
  startSync: (sources) =>
    wrap(async () => {
      if (activeRun) return { runId: activeRun, alreadyRunning: true };
      const runId = newId('sync');
      activeRun = runId;
      void runSync({
        repo, connectors, ai, trigger: 'MANUAL', onlyKeys: sources, runId,
        onProgress: (p) => progress.set(runId, p),
      }).then((p) => {
        progress.set(runId, p);
        activeRun = null;
      });
      return { runId, alreadyRunning: false };
    }),
  syncProgress: (runId) => wrap(async () => must(progress.get(runId) ?? null)),
  alerts: () => wrap(() => repo.listAlertRules()),
  saveAlert: (rule) =>
    wrap(async () => {
      const cur = rule.id ? (await repo.listAlertRules()).find((r) => r.id === rule.id) : undefined;
      return repo.saveAlertRule(alertRuleFrom(rule as Record<string, unknown>, cur));
    }),
  deleteAlert: (id) => wrap(async () => void (await repo.deleteAlertRule(id))),
  alertEvents: () => wrap(() => repo.listAlertEvents(40)),
  markAlertsRead: () => wrap(() => repo.markAlertEventsRead('all')),
  settings: () => wrap(() => repo.getSettings()),
  updateSettings: (patch) => wrap(() => updateSettingsSafe(repo, patch)),
  users: () =>
  wrap(async () =>
    (await repo.listUsers()).map((user) => ({
      ...user,
      passwordConfigured: false,
    })),
  ),
  createUser: (u) => wrap(() => repo.createUser(u)),
  updateUser: (id, patch) =>
    wrap(async () => {
      const user = await repo.updateUser(id, patch);

      if (!user) {
        throw new Error('User not found');
      }

      return user;
    }),

  deleteUser: (id) =>
    wrap(async () => {
      const deleted = await repo.deleteUser(id);

      if (!deleted) {
        throw new Error('User not found');
      }

      return { deleted: true };
    }),
    logout: async () => {
  throw new Error('Logout requires the server-backed API.');
},
  resetUserPassword: async (
    _id: string,
    _password: string,
    _confirmPassword: string,
  ): Promise<{ success: boolean }> => {
    throw new Error(
      'Password reset is not available in standalone mode. Use the server-backed API.',
    );
  },
};
